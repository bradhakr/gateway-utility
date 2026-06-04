# Gateway Utility — Git Repository Guide

A React + Node.js application for managing Layer7 API Gateway policies via the Graphman client.

---

## What Is in This Repository

```
GatewayUtility/
├── docs/                        # All documentation (see References section)
│   ├── Local-Env-Testing.md     # Navigation, API endpoints, architecture, prerequisites
│   ├── Rebuild-Guide.md         # Day-to-day rebuild steps, architecture diagram, packages
│   └── Deployment-Guide.md      # First-time Docker build & Kubernetes deployment
├── src/                         # React/TypeScript frontend source
│   ├── App.tsx                  # React Router setup (createBrowserRouter) with auth guards
│   ├── context/                 # AuthContext — OIDC BFF session state
│   ├── components/              # Layout, Header, Sidebar, Footer, NavigationBlocker
│   ├── hooks/                   # Shared hooks — useDirtyGuard (unsaved-changes navigation guard)
│   └── pages/                   # All UI pages (15 pages)
├── index.html                   # Vite HTML entry template
├── public/                      # Static assets (broadcom.png, favicon)
├── server.js                    # Express backend — API server + OIDC BFF
├── ImportBundles.js             # Bundle import logic
├── ExportBundles.js             # Bundle export logic
├── ReplaceAssertions.js         # Assertion replacement logic
├── SearchAssertions.js          # Assertion search logic
├── package.json                 # npm dependencies & scripts
├── package-lock.json            # Locked dependency tree
├── tsconfig.json                # TypeScript config (app)
├── tsconfig.node.json           # TypeScript config (Node)
├── vite.config.ts               # Vite bundler config
├── Dockerfile                   # Multi-stage Docker image definition
├── .dockerignore                # Docker build context exclusions
├── auth-config.json             # Auth config template — fill in gateway + OIDC values
├── config.json                  # App config template — fill in graphmanHome + gateway names
├── k8s/
│   ├── deployment.yaml          # Kubernetes Deployment
│   ├── service.yaml             # Kubernetes Service (sessionAffinity: ClientIP)
│   ├── configmap.yaml           # Kubernetes ConfigMap (config.json + auth-config.json)
│   ├── namespace.yaml           # Namespace definitions
│   ├── ingress.yaml             # Ingress rules
│   ├── session-secret.yaml      # Session signing key placeholder
│   ├── secret.yaml.template     # Graphman credentials template — copy → secret.yaml
│   ├── docker-registry-secret.yaml.template  # Registry pull secret template
│   └── envoy-gateway/           # Envoy Gateway HTTPRoute and ReferenceGrant configs
└── scripts/                     # All operator scripts (see scripts/README.md)
    ├── dev-server.sh            # Start dev server (Express + Vite, hot reload)
    ├── prod-server.sh           # Build frontend + start production Express server
    ├── kill-server.sh           # Kill processes on ports 3002 / 5173
    ├── package-image.sh         # Docker build and push
    ├── upgrade-rebuild.sh       # Full build → push → rolling restart on VKS
    ├── validate-packages.sh     # Check package availability in Broadcom/npmjs
    ├── download-vendor.sh       # Download all packages as .tgz for offline builds
    ├── build-from-vendor.sh     # Build Docker image from vendored tarballs
    └── README.md                # All scripts reference documentation
```

> **Not in this repo (gitignored):** `node_modules/`, `dist/`, `k8s/secret.yaml`, `k8s/docker-registry-secret.yaml`, `response/`, `generated/`

---

## Application Architecture

Gateway Utility is a **React + Node.js** full-stack application. Understanding this model before you start helps you follow the setup steps and troubleshoot problems.

```
Browser  (React SPA — port 5173 dev / port 3002 prod)
    │
    │  HTTP REST  /api/*
    ▼
Express BFF — server.js  (port 3002)
    │
    ├── Reads: config.json          (app settings — gateway names, schema versions)
    ├── Reads: auth-config.json     (login URL, OIDC client settings)
    ├── Reads: graphman.configuration  (gateway addresses and credentials)
    │
    ├── Handles: basic-auth login proxy, OIDC PKCE flow, server-side session
    │
    │  child_process: graphman.sh <subcommand>
    ▼
graphman-client  (separate CLI tool — NOT an npm package in this repo)
    │
    │  HTTPS / GraphQL  :8443/graphman
    ▼
Layer7 API Gateway
```

