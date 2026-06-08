const express = require('express');
const cors = require('cors');
const session = require('express-session');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');
const crypto = require('crypto');
// X509Certificate available since Node 15.6 – used to parse cert validity dates
const { X509Certificate } = require('crypto');

const app = express();
const PORT = 3002;

// Paths — all local to GatewayUtility; no dependency on ../Find-Assertions
const SCRIPTS_DIR       = __dirname;
const CONFIG_FILE       = path.join(__dirname, 'config.json');
const AUTH_CONFIG_FILE  = path.join(__dirname, 'auth-config.json');
const RESPONSE_DIR      = path.join(__dirname, 'response');
const GENERATED_DIR     = path.join(__dirname, 'generated');

// ─── Session middleware (BFF pattern for OIDC) ────────────────────────────────
// In-memory store — compatible with emptyDir volumes + sessionAffinity:ClientIP.
// SESSION_SECRET should be overridden via environment variable in production.
app.use(session({
  secret: process.env.SESSION_SECRET || 'gw-utility-dev-secret-change-in-prod',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 4 * 60 * 60 * 1000, // 4 h hard ceiling; OIDC config may be shorter
  },
}));

app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

// Serve React build in production
const distDir = path.join(__dirname, 'dist');
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  } catch {
    // Fallback when config.json is absent (first run). Values are intentionally
    // blank so the user is prompted to configure via the UI rather than silently
    // using wrong defaults.
    return {
      graphmanHome: '../../graphman-client-main',
      sourceGateway: '',
      targetGateway: '',
      assertionType: 'EvaluateJsonPathExpressionV2',
      exportSchema:  'v11.1.00',
      importSchema:  'v11.1.00',
    };
  }
}

// Build an env object that always includes GRAPHMAN_HOME so child processes
// (graphman.sh and the Node scripts that shell out to it) can find the client.
// Reads options.schema from graphman.configuration. Used as the authoritative
// schema default for pages that have no config.json association (Entity Forge).
function loadGraphmanSchema() {
  const config = loadConfig();
  const graphmanHome = path.resolve(SCRIPTS_DIR, config.graphmanHome || '../../graphman-client-main');
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(graphmanHome, 'graphman.configuration'), 'utf8'));
    return raw.options?.schema || 'v11.1.00';
  } catch {
    return 'v11.1.00';
  }
}

function buildEnv(graphmanHome) {
  return {
    ...process.env,
    GRAPHMAN_HOME: graphmanHome,
    // Some shells source ~/.bashrc only for interactive sessions; carry PATH too.
    PATH: process.env.PATH || '/usr/local/bin:/usr/bin:/bin',
  };
}

function runScript(scriptPath, args, cwd, graphmanHome) {
  return new Promise((resolve, reject) => {
    const cmd = `node "${scriptPath}" ${args}`;
    const env = graphmanHome ? buildEnv(graphmanHome) : process.env;
    exec(cmd, { cwd: cwd || SCRIPTS_DIR, timeout: 120000, env }, (err, stdout, stderr) => {
      if (err) {
        reject({ error: err.message, stdout, stderr });
      } else {
        resolve({ stdout, stderr });
      }
    });
  });
}

// ─── Health ───────────────────────────────────────────────────────────────────

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', message: 'Gateway Utility server is running', port: PORT });
});

// ─── Auth config helpers ──────────────────────────────────────────────────────

function loadAuthConfig() {
  try {
    if (fs.existsSync(AUTH_CONFIG_FILE)) {
      return JSON.parse(fs.readFileSync(AUTH_CONFIG_FILE, 'utf8'));
    }
  } catch (_) { /* fall through */ }
  return { gateway: {}, oidc: {} };
}

function saveAuthConfig(data) {
  fs.writeFileSync(AUTH_CONFIG_FILE, JSON.stringify(data, null, 2), 'utf8');
}

// Simple HTTP/HTTPS GET helper that follows redirects (used for OIDC discovery)
function fetchUrl(url, options = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const mod = parsed.protocol === 'https:' ? https : http;
    const reqOpts = {
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: options.method || 'GET',
      headers: options.headers || {},
      rejectUnauthorized: false,
    };
    const req = mod.request(reqOpts, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

// ─── Auth config endpoints ────────────────────────────────────────────────────

app.get('/api/auth/config', (_req, res) => {
  const cfg = loadAuthConfig();
  // Never expose clientSecret in GET response
  const safe = JSON.parse(JSON.stringify(cfg));
  if (safe.oidc) safe.oidc.clientSecret = safe.oidc.clientSecret ? '***' : '';
  res.json(safe);
});

app.post('/api/auth/config', (req, res) => {
  try {
    const existing = loadAuthConfig();
    const incoming = req.body;
    // If clientSecret is '***' (masked), keep the existing value
    if (incoming.oidc && incoming.oidc.clientSecret === '***') {
      incoming.oidc.clientSecret = existing.oidc?.clientSecret || '';
    }
    const merged = {
      gateway: { ...existing.gateway, ...(incoming.gateway || {}) },
      oidc:    { ...existing.oidc,    ...(incoming.oidc    || {}) },
    };
    saveAuthConfig(merged);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: String(err) });
  }
});

// ─── Auth URL reachability probe ─────────────────────────────────────────────
// Tests whether a URL (e.g. gateway loginUrl) is reachable.
//
// Design: any HTTP response = gateway is reachable. The verdict label varies by
// status code so the UI can give contextual feedback without treating 4xx/5xx as
// connectivity failures. Only network-layer errors (ECONNREFUSED, ENOTFOUND,
// timeout) mean the host is truly unreachable.
//
// Also extracts TLS certificate info (expiry, issuer, self-signed flag) from the
// established socket so the frontend can surface cert health alongside reachability.

app.post('/api/auth/test-url', async (req, res) => {
  const { url } = req.body || {};
  if (!url) return res.status(400).json({ success: false, error: 'url is required.' });

  let parsed;
  try { parsed = new URL(url); } catch {
    return res.status(400).json({ success: false, error: `Invalid URL: ${url}` });
  }

  const isHttps = parsed.protocol === 'https:';
  const mod     = isHttps ? https : http;
  const port    = parsed.port ? Number(parsed.port) : (isHttps ? 443 : 80);
  const startTime = Date.now();

  function probe(method) {
    return new Promise((resolve) => {
      const opts = {
        hostname: parsed.hostname,
        port,
        path: parsed.pathname + parsed.search,
        method,
        rejectUnauthorized: false,
        timeout: 8000,
        headers: { 'User-Agent': 'GatewayUtility/1.0 (connectivity-check)' },
      };
      const r = mod.request(opts, (resp) => {
        // Extract TLS certificate info from the established socket (best-effort)
        let certInfo = null;
        if (isHttps && resp.socket && typeof resp.socket.getPeerCertificate === 'function') {
          try {
            const cert = resp.socket.getPeerCertificate();
            if (cert && cert.subject) {
              const isSelfSigned =
                cert.subject?.CN && cert.issuer?.CN &&
                JSON.stringify(cert.subject) === JSON.stringify(cert.issuer);
              certInfo = {
                subject:    cert.subject?.CN || cert.subject?.O || '',
                issuer:     cert.issuer?.CN  || cert.issuer?.O  || '',
                validTo:    cert.valid_to    || null,
                selfSigned: !!isSelfSigned,
              };
            }
          } catch (_) { /* cert extraction is best-effort — never block on failure */ }
        }
        resp.resume(); // drain response body so the socket can be reused
        resolve({ ok: true, status: resp.statusCode, certInfo });
      });
      r.on('timeout', () => { r.destroy(); resolve({ ok: false, error: 'Connection timed out (8 s)', code: 'ETIMEDOUT' }); });
      r.on('error',   (e) => resolve({ ok: false, error: e.message, code: e.code }));
      r.end();
    });
  }

  // HEAD is lightweight; fall back to GET only on a network-level error.
  // Any HTTP status returned by HEAD (405, 401, 500…) is still a successful probe.
  let result = await probe('HEAD');
  if (!result.ok) result = await probe('GET');

  const responseTimeMs = Date.now() - startTime;

  if (result.ok) {
    const status = result.status;

    // Status-aware verdict — all paths are "success: true" because any HTTP
    // response proves the gateway is reachable at the network level.
    let verdict, level;
    if (status >= 200 && status < 300) {
      verdict = 'Endpoint responded successfully';                              level = 'ok';
    } else if (status === 401 || status === 402) {
      verdict = 'Endpoint is live — authentication required (expected)';        level = 'ok';
    } else if (status === 403) {
      verdict = 'Endpoint reached — access denied without credentials';         level = 'warn';
    } else if (status === 404) {
      verdict = 'Endpoint not found — verify the login URL path';               level = 'warn';
    } else if (status >= 500) {
      verdict = 'Host reachable — server error at this path';                   level = 'warn';
    } else {
      verdict = `Host reachable — HTTP ${status}`;                              level = 'ok';
    }

    res.json({ success: true, status, verdict, level, responseTimeMs, certInfo: result.certInfo || null });
  } else {
    // Network-layer failure — map error codes to actionable messages
    const code = result.code || '';
    const error =
      code === 'ECONNREFUSED' ? 'Connection refused — gateway may be offline or the port is wrong'
      : code === 'ENOTFOUND'  ? 'Host not found — check the gateway host URL'
      : code === 'ETIMEDOUT'  ? 'Connection timed out — gateway unreachable from this host'
      : result.error || 'Unknown network error';
    res.json({ success: false, error, code, responseTimeMs });
  }
});

// ─── OIDC Discovery proxy ─────────────────────────────────────────────────────
// Browser can't call the IDP directly due to CORS; proxy through here.

app.get('/api/auth/oidc-discover', async (_req, res) => {
  const cfg = loadAuthConfig();
  const discoveryUrl = cfg.oidc?.discoveryUrl;
  if (!discoveryUrl) {
    return res.status(400).json({ success: false, error: 'discoveryUrl not configured in auth-config.' });
  }
  try {
    const r = await fetchUrl(discoveryUrl);
    if (r.status !== 200) {
      return res.status(502).json({ success: false, error: `Discovery endpoint returned HTTP ${r.status}`, raw: r.body });
    }
    const doc = JSON.parse(r.body);
    res.json({ success: true, doc });
  } catch (err) {
    res.status(502).json({ success: false, error: String(err) });
  }
});

// ─── OIDC Init — generate state + nonce (+ optional PKCE), store in session ───
//
// pkceEnabled (default true): set to false in Auth Setup when the redirect_uri
// points to an intermediary server (e.g. API Gateway) that calls the token
// endpoint itself — that server has no code_verifier so PKCE must be omitted.
// Set to true (recommended) when redirect_uri points to this app's /auth/callback
// so the BFF token exchange can supply the code_verifier.

