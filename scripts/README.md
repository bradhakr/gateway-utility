# Gateway Utility — Scripts Reference

All operator scripts live in this folder. Run any script from the project root with `./scripts/<name>.sh`.

Make all scripts executable once after cloning:
```bash
chmod +x scripts/*.sh
```

---

## Script Inventory

| Script | Category | Purpose |
|--------|----------|---------|
| `dev-server.sh` | Local dev | Start dev server (Express :3002 + Vite :5173, hot reload) |
| `prod-server.sh` | Local dev | Build React frontend + start production Express server |
| `kill-server.sh` | Local dev | Kill any process holding ports 3002 or 5173 |
| `package-image.sh` | Docker | Build and optionally push the Docker image |
| `upgrade-rebuild.sh` | Docker + K8s | Full pre-flight → build → push → rolling restart on VKS |
| `validate-packages.sh` | Offline build | Check all npm packages against Broadcom and npmjs registries |
| `download-vendor.sh` | Offline build | Download all packages as `.tgz` tarballs into `scripts/vendor/` |
| `build-from-vendor.sh` | Offline build | Build Docker image from vendored tarballs (no internet needed) |

---

## Local Development Scripts

### `dev-server.sh`

Starts the full development stack with hot reload. Clears ports before starting so stale processes never cause `EADDRINUSE` errors.

```bash
./scripts/dev-server.sh
```

- Kills any process on ports 3002 and 5173 first
- Starts Express API server on **:3002** (auto-restarts via nodemon)
- Starts Vite dev server on **:5173** (hot-module replacement)
- Press `Ctrl-C` to shut down cleanly

---

### `prod-server.sh`

Builds the React frontend and starts Express in production mode. Use this to test a production-like setup locally without Docker.

```bash
./scripts/prod-server.sh
```

- Kills any process on port 3002 first
- Runs `npm run build` to compile the React app into `dist/`
- Starts Express on **:3002** serving both the API and the compiled frontend

---

### `kill-server.sh`

Kills any process holding ports 3002 or 5173, and sweeps stray `node server.js` processes for this project.

```bash
./scripts/kill-server.sh
```

Called automatically by `dev-server.sh` and `prod-server.sh` on start and on `Ctrl-C`. Safe to run when nothing is listening.

---

## Docker Build Scripts

### `package-image.sh`

Builds and optionally pushes the Docker image. Handles both graphman acquisition modes:

| Mode | Flag | When to use |
|------|------|-------------|
| Mode A | `--npm-token <token>` | Broadcom Artifactory token available |
| Mode B | `--local-graphman <path>` | Use a local graphman-client directory (no token needed) |

```bash
# Mode A — build and push with Broadcom token
./scripts/package-image.sh \
  --npm-token "$TOKEN" \
  --registry  docker.io/bradhakr \
  --name      gateway-utility \
  --tag       $(date +%Y%m%d) \
  --push

# Mode B — build with local graphman-client (no token needed)
./scripts/package-image.sh \
  --local-graphman ../../graphman-client-main \
  --registry       docker.io/bradhakr \
  --push

# Local test build only (no push, native platform)
./scripts/package-image.sh --local-graphman ../../graphman-client-main
```

**All options:**

| Flag | Default | Description |
|------|---------|-------------|
| `-r, --registry` | — | Container registry (e.g. `docker.io/bradhakr`) |
| `-n, --name` | `gateway-utility` | Image name |
| `-t, --tag` | `latest` | Image tag |
| `--platform` | `linux/amd64` | Target platform |
| `-g, --graphman-version` | `latest` | `@layer7/graphman` version to fetch (Mode A) |
| `--npm-token` | — | Broadcom Artifactory auth token (Mode A) |
| `--npm-token-file` | — | File containing the auth token (Mode A) |
| `--local-graphman` | — | Path to local graphman-client directory (Mode B) |
| `-p, --push` | false | Push after build |
| `--no-cache` | false | Build without Docker layer cache |

---

### `upgrade-rebuild.sh`

The all-in-one upgrade script: validates pre-flight conditions, builds and pushes the Docker image, then triggers a zero-downtime rolling restart on both `gu-dev` and `gu-prod`.

```bash
./scripts/upgrade-rebuild.sh
```

**Pre-flight checks (automatic):**