| Layer | Technology | Role |
|-------|-----------|------|
| Frontend | React 18, TypeScript 5, Vite 5, React Router v6 (data router — `createBrowserRouter`) | Single-page application — all UI pages; `useBlocker` navigation guards on pages with unsaved changes |
| Backend | Node.js 20, Express 4 | BFF: REST API server, proxies auth, shells out to graphman |
| Session | express-session | Server-side session (cookie with `httpOnly`, `sameSite: lax`) |
| Auth | jose (JWT/OIDC) | ID-token validation via JWKS; PKCE code exchange |
| Gateway CLI | graphman-client (separate install) | Import/export bundles, manage entities — called via `graphman.sh` |
| Config | config.json, auth-config.json, graphman.configuration | Runtime settings — never committed with real values |

**Development mode** (`npm run dev`): Vite starts on **port 5173** and proxies every `/api/*` request to Express on **port 3002**. Both processes start with a single command.

**Production mode** (`npm start` or Docker): the compiled `dist/` is served as static files by Express on **port 3002** only — one port, one process.

**Key runtime directories** (auto-created, cleaned every 24 h):
- `response/` — exported gateway bundle JSON (`spFolderSVCFull.json`), assertion search results
- `generated/` — bundle files output by the Find Assertions workflow

---

## Prerequisites

### For local development (required by everyone)

| Tool | Version | Notes | Install |
|------|---------|-------|---------|
| Node.js | **20.x LTS** (minimum 15.6) | The `X509Certificate` API used to parse cert validity dates requires Node 15.6+. Node 20 LTS is recommended and matches the Docker image. | https://nodejs.org |
| npm | 10.x+ | Included with Node.js 20 | — |
| git | Any | — | `brew install git` |
| graphman-client | Latest from your team | Separate CLI tool — cloned or extracted alongside this repo. Not an npm package. | See Step 2a below |

### For Docker builds and Kubernetes deployment (only needed later)

| Tool | Version | Install |
|------|---------|---------|
| Docker Desktop | 4.x+ | https://docs.docker.com/desktop/mac/ |
| kubectl | 1.28+ | `brew install kubectl` |

---

## REQUIRED CREDENTIALS — Read This Before Anything Else

> **None of the credentials below are stored in this repository. You must obtain and configure them yourself before following the setup steps. Which credentials you need depends on what you are trying to do.**

| # | Credential | Used For | Needed At |
|---|-----------|----------|-----------|
| 1 | Broadcom Artifactory npm token | **Docker builds only** — fetches `@layer7/graphman` CLI inside the Dockerfile (Stage 0). **Not required for `npm install` or `npm run dev`** — all npm packages in `package.json` are from the public npmjs registry. | Step 7 (before Docker build) |
| 2 | Gateway host URL + admin username + password | `auth-config.json` and `config.json` — connects the app to your API Gateway | Step 4 (before `npm run dev`) |
| 3 | OIDC provider details (discovery URL, client ID) | `auth-config.json` — enables SSO login via your identity provider. Optional for local dev: if you skip OIDC you can still log in with gateway basic auth on the Login page. | Step 4 (before `npm run dev`) |
| 4 | Docker Hub username + Personal Access Token (PAT) | `scripts/package-image.sh` / `scripts/upgrade-rebuild.sh` — pushes the image to Docker Hub | Step 7 (before Docker build) |
| 5 | Docker Hub PAT (same or separate read-only) | Kubernetes pull secret — allows the cluster to pull the image | Step 9 (before `kubectl apply`) |

---

### Credential 1 — Broadcom Artifactory npm Token (Docker builds only)

**What it is:** An API token that authorises the Docker build to download `@layer7/graphman` from Broadcom's private npm registry during the Docker image Stage 0.

> **You do NOT need this for local development.** Running `npm install` and `npm run dev` only pulls packages from the public npmjs registry — no Broadcom token required. This credential is only needed when running `scripts/package-image.sh` or `scripts/upgrade-rebuild.sh` to build the Docker image.
>
> **Alternative (no token):** Use `scripts/package-image.sh --local-graphman /path/to/graphman-client-main` to copy your local graphman-client into the Docker image instead of fetching it from Broadcom's registry.