app.get('/api/auth/oidc-init', async (req, res) => {
  const cfg = loadAuthConfig();
  const oidc = cfg.oidc || {};
  if (!oidc.discoveryUrl || !oidc.clientId || !oidc.redirectUri) {
    return res.status(400).json({ success: false, error: 'OIDC not fully configured. Set discoveryUrl, clientId, and redirectUri in Auth Setup.' });
  }

  try {
    // Fetch discovery document
    const dr = await fetchUrl(oidc.discoveryUrl);
    if (dr.status !== 200) throw new Error(`Discovery returned HTTP ${dr.status}`);
    const doc = JSON.parse(dr.body);

    // Anti-CSRF state + replay-protection nonce
    const state = crypto.randomBytes(24).toString('hex');
    const nonce = crypto.randomBytes(24).toString('hex');

    // Build base authorization URL
    const params = new URLSearchParams({
      response_type: 'code',
      client_id:     oidc.clientId,
      redirect_uri:  oidc.redirectUri,
      scope:         oidc.scopes || 'openid profile email',
      state,
      nonce,
    });

    // PKCE (S256) — enabled by default; disable via pkceEnabled: false in Auth Setup.
    // Only use PKCE when this app's /auth/callback is the redirect_uri so the
    // BFF token exchange endpoint (/api/auth/token-exchange) can supply code_verifier.
    const usePkce = oidc.pkceEnabled !== false;
    let codeVerifier;
    if (usePkce) {
      codeVerifier = crypto.randomBytes(48).toString('base64url');
      const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
      params.set('code_challenge_method', 'S256');
      params.set('code_challenge', codeChallenge);
    }

    // Store in server-side session (BFF — nothing sensitive sent to browser)
    req.session.oidcPending = { codeVerifier, state, nonce, doc };
    await new Promise((ok, fail) => req.session.save(e => e ? fail(e) : ok(undefined)));

    res.json({ success: true, authUrl: `${doc.authorization_endpoint}?${params.toString()}` });
  } catch (err) {
    res.status(500).json({ success: false, error: String(err) });
  }
});

// ─── OIDC Token Exchange (BFF — code → tokens, JWKS validation, session) ──────

app.post('/api/auth/token-exchange', async (req, res) => {
  const { code, state } = req.body || {};
  const pending = req.session.oidcPending;

  if (!pending) return res.status(400).json({ success: false, error: 'No OIDC flow in progress. Please restart login.' });
  if (state !== pending.state) return res.status(400).json({ success: false, error: 'State mismatch — possible CSRF. Please restart login.' });

  const cfg = loadAuthConfig();
  const oidc = cfg.oidc || {};
  const { doc, codeVerifier, nonce } = pending;

  try {
    // ── Build token request body ──────────────────────────────────────────────
    // tokenEndpointAuthMethod controls how client credentials are sent:
    //   client_secret_post  (default) — client_id + client_secret in POST body
    //   client_secret_basic           — Authorization: Basic base64(id:secret) header
    //   none                          — public client; only client_id in body (PKCE flow)
    const authMethod = oidc.tokenEndpointAuthMethod || 'client_secret_post';

    const tokenBody = new URLSearchParams({
      grant_type:   'authorization_code',
      code,
      redirect_uri: oidc.redirectUri,
    });
    if (codeVerifier) tokenBody.set('code_verifier', codeVerifier);

    const tokenHeaders = { 'Content-Type': 'application/x-www-form-urlencoded' };

    if (authMethod === 'client_secret_basic') {
      // RFC 6749 §2.3.1 — credentials in Authorization header, NOT in body
      const credentials = Buffer.from(
        `${encodeURIComponent(oidc.clientId)}:${encodeURIComponent(oidc.clientSecret || '')}`
      ).toString('base64');
      tokenHeaders['Authorization'] = `Basic ${credentials}`;
    } else {
      // client_secret_post or none — client_id (and optional secret) in body
      tokenBody.set('client_id', oidc.clientId);
      if (authMethod === 'client_secret_post' && oidc.clientSecret) {
        tokenBody.set('client_secret', oidc.clientSecret);
      }
    }

    const tokenResp = await fetchUrl(doc.token_endpoint, {
      method:  'POST',
      headers: tokenHeaders,
      body:    tokenBody.toString(),
    });

    if (tokenResp.status !== 200) {
      // Extract the most useful error message from the IDSP response
      let idspError = tokenResp.body;
      try {
        const parsed = JSON.parse(tokenResp.body);
        idspError = parsed.error_description || parsed.error || parsed.msg || parsed.message || tokenResp.body;
      } catch (_) { /* body is not JSON */ }
      return res.status(502).json({
        success: false,
        error:   `Token endpoint returned HTTP ${tokenResp.status}: ${idspError}`,
        detail:  tokenResp.body,
      });
    }

    const tokens = JSON.parse(tokenResp.body);
    const { access_token, id_token, expires_in } = tokens;

    if (!access_token) return res.status(502).json({ success: false, error: 'Token response missing access_token.' });

    // ── Validate ID Token (RS256) via JWKS ────────────────────────────────────
    let idClaims = {};
    if (id_token) {
      const { jwtVerify, createRemoteJWKSet } = await import('jose');
      const JWKS = createRemoteJWKSet(new URL(doc.jwks_uri));
      const { payload } = await jwtVerify(id_token, JWKS, {
        issuer:   doc.issuer,
        audience: oidc.clientId,
      });
      // Validate nonce to prevent replay attacks
      if (payload.nonce && payload.nonce !== nonce) {
        return res.status(400).json({ success: false, error: 'Nonce mismatch — possible replay attack.' });
      }
      idClaims = payload;
    }

    // ── Extract user identity from ID token or access token ───────────────────
    // IDSP-specific claims: user_loginid, user_universalid, sub
    let atClaims = {};
    if (access_token) {
      const parts = access_token.split('.');
      if (parts.length === 3) {
        try { atClaims = JSON.parse(Buffer.from(parts[1], 'base64url').toString()); } catch (_) {}
      }
    }
    const username = idClaims.user_loginid || idClaims.preferred_username || idClaims.email || idClaims.sub
                  || atClaims.user_loginid || atClaims.sub || 'unknown';
    const email    = idClaims.email || atClaims.email || '';
    const sub      = idClaims.sub   || atClaims.sub   || '';
    const sid      = idClaims.sid   || '';  // IDSP session ID for logout
    const expiry   = atClaims.exp   || idClaims.exp
                  || Math.floor(Date.now() / 1000) + (expires_in || 3600);

    // ── Establish BFF session ─────────────────────────────────────────────────
    delete req.session.oidcPending;
    req.session.oidcAuth = {
      authenticated:      true,
      username,
      email,
      sub,
      sid,
      access_token,
      id_token: id_token || null,
      exp:      expiry,
      loginTime: Math.floor(Date.now() / 1000),
      lastIntrospect: 0,
      doc,   // cache discovery doc for logout / introspection
    };
    req.session.cookie.maxAge = (oidc.sessionMaxAgeSeconds || 3600) * 1000;
    await new Promise((ok, fail) => req.session.save(e => e ? fail(e) : ok(undefined)));

    res.json({ success: true, username, email });
  } catch (err) {
    res.status(500).json({ success: false, error: String(err) });
  }
});

// ─── OIDC Session status (polled every 60 s by frontend) ─────────────────────

app.get('/api/auth/session', async (req, res) => {
  const auth = req.session?.oidcAuth;
  if (!auth?.authenticated) return res.json({ valid: false, reason: 'no-session' });

  const now = Math.floor(Date.now() / 1000);
  const cfg = loadAuthConfig();
  const introspectInterval = (cfg.oidc?.introspectionIntervalSeconds || 300);

  // Check access token expiry (local, cheap)
  if (now >= auth.exp) {
    req.session.destroy(() => {});
    return res.json({ valid: false, reason: 'token-expired', username: auth.username });
  }

  // Periodic introspection — call IDP every introspectInterval seconds
  const timeSinceIntrospect = now - (auth.lastIntrospect || 0);
  if (auth.doc?.introspection_endpoint && timeSinceIntrospect >= introspectInterval) {
    try {
      const introBody = new URLSearchParams({ token: auth.access_token });
      const authHeader = cfg.oidc?.clientSecret
        ? 'Basic ' + Buffer.from(`${cfg.oidc.clientId}:${cfg.oidc.clientSecret}`).toString('base64')
        : 'Basic ' + Buffer.from(`${cfg.oidc?.clientId}:`).toString('base64');

      const ir = await fetchUrl(auth.doc.introspection_endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': authHeader,
        },
        body: introBody.toString(),
      });

      if (ir.status === 200) {
        const result = JSON.parse(ir.body);
        // IDSP returns active as boolean or string "true"
        const active = result.active === true || result.active === 'true';
        if (!active) {
          req.session.destroy(() => {});
          return res.json({ valid: false, reason: 'token-inactive', username: auth.username });
        }
        auth.lastIntrospect = now;
        // Update expiry from introspection if provided (IDSP returns ms, convert to s)
        if (result.exp) {
          auth.exp = result.exp > 9999999999 ? Math.floor(result.exp / 1000) : result.exp;
        }
        req.session.save(() => {});
      }
    } catch (_) { /* introspection errors are non-fatal — use local exp */ }
  }

  res.json({
    valid:     true,
    username:  auth.username,
    email:     auth.email,
    exp:       auth.exp,
    loginTime: auth.loginTime,
  });
});

// ─── OIDC Logout ──────────────────────────────────────────────────────────────

app.post('/api/auth/logout', async (req, res) => {
  const auth = req.session?.oidcAuth;
  const cfg  = loadAuthConfig();
  const oidc = cfg.oidc || {};

  // Build IDSP end_session URL
  let endSessionUrl = null;
  if (auth?.doc?.end_session_endpoint || auth?.doc?.['end_session_endpoint']) {
    const endEp = auth.doc.end_session_endpoint;
    const params = new URLSearchParams();
    if (auth.id_token) params.set('id_token_hint', auth.id_token);
    if (oidc.postLogoutRedirectUri) params.set('post_logout_redirect_uri', oidc.postLogoutRedirectUri);
    params.set('state', crypto.randomBytes(8).toString('hex'));
    endSessionUrl = `${endEp}?${params.toString()}`;
  }

  req.session.destroy(() => {});
  res.json({ success: true, endSessionUrl });
});

// ─── Graphman version ─────────────────────────────────────────────────────────
// Runs `graphman.sh version` and returns the parsed output so the frontend
// can display exactly what the installed client reports about itself.

app.get('/api/graphman-version', (_req, res) => {
  const config       = loadConfig();
  const graphmanHome = path.resolve(SCRIPTS_DIR, config.graphmanHome || '../../graphman-client-main');
  const graphmanScript = path.join(graphmanHome, 'graphman.sh');
  const env          = buildEnv(graphmanHome);

  if (!fs.existsSync(graphmanScript)) {
    return res.status(500).json({
      success: false,
      error: `graphman.sh not found at: ${graphmanScript}`,
      raw: '',
    });
  }

  exec(`"${graphmanScript}" version`, { cwd: SCRIPTS_DIR, timeout: 15000, env }, (err, stdout, stderr) => {
    const raw = [stdout, stderr].filter(Boolean).join('\n').trim();

    if (err && !raw) {
      return res.status(500).json({ success: false, error: err.message, raw });
    }

    // Parse the well-known output lines from graphman-operation-version.js:
    //   graphman client v1.3.0
    //     schema v11.1.1
    //     supported schema(s) [v10.1.00, v11.0.00, ...]
    //     supported extension(s) [...]
    //     home /app/graphman-client
    //     github https://github.com/...
    const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);

    const parsed = {
      client:              '',
      schema:              '',
      supportedSchemas:    [],
      supportedExtensions: [],
      home:                '',
      github:              '',
    };

    for (const line of lines) {
      if (line.startsWith('graphman client '))      parsed.client   = line.replace('graphman client ', '').trim();
      else if (line.startsWith('schema '))          parsed.schema   = line.replace('schema ', '').trim();
      else if (line.startsWith('supported schema(s)')) {
        const m = line.match(/\[([^\]]*)\]/);
        parsed.supportedSchemas = m ? m[1].split(',').map(s => s.trim()).filter(Boolean) : [];
      } else if (line.startsWith('supported extension(s)')) {
        const m = line.match(/\[([^\]]*)\]/);
        parsed.supportedExtensions = m ? m[1].split(',').map(s => s.trim()).filter(Boolean) : [];
      } else if (line.startsWith('home '))          parsed.home     = line.replace('home ', '').trim();
      else if (line.startsWith('github '))          parsed.github   = line.replace('github ', '').trim();
    }

    res.json({ success: true, raw, parsed });
  });
});

