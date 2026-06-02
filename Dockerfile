# ─────────────────────────────────────────────────────────────────────────────
# Stage 0 — Obtain the Graphman client
#
# TWO modes — selected automatically by Package.sh:
#
# MODE A  (default) — fetch from Broadcom's npm registry:
#   ./Package.sh --npm-token "$TOKEN" --registry docker.io/bradhakr --push
#   (Package.sh forwards the token as a BuildKit secret — never baked in)
#
# MODE B — copy from a local graphman-client directory (no internet needed):
#   ./Package.sh --local-graphman /path/to/graphman-client-main --registry ...
#   Package.sh copies the directory into the build context as graphman-client-src/
#   and the RUN below detects cli-main.js and uses that instead of npm install.
#
# graphman-client-src/ is ALWAYS present in the build context
# (either populated by --local-graphman, or an empty stub for Mode A).
#
# NOTE: The @layer7/graphman npm package ships cli-main.js but NOT graphman.sh.
# graphman.sh is auto-generated here as a thin shell wrapper around cli-main.js:
#   #!/bin/sh
#   if [ -z "$GRAPHMAN_HOME" ]; then echo "GRAPHMAN_HOME not defined"; exit 1; fi
#   node "$GRAPHMAN_HOME/cli-main.js" "$@"
# Both modes run the same generation step so the runtime finds graphman.sh
# regardless of how the client was obtained.
# ─────────────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS graphman-fetcher

ARG GRAPHMAN_VERSION=latest

# Always COPY graphman-client-src/ — it is either:
#   • populated (Mode B: --local-graphman path passed to Package.sh), or
#   • an empty stub directory (Mode A: npm install path)
COPY graphman-client-src/ /graphman-client-src/

# ── Registry auth token (Mode A only) ────────────────────────────────────────
# Pass your Broadcom Artifactory token via Package.sh:
#   ./Package.sh --npm-token  <token>           (inline)
#   ./Package.sh --npm-token-file /path/to/file (file containing just the token)
#
# The token is forwarded as a BuildKit secret (id=npm_token) and is ONLY visible
# inside this single RUN instruction — it is never written to an image layer.
#
# How it works:
#   1. npm config set  …:_authToken  <token>   (configure auth before install)
#   2. npm install -g @layer7/graphman          (authenticated install)
#   3. npm config delete …:_authToken           (remove from ~/.npmrc before snapshot)
#
# The resulting layer contains the installed package but zero credential data.
# ─────────────────────────────────────────────────────────────────────────────
RUN --mount=type=secret,id=npm_token,required=false \
    if [ -f /graphman-client-src/cli-main.js ]; then \
      echo ">>> Mode B: using local graphman-client from build context"; \
      cp -r /graphman-client-src /graphman-client; \
    else \
      echo ">>> Mode A: fetching @layer7/graphman@${GRAPHMAN_VERSION} from Broadcom npm registry"; \
      if [ -f /run/secrets/npm_token ]; then \
        echo "    Configuring registry auth token..."; \
        npm config set \
          "//packages.broadcom.com/artifactory/api/npm/layer7-npm/:_authToken" \
          "$(cat /run/secrets/npm_token)"; \
      fi; \
      npm install -g "@layer7/graphman@${GRAPHMAN_VERSION}" \
        --registry https://packages.broadcom.com/artifactory/api/npm/layer7-npm; \
      npm config delete \
        "//packages.broadcom.com/artifactory/api/npm/layer7-npm/:_authToken" \
        2>/dev/null || true; \
      cp -r "$(npm root -g)/@layer7/graphman" /graphman-client; \
      npm cache clean --force; \
    fi && \
    \
    # Verify cli-main.js is present (real entry-point) \
    test -f /graphman-client/cli-main.js \
      || (echo "ERROR: cli-main.js not found — inspect @layer7/graphman package structure" && exit 1) && \
    \
    # Generate graphman.sh wrapper if the package does not bundle it. \
    # The npm package ships only cli-main.js; graphman.sh is a thin shell wrapper. \
    if [ ! -f /graphman-client/graphman.sh ]; then \
      echo "    graphman.sh not bundled — generating wrapper from cli-main.js"; \
      printf '#!/bin/sh\nif [ -z "$GRAPHMAN_HOME" ]; then\n  echo "GRAPHMAN_HOME environment variable is not defined"\n  exit 1\nfi\nnode "$GRAPHMAN_HOME/cli-main.js" "$@"\n' \
        > /graphman-client/graphman.sh; \
    fi && \
    chmod +x /graphman-client/graphman.sh

# Persist the exact installed version so the runtime API can report it
RUN node -e "process.stdout.write(require('/graphman-client/package.json').version)" \
      > /graphman-client/.installed-version 2>/dev/null \
    || echo "unknown" > /graphman-client/.installed-version


# ─────────────────────────────────────────────────────────────────────────────
# Stage 1 — Lean production image
#
# The React frontend (dist/) is built locally before running Package.sh:
#   npm install && npm run build
# Package.sh includes dist/ in the build context automatically.
# ─────────────────────────────────────────────────────────────────────────────
FROM node:20-alpine

ARG GRAPHMAN_VERSION=latest

LABEL org.opencontainers.image.title="Gateway Utility"
LABEL org.opencontainers.image.description="Layer7 API Gateway Utility — graphman-powered management tool"
LABEL org.opencontainers.image.source="https://github.com/your-org/gateway-utility"
LABEL layer7.graphman.version="${GRAPHMAN_VERSION}"

# ── Non-root user ─────────────────────────────────────────────────────────────
RUN addgroup -g 1001 -S appgroup \
 && adduser  -u 1001 -S appuser -G appgroup

WORKDIR /app

# ── Production Node dependencies (installed locally by Package.sh) ─────────────
COPY app/node_modules ./node_modules

# ── Application files ─────────────────────────────────────────────────────────
COPY app/server.js            ./
COPY app/ImportBundles.js     ./
COPY app/ExportBundles.js     ./
COPY app/ReplaceAssertions.js ./
COPY app/SearchAssertions.js  ./

# ── React build (built locally with: npm install && npm run build) ────────────
COPY app/dist ./dist

# ── Graphman client from fetcher stage ────────────────────────────────────────
# graphman.configuration is intentionally NOT included here; it is mounted at
# runtime as a Kubernetes Secret (see k8s/secret.yaml.template).
COPY --from=graphman-fetcher /graphman-client ./graphman-client/

# ── Runtime writable directories ──────────────────────────────────────────────
# In Kubernetes these are backed by emptyDir volumes (see k8s/deployment.yaml).
# server.js purges files older than 24 h automatically.
RUN mkdir -p response generated \
 && chown -R appuser:appgroup /app

# ── Switch to non-root ────────────────────────────────────────────────────────
USER appuser

# ── Runtime environment ───────────────────────────────────────────────────────
EXPOSE 3002

ENV NODE_ENV=production
# GRAPHMAN_HOME is also set per-process by server.js via buildEnv(),
# but exporting it here ensures graphman.sh works if ever called directly.
ENV GRAPHMAN_HOME=/app/graphman-client

# ── Health check ──────────────────────────────────────────────────────────────
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:3002/api/health || exit 1

# ── Startup ───────────────────────────────────────────────────────────────────
# config.json must be mounted at /app/config.json (ConfigMap)
# graphman.configuration must be mounted at /app/graphman-client/graphman.configuration (Secret)
CMD ["node", "server.js"]