| Check | What it verifies | How to refresh if it fails |
|-------|-----------------|---------------------------|
| 1 — kubectl | VKS JWT token valid (~10 h lifetime) | `kubectl vsphere login --server https://10.160.125.134 --vsphere-username bala@content.tmm.broadcom.lab --insecure-skip-tls-verify` |
| 2 — Docker Hub | Logged in as `bradhakr` | `docker login docker.io` |
| 3 — Broadcom npm | `_authToken` in `~/.npmrc` is present and not expired | `npm login --registry https://packages.broadcom.com/artifactory/api/npm/layer7-npm` |

**Steps (after pre-flight):**
1. Calls `package-image.sh` — builds multi-platform image (`linux/amd64`) and pushes versioned tag + `latest`
2. `kubectl rollout restart` on `gu-dev` and `gu-prod`
3. Waits for both rollouts to complete

---

## Offline / Vendor Build Scripts

Three scripts to validate, download, and build from officially sourced packages — for air-gapped or internet-restricted environments.

### `validate-packages.sh`

Checks every npm package against Broadcom Artifactory and npmjs.org. Produces a report table and saves it to `scripts/validation-report.txt`.

```bash
./scripts/validate-packages.sh
```

| Registry | URL | What it finds |
|----------|-----|--------------|
| Broadcom layer7-npm | `packages.broadcom.com/.../layer7-npm` | `@layer7/graphman` and Broadcom-published packages |
| Broadcom npm-proxy | `packages.broadcom.com/.../npm-proxy` | Standard packages if Broadcom has a public npm mirror |
| Official npmjs.org | `registry.npmjs.org` | All open-source packages (authoritative source) |

**Result codes:** `FOUND` · `NOT_FOUND` · `AUTH_REQUIRED` · `UNREACHABLE`

---

### `download-vendor.sh`

Downloads all npm packages as `.tgz` tarballs into `scripts/vendor/`. Run this before `build-from-vendor.sh`.

```bash
# Download all packages (prod + dev)
./scripts/download-vendor.sh

# Download production dependencies only
./scripts/download-vendor.sh --prod-only
```

Output: `scripts/vendor/<package>-<version>.tgz` + `scripts/vendor/manifest.json` (with SHA-512 checksums).

---

### `build-from-vendor.sh`

Builds the Docker image using only the pre-downloaded tarballs — no internet access required inside Docker.

```bash
# Prerequisites: run download-vendor.sh first, then npm install && npm run build

# Local test build
./scripts/build-from-vendor.sh

# Build and push
./scripts/build-from-vendor.sh --registry docker.io/bradhakr --tag 1.0.0 --push
```

---

## Package Inventory

### Production (run inside the container)

| Package | Version Range | Source | Notes |
|---------|-------------|--------|-------|
| `@layer7/graphman` | latest | **Broadcom layer7-npm** | Broadcom's own Layer7 CLI |
| `express` | ^4.18.2 | npmjs.org | HTTP web framework |
| `cors` | ^2.8.5 | npmjs.org | CORS middleware |
| `express-session` | ^1.19.0 | npmjs.org | Session management |
| `jose` | ^6.2.3 | npmjs.org | JOSE / JWT library |
| `react` | ^18.2.0 | npmjs.org | UI library |
| `react-dom` | ^18.2.0 | npmjs.org | React DOM renderer |
| `react-router-dom` | ^6.22.0 | npmjs.org | SPA routing |

### Dev / Build-time only (not in the Docker image)

| Package | Version Range | Source | Notes |
|---------|-------------|--------|-------|
| `typescript` | ^5.3.3 | npmjs.org | TypeScript compiler |
| `vite` | ^5.1.0 | npmjs.org | Frontend bundler |
| `@vitejs/plugin-react` | ^4.2.1 | npmjs.org | Vite + React integration |
| `@types/react` | ^18.2.0 | npmjs.org | TypeScript types |
| `@types/react-dom` | ^18.2.0 | npmjs.org | TypeScript types |
| `@types/cors` | ^2.8.17 | npmjs.org | TypeScript types |
| `@types/express-session` | ^1.19.0 | npmjs.org | TypeScript types |
| `concurrently` | ^8.2.2 | npmjs.org | Run multiple scripts concurrently |
| `nodemon` | ^3.1.14 | npmjs.org | Auto-restart server on file changes |