// ─── Config ───────────────────────────────────────────────────────────────────

app.get('/api/config', (_req, res) => {
  res.json(loadConfig());
});

app.post('/api/config', (req, res) => {
  try {
    const current = loadConfig();
    const updated = { ...current, ...req.body };
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(updated, null, 2), 'utf8');
    res.json({ success: true, config: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: String(err) });
  }
});

// ─── Find Assertions ──────────────────────────────────────────────────────────

app.post('/api/search-assertions', async (req, res) => {
  const config = loadConfig();
  const { assertionType, replaceEnabled } = req.body;
  const type = assertionType || config.assertionType || 'EvaluateJsonPathExpressionV2';
  const replaceFlag = replaceEnabled ? 'true' : 'false';
  const graphmanHome = path.resolve(SCRIPTS_DIR, config.graphmanHome || '../../graphman-client-main');

  try {
    const result = await runScript(
      path.join(SCRIPTS_DIR, 'SearchAssertions.js'),
      `"${type}" --replace-enabled ${replaceFlag}`,
      SCRIPTS_DIR,
      graphmanHome
    );
    res.json({ success: true, assertionType: type, ...result });
  } catch (err) {
    res.status(500).json({ success: false, ...err });
  }
});

app.post('/api/export-bundles', async (req, res) => {
  const config = loadConfig();
  const { gateway, schema } = req.body;
  const gw = gateway || config.sourceGateway || 'aws';
  const sc = schema || config.exportSchema || 'v11.1.3';
  const graphmanHome = path.resolve(SCRIPTS_DIR, config.graphmanHome || '../../graphman-client-main');

  try {
    const result = await runScript(
      path.join(SCRIPTS_DIR, 'ExportBundles.js'),
      `--gateway "${gw}" --schema "${sc}"`,
      SCRIPTS_DIR,
      graphmanHome
    );
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, ...err });
  }
});

app.post('/api/replace-assertions', async (req, res) => {
  const { resultsFile, searchAssertion, replaceAssertion } = req.body;
  if (!resultsFile || !searchAssertion || !replaceAssertion) {
    return res.status(400).json({ success: false, error: 'resultsFile, searchAssertion, replaceAssertion are required' });
  }
  const config = loadConfig();
  const graphmanHome = path.resolve(SCRIPTS_DIR, config.graphmanHome || '../../graphman-client-main');

  try {
    const result = await runScript(
      path.join(SCRIPTS_DIR, 'ReplaceAssertions.js'),
      `"${resultsFile}" "${searchAssertion}" "${replaceAssertion}"`,
      SCRIPTS_DIR,
      graphmanHome
    );
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, ...err });
  }
});

app.post('/api/import-bundles', async (req, res) => {
  const config = loadConfig();
  const { gateway, schema } = req.body;
  const gw = gateway || config.targetGateway || 'aws';
  const sc = schema || config.importSchema || 'v11.1.3';
  const graphmanHome = path.resolve(SCRIPTS_DIR, config.graphmanHome || '../../graphman-client-main');

  try {
    const result = await runScript(
      path.join(SCRIPTS_DIR, 'ImportBundles.js'),
      `--gateway "${gw}" --schema "${sc}"`,
      SCRIPTS_DIR,
      graphmanHome
    );
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, ...err });
  }
});

// ─── Results ──────────────────────────────────────────────────────────────────