**How to get it:** Contact your Broadcom account team or open a ticket at https://support.broadcom.com to request an Artifactory API token for `packages.broadcom.com`.

**Where to put it** (for Docker builds): Add these two lines to `~/.npmrc` on your machine:

```
@layer7:registry=https://packages.broadcom.com/artifactory/api/npm/layer7-npm/
//packages.broadcom.com/artifactory/api/npm/layer7-npm/:_authToken=<YOUR_BROADCOM_TOKEN>
```

Replace `<YOUR_BROADCOM_TOKEN>` with your actual token. This file lives in your home directory and is never committed.

---

### Credential 2 & 3 — Gateway URL and OIDC Details

**What they are:** The hostname of your Layer7 API Gateway and the OIDC application registration for Gateway Utility.

**How to get them:**
- Gateway host: your API Gateway administrator
- OIDC discovery URL, client ID: whoever manages your identity provider (PingFederate, Okta, Azure AD, etc.)

**Where to put them:** Edit `auth-config.json` in the project root:

```json
{
  "gateway": {
    "host": "https://<your-gateway-host>/",
    "loginUrl": "https://<your-gateway-host>/rest/gu/login",
    "logoffUrl": "https://<your-gateway-host>/rest/gu/logoff"
  },
  "oidc": {
    "discoveryUrl": "https://<your-idsp-host>/default/.well-known/openid-configuration",
    "clientId": "<your-oidc-client-id>",
    "clientSecret": "",
    "redirectUri": "http://localhost:5173/auth/callback",
    "postLogoutRedirectUri": "http://localhost:5173/login",
    "scopes": "openid profile email",
    "sessionMaxAgeSeconds": 3600,
    "introspectionIntervalSeconds": 300
  }
}
```

Also edit `config.json`:

```json
{
  "graphmanHome": "../../graphman-client-main",
  "sourceGateway": "<gateway-alias>",
  "targetGateway": "<gateway-alias>",
  "assertionType": "EvaluateJsonPathExpressionV2",
  "exportSchema": "v11.2.1",
  "importSchema": "v11.2.1",
  "loginUrl": "https://<your-gateway-host>/rest/gu/login"
}
```

These files are committed to the repo with placeholder values. Edit them locally. Do **not** commit back with real values.

---

### Credential 4 — Docker Hub Personal Access Token (for push)

**What it is:** A Docker Hub PAT that allows `scripts/package-image.sh` to push the built image to your Docker Hub account.

**How to get it:**
1. Log in at https://hub.docker.com
2. Go to **Account Settings → Security → New Access Token**
3. Create a token with **Read & Write** scope

**Where to put it:** You will be prompted when you run `./scripts/upgrade-rebuild.sh`. Alternatively, log in once:

```bash
docker login docker.io
# Enter your Docker Hub username and the PAT as the password
```

---

### Credential 5 — Kubernetes Registry Pull Secret

**What it is:** The same (or a separate read-only) Docker Hub PAT used by Kubernetes to pull the image from Docker Hub when starting pods.

**How to get it:** Same as Credential 4. A separate read-only PAT is recommended for the cluster.

**Where to put it:** This is a Kubernetes Secret created directly in the cluster — it is never stored as a file. Run this after `kubectl` is configured for your cluster:

```bash
kubectl create secret docker-registry private-registry-secret \
  --docker-server=docker.io \
  --docker-username=<your-dockerhub-username> \
  --docker-password=<your-dockerhub-pat> \
  --docker-email=<your-email> \
  --namespace gu-dev \
  --dry-run=client -o yaml | kubectl apply -f -

# Repeat for production namespace
kubectl create secret docker-registry private-registry-secret \
  --docker-server=docker.io \
  --docker-username=<your-dockerhub-username> \
  --docker-password=<your-dockerhub-pat> \
  --docker-email=<your-email> \
  --namespace gu-prod \
  --dry-run=client -o yaml | kubectl apply -f -
```

---

### Bonus Credential — Graphman Gateway Secret (Kubernetes)

The application also needs to know how to connect to your gateway from inside the cluster. This is stored as a separate Kubernetes Secret. You will create this in Step 8.

---

## Setup Checklist

Work through this list in order. The first block covers local development; the second block covers Docker and Kubernetes.

