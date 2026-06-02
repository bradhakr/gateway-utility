# Gateway Utility — Package Validation & Vendor Download

Three scripts to validate, download, and build from officially sourced packages.

---

## Scripts Overview

| Script | Purpose |
|--------|---------|
| `validate-packages.sh` | Checks every package against Broadcom Artifactory and npmjs.org |
| `download-vendor.sh` | Downloads all packages as `.tgz` tarballs into `scripts/vendor/` |
| `build-from-vendor.sh` | Builds the Docker image using only the vendored tarballs (offline) |

---

## Step 1 — Validate Packages

```bash
cd /Users/br661896/Documents/APIM/Graphman/Scripts/GatewayUtility
chmod +x scripts/*.sh
./scripts/validate-packages.sh
```

**What it checks for each package:**

| Registry | URL | What it finds |
|----------|-----|--------------|
| Broadcom layer7-npm | `packages.broadcom.com/.../layer7-npm` | `@layer7/graphman` and any other Broadcom-published packages |
| Broadcom npm-proxy | `packages.broadcom.com/.../npm-proxy` | Standard packages if Broadcom has a public npm mirror configured |
| Official npmjs.org | `registry.npmjs.org` | All open-source packages (authoritative source) |

**Example output:**
```
PACKAGE                             TYPE   BROADCOM L7-NPM    BROADCOM PROXY     NPMJS.ORG
───────────────────────────────── ────── ────────────────── ────────────────── ────────────
@layer7/graphman                  broadcom FOUND            NOT_FOUND          NOT_FOUND
express                           prod   NOT_FOUND          FOUND/NOT_FOUND    FOUND
react                             prod   NOT_FOUND          FOUND/NOT_FOUND    FOUND
typescript                        dev    NOT_FOUND          FOUND/NOT_FOUND    FOUND
...
```

**Result codes:**

| Code | Meaning |
|------|---------|
| `FOUND` | Package is available in this registry |
| `NOT_FOUND` | Package does not exist here (404) |
| `AUTH_REQUIRED` | Registry returned 401/403 — token missing or expired |
| `UNREACHABLE` | Registry timed out or is not accessible |

Full results are saved to `scripts/validation-report.txt`.

---

## Step 2 — Download Vendor Packages

```bash
# Download all packages (prod + dev)
./scripts/download-vendor.sh

# Download production dependencies only (smaller, for distribution)
./scripts/download-vendor.sh --prod-only
```

**Download priority (first success wins):**

1. `@layer7/` packages → Broadcom layer7-npm → npmjs.org
2. Standard packages → Broadcom npm-proxy → npmjs.org

Downloaded files land in `scripts/vendor/`:
```
scripts/vendor/
├── manifest.json                          ← name, version, source, sha512 for each package
├── express-4.18.2.tgz
├── cors-2.8.5.tgz
├── react-18.2.0.tgz
├── layer7-graphman-<version>.tgz
└── ...
```

The `manifest.json` records the exact version, source registry, and SHA-512 checksum of every downloaded package — making the distribution fully auditable.

---

## Step 3 — Build from Vendor (Offline)

Once `scripts/vendor/` is populated and validated:

```bash
# Build local test image
npm install && npm run build
./scripts/build-from-vendor.sh

# Build and push to Docker Hub
./scripts/build-from-vendor.sh --registry docker.io/bradhakr --tag 1.0.0 --push
```

This build uses **zero internet access** inside Docker — all packages come from your verified `vendor/` tarballs.

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
| `react` | ^18.2.0 | npmjs.org | UI library (Meta / open source) |
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
| `concurrently` | ^8.2.2 | npmjs.org | Dev: run multiple scripts |
| `nodemon` | ^3.1.14 | npmjs.org | Dev: auto-restart server |

---

## Notes on "Broadcom Approved" Packages

- **`@layer7/graphman`** is Broadcom's own published package on their private registry. It is explicitly Broadcom-sourced.

- **Standard packages** (React, Express, TypeScript, etc.) are open-source packages from npmjs.org. They are not published by Broadcom, but Broadcom Artifactory can be configured with an **npm-proxy** repository that mirrors npmjs.org. If your Broadcom Artifactory instance has such a repo, `validate-packages.sh` will show `FOUND` under `BROADCOM PROXY`, confirming they are accessible via Broadcom's infrastructure.

- If the `npm-proxy` repo name is different in your Artifactory instance (e.g., `npm`, `npm-virtual`, `npm-remote`), update the `BROADCOM_NPM_PROXY` variable at the top of each script.

- For formal security compliance, run `npm audit` against the installed packages and cross-reference results with your organisation's approved package list.