app.get('/api/results', (_req, res) => {
  try {
    if (!fs.existsSync(RESPONSE_DIR)) {
      return res.json([]);
    }
    const files = fs.readdirSync(RESPONSE_DIR)
      .filter(f => f.endsWith('-results.json'))
      .map(f => {
        const filePath = path.join(RESPONSE_DIR, f);
        const stat = fs.statSync(filePath);
        return { name: f, modified: stat.mtime };
      })
      .sort((a, b) => b.modified - a.modified);
    res.json(files);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get('/api/results/:filename', (req, res) => {
  try {
    const filePath = path.join(RESPONSE_DIR, req.params.filename);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found' });
    }
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get('/api/input-data', (_req, res) => {
  try {
    const filePath = path.join(RESPONSE_DIR, 'spFolderSVCFull.json');
    if (!fs.existsSync(filePath)) {
      return res.json({ exists: false });
    }
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const services = data.services ? data.services.length : 0;
    const policies = data.policies ? data.policies.length : 0;
    const hostname = data.properties?.meta?.hostname || 'N/A';
    res.json({ exists: true, services, policies, total: services + policies, hostname });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ─── Shared policy helpers ────────────────────────────────────────────────────

function getPolicyCode(entry) {
  if (!entry || !entry.policy) return null;
  if (entry.policy.code && typeof entry.policy.code === 'object') return entry.policy.code;
  if (entry.policy.json) {
    try {
      return typeof entry.policy.json === 'string'
        ? JSON.parse(entry.policy.json)
        : entry.policy.json;
    } catch { return null; }
  }
  return null;
}

function deepSearchAssertion(obj, assertionName) {
  if (!obj || typeof obj !== 'object') return false;
  if (Array.isArray(obj)) return obj.some(i => deepSearchAssertion(i, assertionName));
  if (Object.prototype.hasOwnProperty.call(obj, assertionName)) return true;
  return Object.values(obj).some(v =>
    typeof v === 'object' && v !== null && deepSearchAssertion(v, assertionName)
  );
}

// Deep search for an Encapsulated assertion whose encassName matches targetName.
function deepSearchEncassName(obj, targetName) {
  if (!obj || typeof obj !== 'object') return false;
  if (Array.isArray(obj)) return obj.some(i => deepSearchEncassName(i, targetName));
  if (
    Object.prototype.hasOwnProperty.call(obj, 'Encapsulated') &&
    obj.Encapsulated &&
    obj.Encapsulated.encassName === targetName
  ) return true;
  return Object.values(obj).some(v =>
    typeof v === 'object' && v !== null && deepSearchEncassName(v, targetName)
  );
}

function loadBundleData() {
  const filePath = path.join(RESPONSE_DIR, 'spFolderSVCFull.json');
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

// ─── Export All (load full bundle from gateway) ───────────────────────────────

// Resolve the bundle file path for a given source key ('source' | 'target').
function bundleFilePath(key) {
  return key === 'target'
    ? path.join(RESPONSE_DIR, 'spFolderSVCFull_target.json')
    : path.join(RESPONSE_DIR, 'spFolderSVCFull.json');
}

app.post('/api/export-all', (req, res) => {
  const config = loadConfig();
  // outputKey: 'source' (default) writes spFolderSVCFull.json
  //            'target'          writes spFolderSVCFull_target.json
  const outputKey = req.body.outputKey === 'target' ? 'target' : 'source';
  const defaultGw = outputKey === 'target' ? config.targetGateway : config.sourceGateway;
  const gateway = req.body.gateway || defaultGw || 'aws';
  const graphmanHome = path.resolve(SCRIPTS_DIR, config.graphmanHome || '../../graphman-client-main');
  const graphmanScript = path.join(graphmanHome, 'graphman.sh');
  const outputFile = bundleFilePath(outputKey);

  if (!fs.existsSync(RESPONSE_DIR)) {
    fs.mkdirSync(RESPONSE_DIR, { recursive: true });
  }

  if (!fs.existsSync(graphmanScript)) {
    return res.status(400).json({
      success: false,
      error: `graphman.sh not found at: ${graphmanScript}`,
      hint: 'Check the graphmanHome value in Configuration (Find Assertions page).',
    });
  }

  // Use importSchema when loading from the target gateway, exportSchema for source.
  // A schema override from the request body takes highest precedence.
  const schemaDefault = gateway === config.targetGateway
    ? (config.importSchema || config.exportSchema)
    : (config.exportSchema || config.importSchema);
  const schema = req.body.schema || schemaDefault || 'v11.1.00';
  const cmd = `"${graphmanScript}" export --gateway "${gateway}" --using all --options.schema "${schema}" --output "${outputFile}"`;
  const env = buildEnv(graphmanHome);

  // Snapshot the file's mtime BEFORE exec so we can detect stale-file false-positives later.
  // graphman.sh sometimes exits 0 on ECONNREFUSED without writing a new file; if an old
  // export file already exists the simple existence check would wrongly return success.
  const priorMtime = fs.existsSync(outputFile) ? fs.statSync(outputFile).mtimeMs : 0;

  // 60 s hard limit — enough for a healthy gateway, fast failure for a dead one.
  exec(cmd, { cwd: SCRIPTS_DIR, timeout: 60000, env }, (err, stdout, stderr) => {
    const combinedOutput = [stdout, stderr].filter(Boolean).join('\n').trim();
    if (err) {
      const timedOut = err.killed || err.signal === 'SIGTERM' || err.code === 'ETIMEDOUT';
      return res.status(500).json({
        success: false,
        timedOut,
        error: timedOut
          ? `Gateway "${gateway}" did not respond within 60 seconds — it may be unreachable or misconfigured.`
          : `Export failed for gateway "${gateway}".`,
        detail: combinedOutput || err.message,
        hint: timedOut
          ? 'Check that the gateway name matches an entry in graphman.configuration and that the host is reachable from this machine.'
          : 'Verify the gateway name matches an entry in graphman.configuration and that the gateway is reachable.',
      });
    }

    // Guard 1 — file must exist
    if (!fs.existsSync(outputFile)) {
      return res.status(500).json({
        success: false,
        timedOut: false,
        error: 'Export ran but the output file was not created.',
        detail: combinedOutput,
        hint: 'This usually means graphman.sh exited cleanly but produced no output. Check gateway connectivity and permissions.',
      });
    }

    // Guard 2 — file must be NEWER than before the exec started.
    // If mtime is unchanged, graphman.sh exited 0 silently (e.g. ECONNREFUSED) and the
    // output file on disk is stale data from a previous run — report that as failure.
    const stat = fs.statSync(outputFile);
    if (stat.mtimeMs <= priorMtime) {
      return res.status(500).json({
        success: false,
        timedOut: false,
        error: `Gateway "${gateway}" appears unreachable — export completed without writing new data (stale file detected).`,
        detail: combinedOutput || 'graphman.sh exited with code 0 but the output file was not updated.',
        hint: 'A previous export file exists on disk but was not refreshed this run. Verify the gateway is running and reachable.',
      });
    }

    // Guard 3 — file must contain valid JSON with at least one recognised gateway entity key.
    // An empty bundle ({} or {"items":[]}) or a network-error stub would fail this check.
    let bundle;
    try {
      bundle = JSON.parse(fs.readFileSync(outputFile, 'utf8'));
    } catch (parseErr) {
      return res.status(500).json({
        success: false,
        error: 'Export completed but the output file contains invalid JSON.',
        detail: String(parseErr),
        hint: 'This may indicate a gateway error or a malformed response from graphman.sh.',
      });
    }
    const ENTITY_KEYS = [
      'webApiServices', 'internalWebApiServices', 'backgroundTaskServices',
      'policyFragments', 'encassConfigs', 'listenPorts', 'clusterProperties',
      'trustedCerts', 'keys', 'sslKeys', 'jdbcConnections', 'scheduledTasks',
    ];
    const hasEntityData = ENTITY_KEYS.some(k => Array.isArray(bundle[k]));
    if (!hasEntityData) {
      const preview = JSON.stringify(bundle).slice(0, 400);
      return res.status(500).json({
        success: false,
        error: `Export returned no entity data for gateway "${gateway}" — the gateway may have responded with an error.`,
        detail: combinedOutput ? `${combinedOutput}\n\nFile content: ${preview}` : `File content: ${preview}`,
        hint: 'Verify the gateway credentials in graphman.configuration are correct and the gateway is running.',
      });
    }

    res.json({ success: true, gateway, outputKey, outputFile, sizeBytes: stat.size, output: combinedOutput });
  });
});

// ─── Encass Configs ───────────────────────────────────────────────────────────

app.get('/api/encass-configs', (_req, res) => {
  try {
    const data = loadBundleData();
    if (!data) return res.json({ exists: false, configs: [] });
    const configs = (data.encassConfigs || []).map(e => ({
      name: e.name,
      description: e.description || '',
      policyName: e.policyName || '',
      guid: e.guid || '',
    }));
    const hostname = data.properties?.meta?.hostname || 'N/A';
    res.json({ exists: true, hostname, configs });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ─── Encass Compliance ────────────────────────────────────────────────────────

app.post('/api/encass-compliance', (req, res) => {
  const { encassName } = req.body;
  if (!encassName) {
    return res.status(400).json({ success: false, error: 'encassName is required' });
  }

  try {
    const data = loadBundleData();
    if (!data) {
      return res.status(404).json({ success: false, error: 'Bundle data not found. Run a search export first to load spFolderSVCFull.json.' });
    }

    const hostname = data.properties?.meta?.hostname || 'N/A';
    const services = data.services || [];
    const policies = data.policies || [];

    const results = [];

    services.forEach(svc => {
      const code = getPolicyCode(svc);
      const compliant = code ? deepSearchEncassName(code, encassName) : false;
      results.push({
        type: 'Service',
        name: svc.name || 'Unknown',
        resolutionPath: svc.resolutionPath || 'N/A',
        folderPath: svc.folderPath || 'N/A',
        compliant,
      });
    });

    policies.forEach(pol => {
      const code = getPolicyCode(pol);
      const compliant = code ? deepSearchEncassName(code, encassName) : false;
      results.push({
        type: 'Policy',
        name: pol.name || 'Unknown',
        resolutionPath: 'N/A',
        folderPath: pol.folderPath || 'N/A',
        compliant,
      });
    });

    res.json({
      success: true,
      hostname,
      timestamp: new Date().toISOString(),
      encassName,
      totalServices: services.length,
      totalPolicies: policies.length,
      totalItems: services.length + policies.length,
      compliantCount: results.filter(r => r.compliant).length,
      nonCompliantCount: results.filter(r => !r.compliant).length,
      results,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: String(err) });
  }
});

// ─── Compliance (legacy assertion-based) ─────────────────────────────────────

app.post('/api/compliance-check', async (req, res) => {
  const { assertions } = req.body;
  if (!assertions || !Array.isArray(assertions) || assertions.length === 0) {
    return res.status(400).json({ success: false, error: 'assertions array is required' });
  }

  try {
    const data = loadBundleData();
    if (!data) return res.status(404).json({ success: false, error: 'Input data file not found.' });

    const hostname = data.properties?.meta?.hostname || 'N/A';
    const services = data.services || [];
    const policies = data.policies || [];

    const results = assertions.map(assertion => {
      const items = [];
      [...services.map(s => ({ ...s, _type: 'Service' })), ...policies.map(p => ({ ...p, _type: 'Policy' }))].forEach(item => {
        const code = getPolicyCode(item);
        if (code && deepSearchAssertion(code, assertion)) {
          items.push({ type: item._type, name: item.name, folderPath: item.folderPath || 'N/A', resolutionPath: item.resolutionPath || 'N/A' });
        }
      });
      return { assertion, count: items.length, items };
    });

    res.json({
      success: true, hostname,
      timestamp: new Date().toISOString(),
      totalServices: services.length,
      totalPolicies: policies.length,
      results,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: String(err) });
  }
});

// ─── Certificates ─────────────────────────────────────────────────────────────

app.get('/api/certificates', (_req, res) => {
  const filePath = path.join(RESPONSE_DIR, 'spFolderSVCFull.json');
  if (!fs.existsSync(filePath)) {
    return res.json({ exists: false, certificates: [] });
  }

  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const certs = data.trustedCertificates || data.certificates || [];
    const keystoreEntries = data.privateKeys || [];

    const formattedCerts = certs.map((c, i) => ({
      id: i + 1,
      name: c.name || c.subjectDn || `Certificate ${i + 1}`,
      subjectDn: c.certBase64 ? parseCertSubject(c) : (c.subjectDn || 'N/A'),
      issuerDn: c.issuerDn || 'N/A',
      notBefore: c.notBefore || null,
      notAfter: c.notAfter || null,
      thumbprintSha1: c.thumbprintSha1 || 'N/A',
      type: 'Trusted Certificate',
      enabled: c.trustedForSsl !== false,
    }));

    const formattedKeys = keystoreEntries.map((k, i) => ({
      id: certs.length + i + 1,
      name: k.alias || `Key ${i + 1}`,
      subjectDn: k.subjectDn || 'N/A',
      issuerDn: k.issuerDn || 'N/A',
      notBefore: null,
      notAfter: null,
      thumbprintSha1: 'N/A',
      type: 'Private Key',
      enabled: true,
    }));

    res.json({
      exists: true,
      hostname: data.properties?.meta?.hostname || 'N/A',
      certificates: [...formattedCerts, ...formattedKeys],
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

function parseCertSubject(cert) {
  return cert.name || cert.subjectDn || 'N/A';
}

// ─── Generated Bundles ────────────────────────────────────────────────────────

app.get('/api/bundles', (_req, res) => {
  try {
    if (!fs.existsSync(GENERATED_DIR)) {
      return res.json([]);
    }
    const files = fs.readdirSync(GENERATED_DIR)
      .filter(f => f.endsWith('.json') && !f.includes('.backup.'))
      .map(f => {
        const stat = fs.statSync(path.join(GENERATED_DIR, f));
        return { name: f, size: stat.size, modified: stat.mtime };
      });
    res.json(files);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get('/api/bundles/:filename', (req, res) => {
  const filename = path.basename(req.params.filename); // prevent path traversal
  if (!filename.endsWith('.json') || filename.includes('.backup.')) {
    return res.status(400).json({ error: 'Invalid filename' });
  }
  const filePath = path.join(GENERATED_DIR, filename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: `Bundle file not found: ${filename}. Run Export Bundles first.` });
  }
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    res.setHeader('Content-Type', 'application/json');
    res.send(content);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ─── Entity Updates ───────────────────────────────────────────────────────────

// List all top-level entity keys that are non-empty arrays.
// Query param: ?from=target reads spFolderSVCFull_target.json instead.
app.get('/api/entities', (req, res) => {
  const fromKey = req.query.from === 'target' ? 'target' : 'source';
  const bundleFile = bundleFilePath(fromKey);
  const config = loadConfig();

  // Always return gateway config regardless of whether the file exists
  const base = {
    sourceGateway: config.sourceGateway || '',
    targetGateway: config.targetGateway || '',
    sourceFileModified: fs.existsSync(bundleFilePath('source'))
      ? fs.statSync(bundleFilePath('source')).mtime : null,
    targetFileModified: fs.existsSync(bundleFilePath('target'))
      ? fs.statSync(bundleFilePath('target')).mtime : null,
  };

  if (!fs.existsSync(bundleFile)) {
    return res.json({ exists: false, entities: [], counts: {}, from: fromKey, ...base });
  }
  try {
    const stat = fs.statSync(bundleFile);
    const data = JSON.parse(fs.readFileSync(bundleFile, 'utf8'));
    const counts = {};
    const entities = Object.keys(data)
      .filter(k => Array.isArray(data[k]) && data[k].length > 0)
      .sort();
    entities.forEach(k => { counts[k] = data[k].length; });
    res.json({
      exists: true, entities, counts, from: fromKey,
      fileModified: stat.mtime,
      totalEntityTypes: entities.length,
      totalItems: entities.reduce((s, k) => s + (data[k]?.length ?? 0), 0),
      ...base,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: String(err) });
  }
});

// Get all items for a specific entity type.
// Query param: ?from=target reads from the target bundle.
app.get('/api/entities/:entityType', (req, res) => {
  const fromKey = req.query.from === 'target' ? 'target' : 'source';
  const bundleFile = bundleFilePath(fromKey);
  if (!fs.existsSync(bundleFile)) {
    const label = fromKey === 'target' ? 'Target bundle' : 'Source bundle';
    return res.status(404).json({ success: false, error: `${label} not found. Run a gateway export first.` });
  }
  try {
    const data = JSON.parse(fs.readFileSync(bundleFile, 'utf8'));
    const { entityType } = req.params;
    if (!Array.isArray(data[entityType])) {
      return res.status(404).json({ success: false, error: `Entity type '${entityType}' not found in ${fromKey} bundle.` });
    }
    res.json({ success: true, entityType, items: data[entityType], from: fromKey });
  } catch (err) {
    res.status(500).json({ success: false, error: String(err) });
  }
});

// Import a single edited entity back to the target gateway
app.post('/api/entity-import', (req, res) => {
  const config = loadConfig();
  const { entityType, entityData, gateway } = req.body;
  if (!entityType || !entityData) {
    return res.status(400).json({ success: false, error: 'entityType and entityData are required.' });
  }

  const gw = gateway || config.targetGateway || 'aws';
  const graphmanHome = path.resolve(SCRIPTS_DIR, config.graphmanHome || '../../graphman-client-main');
  const graphmanScript = path.join(graphmanHome, 'graphman.sh');

  if (!fs.existsSync(graphmanScript)) {
    return res.status(400).json({
      success: false,
      error: `graphman.sh not found at: ${graphmanScript}`,
      hint: 'Check the graphmanHome value in Configuration (Find Assertions page).',
    });
  }

  // Write a minimal graphman bundle containing only this entity
  const tmpFile = path.join(RESPONSE_DIR, `tmp_import_${Date.now()}.json`);
  try {
    fs.writeFileSync(tmpFile, JSON.stringify({ [entityType]: [entityData] }, null, 2));
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Failed to write temporary import file.', detail: String(err) });
  }

  const importSchema = config.importSchema || 'v11.1.00';
  const cmd = `"${graphmanScript}" import --gateway "${gw}" --options.schema "${importSchema}" --input "${tmpFile}"`;
  const env = buildEnv(graphmanHome);

  exec(cmd, { cwd: SCRIPTS_DIR, timeout: 60000, env }, (err, stdout, stderr) => {
    try { fs.unlinkSync(tmpFile); } catch (_) {}
    const combinedOutput = [stdout, stderr].filter(Boolean).join('\n').trim();
    if (err) {
      return res.status(500).json({
        success: false,
        error: `Import to gateway "${gw}" failed.`,
        detail: combinedOutput || err.message,
        hint: 'Verify the gateway name matches an entry in graphman configuration and is reachable.',
      });
    }
    res.json({ success: true, gateway: gw, output: combinedOutput });
  });
});

// ─── Entity Forge — Schema Discovery ─────────────────────────────────────────

// In-memory cache: avoid re-reading schema files on every request.
const _schemaCache = {};

function loadSchemaData(schemaVersion, graphmanHome) {
  if (_schemaCache[schemaVersion]) return _schemaCache[schemaVersion];

  const metadataFile = path.join(graphmanHome, 'schema', schemaVersion, 'metadata.json');
  if (!fs.existsSync(metadataFile)) {
    throw new Error(`Schema metadata not found at: ${metadataFile}. Check graphmanHome and exportSchema in config.`);
  }

  const metadata = JSON.parse(fs.readFileSync(metadataFile, 'utf8'));

  // Parse schema.graphql to extract: (a) which fields are arrays, (b) enum values.
  const arrayFields = {};  // "TypeName.fieldName" → true
  const enumValues  = {};  // "EnumType" → ["VAL1", ...]

  const schemaFile = path.join(graphmanHome, 'schema', schemaVersion, 'schema.graphql');
  if (fs.existsSync(schemaFile)) {
    const lines = fs.readFileSync(schemaFile, 'utf8').split(/\r?\n/);
    let currentType = null;
    let isEnum = false;
    for (const line of lines) {
      const typeLine = line.match(/^(type|enum|interface|input)\s+(\w+)/);
      if (typeLine) { currentType = typeLine[2]; isEnum = typeLine[1] === 'enum'; if (isEnum) enumValues[currentType] = []; continue; }
      if (line.trim() === '}') { currentType = null; isEnum = false; continue; }
      if (currentType && isEnum) {
        const val = line.trim().split(/[\s#@]/)[0].trim();
        if (val) enumValues[currentType].push(val);
      } else if (currentType) {
        const fm = line.match(/^\s+(\w+)\s*[:(]\s*\[/);
        if (fm) arrayFields[`${currentType}.${fm[1]}`] = true;
      }
    }
  }

  const result = { metadata, arrayFields, enumValues };
  _schemaCache[schemaVersion] = result;
  return result;
}

// Resolve a type's fields with enriched metadata (array flag, enum values, nested fields).
function resolveTypeFields(typeInfo, metadata, arrayFields, enumValues, depth) {
  const skip = new Set(['goid', 'checksum']);
  const excluded = new Set(typeInfo.excludedFields || []);
  const included = typeInfo.includedFields && typeInfo.includedFields.length > 0
    ? new Set(typeInfo.includedFields) : null;

  return typeInfo.fields
    .filter(f => !skip.has(f.name) && f.dataType !== 'ID' && !excluded.has(f.name))
    .filter(f => !included || included.has(f.name))
    .map(f => {
      const isPrimitive = metadata.primitiveTypes.includes(f.dataType);
      const isArray     = !!(arrayFields[`${typeInfo.typeName}.${f.name}`]);
      const isEnum      = isPrimitive && enumValues[f.dataType] !== undefined;
      const enumVals    = isEnum ? (enumValues[f.dataType] || []) : null;
      const nestedInfo  = (!isPrimitive && depth < 2) ? metadata.types[f.dataType] : null;
      const nestedFields = nestedInfo ? resolveTypeFields(nestedInfo, metadata, arrayFields, enumValues, depth + 1) : null;
      return { name: f.name, dataType: f.dataType, isPrimitive, isArray, isEnum, enumValues: enumVals, nestedFields };
    });
}

// GET /api/schema/versions — list all schema versions available in graphmanHome/schema/
// Used to populate the Export/Import schema dropdowns in the Configuration page.
app.get('/api/schema/versions', (req, res) => {
  const config = loadConfig();
  const graphmanHome = path.resolve(SCRIPTS_DIR, config.graphmanHome || '../../graphman-client-main');
  const schemaDir = path.join(graphmanHome, 'schema');

  try {
    if (!fs.existsSync(schemaDir)) {
      return res.json({ success: true, versions: [], schemaDir });
    }
    const versions = fs.readdirSync(schemaDir)
      .filter(name => {
        try {
          return fs.statSync(path.join(schemaDir, name)).isDirectory();
        } catch { return false; }
      })
      // Sort semantically: v11.1.00 < v11.1.1 < v11.2.0 etc.
      .sort((a, b) => {
        const toNum = s => s.replace(/^v/i, '').split('.').map(n => parseInt(n, 10) || 0);
        const an = toNum(a), bn = toNum(b);
        for (let i = 0; i < Math.max(an.length, bn.length); i++) {
          const diff = (an[i] || 0) - (bn[i] || 0);
          if (diff !== 0) return diff;
        }
        return 0;
      });
    res.json({ success: true, versions, schemaDir });
  } catch (err) {
    res.status(500).json({ success: false, error: String(err), versions: [] });
  }
});

// GET /api/schema/describe — lists entity types, mutations, queries, built-in queries.
// Priority: ?schemaVersion= (explicit) > ?gateway= role-based lookup > config.json defaults.
app.get('/api/schema/describe', (req, res) => {
  const config = loadConfig();
  const reqGateway    = req.query.gateway;
  const reqSchemaVer  = req.query.schemaVersion;
  const schemaVersion = reqSchemaVer
    || (reqGateway === config.targetGateway ? config.importSchema : config.exportSchema)
    || 'v11.1.00';
  const graphmanHome  = path.resolve(SCRIPTS_DIR, config.graphmanHome || '../../graphman-client-main');
  try {
    const { metadata } = loadSchemaData(schemaVersion, graphmanHome);

    // L7 importable entity types
    const entityTypes = Object.values(metadata.types)
      .filter(t => t.isL7Entity && !t.deprecated)
      .map(t => ({ typeName: t.typeName, pluralName: t.pluralName, singularName: t.singularName }))
      .sort((a, b) => a.typeName.localeCompare(b.typeName));

    // Built-in query names from the Query type
    const queryType = metadata.types['Query'];
    const builtinQueries = queryType ? queryType.fields.map(f => f.name).sort() : [];

    // File-based queries & mutations from queries/ directory
    const queriesDir = path.join(graphmanHome, 'queries');
    const queries = [], mutations = [];
    if (fs.existsSync(queriesDir)) {
      fs.readdirSync(queriesDir).forEach(file => {
        if (!file.endsWith('.json')) return;
        const name = file.replace('.json', '');
        const gqlFile = path.join(queriesDir, name + '.gql');
        const isMutation = fs.existsSync(gqlFile) && fs.readFileSync(gqlFile, 'utf8').trim().startsWith('mutation');
        (isMutation ? mutations : queries).push(name);
      });
    }

    res.json({ success: true, schemaVersion, entityTypes, builtinQueries, queries: queries.sort(), mutations: mutations.sort() });
  } catch (err) {
    res.status(500).json({ success: false, error: String(err) });
  }
});

// GET /api/schema/type/:typeName — full field definition for one entity type.
// Priority: ?schemaVersion= (explicit) > ?gateway= role-based lookup > config.json defaults.
app.get('/api/schema/type/:typeName', (req, res) => {
  const config = loadConfig();
  const reqGateway    = req.query.gateway;
  const reqSchemaVer  = req.query.schemaVersion;
  const schemaVersion = reqSchemaVer
    || (reqGateway === config.targetGateway ? config.importSchema : config.exportSchema)
    || 'v11.1.00';
  const graphmanHome  = path.resolve(SCRIPTS_DIR, config.graphmanHome || '../../graphman-client-main');
  try {
    const { metadata, arrayFields, enumValues } = loadSchemaData(schemaVersion, graphmanHome);
    const name = req.params.typeName;

    // Look up by typeName, then by pluralName/singularName
    let typeInfo = metadata.types[name]
      || Object.values(metadata.types).find(t => t.isL7Entity && (t.pluralName === name || t.singularName === name));

    if (!typeInfo) {
      return res.status(404).json({ success: false, error: `Type "${name}" not found in schema version ${schemaVersion}.` });
    }

    const fields = resolveTypeFields(typeInfo, metadata, arrayFields, enumValues, 0);
    res.json({
      success: true, schemaVersion,
      typeName: typeInfo.typeName, pluralName: typeInfo.pluralName, singularName: typeInfo.singularName,
      identityFields: typeInfo.identityFields || [], fields,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: String(err) });
  }
});

// ─── Schema: ByFilters query metadata ─────────────────────────────────────────
// Parses schema.graphql to extract filter type info and entity field list for a
// named ByFilters query. Handles "extend type Query" (the schema uses multiple
// extend blocks, not a single "type Query"). Also handles array filter types like
// [EntityFilterInput!]! which all standard ByFilters queries use.

app.get('/api/schema/query-filters/:queryName', (req, res) => {
  const { queryName } = req.params;
  const config        = loadConfig();
  const schemaVersion = req.query.schemaVersion || config.exportSchema || 'v11.1.00';
  const graphmanHome  = path.resolve(SCRIPTS_DIR, config.graphmanHome || '../../graphman-client-main');
  const schemaFile    = path.join(graphmanHome, 'schema', schemaVersion, 'schema.graphql');

  if (!fs.existsSync(schemaFile)) {
    return res.status(404).json({ success: false, error: `Schema file not found for version ${schemaVersion}. Check graphmanHome and exportSchema in Configuration.` });
  }

  const lines = fs.readFileSync(schemaFile, 'utf8').split(/\r?\n/);

  // ── Pass 1: find query definition — handles "extend type Query" blocks ────
  // The schema uses multiple "extend type Query { ... }" blocks rather than a
  // single "type Query". We track in/out of each block by curly-brace depth.
  let filterArgName  = 'filters';
  let filterTypeName = null;
  let filterArgIsArray = false;
  let returnTypeName = null;
  let inQueryBlock   = false;

  for (const line of lines) {
    if (/^(extend\s+)?type\s+Query\b/.test(line)) { inQueryBlock = true; continue; }
    if (inQueryBlock && /^\}/.test(line.trim()))   { inQueryBlock = false; continue; }
    if (!inQueryBlock) continue;

    // e.g.: "  foldersByFilters(filters: [EntityFilterInput!]!): [Folder!]!"
    const qMatch = line.match(new RegExp(`\\b${queryName}\\s*\\(([^)]+)\\)\\s*:\\s*\\[?(\\w+)`));
    if (!qMatch) continue;

    returnTypeName = qMatch[2];
    // Parse first argument: captures argName and (optionally '[')typeName
    const argMatch = qMatch[1].match(/([\w]+)\s*:\s*(\[?)\s*([\w]+)/);
    if (argMatch) {
      filterArgName    = argMatch[1];
      filterArgIsArray = argMatch[2] === '[';
      filterTypeName   = argMatch[3];
    }
    break;
  }

  if (!returnTypeName) {
    return res.status(404).json({
      success: false,
      error: `Query "${queryName}" not found in schema ${schemaVersion}. Verify the schema version selected on the Gateway page supports ByFilters queries (requires v11.2.0+).`,
    });
  }

  // ── Pass 2: parse EntityFilterConditionInput → condition type list ─────────
  const conditionTypes = [];
  const conditionLabels = {
    eq: 'Equals', regex: 'Matches Regex', gt: 'Greater Than', lt: 'Less Than',
    gte: 'Greater or Equal', lte: 'Less or Equal', has: 'List Has', in: 'In List',
  };
  let inCondInput = false;
  for (const line of lines) {
    const clean = line.replace(/#.*$/, '').trim();
    if (/^input\s+EntityFilterConditionInput\b/.test(clean)) { inCondInput = true; continue; }
    if (inCondInput && /^\}/.test(clean)) { inCondInput = false; continue; }
    if (inCondInput && clean) {
      const fm = clean.match(/^(\w+)\s*:/);
      if (fm) conditionTypes.push({ value: fm[1], label: conditionLabels[fm[1]] || fm[1] });
    }
  }
  // Fallback if EntityFilterConditionInput not found
  if (conditionTypes.length === 0) {
    ['eq','regex','gt','lt','gte','lte','has','in'].forEach(v => conditionTypes.push({ value: v, label: conditionLabels[v] || v }));
  }

  // ── Pass 3: entity type fields from schema metadata ────────────────────────
  const entityFields = [];
  try {
    const { metadata, arrayFields: af, enumValues: ev } = loadSchemaData(schemaVersion, graphmanHome);
    const entityType = metadata.types[returnTypeName]
      || Object.values(metadata.types).find(t => t.isL7Entity && t.typeName === returnTypeName);
    if (entityType) {
      resolveTypeFields(entityType, metadata, af, ev, 0)
        .filter(f => f.isPrimitive && !f.isArray)
        .forEach(f => entityFields.push({ name: f.name, dataType: f.dataType }));
    }
  } catch (_) { /* metadata may not cover all versions */ }

  // ── Build the GraphQL query template ──────────────────────────────────────
  const argDecl   = filterArgIsArray ? `[${filterTypeName}!]!` : `${filterTypeName}!`;
  const selFields = entityFields.length > 0
    ? entityFields.map(f => `    ${f.name}`).join('\n')
    : '    name';
  const gqlQueryTemplate = [
    `query ${queryName}($${filterArgName}: ${argDecl}) {`,
    `  ${queryName}(${filterArgName}: $${filterArgName}) {`,
    selFields,
    `  }`,
    `}`,
  ].join('\n');

  res.json({
    success: true,
    queryName,
    filterArgName,
    filterTypeName,
    filterArgIsArray,
    filterArgDecl: argDecl,
    returnTypeName,
    conditionTypes,
    entityFields,
    gqlQueryTemplate,
  });
});

// ─── Gateway GraphQL query executor (ByFilters) ───────────────────────────────
// Executes a ByFilters built-in query against a gateway using proper GraphQL
// variable declarations ($filters: [EntityFilterInput!]!). Conditions are supplied
// as an array of { field, conditionType, value } objects which are converted to
// the EntityFilterInput array format that the gateway expects.

app.post('/api/gateway-query', (req, res) => {
  const { gateway, queryName, filterArgName, filterArgDecl, conditions, entityFields, schemaVersion } = req.body || {};
  if (!gateway || !queryName) {
    return res.status(400).json({ success: false, error: 'gateway and queryName are required.' });
  }

  // ── Read gateway credentials ──────────────────────────────────────────────
  const configPath = resolveGraphmanConfigPath();
  let rawCfg;
  try { rawCfg = JSON.parse(fs.readFileSync(configPath, 'utf8')); }
  catch (e) { return res.status(500).json({ success: false, error: `Cannot read graphman.configuration: ${e.message}` }); }

  const gwCfg = rawCfg.gateways && rawCfg.gateways[gateway];
  if (!gwCfg || !gwCfg.address) {
    return res.status(404).json({ success: false, error: `Gateway "${gateway}" not found or has no address configured.` });
  }

  const SECRET_PREFIX = '$b64.';
  const rawPass  = gwCfg.password || '';
  const password = rawPass.startsWith(SECRET_PREFIX)
    ? Buffer.from(rawPass.slice(SECRET_PREFIX.length), 'base64').toString('utf-8')
    : rawPass;

  let parsedUrl;
  try { parsedUrl = new URL(gwCfg.address); }
  catch (e) { return res.json({ success: false, error: `Invalid gateway address "${gwCfg.address}": ${e.message}` }); }

  const useHttps = parsedUrl.protocol === 'https:';
  const httpMod  = useHttps ? https : http;
  const port     = parsedUrl.port ? Number(parsedUrl.port) : (useHttps ? 443 : 80);
  const gwPath   = parsedUrl.pathname || '/graphman';
  const rejectUA = gwCfg.rejectUnauthorized !== false && gwCfg.rejectUnauthorized !== 'false';

  // ── Build selection set ───────────────────────────────────────────────────
  const selFields = Array.isArray(entityFields) && entityFields.length > 0
    ? entityFields.map(f => f.name).join('\n    ')
    : 'name';

  // ── Build proper GraphQL query with named variable ($filters) ────────────
  const argName = filterArgName || 'filters';
  const argDecl = filterArgDecl || `[EntityFilterInput!]!`;
  const gqlQuery = [
    `query ${queryName}($${argName}: ${argDecl}) {`,
    `  ${queryName}(${argName}: $${argName}) {`,
    `    ${selFields}`,
    `  }`,
    `}`,
  ].join('\n');

  // ── Convert condition rows → EntityFilterInput array ─────────────────────
  const filterArray = [];
  if (Array.isArray(conditions)) {
    for (const c of conditions) {
      if (!c.field || !c.conditionType || (c.value === '' && c.conditionType !== 'has')) continue;
      let condVal;
      if (c.conditionType === 'in') {
        condVal = { in: c.value.split(',').map(s => s.trim()).filter(Boolean) };
      } else if (['gt','lt','gte','lte'].includes(c.conditionType)) {
        const n = Number(c.value);
        condVal = isNaN(n) ? { [c.conditionType]: c.value } : { [c.conditionType]: n };
      } else {
        condVal = { [c.conditionType]: c.value };
      }
      filterArray.push({ field: c.field, condition: condVal });
    }
  }

  const variables = filterArray.length > 0 ? { [argName]: filterArray } : { [argName]: [] };
  const body      = JSON.stringify({ query: gqlQuery, variables });
  const basicAuth = Buffer.from(`${gwCfg.username || ''}:${password}`).toString('base64');

  const reqOpts = {
    hostname: parsedUrl.hostname, port, path: gwPath, method: 'POST',
    rejectUnauthorized: rejectUA,
    headers: {
      'Content-Type':   'application/json; charset=utf-8',
      'Content-Length': Buffer.byteLength(body),
      'Authorization':  `Basic ${basicAuth}`,
    },
  };

  let responseSent = false;
  let reqHandle;

  const timer = setTimeout(() => {
    if (responseSent) return;
    responseSent = true;
    if (reqHandle) reqHandle.destroy();
    res.json({ success: false, error: `Gateway "${gateway}" did not respond within 30 seconds.` });
  }, 30000);

  try {
    reqHandle = httpMod.request(reqOpts, (proxyRes) => {
      let data = '';
      proxyRes.on('data', c => { data += c; });
      proxyRes.on('end', () => {
        clearTimeout(timer);
        if (responseSent) return;
        responseSent = true;
        const status = proxyRes.statusCode || 0;
        if (status === 401 || status === 403) {
          return res.json({ success: false, error: `Gateway "${gateway}" rejected credentials (HTTP ${status}). Check graphman.configuration.` });
        }
        if (status >= 400) {
          return res.json({ success: false, error: `Gateway returned HTTP ${status}.`, detail: data.slice(0, 400), gqlQuery });
        }
        try {
          const json = JSON.parse(data);
          if (json.errors && !json.data) {
            return res.json({ success: false, error: 'GraphQL errors returned by gateway.', errors: json.errors, gqlQuery });
          }
          const resultData = json.data?.[queryName];
          const rows = Array.isArray(resultData) ? resultData : (resultData ? [resultData] : []);
          return res.json({ success: true, queryName, total: rows.length, data: rows, gqlQuery, variables });
        } catch {
          return res.json({ success: false, error: 'Gateway returned a non-JSON response. Verify the /graphman path is correct.', raw: data.slice(0, 300), gqlQuery });
        }
      });
    });
  } catch (e) {
    clearTimeout(timer);
    return res.json({ success: false, error: `Request failed: ${e.message}` });
  }

  reqHandle.on('error', err => {
    clearTimeout(timer);
    if (responseSent) return;
    responseSent = true;
    const msg =
      err.code === 'ECONNREFUSED' ? `Connection refused — "${gateway}" may be offline or the port is wrong.`
      : err.code === 'ENOTFOUND'  ? `Host not found — check the address for "${gateway}".`
      : err.code === 'ETIMEDOUT'  ? `Connection timed out to "${gateway}".`
      : `Cannot reach "${gateway}": ${err.message}`;
    res.json({ success: false, error: msg, code: err.code });
  });

  reqHandle.write(body);
  reqHandle.end();
});

// POST /api/entity-forge — validate + import a freshly-built entity bundle.
app.post('/api/entity-forge', (req, res) => {
  const config = loadConfig();
  const { gateway, pluralName, entityData } = req.body;
  if (!gateway || !pluralName || !entityData) {
    return res.status(400).json({ success: false, error: 'gateway, pluralName, and entityData are required.' });
  }

  const gw           = gateway;
  const graphmanHome = path.resolve(SCRIPTS_DIR, config.graphmanHome || '../../graphman-client-main');
  const graphmanScript = path.join(graphmanHome, 'graphman.sh');

  if (!fs.existsSync(graphmanScript)) {
    return res.status(400).json({ success: false, error: `graphman.sh not found at: ${graphmanScript}`, hint: 'Check graphmanHome in Configuration.' });
  }

  if (!fs.existsSync(RESPONSE_DIR)) fs.mkdirSync(RESPONSE_DIR, { recursive: true });
  const tmpFile = path.join(RESPONSE_DIR, `tmp_forge_${Date.now()}.json`);
  try {
    fs.writeFileSync(tmpFile, JSON.stringify({ [pluralName]: [entityData] }, null, 2));
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Failed to write temporary bundle file.', detail: String(err) });
  }

  // Schema precedence: request body (from frontend via graphman-config) > graphman.configuration default.
  // config.json is intentionally excluded from this path.
  const forgeSchema = req.body.schema || loadGraphmanSchema();
  const cmd = `"${graphmanScript}" import --gateway "${gw}" --options.schema "${forgeSchema}" --input "${tmpFile}"`;
  const env = buildEnv(graphmanHome);

  exec(cmd, { cwd: SCRIPTS_DIR, timeout: 60000, env }, (err, stdout, stderr) => {
    try { fs.unlinkSync(tmpFile); } catch (_) {}
    const out = [stdout, stderr].filter(Boolean).join('\n').trim();
    if (err) {
      const timedOut = err.killed || err.signal === 'SIGTERM';
      return res.status(500).json({
        success: false, timedOut,
        error: timedOut
          ? `Gateway "${gw}" did not respond within 60s — it may be unreachable.`
          : `Import to gateway "${gw}" failed.`,
        detail: out || err.message,
        hint: 'Verify the gateway is reachable and the entity data is valid.',
      });
    }
    // Graphman sometimes exits 0 even when the operation failed (e.g. connection error).
    // Detect known error signatures in the output and surface them as failures.
    const errorSignals = [
      /error encountered while processing/i,
      /ECONNREFUSED/,
      /ENOTFOUND/,
      /ETIMEDOUT/,
      /socket hang up/i,
      /unable to connect/i,
      /connection refused/i,
      /SSL_ERROR/i,
    ];
    const hasOutputError = errorSignals.some(p => p.test(out));
    if (hasOutputError) {
      return res.status(500).json({
        success: false,
        error: `Gateway "${gw}" reported an error — it may be unreachable or rejected the request.`,
        detail: out,
        hint: 'Verify the gateway name in graphman.configuration and confirm it is online.',
      });
    }
    res.json({ success: true, gateway: gw, pluralName, output: out });
  });
});

// ─── Gateway Login proxy ──────────────────────────────────────────────────────

// Proxies login credentials to the gateway's REST login endpoint so we avoid
// CORS issues and can handle self-signed TLS certificates on internal gateways.
//
// The Layer7 /rest/gu/login endpoint expects:
//   POST <url>  (no request body)
//   Authorization: Basic base64(username:password)
//   username: <username>         ← explicit header required by this gateway
//   password: <password>         ← explicit header required by this gateway
app.post('/api/gateway-login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ success: false, error: 'Username and password are required.' });
  }

  const config = loadConfig();
  const authCfg = loadAuthConfig();
  // Auth-config takes precedence; fall back to legacy config.json loginUrl
  const loginUrl = authCfg.gateway?.loginUrl || config.loginUrl || '';

  let parsedUrl;
  try { parsedUrl = new URL(loginUrl); } catch {
    return res.status(400).json({ success: false, error: `Invalid loginUrl in config: ${loginUrl}` });
  }

  const basicAuth = Buffer.from(`${username}:${password}`).toString('base64');

  // Match the working curl exactly: GET with Basic auth + explicit username/password headers, no body.
  const options = {
    hostname: parsedUrl.hostname,
    port: Number(parsedUrl.port) || 443,
    path: parsedUrl.pathname + parsedUrl.search,
    method: 'POST',
    headers: {
      'Authorization': `Basic ${basicAuth}`,
      'username': username,
      'password': password,
      'Accept': '*/*',
    },
    rejectUnauthorized: false, // allow self-signed certs on internal gateways
  };

  // Guard against double-response if an error fires after data starts arriving
  let responseSent = false;

  let proxyReq;
  try {
    proxyReq = https.request(options, proxyRes => {
      let raw = '';
      proxyRes.on('data', chunk => { raw += chunk; });
      proxyRes.on('end', () => {
        if (responseSent) return;
        responseSent = true;
        const status = proxyRes.statusCode || 500;
        let body;
        try { body = JSON.parse(raw); } catch { body = raw || null; }
        if (status >= 200 && status < 300) {
          res.json({ success: true, username, gateway: parsedUrl.hostname, data: body });
        } else {
          res.status(status).json({
            success: false,
            error: `Gateway returned HTTP ${status}.`,
            detail: typeof body === 'string' ? body : JSON.stringify(body),
          });
        }
      });
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: `Failed to create proxy request: ${err.message}` });
  }

  proxyReq.on('error', err => {
    if (responseSent) return;
    responseSent = true;
    res.status(502).json({ success: false, error: `Cannot reach gateway: ${err.message}` });
  });

  proxyReq.setTimeout(15000, () => {
    if (responseSent) return;
    responseSent = true;
    proxyReq.destroy();
    res.status(504).json({ success: false, error: 'Gateway login request timed out (15 s).' });
  });

  // GET — no body to write
  proxyReq.end();
});

// ─── Graphman gateway configuration ──────────────────────────────────────────
// Reads graphman.configuration and returns all defined gateways (without passwords).

app.get('/api/graphman-config', (req, res) => {
  const config     = loadConfig();
  const graphmanHome = path.resolve(SCRIPTS_DIR, config.graphmanHome || '../../graphman-client-main');

  // Try both common locations for the configuration file
  const candidates = [
    path.join(graphmanHome, 'graphman.configuration'),
    path.join(SCRIPTS_DIR, 'graphman.configuration'),
  ];

  let raw = null;
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      try { raw = JSON.parse(fs.readFileSync(candidate, 'utf8')); break; } catch { /* try next */ }
    }
  }

  if (!raw) {
    return res.status(404).json({ success: false, error: 'graphman.configuration not found.', searched: candidates });
  }

  // Strip passwords before sending to the browser
  const gateways = {};
  for (const [name, gw] of Object.entries(raw.gateways || {})) {
    const addr = gw.address || '';
    let host = addr;
    try { host = new URL(addr).hostname; } catch { /* leave as-is */ }
    gateways[name] = {
      address:  addr,
      host,
      username: gw.username || '',
      allowMutations: !!gw.allowMutations,
      rejectUnauthorized: !!gw.rejectUnauthorized,
    };
  }

  res.json({ success: true, gateways, options: raw.options || {} });
});

// ─── Graphman Configuration — full read/write ─────────────────────────────────
// Unlike /api/graphman-config (which strips passwords), these endpoints expose
// and accept the full file so the UI editor can manage all fields.

function resolveGraphmanConfigPath() {
  const config = loadConfig();
  const graphmanHome = path.resolve(SCRIPTS_DIR, config.graphmanHome || '../../graphman-client-main');
  const candidates = [
    path.join(graphmanHome, 'graphman.configuration'),
    path.join(SCRIPTS_DIR, 'graphman.configuration'),
  ];
  for (const c of candidates) { if (fs.existsSync(c)) return c; }
  // Default to the primary location even if it doesn't exist yet
  return candidates[0];
}

app.get('/api/graphman-config-full', (req, res) => {
  const filePath = resolveGraphmanConfigPath();
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ success: false, error: 'graphman.configuration not found.', filePath });
  }
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    res.json({ success: true, data, filePath });
  } catch (err) {
    res.status(500).json({ success: false, error: `Failed to parse graphman.configuration: ${err.message}` });
  }
});

app.post('/api/graphman-config-save', (req, res) => {
  const { data } = req.body || {};
  if (!data || typeof data !== 'object') {
    return res.status(400).json({ success: false, error: 'data object is required.' });
  }
  const filePath = resolveGraphmanConfigPath();
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 4), 'utf8');
    // Bust the in-memory schema cache so the next describe call picks up any schema change
    Object.keys(_schemaCache).forEach(k => delete _schemaCache[k]);
    res.json({ success: true, filePath });
  } catch (err) {
    res.status(500).json({ success: false, error: `Failed to write graphman.configuration: ${err.message}` });
  }
});

// ─── Raw bundle import ────────────────────────────────────────────────────────
// Accepts a complete Graphman JSON bundle string and imports it to a named gateway.

app.post('/api/bundle-import-raw', (req, res) => {
  const config = loadConfig();
  const { gateway, bundleJson } = req.body || {};

  if (!gateway)    return res.status(400).json({ success: false, error: 'gateway is required.' });
  if (!bundleJson) return res.status(400).json({ success: false, error: 'bundleJson is required.' });

  // Parse + validate the bundle before touching the filesystem
  let parsed;
  try { parsed = JSON.parse(bundleJson); } catch (e) {
    return res.status(400).json({ success: false, error: `Invalid JSON: ${e.message}` });
  }
  if (typeof parsed !== 'object' || Array.isArray(parsed) || parsed === null) {
    return res.status(400).json({ success: false, error: 'Bundle must be a JSON object (not an array or primitive).' });
  }

  const graphmanHome   = path.resolve(SCRIPTS_DIR, config.graphmanHome || '../../graphman-client-main');
  const graphmanScript = path.join(graphmanHome, 'graphman.sh');

  if (!fs.existsSync(graphmanScript)) {
    return res.status(400).json({
      success: false,
      error: `graphman.sh not found at: ${graphmanScript}`,
      hint: 'Check the Graphman Home value in Configuration.',
    });
  }

  const tmpFile = path.join(RESPONSE_DIR, `tmp_bundle_raw_${Date.now()}.json`);
  try {
    fs.writeFileSync(tmpFile, JSON.stringify(parsed, null, 2));
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Failed to write temporary bundle file.', detail: String(err) });
  }

  const entityTypes  = Object.keys(parsed).filter(k => Array.isArray(parsed[k]));
  const entityCount  = entityTypes.reduce((sum, k) => sum + parsed[k].length, 0);
  const rawSchema    = config.importSchema || 'v11.1.00';
  const cmd          = `"${graphmanScript}" import --gateway "${gateway}" --options.schema "${rawSchema}" --input "${tmpFile}"`;
  const env          = buildEnv(graphmanHome);

  exec(cmd, { cwd: SCRIPTS_DIR, timeout: 120000, env }, (err, stdout, stderr) => {
    try { fs.unlinkSync(tmpFile); } catch (_) {}
    const output = [stdout, stderr].filter(Boolean).join('\n').trim();
    if (err) {
      return res.status(500).json({
        success: false,
        error: `Import to "${gateway}" failed.`,
        detail: output || err.message,
        hint: 'Verify the gateway name matches an entry in graphman configuration and the gateway is reachable.',
      });
    }
    res.json({ success: true, gateway, entityTypes, entityCount, output: output || 'Import completed.' });
  });
});

// ─── Gateway Logoff proxy ─────────────────────────────────────────────────────

app.post('/api/gateway-logoff', (req, res) => {
  const { authToken } = req.body || {};
  const config  = loadConfig();
  const authCfg = loadAuthConfig();
  // Auth-config takes precedence; fall back to deriving from legacy loginUrl
  const logoffUrl = authCfg.gateway?.logoffUrl
    || (authCfg.gateway?.loginUrl || config.loginUrl || '').replace(/\/login$/, '/logoff');

  let parsedUrl;
  try { parsedUrl = new URL(logoffUrl); } catch {
    return res.status(400).json({ success: false, error: `Invalid logoff URL: ${logoffUrl}` });
  }

  const options = {
    hostname: parsedUrl.hostname,
    port: Number(parsedUrl.port) || 443,
    path: parsedUrl.pathname + parsedUrl.search,
    method: 'POST',
    headers: {
      ...(authToken ? { 'Authorization': `Basic ${authToken}` } : {}),
      'Accept': '*/*',
    },
    rejectUnauthorized: false,
  };

  let responseSent = false;
  let proxyReq;
  try {
    proxyReq = https.request(options, proxyRes => {
      let raw = '';
      proxyRes.on('data', chunk => { raw += chunk; });
      proxyRes.on('end', () => {
        if (responseSent) return;
        responseSent = true;
        res.json({ success: true, status: proxyRes.statusCode, detail: raw || null });
      });
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: `Failed to create logoff request: ${err.message}` });
  }

  proxyReq.on('error', err => {
    if (responseSent) return;
    responseSent = true;
    // Always report success to the client — local session is cleared regardless
    res.json({ success: true, warning: `Logoff call failed (${err.message}), local session cleared.` });
  });

  proxyReq.setTimeout(8000, () => {
    if (responseSent) return;
    responseSent = true;
    proxyReq.destroy();
    res.json({ success: true, warning: 'Logoff request timed out, local session cleared.' });
  });

  proxyReq.end();
});

// ─── README ───────────────────────────────────────────────────────────────────

app.get('/api/readme', (_req, res) => {
  const candidates = [
    path.join(SCRIPTS_DIR, 'README.md'),
    path.join(SCRIPTS_DIR, '..', 'README.md'),
    path.join(__dirname, 'README.md'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      return res.json({ content: fs.readFileSync(p, 'utf8'), filePath: p });
    }
  }
  res.json({
    content: `# Layer7 Gateway Utility\n\nWelcome to the Gateway Utility Console.\n\n` +
      `## Available Tools\n\n` +
      `- **Find Assertions** – Search for specific assertion types across all services and policies.\n` +
      `- **Check Compliance** – Audit encapsulated assertion usage across your gateway bundle.\n` +
      `- **Keys & Certificates** – View, audit expiry, and manage trusted certs and private keys.\n` +
      `- **Entity Updates** – Browse, edit, and import any gateway entity back to a target gateway.\n`,
    filePath: null,
  });
});

// ─── Keys & Certificates ──────────────────────────────────────────────────────

// Enrich a cert/key item with dates and DN fields parsed from certBase64 when
// those fields are not already present in the graphman bundle payload.
function enrichWithCertDates(item) {
  // Already have notAfter – nothing to do
  if (item.notAfter) return item;

  const base64 = item.certBase64;
  if (!base64 || !X509Certificate) return item;

  try {
    const cert = new X509Certificate(Buffer.from(base64, 'base64'));
    return {
      ...item,
      subjectDn:      item.subjectDn      || cert.subject      || '',
      issuerDn:       item.issuerDn       || cert.issuer       || '',
      notBefore:      item.notBefore      || new Date(cert.validFrom).toISOString(),
      notAfter:       item.notAfter       || new Date(cert.validTo).toISOString(),
      thumbprintSha1: item.thumbprintSha1 || (cert.fingerprint || '').replace(/:/g, ''),
    };
  } catch {
    return item;
  }
}

// Returns enriched trustedCerts or keys items (with parsed cert validity dates).
// Query param ?from=target reads from the target bundle file.
app.get('/api/keys-certs/:entityType', (req, res) => {
  const { entityType } = req.params;
  if (!['trustedCerts', 'keys', 'sslKeys'].includes(entityType)) {
    return res.status(400).json({ success: false, error: "entityType must be 'trustedCerts', 'keys', or 'sslKeys'." });
  }
  const fromKey  = req.query.from === 'target' ? 'target' : 'source';
  const bundleFile = bundleFilePath(fromKey);

  if (!fs.existsSync(bundleFile)) {
    const label = fromKey === 'target' ? 'Target bundle' : 'Source bundle';
    return res.status(404).json({ success: false, error: `${label} not found. Export gateway data first.` });
  }

  try {
    const data  = JSON.parse(fs.readFileSync(bundleFile, 'utf8'));
    const raw   = Array.isArray(data[entityType]) ? data[entityType] : [];
    const items = raw.map(enrichWithCertDates);
    res.json({ success: true, entityType, items, from: fromKey, total: items.length });
  } catch (err) {
    res.status(500).json({ success: false, error: String(err) });
  }
});

// ─── Gateway connectivity test ────────────────────────────────────────────────
// Runs a lightweight `--using counts` export to probe whether a gateway is reachable.
// Returns quickly on failure so the frontend can warn users before they proceed.

// Direct GraphQL connectivity probe — no graphman.sh involved.
// Reads graphman.configuration for the gateway's address + credentials, then POSTs
// the minimal introspection query { __typename } to the gateway's GraphQL endpoint.
// This mirrors exactly what the graphman client does internally, so it reliably
// reflects whether graphman.sh would be able to reach the gateway.
app.post('/api/gateway-test', (req, res) => {
  const gatewayName = req.body.gateway || '';
  if (!gatewayName) return res.status(400).json({ success: false, error: 'gateway is required.' });

  // Read graphman.configuration (full, including passwords).
  const configPath = resolveGraphmanConfigPath();
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (e) {
    return res.status(500).json({ success: false, error: `Cannot read graphman.configuration: ${e.message}` });
  }

  const gwConfig = raw.gateways && raw.gateways[gatewayName];
  if (!gwConfig || !gwConfig.address) {
    return res.status(404).json({ success: false, error: `Gateway "${gatewayName}" not found in graphman.configuration or has no address configured.` });
  }

  // Decode base64-encoded password (graphman uses "$b64." prefix).
  const SECRET_PREFIX = '$b64.';
  const rawPass = gwConfig.password || '';
  const password = rawPass.startsWith(SECRET_PREFIX)
    ? Buffer.from(rawPass.slice(SECRET_PREFIX.length), 'base64').toString('utf-8')
    : rawPass;
  const username = gwConfig.username || '';

  let parsedUrl;
  try { parsedUrl = new URL(gwConfig.address); }
  catch (e) { return res.json({ success: false, error: `Invalid address for "${gatewayName}": ${gwConfig.address}` }); }

  const useHttps = parsedUrl.protocol === 'https:';
  const httpMod  = useHttps ? https : require('http');
  const port     = parsedUrl.port ? Number(parsedUrl.port) : (useHttps ? 443 : 80);
  // Preserve the exact pathname from the configured address (e.g. /graphman).
  const gwPath   = parsedUrl.pathname || '/graphman';
  const rejectUA = gwConfig.rejectUnauthorized !== false && gwConfig.rejectUnauthorized !== 'false';

  const body = JSON.stringify({ query: '{ __typename }' });
  const basicAuth = Buffer.from(`${username}:${password}`).toString('base64');

  const options = {
    hostname: parsedUrl.hostname,
    port,
    path: gwPath,
    method: 'POST',
    rejectUnauthorized: rejectUA,
    headers: {
      'Content-Type':   'application/json; charset=utf-8',
      'Content-Length': Buffer.byteLength(body),
      'Authorization':  `Basic ${basicAuth}`,
    },
  };

  let responseSent = false;
  let reqHandle;

  const timeout = setTimeout(() => {
    if (responseSent) return;
    responseSent = true;
    if (reqHandle) reqHandle.destroy();
    res.json({ success: false, error: `Gateway "${gatewayName}" did not respond within 15 seconds.` });
  }, 15000);

  try {
    reqHandle = httpMod.request(options, (proxyRes) => {
      let data = '';
      proxyRes.on('data', chunk => { data += chunk; });
      proxyRes.on('end', () => {
        clearTimeout(timeout);
        if (responseSent) return;
        responseSent = true;

        const status = proxyRes.statusCode || 0;

        if (status === 401 || status === 403) {
          return res.json({ success: false, error: `Gateway "${gatewayName}" rejected credentials (HTTP ${status}). Check username/password in graphman.configuration.`, detail: data });
        }
        if (status >= 400) {
          return res.json({ success: false, error: `Gateway "${gatewayName}" returned HTTP ${status}.`, detail: data.slice(0, 300) });
        }

        // Parse GraphQL response
        try {
          const json = JSON.parse(data);
          if (json.errors && !json.data) {
            return res.json({ success: false, error: `Gateway "${gatewayName}" returned GraphQL errors.`, detail: JSON.stringify(json.errors) });
          }
          // Any 200 + parseable JSON (with or without __typename) counts as reachable.
          return res.json({ success: true, message: `Gateway "${gatewayName}" is reachable and responding.` });
        } catch {
          // 200 but non-JSON — gateway is up but this path may not be a GraphQL endpoint.
          return res.json({ success: false, error: `Gateway "${gatewayName}" responded but returned non-JSON. Verify the address includes the /graphman path.`, detail: data.slice(0, 200) });
        }
      });
    });
  } catch (e) {
    clearTimeout(timeout);
    return res.json({ success: false, error: `Test failed: ${e.message}` });
  }

  reqHandle.on('error', (err) => {
    clearTimeout(timeout);
    if (responseSent) return;
    responseSent = true;
    const msg =
      err.code === 'ECONNREFUSED' ? `Connection refused — "${gatewayName}" may be offline or the port is wrong.`
      : err.code === 'ENOTFOUND'  ? `Host not found — check the address for "${gatewayName}".`
      : err.code === 'ETIMEDOUT'  ? `Connection timed out to "${gatewayName}".`
      : `Cannot reach "${gatewayName}": ${err.message}`;
    res.json({ success: false, error: msg, detail: err.code });
  });

  reqHandle.write(body);
  reqHandle.end();
});

// ─── SPA fallback ─────────────────────────────────────────────────────────────

app.get('*', (req, res) => {
  const indexPath = path.join(distDir, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).json({ error: 'React app not built. Run: npm run build' });
  }
});

// ─── Periodic scratch-dir cleanup ─────────────────────────────────────────────
// response/ and generated/ are ephemeral scratch space. Files older than
// SCRATCH_MAX_AGE_MS are removed automatically — both at startup (handles any
// leftovers from a prior run on non-emptyDir mounts) and every 24 hours.
//
// tmp_* files are already unlinked immediately after each request; this sweep
// only ever catches the named persistent files (spFolderSVCFull*.json,
// *-results.json/html, bundle JSON) that outlive a single HTTP round-trip.

const SCRATCH_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

function cleanScratchDirs() {
  const now = Date.now();
  let removed = 0;
  for (const dir of [RESPONSE_DIR, GENERATED_DIR]) {
    if (!fs.existsSync(dir)) continue;
    for (const file of fs.readdirSync(dir)) {
      const fp = path.join(dir, file);
      try {
        const { mtimeMs } = fs.statSync(fp);
        if (now - mtimeMs > SCRATCH_MAX_AGE_MS) {
          fs.unlinkSync(fp);
          removed++;
        }
      } catch (_) { /* skip locked or already-gone files */ }
    }
  }
  if (removed > 0) {
    console.log(`[cleanup] Removed ${removed} scratch file(s) older than 24 h.`);
  }
}

// Run once at boot, then every 24 h.
cleanScratchDirs();
setInterval(cleanScratchDirs, SCRATCH_MAX_AGE_MS).unref();

// ─── Server startup ────────────────────────────────────────────────────────────

const server = app.listen(PORT, () => {
  console.log(`Gateway Utility API server running at http://localhost:${PORT}`);
  console.log(`Scripts directory: ${SCRIPTS_DIR}`);
});

// Graceful shutdown – release the port cleanly on Ctrl-C or SIGTERM so
// a subsequent npm run dev never hits EADDRINUSE.
function shutdown(signal) {
  console.log(`\n[server] Received ${signal} – closing HTTP server...`);
  server.close(() => {
    console.log('[server] Port released. Goodbye.');
    process.exit(0);
  });
  // Force-exit if the server hasn't closed after 3 s
  setTimeout(() => { console.log('[server] Force exit after timeout.'); process.exit(1); }, 3000).unref();
}

process.on('SIGINT',  () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