**Local development (everyone starts here)**
```
[ ] Step 1  — Repository cloned
[ ] Step 2  — Node.js 20.x verified: node --version → v20.x.x
[ ] Step 2a — graphman-client cloned/extracted at the expected path (e.g. ../../graphman-client-main)
[ ] Step 2a — graphman.configuration created inside graphman-client-main/ with at least one gateway entry
[ ] Cred 2  — auth-config.json filled in (gateway loginUrl; OIDC fields optional for basic-auth login)
[ ] Cred 2  — config.json filled in (graphmanHome path, gateway alias names, schema versions)
[ ] Step 3  — npm install completed (no errors)
[ ] Step 5  — npm run dev shows "VITE ready" and "Gateway Utility API server running"
[ ] Step 5  — Browser opened at http://localhost:5173 and login page displayed
```

**Docker image build and Kubernetes deployment (do after local dev is working)**
```
[ ] Cred 1  — Broadcom npm token added to ~/.npmrc (OR use --local-graphman mode instead)
[ ] Cred 4  — docker login docker.io completed
[ ] Step 6  — npm run build completed (dist/ folder created)
[ ] Step 7  — Docker image built and pushed (./scripts/upgrade-rebuild.sh)
[ ] Cred 5  — Kubernetes registry pull secret created in gu-dev and gu-prod
[ ] Step 8  — Graphman secret applied (k8s/secret.yaml.template → k8s/secret.yaml)
[ ] Step 8  — Session signing key secret created
[ ] Step 9  — kubectl apply for all manifests
[ ] Step 9  — kubectl get pods -n gu-dev shows Running
```

---

## 1 — Clone the Repository

```bash
git clone https://github.com/<your-org>/gateway-utility.git
cd gateway-utility
```

---

## 2 — Verify Node.js Version

```bash
node --version   # Must be v15.6 or higher; v20.x LTS recommended
npm --version    # Must be 10.x or higher
```

If Node.js is not installed, download v20.x LTS from https://nodejs.org.

---

## 2a — Set Up the Graphman Client (Local Dev — Required)

The application shells out to `graphman.sh` at runtime for all gateway operations. This CLI is a **separate tool** — it is not in `package.json` and is not installed by `npm install`. You must set it up before running `npm run dev`.

### Get the graphman-client

Obtain the `graphman-client-main` directory from your team (clone from your internal Git, extract from a zip/tarball, or copy from an existing installation):

```bash
# Example — clone one level above the GatewayUtility folder so the default path resolves automatically
cd ~/Documents/APIM/Graphman/Scripts
git clone https://github.com/<your-org>/graphman-client-main.git
```

After this, the directory structure should look like:

```
Scripts/
├── graphman-client-main/    ← the graphman CLI
│   ├── graphman.sh
│   ├── cli-main.js
│   ├── schema/
│   └── graphman.configuration   ← you will create this next
└── GatewayUtility/          ← this repository
```

> If you place the graphman-client somewhere else, update `graphmanHome` in `config.json` to point to the correct absolute or relative path.

### Create `graphman.configuration`

Inside `graphman-client-main/`, create a file named `graphman.configuration` with your gateway connection details:

```json
{
  "gateways": {
    "my-gateway": {
      "address": "https://<your-gateway-host>:8443/graphman",
      "username": "<admin-username>",
      "password": "<admin-password>",
      "allowMutations": true,
      "rejectUnauthorized": false
    }
  },
  "options": {
    "schema": "v11.2.1"
  }
}
```

- Replace `my-gateway` with a short alias — this alias is what you enter in `config.json` as `sourceGateway` / `targetGateway`.
- `rejectUnauthorized: false` allows self-signed TLS certificates on internal gateways. Set to `true` in production environments with valid certificates.
- To add multiple gateways (e.g. source and target), add additional entries under `"gateways"`.
- Passwords can be stored as plain text or base64-encoded with a `$b64.` prefix: `"password": "$b64.<base64-of-password>"`.

> `graphman.configuration` is gitignored and must **never** be committed — it contains real credentials.

### Verify the setup

```bash
# From the GatewayUtility directory, check the default relative path resolves correctly
ls ../../graphman-client-main/graphman.sh
# Should print the file path — if not, adjust graphmanHome in config.json

# Verify graphman.sh is executable
chmod +x ../../graphman-client-main/graphman.sh
```

---

## 2b — Verify Your Broadcom Token (Docker Builds Only)

