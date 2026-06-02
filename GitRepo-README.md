# Gateway Utility — Git Repository Guide

A React + Node.js application for managing Layer7 API Gateway policies via the Graphman client.

---

## What Is in This Repository

```
GatewayUtility/
├── src/                         # React/TypeScript frontend source
│   ├── App.tsx
│   ├── context/                 # Auth context provider
│   └── pages/                   # All UI pages
├── index.html                   # Vite HTML entry template
├── public/                      # Static assets (if any)
├── server.js                    # Express backend (API server)
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
├── Package.sh                   # Docker build script (run from project root)
├── auth-config.json             # OIDC auth config template — fill in your values
├── config.json                  # Gateway config template — fill in your values
├── RebuildREADME.md             # Detailed rebuild & deployment guide
├── k8s/
│   ├── deployment.yaml          # Kubernetes Deployment
│   ├── service.yaml             # Kubernetes Service
│   ├── configmap.yaml           # Kubernetes ConfigMap
│   ├── namespace.yaml           # Namespace definitions
│   ├── ingress.yaml             # Ingress rules
│   ├── session-secret.yaml      # Session signing key (placeholder — fill in)
│   ├── secret.yaml.template     # Graphman credentials template — copy → secret.yaml
│   ├── docker-registry-secret.yaml.template  # Registry pull secret template
│   ├── Upgrade-Rebuild-GWUtility.sh          # Full build → push → rollout script
│   ├── DEPLOYMENT-GUIDE.md
│   ├── GatewayUtility-Deployment-Steps.md
│   └── envoy-gateway/           # Envoy Gateway HTTPRoute and ReferenceGrant configs
└── scripts/
    ├── validate-packages.sh     # Check package availability in Broadcom/npmjs
    ├── download-vendor.sh       # Download all packages as .tgz for offline builds
    ├── build-from-vendor.sh     # Build Docker image from vendored tarballs
    └── README.md                # Vendor workflow documentation
```

> **Not in this repo (gitignored):** `node_modules/`, `dist/`, `k8s/secret.yaml`, `k8s/docker-registry-secret.yaml`, `response/`, `generated/`

---

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Node.js | 20.x LTS | https://nodejs.org |
| npm | 10.x+ | Included with Node.js |
| Docker Desktop | 4.x+ | https://docs.docker.com/desktop/mac/ |
| kubectl | 1.28+ | `brew install kubectl` |
| git | Any | `brew install git` |

---

## REQUIRED CREDENTIALS — Read This Before Anything Else

> **This application will not build or run without credentials. None of these are stored in the repository because they are secrets. You must obtain and configure all of them yourself before following the setup steps below.**

There are **five credentials** you need. The table below shows exactly what each one is for and at which step it is required.

| # | Credential | Used For | Needed At |
|---|-----------|----------|-----------|
| 1 | Broadcom Artifactory npm token | `npm install` — pulls `@layer7/graphman` from Broadcom registry | Step 3 (before `npm install`) |
| 2 | Gateway host URL + admin username + password | `auth-config.json` and `config.json` — connects the app to your API Gateway | Step 4 (before `npm run dev`) |
| 3 | OIDC provider details (discovery URL, client ID) | `auth-config.json` — enables login via your identity provider | Step 4 (before `npm run dev`) |
| 4 | Docker Hub username + Personal Access Token (PAT) | `Package.sh` / `Upgrade-Rebuild-GWUtility.sh` — pushes the image to Docker Hub | Step 6 (before Docker build) |
| 5 | Docker Hub PAT (same or separate read-only) | Kubernetes pull secret — allows the cluster to pull the image | Step 8 (before `kubectl apply`) |

---

### Credential 1 — Broadcom Artifactory npm Token

**What it is:** An API token that authorises your machine to download `@layer7/graphman` from Broadcom's private npm registry.

**How to get it:** Contact your Broadcom account team or open a ticket at https://support.broadcom.com to request an Artifactory API token for `packages.broadcom.com`.

**Where to put it:** Add these two lines to `~/.npmrc` on your machine (create the file if it does not exist):

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

**What it is:** A Docker Hub PAT that allows `Package.sh` to push the built image to your Docker Hub account.

**How to get it:**
1. Log in at https://hub.docker.com
2. Go to **Account Settings → Security → New Access Token**
3. Create a token with **Read & Write** scope

**Where to put it:** You will be prompted when you run `./k8s/Upgrade-Rebuild-GWUtility.sh`. Alternatively, log in once:

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

Work through this list in order. Do not skip ahead.

```
[ ] Credential 1 — Broadcom token added to ~/.npmrc
[ ] Credential 2/3 — auth-config.json filled in with gateway host and OIDC details
[ ] Credential 2/3 — config.json filled in with gateway host
[ ] Step 1 — Repository cloned
[ ] Step 3 — npm install completed successfully (no auth errors)
[ ] Step 4 — npm run build completed successfully (dist/ folder created)
[ ] Credential 4 — docker login completed
[ ] Step 6 — Docker image built and pushed
[ ] Credential 5 — Kubernetes registry pull secret created in gu-dev and gu-prod
[ ] Step 8 — Graphman secret applied (k8s/secret.yaml.template → k8s/secret.yaml)
[ ] Step 8 — Session signing key secret created
[ ] Step 9 — kubectl apply for all manifests
[ ] Step 9 — kubectl get pods -n gu-dev shows Running
```

