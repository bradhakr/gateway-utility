import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const PAGE_COLOR = '#CC0000'
const PAGE_RGBA  = 'rgba(204,0,0,'

// ─── Types ────────────────────────────────────────────────────────────────────

interface GatewayAuth {
  host:      string
  loginUrl:  string
  logoffUrl: string
}

interface OidcConfig {
  discoveryUrl:                 string
  clientId:                     string
  clientSecret:                 string
  redirectUri:                  string
  postLogoutRedirectUri:        string
  scopes:                       string
  sessionMaxAgeSeconds:         number
  introspectionIntervalSeconds: number
  pkceEnabled:                  boolean
  tokenEndpointAuthMethod:      'client_secret_post' | 'client_secret_basic' | 'none'
}

interface DiscoveredDoc {
  issuer:                 string
  authorization_endpoint: string
  token_endpoint:         string
  introspection_endpoint?: string
  end_session_endpoint?:  string
  jwks_uri:               string
  userinfo_endpoint?:     string
  revocation_endpoint?:   string
  code_challenge_methods_supported?: string[]
}

interface GwTestResult {
  success:      boolean
  status?:      number
  verdict?:     string
  level?:       'ok' | 'warn'
  responseTimeMs?: number
  certInfo?: {
    subject:    string
    issuer:     string
    validTo:    string | null
    selfSigned: boolean
  } | null
  error?: string
}

// ─── Shared UI helpers ────────────────────────────────────────────────────────

const labelSt: React.CSSProperties = {
  display: 'block', fontSize: '12px', fontWeight: 700,
  textTransform: 'uppercase', letterSpacing: '0.5px',
  color: 'var(--color-text-secondary)', marginBottom: '6px',
}
const inputSt: React.CSSProperties = {
  width: '100%', padding: '9px 12px', borderRadius: '6px',
  fontSize: '13px', boxSizing: 'border-box',
  background: '#fff', border: '1px solid var(--color-border)',
  color: 'var(--color-text-primary)', outline: 'none',
}
const hintSt: React.CSSProperties = {
  fontSize: '11px', color: 'var(--color-text-secondary)',
  marginTop: '4px', lineHeight: '1.5',
}

function Field({ label, value, onChange, type = 'text', hint, placeholder }: {
  label: string; value: string; onChange: (v: string) => void;
  type?: string; hint?: string; placeholder?: string
}) {
  return (
    <div style={{ marginBottom: '16px' }}>
      <label style={labelSt}>{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)}
             placeholder={placeholder} style={inputSt} />
      {hint && <div style={hintSt}>{hint}</div>}
    </div>
  )
}

function NumberField({ label, value, onChange, hint }: {
  label: string; value: number; onChange: (v: number) => void; hint?: string
}) {
  return (
    <div style={{ marginBottom: '16px' }}>
      <label style={labelSt}>{label}</label>
      <input type="number" value={value}
             onChange={e => onChange(Number(e.target.value))}
             style={{ ...inputSt, width: '160px' }} />
      {hint && <div style={hintSt}>{hint}</div>}
    </div>
  )
}