> **Skip this step if you are only doing local development.** You do not need this token to run `npm install` or `npm run dev`.

If you plan to build the Docker image, confirm your `~/.npmrc` is configured with the Broadcom token first (see Credential 1 above):

```bash
cat ~/.npmrc | grep layer7
# Should show two lines — the registry URL and the _authToken line
```

Alternatively, you can use `--local-graphman` mode in `scripts/package-image.sh` to copy your local graphman-client into the image without needing the token.

---

## 3 — Install Dependencies

```bash
cd ~/Documents/APIM/Graphman/Scripts/GatewayUtility
npm install
```

This installs all frontend and backend npm packages (React, Vite, TypeScript, Express, etc.) from the public npmjs registry. No Broadcom token is required. The install typically takes 30–60 seconds.

**Verify:**
```bash
ls node_modules | head -5
# Should list package directories (cors, express, react, ...)
```

---

## 4 — Configure Local Settings

The application reads three configuration files at startup. Two of them (`config.json` and `auth-config.json`) ship with placeholder values in the repository — edit them now.

### 4a — Edit `config.json`

```json
{
  "graphmanHome": "../../graphman-client-main",
  "sourceGateway": "<gateway-alias-from-graphman.configuration>",
  "targetGateway": "<gateway-alias-from-graphman.configuration>",
  "assertionType": "EvaluateJsonPathExpressionV2",
  "exportSchema": "v11.2.1",
  "importSchema": "v11.2.1",
  "loginUrl": "https://<your-gateway-host>/rest/gu/login"
}
```

- `graphmanHome` — path to `graphman-client-main/`, relative to `GatewayUtility/` or absolute.
- `sourceGateway` / `targetGateway` — must match an alias key in `graphman.configuration` (set up in Step 2a).
- `exportSchema` / `importSchema` — must match a schema directory inside `graphman-client-main/schema/`. Run `ls ../../graphman-client-main/schema/` to see what is available.

### 4b — Edit `auth-config.json`

```json
{
  "gateway": {
    "host": "https://<your-gateway-host>/",
    "loginUrl": "https://<your-gateway-host>/rest/gu/login",
    "logoffUrl": "https://<your-gateway-host>/rest/gu/logoff"
  },
  "oidc": {
    "discoveryUrl": "https://<your-idsp-host>/default/.well-known/openid-configuration",
    "clientId": "<your-oidc-client-id>",
    "clientSecret": "",
    "redirectUri": "http://localhost:5173/auth/callback",
    "postLogoutRedirectUri": "http://localhost:5173/login",
    "scopes": "openid profile email",
    "sessionMaxAgeSeconds": 3600,
    "introspectionIntervalSeconds": 300
  }
}
```

- **Basic auth only (no OIDC):** Fill in only the `gateway` block. Leave the `oidc` block with empty `discoveryUrl` and `clientId` — the Login page will default to the basic-auth form.
- **OIDC login:** Fill in the full `oidc` block. The `redirectUri` must match the registered redirect URI in your identity provider. For local dev this is always `http://localhost:5173/auth/callback`.

> Do **not** commit `auth-config.json` after filling in real URLs — treat it as a secrets file.

---

## 5 — Local Development (First Run and Day-to-Day)

### Start the dev server

```bash
npm run dev
```

This starts two processes concurrently:
- **Vite** (React dev server) on **http://localhost:5173** with hot-module replacement
- **Express API server** (`server.js`) on **http://localhost:3002** — auto-restarts on file changes via nodemon

**Expected output:**
```
[0] Gateway Utility API server running at http://localhost:3002
[1]   VITE v5.x.x  ready in XXXms
[1]   ➜  Local:   http://localhost:5173/
```

### Open the application

1. Navigate to **http://localhost:5173** in your browser.
2. You are redirected to the **Login** page (`/login`).
3. Enter your gateway credentials (username + password) — or click **Login with SSO** if OIDC is configured.
4. On successful login you land on the **Dashboard** with all tools available.

### Verify the backend is healthy

```bash
curl http://localhost:3002/api/health
# Expected: {"status":"ok","message":"Gateway Utility server is running","port":3002}
```

### Verify graphman-client is reachable

In the app, go to **App Config → Test** (or use Graphman Version page) to confirm the backend can find `graphman.sh` at the configured path. If you see an error about `graphman.sh not found`, re-check the `graphmanHome` value in `config.json`.