---

## 1 — Clone the Repository

```bash
git clone https://github.com/<your-org>/gateway-utility.git
cd gateway-utility
```

---

## 2 — Verify Your Broadcom Token (Credential 1)

Before running `npm install`, confirm your `~/.npmrc` is configured:

```bash
cat ~/.npmrc | grep layer7
# Should show two lines — the registry URL and the _authToken line
```

If the token is missing, add it now (see Credential 1 above). Without it, `npm install` will fail with a 401 Unauthorized error.

---

## 3 — Install Dependencies

```bash
npm install
```

This installs both dev dependencies (TypeScript, Vite, React) and production dependencies (Express, graphman client).

---

## 4 — Configure Local Settings

Fill in `auth-config.json` and `config.json` with your gateway host and OIDC details (see Credentials 2 & 3 above). The files already exist in the repo with placeholder values — just replace the `<placeholders>`.

---

## 5 — Local Development

```bash
npm run dev
```

App will be available at `http://localhost:5173`. The Express backend starts alongside the React dev server.

---

## 6 — Build the React Frontend

Run this **before every Docker build**:

```bash
npm run build
```

This produces the `dist/` folder. The Docker image includes this folder.

---

## 7 — Docker Build and Push

> Ensure `npm run build` (Step 6) and `docker login` (Credential 4) are complete first.

```bash
# Make scripts executable (first time only)
chmod +x Package.sh k8s/Upgrade-Rebuild-GWUtility.sh

# Full pipeline: build image → push to Docker Hub → rollout to Kubernetes
./k8s/Upgrade-Rebuild-GWUtility.sh
```

To build the Docker image only without pushing or deploying:

```bash
./Package.sh
```

See `RebuildREADME.md` for detailed rebuild steps and troubleshooting.

---

## 8 — Kubernetes Secrets (First-Time Cluster Setup Only)

These steps are required once per cluster/namespace. Skip if the secrets already exist.

### 8a. Graphman gateway credentials

```bash
# Copy the safe template included in the repo
cp k8s/secret.yaml.template k8s/secret.yaml

# Open k8s/secret.yaml and replace every <placeholder> with your real values:
#   - address: your gateway GraphQL endpoint
#   - username / password / passphrase: gateway admin credentials
#   - namespace: gu-dev or gu-prod

kubectl apply -f k8s/secret.yaml -n gu-dev
kubectl apply -f k8s/secret.yaml -n gu-prod

# Delete k8s/secret.yaml locally when done — it is gitignored but
# keeping it around is a security risk
rm k8s/secret.yaml
```

### 8b. Docker Hub pull secret (Credential 5)

Already shown in the Credential 5 section above.

### 8c. Session signing key

```bash
SECRET=$(openssl rand -hex 32)

kubectl create secret generic gateway-utility-session \
  --namespace gu-dev \
  --from-literal=session-secret="$SECRET" \
  --dry-run=client -o yaml | kubectl apply -f -

kubectl create secret generic gateway-utility-session \
  --namespace gu-prod \
  --from-literal=session-secret="$SECRET" \
  --dry-run=client -o yaml | kubectl apply -f -
```

---

## 9 — Deploy to Kubernetes

```bash
# Namespaces first
kubectl apply -f k8s/namespace.yaml

# Core workload
kubectl apply -f k8s/configmap.yaml    -n gu-dev
kubectl apply -f k8s/deployment.yaml   -n gu-dev
kubectl apply -f k8s/service.yaml      -n gu-dev
kubectl apply -f k8s/ingress.yaml      -n gu-dev

# Envoy Gateway routes (if using Envoy)
kubectl apply -f k8s/envoy-gateway/    -n gu-dev
```

Verify the pod is running:

```bash
kubectl get pods -n gu-dev
kubectl logs -f deployment/gateway-utility -n gu-dev
```

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
git remote add origin https://github.com/<your-org>/gateway-utility.git
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
| Build React frontend | `npm run build` |
| Start dev server | `npm run dev` |
| Full Docker build + push + rollout | `./k8s/Upgrade-Rebuild-GWUtility.sh` |
| Docker build only | `./Package.sh` |
| Validate packages | `./scripts/validate-packages.sh` |
| Download packages for offline builds | `./scripts/download-vendor.sh` |
| Build from vendored packages | `./scripts/build-from-vendor.sh` |

---

## References

- [RebuildREADME.md](./RebuildREADME.md) — Full rebuild steps, architecture diagram, and package inventory
- [k8s/DEPLOYMENT-GUIDE.md](./k8s/DEPLOYMENT-GUIDE.md) — Kubernetes deployment guide
- [scripts/README.md](./scripts/README.md) — Package validation and vendor workflow