function SaveBtn({ loading, onClick }: { loading: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} disabled={loading}
      style={{
        padding: '9px 24px', borderRadius: '7px', cursor: loading ? 'wait' : 'pointer',
        background: loading ? `${PAGE_RGBA}0.5)` : PAGE_COLOR,
        border: 'none', color: '#fff', fontSize: '13px', fontWeight: 700,
        display: 'flex', alignItems: 'center', gap: '7px',
      }}>
      {loading
        ? <><span style={{ display: 'inline-block', width: '13px', height: '13px', border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />Saving…</>
        : '✓ Save'}
    </button>
  )
}

function ResultBanner({ ok, msg }: { ok: boolean; msg: string }) {
  if (!msg) return null
  return (
    <div style={{
      padding: '10px 14px', borderRadius: '6px', fontSize: '13px',
      marginBottom: '16px',
      background: ok ? '#F0FDF4' : '#FEF2F2',
      border:     ok ? '1px solid #BBF7D0' : '1px solid #FECACA',
      color:      ok ? '#15803D' : '#991B1B',
    }}>
      {msg}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AuthSetup() {
  const [tab, setTab] = useState<'gateway' | 'oidc'>('gateway')
  const navigate = useNavigate()
  const { isAuthenticated } = useAuth()

  // Gateway state
  const [gw, setGw] = useState<GatewayAuth>({ host: '', loginUrl: '', logoffUrl: '' })
  const [gwSaving, setGwSaving] = useState(false)
  const [gwMsg, setGwMsg] = useState({ ok: true, text: '' })
  const [gwTesting, setGwTesting] = useState(false)
  const [gwTestResult, setGwTestResult] = useState<GwTestResult | null>(null)
  const [gwVerifyOpen, setGwVerifyOpen] = useState(false)
  const [gwVerifyUser, setGwVerifyUser] = useState('')
  const [gwVerifyPass, setGwVerifyPass] = useState('')
  const [gwVerifying, setGwVerifying] = useState(false)
  const [gwVerifyResult, setGwVerifyResult] = useState<{ ok: boolean; text: string } | null>(null)

  // OIDC state
  const [oidc, setOidc] = useState<OidcConfig>({
    discoveryUrl: '', clientId: '', clientSecret: '',
    redirectUri: '', postLogoutRedirectUri: '',
    scopes: 'openid profile email',
    sessionMaxAgeSeconds: 3600, introspectionIntervalSeconds: 300,
    pkceEnabled: true,
    tokenEndpointAuthMethod: 'client_secret_post',
  })
  const [oidcSaving, setOidcSaving] = useState(false)
  const [oidcMsg, setOidcMsg] = useState({ ok: true, text: '' })
  const [discovering, setDiscovering] = useState(false)
  const [discovered, setDiscovered] = useState<DiscoveredDoc | null>(null)
  const [discoverMsg, setDiscoverMsg] = useState({ ok: true, text: '' })

  // Load current config on mount
  useEffect(() => {
    fetch('/api/auth/config')
      .then(r => r.json())
      .then(d => {
        if (d.gateway) setGw({ host: d.gateway.host || '', loginUrl: d.gateway.loginUrl || '', logoffUrl: d.gateway.logoffUrl || '' })
        if (d.oidc) setOidc(o => ({
          ...o,
          discoveryUrl:                 d.oidc.discoveryUrl || '',
          clientId:                     d.oidc.clientId || '',
          clientSecret:                 d.oidc.clientSecret || '',
          redirectUri:                  d.oidc.redirectUri || '',
          postLogoutRedirectUri:        d.oidc.postLogoutRedirectUri || '',
          scopes:                       d.oidc.scopes || 'openid profile email',
          sessionMaxAgeSeconds:         d.oidc.sessionMaxAgeSeconds || 3600,
          introspectionIntervalSeconds: d.oidc.introspectionIntervalSeconds || 300,
          pkceEnabled:                  d.oidc.pkceEnabled !== false,
          tokenEndpointAuthMethod:      d.oidc.tokenEndpointAuthMethod || 'client_secret_post',
        }))
      })
      .catch(() => {})
  }, [])

  // Auto-fill loginUrl / logoffUrl when host changes
  function handleHostChange(host: string) {
    setGw(g => ({
      ...g, host,
      loginUrl:  g.loginUrl  || (host ? `${host}/rest/gu/login`  : ''),
      logoffUrl: g.logoffUrl || (host ? `${host}/rest/gu/logoff` : ''),
    }))
  }

  // Auto-fill redirectUri when tab opens if empty
  useEffect(() => {
    if (tab === 'oidc' && !oidc.redirectUri) {
      setOidc(o => ({ ...o, redirectUri: `${window.location.origin}/auth/callback` }))
    }
    if (tab === 'oidc' && !oidc.postLogoutRedirectUri) {
      setOidc(o => ({ ...o, postLogoutRedirectUri: `${window.location.origin}/login` }))
    }
  }, [tab])

  async function saveGateway() {
    setGwSaving(true); setGwMsg({ ok: true, text: '' })
    try {
      const r = await fetch('/api/auth/config', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gateway: gw }),
      })
      const d = await r.json()
      setGwMsg({ ok: d.success, text: d.success ? 'Gateway auth settings saved.' : (d.error || 'Save failed.') })
    } catch (e) { setGwMsg({ ok: false, text: String(e) }) }
    finally { setGwSaving(false) }
  }

  async function testGateway() {
    if (!gw.loginUrl) return
    setGwTesting(true); setGwTestResult(null)
    try {
      const r = await fetch('/api/auth/test-url', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: gw.loginUrl }),
      })
      const d = await r.json()
      setGwTestResult(d)
    } catch (e) {
      setGwTestResult({ success: false, error: String(e) })
    } finally {
      setGwTesting(false)
    }
  }

  async function verifyLogin() {
    if (!gwVerifyUser || !gwVerifyPass) return
    setGwVerifying(true); setGwVerifyResult(null)
    try {
      const r = await fetch('/api/gateway-login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: gwVerifyUser, password: gwVerifyPass }),
      })
      const d = await r.json()
      setGwVerifyResult({
        ok:   d.success,
        text: d.success
          ? `Login successful — authenticated as ${d.username || gwVerifyUser} on ${d.gateway || gw.host}`
          : (d.error || 'Login failed'),
      })
    } catch (e) {
      setGwVerifyResult({ ok: false, text: String(e) })
    } finally {
      setGwVerifying(false)
    }
  }

  async function saveOidc() {
    setOidcSaving(true); setOidcMsg({ ok: true, text: '' })
    try {
      const r = await fetch('/api/auth/config', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oidc }),
      })
      const d = await r.json()
      setOidcMsg({ ok: d.success, text: d.success ? 'OIDC settings saved.' : (d.error || 'Save failed.') })
    } catch (e) { setOidcMsg({ ok: false, text: String(e) }) }
    finally { setOidcSaving(false) }
  }

  async function testDiscovery() {
    setDiscovering(true); setDiscoverMsg({ ok: true, text: '' }); setDiscovered(null)
    try {
      const r = await fetch('/api/auth/oidc-discover')
      const d = await r.json()
      if (d.success) {
        setDiscovered(d.doc)
        setDiscoverMsg({ ok: true, text: 'Discovery successful — endpoints verified.' })
      } else {
        setDiscoverMsg({ ok: false, text: d.error || 'Discovery failed.' })
      }
    } catch (e) { setDiscoverMsg({ ok: false, text: String(e) }) }
    finally { setDiscovering(false) }
  }

  const tabBtn = (id: 'gateway' | 'oidc', label: string) => (
    <button
      onClick={() => setTab(id)}
      style={{
        padding: '8px 20px', borderRadius: '6px 6px 0 0', cursor: 'pointer',
        fontSize: '13px', fontWeight: 600, border: 'none',
        background: tab === id ? '#fff' : 'transparent',
        color: tab === id ? PAGE_COLOR : 'var(--color-text-secondary)',
        borderBottom: tab === id ? `2px solid ${PAGE_COLOR}` : '2px solid transparent',
      }}
    >{label}</button>
  )

  return (
    <div style={{ padding: '28px 32px', maxWidth: '860px' }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* ── Page header ───────────────────────────────────────────────────── */}
      <div style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
          <h1 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--color-text-primary)', margin: 0, letterSpacing: '-0.2px' }}>
            Auth Setup
            <span style={{ fontWeight: 400, fontSize: '15px', color: 'var(--color-text-secondary)', marginLeft: '12px' }}>
              — Gateway &amp; OIDC / IDSP Authentication Configuration
            </span>
          </h1>
          {/* Back to Login — shown when not authenticated (pre-login access) */}
          {!isAuthenticated && (
            <button
              onClick={() => navigate('/login')}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                padding: '7px 16px', borderRadius: '7px', cursor: 'pointer',
                background: PAGE_COLOR, border: 'none', color: '#fff',
                fontSize: '13px', fontWeight: 700,
              }}
            >
              ← Back to Login
            </button>
          )}
        </div>
        <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginTop: '6px', marginBottom: 0 }}>
          Configure gateway login endpoints and OIDC / IDSP identity provider settings.
          {!isAuthenticated && (
            <span style={{ marginLeft: '8px', padding: '2px 8px', borderRadius: '4px', background: '#FEF9C3', border: '1px solid #FDE047', color: '#92400E', fontSize: '11px', fontWeight: 600 }}>
              Pre-login mode — save your changes then return to Login
            </span>
          )}
        </p>
      </div>

      {/* ── Tabs ──────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: '4px', borderBottom: '1px solid var(--color-border)', marginBottom: '24px' }}>
        {tabBtn('gateway', 'Gateway Login')}
        {tabBtn('oidc',    'OIDC / IDSP')}
      </div>

      {/* ── Gateway Login tab ─────────────────────────────────────────────── */}
      {tab === 'gateway' && (
        <div style={{ background: 'var(--color-card-bg)', border: '1px solid var(--color-border)', borderRadius: '8px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
          <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: '20px', paddingBottom: '12px', borderBottom: `2px solid ${PAGE_COLOR}` }}>
            Gateway Authentication Endpoints
          </div>

          {/* Save result banner */}
          <ResultBanner ok={gwMsg.ok} msg={gwMsg.text} />

          <Field label="Gateway Host"
                 value={gw.host}
                 onChange={handleHostChange}
                 placeholder="https://gateway.example.com"
                 hint="Base host URL of the Layer7 Gateway (used to auto-fill login/logoff URLs)." />

          <Field label="Login URL"
                 value={gw.loginUrl}
                 onChange={v => setGw(g => ({ ...g, loginUrl: v }))}
                 placeholder="https://gateway.example.com/rest/gu/login"
                 hint="Full URL the application calls to authenticate gateway users." />

          <Field label="Logoff URL"
                 value={gw.logoffUrl}
                 onChange={v => setGw(g => ({ ...g, logoffUrl: v }))}
                 placeholder="https://gateway.example.com/rest/gu/logoff"
                 hint="Full URL the application calls when a user logs off." />

          {/* ── Button row ──────────────────────────────────────────────── */}
          <div style={{ display: 'flex', gap: '10px', marginTop: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            <SaveBtn loading={gwSaving} onClick={saveGateway} />

            {/* Test Endpoint — probes loginUrl without credentials */}
            <button
              onClick={testGateway}
              disabled={gwTesting || !gw.loginUrl}
              title={!gw.loginUrl ? 'Enter a Login URL first' : 'Check if the login endpoint is reachable (no credentials needed)'}
              style={{
                padding: '9px 18px', borderRadius: '7px',
                cursor: (gwTesting || !gw.loginUrl) ? 'not-allowed' : 'pointer',
                background: '#fff', border: '1px solid var(--color-border)',
                color: 'var(--color-text-primary)', fontSize: '13px', fontWeight: 600,
                opacity: !gw.loginUrl ? 0.5 : 1,
                display: 'flex', alignItems: 'center', gap: '6px',
              }}
            >
              {gwTesting
                ? <><span style={{ display: 'inline-block', width: '12px', height: '12px', border: '2px solid rgba(0,0,0,0.15)', borderTopColor: 'var(--color-text-primary)', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />Testing…</>
                : '⚡ Test Endpoint'}
            </button>

            {/* Verify Login — full credential test via existing /api/gateway-login */}
            <button
              onClick={() => { setGwVerifyOpen(v => !v); setGwVerifyResult(null) }}
              disabled={!gw.loginUrl}
              title={!gw.loginUrl ? 'Enter a Login URL first' : 'Test with actual credentials to confirm login works end-to-end'}
              style={{
                padding: '9px 18px', borderRadius: '7px',
                cursor: !gw.loginUrl ? 'not-allowed' : 'pointer',
                background: '#fff', border: '1px solid var(--color-border)',
                color: 'var(--color-text-primary)', fontSize: '13px', fontWeight: 600,
                opacity: !gw.loginUrl ? 0.5 : 1,
              }}
            >
              🔑 Verify Login
            </button>
          </div>

          {/* ── Test Endpoint result panel ───────────────────────────────── */}
          {gwTestResult && (() => {
            const ok      = gwTestResult.success
            const isWarn  = ok && gwTestResult.level === 'warn'
            const bg      = !ok ? '#FEF2F2'  : isWarn ? '#FFFBEB'  : '#F0FDF4'
            const border  = !ok ? '#FECACA'  : isWarn ? '#FDE68A'  : '#BBF7D0'
            const txt     = !ok ? '#991B1B'  : isWarn ? '#92400E'  : '#15803D'
            const dot     = !ok ? '#EF4444'  : isWarn ? '#F59E0B'  : '#22C55E'
            return (
              <div style={{ marginTop: '16px', borderRadius: '8px', border: `1px solid ${border}`, overflow: 'hidden', fontSize: '12px' }}>
                {/* Verdict header */}
                <div style={{ padding: '10px 14px', background: bg, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: dot, flexShrink: 0 }} />
                  <span style={{ fontWeight: 600, color: txt, lineHeight: 1.4 }}>
                    {ok ? gwTestResult.verdict : gwTestResult.error}
                  </span>
                </div>
                {/* Details row */}
                {ok && (
                  <div style={{
                    padding: '10px 16px', background: '#fff',
                    borderTop: `1px solid ${border}`,
                    display: 'flex', flexWrap: 'wrap', gap: '20px',
                    color: 'var(--color-text-secondary)',
                  }}>
                    <div>
                      <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '3px' }}>HTTP Status</div>
                      <div style={{ fontFamily: 'ui-monospace, monospace', color: 'var(--color-text-primary)', fontSize: '13px' }}>{gwTestResult.status}</div>
                    </div>
                    {gwTestResult.responseTimeMs !== undefined && (
                      <div>
                        <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '3px' }}>Response Time</div>
                        <div style={{ fontFamily: 'ui-monospace, monospace', color: 'var(--color-text-primary)', fontSize: '13px' }}>{gwTestResult.responseTimeMs} ms</div>
                      </div>
                    )}
                    {gwTestResult.certInfo && (() => {
                      const expiry    = gwTestResult.certInfo!.validTo ? new Date(gwTestResult.certInfo!.validTo) : null
                      const daysLeft  = expiry ? Math.ceil((expiry.getTime() - Date.now()) / 86_400_000) : null
                      const expired   = daysLeft !== null && daysLeft < 0
                      const warnSoon  = daysLeft !== null && daysLeft >= 0 && daysLeft <= 30
                      return (
                        <div>
                          <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '3px' }}>TLS Certificate</div>
                          <div style={{ color: expired ? '#991B1B' : warnSoon ? '#92400E' : 'var(--color-text-primary)', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            {gwTestResult.certInfo!.selfSigned && (
                              <span style={{ color: '#F59E0B', fontWeight: 600 }}>⚠ Self-signed</span>
                            )}
                            {expiry && (
                              <span>Expires {expiry.toLocaleDateString()}{daysLeft !== null && ` (${expired ? 'EXPIRED' : `${daysLeft}d left`})`}</span>
                            )}
                          </div>
                        </div>
                      )
                    })()}
                    <div style={{ minWidth: '200px', flex: 1 }}>
                      <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '3px' }}>Probed URL</div>
                      <div style={{ fontFamily: 'ui-monospace, monospace', color: 'var(--color-text-primary)', fontSize: '11px', wordBreak: 'break-all' }}>{gw.loginUrl}</div>
                    </div>
                  </div>
                )}
              </div>
            )
          })()}

          {/* ── Verify Login inline form ─────────────────────────────────── */}
          {gwVerifyOpen && (
            <div style={{ marginTop: '16px', padding: '18px 18px 14px', background: 'var(--color-input-bg)', border: '1px solid var(--color-border)', borderRadius: '8px' }}>
              <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                🔑 Verify Login Credentials
                <span style={{ fontWeight: 400, color: 'var(--color-text-secondary)', fontSize: '11px' }}>
                  — credentials are sent directly to the gateway login endpoint and are not stored
                </span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                <div>
                  <label style={labelSt}>Username</label>
                  <input
                    type="text"
                    value={gwVerifyUser}
                    onChange={e => setGwVerifyUser(e.target.value)}
                    placeholder="gateway username"
                    style={inputSt}
                    autoComplete="username"
                  />
                </div>
                <div>
                  <label style={labelSt}>Password</label>
                  <input
                    type="password"
                    value={gwVerifyPass}
                    onChange={e => setGwVerifyPass(e.target.value)}
                    placeholder="••••••••"
                    style={inputSt}
                    autoComplete="current-password"
                    onKeyDown={e => { if (e.key === 'Enter' && gwVerifyUser && gwVerifyPass) verifyLogin() }}
                  />
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <button
                  onClick={verifyLogin}
                  disabled={gwVerifying || !gwVerifyUser || !gwVerifyPass}
                  style={{
                    padding: '8px 18px', borderRadius: '7px',
                    cursor: (gwVerifying || !gwVerifyUser || !gwVerifyPass) ? 'not-allowed' : 'pointer',
                    background: PAGE_COLOR, border: 'none', color: '#fff',
                    fontSize: '13px', fontWeight: 600,
                    opacity: (!gwVerifyUser || !gwVerifyPass) ? 0.5 : 1,
                    display: 'flex', alignItems: 'center', gap: '6px',
                  }}
                >
                  {gwVerifying
                    ? <><span style={{ display: 'inline-block', width: '12px', height: '12px', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />Testing…</>
                    : 'Test Login'}
                </button>
                <button
                  onClick={() => { setGwVerifyOpen(false); setGwVerifyResult(null); setGwVerifyUser(''); setGwVerifyPass('') }}
                  style={{
                    padding: '8px 14px', borderRadius: '7px', cursor: 'pointer',
                    background: 'transparent', border: '1px solid var(--color-border)',
                    color: 'var(--color-text-secondary)', fontSize: '13px', fontWeight: 500,
                  }}
                >
                  Cancel
                </button>
              </div>
              {gwVerifyResult && (
                <div style={{
                  marginTop: '12px', padding: '10px 14px', borderRadius: '6px', fontSize: '13px',
                  background: gwVerifyResult.ok ? '#F0FDF4' : '#FEF2F2',
                  border:     gwVerifyResult.ok ? '1px solid #BBF7D0' : '1px solid #FECACA',
                  color:      gwVerifyResult.ok ? '#15803D' : '#991B1B',
                }}>
                  {gwVerifyResult.text}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── OIDC tab ──────────────────────────────────────────────────────── */}
      {tab === 'oidc' && (
        <div>
          <div style={{ background: 'var(--color-card-bg)', border: '1px solid var(--color-border)', borderRadius: '8px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', marginBottom: '20px' }}>
            <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: '20px', paddingBottom: '12px', borderBottom: `2px solid ${PAGE_COLOR}` }}>
              Symantec IDSP / OIDC Provider Settings
            </div>

            <ResultBanner ok={oidcMsg.ok} msg={oidcMsg.text} />

            <Field label="Discovery URL (.well-known)"
                   value={oidc.discoveryUrl}
                   onChange={v => setOidc(o => ({ ...o, discoveryUrl: v }))}
                   placeholder="https://idp.example.com/default/.well-known/openid-configuration"
                   hint="IDSP discovery endpoint — format: https://<host>/<tenant>/.well-known/openid-configuration" />

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <Field label="Client ID"
                     value={oidc.clientId}
                     onChange={v => setOidc(o => ({ ...o, clientId: v }))}
                     placeholder="your-app-client-id"
                     hint="Registered client_id in IDSP." />
              <Field label="Client Secret (optional)"
                     value={oidc.clientSecret}
                     onChange={v => setOidc(o => ({ ...o, clientSecret: v }))}
                     type="password"
                     placeholder="Leave empty for public client (PKCE only)"
                     hint="Required for introspection endpoint auth. Empty = public client." />

              {/* Token endpoint auth method */}
              <div style={{ marginTop: '4px' }}>
                <label style={labelSt}>Token Endpoint Auth Method</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
                  {(
                    [
                      { value: 'client_secret_post',  label: 'client_secret_post',  desc: 'client_id + client_secret sent in POST body (RFC 6749 default)' },
                      { value: 'client_secret_basic', label: 'client_secret_basic', desc: 'Authorization: Basic base64(client_id:client_secret) header — required by many enterprise IDPs (CA SSO, Ping, Okta)' },
                      { value: 'none',                label: 'none',                desc: 'Public client — only client_id in body, no secret (PKCE-only flows)' },
                    ] as { value: OidcConfig['tokenEndpointAuthMethod']; label: string; desc: string }[]
                  ).map(opt => (
                    <label key={opt.value} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer' }}>
                      <input
                        type="radio"
                        name="tokenEndpointAuthMethod"
                        value={opt.value}
                        checked={oidc.tokenEndpointAuthMethod === opt.value}
                        onChange={() => setOidc(o => ({ ...o, tokenEndpointAuthMethod: opt.value }))}
                        style={{ marginTop: '2px', accentColor: PAGE_COLOR, flexShrink: 0 }}
                      />
                      <span>
                        <code style={{ fontFamily: 'monospace', fontSize: '12px', fontWeight: 700, color: oidc.tokenEndpointAuthMethod === opt.value ? PAGE_COLOR : 'var(--color-text-primary)' }}>
                          {opt.label}
                        </code>
                        <span style={{ ...hintSt, display: 'block', marginTop: '1px' }}>{opt.desc}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <Field label="Redirect URI"
                   value={oidc.redirectUri}
                   onChange={v => setOidc(o => ({ ...o, redirectUri: v }))}
                   placeholder={`${window.location.origin}/auth/callback`}
                   hint="Must match exactly what is registered in IDSP. Must also be registered in the IDSP client." />

            {/* Suggested Redirect URI helper */}
            <div style={{ marginBottom: '16px', padding: '10px 14px', borderRadius: '7px', background: 'rgba(8,145,178,0.08)', border: '1px solid rgba(8,145,178,0.25)', fontSize: '12px', lineHeight: 1.7, color: 'var(--color-text-secondary)' }}>
              <span style={{ fontWeight: 700, color: 'var(--color-text-primary)' }}>Suggested Redirect URI for this app: </span>
              <code
                style={{ fontFamily: 'monospace', fontSize: '11.5px', color: '#0891b2', cursor: 'pointer', wordBreak: 'break-all' }}
                title="Click to copy"
                onClick={() => navigator.clipboard.writeText(`${window.location.origin}/auth/callback`)}
              >
                {window.location.origin}/auth/callback
              </code>
              {' '}
              <span style={{ opacity: 0.7 }}>(click to copy)</span>
              <div style={{ marginTop: '5px' }}>
                Set this as the Redirect URI <strong>and</strong> register it in the IDSP client to let this app
                handle the OIDC callback directly (recommended). If the redirect URI points to a different
                server (e.g. an API Gateway), disable PKCE below so that server can exchange the code
                without a <code style={{ fontFamily: 'monospace', fontSize: '11px' }}>code_verifier</code>.
              </div>
            </div>

            {/* PKCE toggle */}
            <div style={{ marginBottom: '16px' }}>
              <label style={labelSt}>PKCE (Proof Key for Code Exchange)</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <button
                  type="button"
                  onClick={() => setOidc(o => ({ ...o, pkceEnabled: !o.pkceEnabled }))}
                  style={{
                    position: 'relative', width: '44px', height: '24px', borderRadius: '12px',
                    border: 'none', cursor: 'pointer', padding: 0, flexShrink: 0,
                    background: oidc.pkceEnabled ? '#0891b2' : '#6b7280',
                    transition: 'background 0.2s',
                  }}
                >
                  <span style={{
                    position: 'absolute', top: '3px',
                    left: oidc.pkceEnabled ? '23px' : '3px',
                    width: '18px', height: '18px', borderRadius: '50%',
                    background: '#fff', transition: 'left 0.2s',
                  }} />
                </button>
                <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                  {oidc.pkceEnabled ? 'Enabled (recommended)' : 'Disabled'}
                </span>
              </div>
              <p style={{ ...hintSt, marginTop: '6px' }}>
                {oidc.pkceEnabled
                  ? 'The /authorize call includes code_challenge (S256). The BFF token exchange supplies code_verifier. Only works when Redirect URI points to this app.'
                  : 'The /authorize call sends no code_challenge. Use this when the Redirect URI points to an intermediary server (e.g. API Gateway) that calls the token endpoint without a code_verifier.'}
              </p>
            </div>

            <Field label="Post-Logout Redirect URI"
                   value={oidc.postLogoutRedirectUri}
                   onChange={v => setOidc(o => ({ ...o, postLogoutRedirectUri: v }))}
                   placeholder={`${window.location.origin}/login`}
                   hint="Where IDSP redirects the browser after logout." />

            <Field label="Scopes"
                   value={oidc.scopes}
                   onChange={v => setOidc(o => ({ ...o, scopes: v }))}
                   placeholder="openid profile email"
                   hint="Space-separated. Always include 'openid'. Add 'offline_access' for refresh tokens." />

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <NumberField label="Session Max Age (seconds)"
                           value={oidc.sessionMaxAgeSeconds}
                           onChange={v => setOidc(o => ({ ...o, sessionMaxAgeSeconds: v }))}
                           hint="How long the BFF session lives after login. Default: 3600 (1 hour)." />
              <NumberField label="Introspection Interval (seconds)"
                           value={oidc.introspectionIntervalSeconds}
                           onChange={v => setOidc(o => ({ ...o, introspectionIntervalSeconds: v }))}
                           hint="How often the server checks token validity with IDSP. Default: 300 (5 min)." />
            </div>

            <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
              <SaveBtn loading={oidcSaving} onClick={saveOidc} />
              <button onClick={testDiscovery} disabled={discovering || !oidc.discoveryUrl}
                style={{ padding: '9px 18px', borderRadius: '7px', cursor: (discovering || !oidc.discoveryUrl) ? 'not-allowed' : 'pointer', background: '#fff', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)', fontSize: '13px', fontWeight: 600, opacity: !oidc.discoveryUrl ? 0.5 : 1 }}>
                {discovering ? 'Fetching…' : 'Test Discovery'}
              </button>
            </div>
          </div>

          {/* Discovered endpoints */}
          {(discoverMsg.text || discovered) && (
            <div style={{ background: 'var(--color-card-bg)', border: '1px solid var(--color-border)', borderRadius: '8px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
              <div style={{ padding: '13px 20px', background: 'var(--color-header-bg)', color: '#fff', borderBottom: `2px solid ${PAGE_COLOR}`, fontSize: '13px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
                {discoverMsg.ok ? (
                  <><div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#22C55E', boxShadow: '0 0 5px rgba(34,197,94,0.7)' }} /> Discovered Endpoints</>
                ) : (
                  <><div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#EF4444' }} /> Discovery Failed</>
                )}
              </div>

              {!discoverMsg.ok && (
                <div style={{ padding: '14px 20px', fontSize: '13px', color: '#991B1B' }}>{discoverMsg.text}</div>
              )}

              {discovered && (
                <div>
                  {[
                    { label: 'Issuer',               value: discovered.issuer },
                    { label: 'Authorization',         value: discovered.authorization_endpoint },
                    { label: 'Token',                 value: discovered.token_endpoint },
                    { label: 'UserInfo',              value: discovered.userinfo_endpoint || '' },
                    { label: 'Introspection',         value: discovered.introspection_endpoint || '(not advertised)' },
                    { label: 'End Session (Logout)',  value: discovered.end_session_endpoint || '(not advertised)' },
                    { label: 'Revocation',            value: discovered.revocation_endpoint || '' },
                    { label: 'JWKS URI',              value: discovered.jwks_uri },
                    { label: 'PKCE Methods',          value: (discovered.code_challenge_methods_supported || []).join(', ') || '(not advertised)' },
                  ].filter(r => r.value).map((row, i, arr) => (
                    <div key={row.label} style={{
                      display: 'grid', gridTemplateColumns: '180px 1fr',
                      padding: '10px 20px', gap: '12px',
                      borderBottom: i < arr.length - 1 ? '1px solid var(--color-border)' : 'none',
                      alignItems: 'start',
                    }}>
                      <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-text-secondary)' }}>{row.label}</span>
                      <span style={{ fontSize: '12px', fontFamily: 'ui-monospace, monospace', color: 'var(--color-text-primary)', wordBreak: 'break-all' }}>{row.value}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* IDSP registration note */}
          <div style={{ marginTop: '20px', padding: '14px 18px', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '8px', fontSize: '12px', color: '#92400E', lineHeight: '1.7' }}>
            <strong>IDSP App Registration requirements:</strong> Your client app in IDSP must have{' '}
            <code style={{ fontFamily: 'monospace', background: 'rgba(0,0,0,0.07)', padding: '1px 4px', borderRadius: '3px' }}>redirectURI</code>,{' '}
            <code style={{ fontFamily: 'monospace', background: 'rgba(0,0,0,0.07)', padding: '1px 4px', borderRadius: '3px' }}>allowedOpenIDScopes</code>,{' '}
            <code style={{ fontFamily: 'monospace', background: 'rgba(0,0,0,0.07)', padding: '1px 4px', borderRadius: '3px' }}>allowedGrantTypes: [authorization_code]</code>, and{' '}
            <code style={{ fontFamily: 'monospace', background: 'rgba(0,0,0,0.07)', padding: '1px 4px', borderRadius: '3px' }}>allowedOperations: [introspect]</code> configured.{' '}
            Ensure <code style={{ fontFamily: 'monospace', background: 'rgba(0,0,0,0.07)', padding: '1px 4px', borderRadius: '3px' }}>allowedOrigins</code> includes this app's FQDN to avoid CORS issues.
          </div>
        </div>
      )}
    </div>
  )
}