### Rebuilding after code changes

| Change type | What to run |
|-------------|-------------|
| React/TypeScript source (`src/`) | Nothing — Vite hot-reloads automatically |
| `server.js` | Nothing — nodemon restarts automatically |
| Added/removed npm package | `npm install` then restart `npm run dev` |
| TypeScript compile errors | Fix them; Vite will show errors in the browser |

---

## 5a — Local Testing Guide

Once the dev server is running and you can log in, see **[docs/Local-Env-Testing.md](./docs/Local-Env-Testing.md)** for a complete reference of all pages, API endpoints, architecture details, and application features to exercise.

---

## 6 — Build the React Frontend (pre-requisite for Docker)

Run this **before every Docker build** to compile the TypeScript source into the `dist/` folder that the image will serve:

```bash
npm run build
```

**Verify:**
```bash
ls dist/
# Expected: index.html  assets/
```

> This step is **not** needed for `npm run dev` — Vite compiles on the fly during development.

---

## 7 — Docker Build and Push

> Complete Step 6 (`npm run build`), Credential 1 (Broadcom token or `--local-graphman`), and Credential 4 (`docker login`) first.

**Quick path — run the upgrade script (builds, pushes, and rolls out automatically):**

```bash
# Make executable (first time only)
chmod +x scripts/*.sh

./scripts/upgrade-rebuild.sh
```

**Manual path — build only (no push, no rollout):**

```bash
# Mode A — with Broadcom npm token
./scripts/package-image.sh --npm-token "$TOKEN" --registry docker.io/bradhakr --name gateway-utility --push

# Mode B — with local graphman-client (no token needed)
./scripts/package-image.sh --local-graphman ../../graphman-client-main --registry docker.io/bradhakr --name gateway-utility --push
```

For detailed options, packaging modes, local Docker test runs, and troubleshooting, see **[docs/Rebuild-Guide.md](./docs/Rebuild-Guide.md)**.

---

## 8 — Kubernetes Secrets (First-Time Only)

These are one-time per cluster/namespace. Skip if the secrets already exist.

```bash
# Registry pull secret (allows Kubernetes to pull from Docker Hub)
kubectl create secret docker-registry private-registry-secret \
  --namespace gu-dev \
  --docker-server=docker.io \
  --docker-username=<dockerhub-username> \
  --docker-password=<dockerhub-pat>

# Graphman gateway credentials
kubectl create secret generic gateway-utility-graphman \
  --namespace gu-dev \
  --from-file=graphman.configuration=/path/to/dev-graphman.configuration \
  --dry-run=client -o yaml | kubectl apply -f -

# Session signing key (separate key per environment)
kubectl create secret generic gateway-utility-session \
  --namespace gu-dev \
  --from-literal=session-secret="$(openssl rand -hex 32)"
```

Repeat all three for `gu-prod`. For the complete first-time deployment walkthrough (namespaces, ReferenceGrants, TLS cert setup, ConfigMaps, HTTPRoutes, Envoy Gateway, verification), see **[docs/Deployment-Guide.md](./docs/Deployment-Guide.md)**.

---

## 9 — Deploy to Kubernetes

```bash
# Namespaces + ReferenceGrants (first time only)
kubectl apply -f k8s/envoy-gateway/gu-dev-namespace.yaml
kubectl apply -f k8s/envoy-gateway/gu-dev-referencegrant.yaml

# ConfigMap + workload
sed 's/namespace: gateway-utility/namespace: gu-dev/' k8s/configmap.yaml  | kubectl apply -f -
sed 's/namespace: gateway-utility/namespace: gu-dev/' k8s/deployment.yaml | kubectl apply -f -
sed 's/namespace: gateway-utility/namespace: gu-dev/' k8s/service.yaml    | kubectl apply -f -

# HTTPRoute (Envoy Gateway)
kubectl apply -f k8s/envoy-gateway/gu-dev-httproute.yaml

# Verify
kubectl rollout status deployment/gateway-utility -n gu-dev
kubectl get pods -n gu-dev
```

Repeat substituting `gu-prod` for production. For the full 15-step deployment guide including TLS cert, Envoy Gateway verification, scaling, and troubleshooting, see **[docs/Deployment-Guide.md](./docs/Deployment-Guide.md)**.

---

## Git Commands — Setting Up the Repository

### Initialize and push for the first time

```bash
cd /path/to/GatewayUtility

git init
git checkout -b main

# Stage all tracked files
git add .

# IMPORTANT: verify no secrets appear in the output below
git status

git commit -m "Initial commit: Gateway Utility application"

# Add your remote (GitHub, GitLab, Bitbucket, etc.)
git remote add origin https://github.<specific domain>/<username or org name>/gateway-utility.git
git push -u origin main
```

### Day-to-day workflow

```bash
git pull origin main
git checkout -b feature/<your-feature-name>

git add <file-or-directory>
git commit -m "Short description of change"

git push origin feature/<your-feature-name>
# Then open a pull request on GitHub
```

### Tagging a release

```bash
git tag -a v1.0.1 -m "Release v1.0.1 — description of changes"
git push origin v1.0.1
```

---

## What NOT to Commit

| File / Folder | Reason |
|---------------|--------|
| `node_modules/` | Hundreds of MB; regenerated with `npm install` |
| `dist/` | Compiled output; regenerated with `npm run build` |
| `k8s/secret.yaml` | Contains real gateway usernames and passwords |
| `k8s/docker-registry-secret.yaml` | Contains real Docker Hub Personal Access Token |
| `auth-config.json` (after editing) | Contains real gateway URLs — only safe as template |
| `response/` | Runtime data files |
| `generated/` | Runtime generated files |
| `*.configuration` | graphman credential files |
| `scripts/vendor/*.tgz` | Downloaded package tarballs |

All of the above are already covered by `.gitignore`.

---

## Secrets Summary

| Secret | Where It Lives | Template Provided | Applied Via |
|--------|---------------|-------------------|-------------|
| Broadcom npm token | `~/.npmrc` on developer machine | See Credential 1 above | File on local machine |
| Gateway host + OIDC config | `auth-config.json`, `config.json` | Already in repo (edit placeholders) | Local file, never committed |
| Docker Hub PAT (push) | `docker login` on developer machine | See Credential 4 above | `docker login` |
| Docker Hub PAT (pull) | Kubernetes Secret | `k8s/docker-registry-secret.yaml.template` | `kubectl create secret` |
| Graphman gateway credentials | Kubernetes Secret | `k8s/secret.yaml.template` | `kubectl apply` |
| Express session signing key | Kubernetes Secret | `k8s/session-secret.yaml` (placeholder) | `kubectl create secret` |

---

## Quick Reference

| Task | Command |
|------|---------|
| Install dependencies | `npm install` |
| Start local dev server (hot reload) | `./scripts/dev-server.sh` |
| Start production server locally | `./scripts/prod-server.sh` |
| Kill dev server processes | `./scripts/kill-server.sh` |
| Build React frontend (before Docker) | `npm run build` |
| Full Docker build + push + rollout | `./scripts/upgrade-rebuild.sh` |
| Docker build + push (manual) | `./scripts/package-image.sh --npm-token "$TOKEN" --registry docker.io/<user> --push` |
| Docker build (local graphman, no token) | `./scripts/package-image.sh --local-graphman ../../graphman-client-main --registry docker.io/<user> --push` |
| Validate packages (offline prep) | `./scripts/validate-packages.sh` |
| Download packages for offline builds | `./scripts/download-vendor.sh` |
| Build from vendored packages | `./scripts/build-from-vendor.sh` |

---

## References

All documentation lives in `docs/`. `README.md` (this file) is the entry point.

| Document | What it covers |
|----------|---------------|
| [docs/Local-Env-Testing.md](./docs/Local-Env-Testing.md) | All UI pages and routes, full API endpoint catalogue, application architecture, local prerequisites |
| [docs/Rebuild-Guide.md](./docs/Rebuild-Guide.md) | Day-to-day rebuild pre-flight checks, step-by-step rebuild, local Docker test, build troubleshooting, technology stack, npm package inventory |
| [docs/Deployment-Guide.md](./docs/Deployment-Guide.md) | First-time Docker build (all package-image.sh modes), complete 15-step Kubernetes deployment, Envoy Gateway setup, secrets, HTTPRoutes, scaling, K8s troubleshooting |
| [scripts/README.md](./scripts/README.md) | Package validation and vendor workflow for air-gapped / offline builds |
