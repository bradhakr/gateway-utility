# Gateway Utility — Docker Build & Kubernetes Deployment Guide

**Docker Hub image:** `docker.io/bradhakr/gateway-utility`  
**Kubernetes namespaces:** `gu-dev` (development), `gu-prod` (production)  
**Last updated:** June 2026

> This guide covers **first-time deployment** from scratch.  
> For day-to-day rebuilds after a code change, see [Rebuild-Guide.md](./Rebuild-Guide.md).  
> For local development setup, see [Local-Env-Testing.md](./Local-Env-Testing.md).

---

## Session Affinity

`sessionAffinity: ClientIP` is active in `k8s/service.yaml` with a **3-hour sticky timeout**.

| Scenario | Behaviour |
|---|---|
| Different users from different machines | Each IP routes independently — no interference |
| Same user, multiple browser tabs | Same IP → same pod → shared scratch space and session cookie. Works correctly |
| Same user logged in twice simultaneously | Same IP → same pod → same session cookie → treated as one session |
| Same user from two different machines | Different IPs → may land on different pods, each with its own independent session |

---

## Overview — what gets deployed

The application runs as **two independent instances**: one in `gu-dev`, one in `gu-prod`. Both are exposed through an existing `shared-gateway` (Envoy) in the `default` namespace via a wildcard HTTPS listener.

```
Internet / Browser
       │  HTTPS (443) — wildcard.vks.security.broadcom.com-tls
       ▼
Envoy Gateway  (shared-gateway — default namespace)
  │
  ├── Listener: gu-dev-https  ─── gu-dev.vks.security.broadcom.com
  │     TLS terminated
  │     └── HTTPRoute (gu-dev ns)
  │           sessionAffinity: ClientIP ──► Pod A (gu-dev)
  │
  └── Listener: gu-prod-https ─── gu-prod.vks.security.broadcom.com
        TLS terminated
        └── HTTPRoute (gu-prod ns)
              sessionAffinity: ClientIP ──► Pod A (gu-prod)
```

Each environment is fully isolated — separate namespace, ConfigMap, Secrets, emptyDir scratch volumes, and OIDC session store.

---

## Kubernetes manifest file map

```
k8s/
├── configmap.yaml                              ← edit per environment before applying
├── deployment.yaml                             ← set namespace per environment
├── service.yaml                                ← set namespace per environment
├── secret.yaml.template                        ← graphman.configuration credentials template
├── github-repos-secret.yaml.template           ← GitHub repos config template (optional — Repository SyncUp)
├── session-secret.yaml                         ← OIDC session signing key (placeholder)
├── docker-registry-secret.yaml.template        ← Docker Hub pull secret template
└── envoy-gateway/
    ├── shared-gateway-listener-patch.yaml ← manual listener YAML (see Step 9 note)
    ├── gu-dev-namespace.yaml
    ├── gu-dev-httproute.yaml
    ├── gu-dev-referencegrant.yaml
    ├── gu-prod-namespace.yaml
    ├── gu-prod-httproute.yaml
    └── gu-prod-referencegrant.yaml
```

---

## Part 1 — Docker Build and Push

### Prerequisites

```bash
docker --version          # Docker 20+ with buildx
kubectl version --client  # kubectl 1.24+
```

Outbound HTTPS access required to:
- `registry-1.docker.io` — Docker Hub push
- `packages.broadcom.com` — Graphman npm fetch (Mode A only)

> **Broadcom Artifactory token** — required to download `@layer7/graphman` during Stage 0 of the Docker build.  
> Use `--npm-token` or `--npm-token-file`. Alternatively, use `--local-graphman` (Mode B) to copy your already-installed client — no token required.

> **Platform / architecture** — `package-image.sh` defaults to `--platform linux/amd64,linux/arm64` (multi-platform manifest). Multi-platform builds require `--push`. Local test builds without `--push` fall back to your machine's native platform automatically.

---

### Step 1 — Log in to Docker Hub

```bash
docker login docker.io
# Username: bradhakr
# Password: <Access Token — hub.docker.com → Account Settings → Security → New Access Token>
```

---

### Step 2 — Build the React frontend

Run this **before every Docker build**:

```bash
cd /path/to/GatewayUtility
npm install        # only needed if package.json changed
npm run build
```

Verify: `ls dist/` should show `index.html` and `assets/`.

---

### Step 3 — Build and push using package-image.sh

Choose the mode that matches your setup:

**Mode A — Broadcom npm token (recommended for CI/CD):**
```bash
export TAG=$(date +%Y%m%d)   # date-stamped — allows rollback
TOKEN=$(cat ~/.npmrc | grep _authToken | cut -d= -f2)

./scripts/package-image.sh \
  --npm-token "$TOKEN" \
  --registry  docker.io/bradhakr \
  --name      gateway-utility \
  --tag       $TAG \
  --push
```

To pin a specific graphman version (recommended for production):
```bash
./scripts/package-image.sh \
  --npm-token        "$TOKEN" \
  --graphman-version 1.3.0 \
  --registry         docker.io/bradhakr \
  --name             gateway-utility \
  --tag              $TAG \
  --push
```

**Mode B — local graphman-client copy (no token needed):**
```bash
./scripts/package-image.sh \
  --local-graphman ../../graphman-client-main \
  --registry       docker.io/bradhakr \
  --name           gateway-utility \
  --tag            $TAG \
  --push
```

**Token from a file (CI/CD pattern):**
```bash
./scripts/package-image.sh \
  --npm-token-file /tmp/broadcom-token.txt \
  --registry       docker.io/bradhakr \
  --name           gateway-utility \
  --tag            $TAG \
  --push
```

---

### Step 3b — Re-tag and push `latest`

> **Required.** `k8s/deployment.yaml` uses the `latest` tag by default. Without this step, Kubernetes will fail with `Failed to pull image … :latest: not found`.

```bash
docker tag  docker.io/bradhakr/gateway-utility:$TAG \
            docker.io/bradhakr/gateway-utility:latest
docker push docker.io/bradhakr/gateway-utility:latest
```

> `upgrade-rebuild.sh` handles the re-tag step automatically. This step is only needed when running `package-image.sh` manually.

**Alternative** — pin a specific tag in `deployment.yaml` and skip `latest` entirely:
```yaml
# k8s/deployment.yaml — change the image line to:
image: docker.io/bradhakr/gateway-utility:20260530
```

---

### Step 4 — Verify the pushed image

```bash
docker pull docker.io/bradhakr/gateway-utility:$TAG
docker inspect docker.io/bradhakr/gateway-utility:$TAG \
  --format '{{json .Config.Labels}}' | python3 -m json.tool
# Expected labels: build.date, build.version, layer7.graphman.version
```

---

## Part 2 — Kubernetes Preparation

### Step 5 — Confirm kubectl context

```bash
kubectl config current-context
kubectl config get-contexts
kubectl config use-context <your-cluster-context>
```

---

### Step 6 — Create namespaces

```bash
kubectl apply -f k8s/envoy-gateway/gu-dev-namespace.yaml
kubectl apply -f k8s/envoy-gateway/gu-prod-namespace.yaml

kubectl get namespaces gu-dev gu-prod
```

Each namespace carries the label `kubernetes.io/metadata.name` which matches the `allowedRoutes` selector in the shared-gateway listeners.

---

### Step 7 — Apply ReferenceGrants

These must exist **before** HTTPRoutes are applied — without them Envoy rejects cross-namespace `backendRef`s.

```bash
kubectl apply -f k8s/envoy-gateway/gu-dev-referencegrant.yaml
kubectl apply -f k8s/envoy-gateway/gu-prod-referencegrant.yaml

kubectl get referencegrant -n gu-dev
kubectl get referencegrant -n gu-prod
```

---

### Step 8 — Prepare the TLS certificate

The wildcard cert `wildcard.vks.security.broadcom.com-tls` must be accessible to the Envoy Gateway controller.

**Option A (simplest) — copy the cert to the `default` namespace:**

```bash
kubectl get secret wildcard.vks.security.broadcom.com-tls -n gu-dev \
  -o yaml \
  | sed 's/namespace: gu-dev/namespace: default/' \
  | kubectl apply -f -

kubectl get secret wildcard.vks.security.broadcom.com-tls -n default
```

The shared-gateway listeners reference `namespace: default`.

**Option B — keep cert in each app namespace (cross-namespace reference):**

The ReferenceGrants already permit `Secret` access. Ensure the cert exists in both namespaces:

```bash
for NS in gu-dev gu-prod; do
  kubectl get secret wildcard.vks.security.broadcom.com-tls -n default \
    -o yaml \
    | sed "s/namespace: default/namespace: $NS/" \
    | kubectl apply -f -
done
```

Then reference `namespace: gu-dev` / `namespace: gu-prod` in the respective listener `certificateRefs`.

---

### Step 9 — Verify shared-gateway covers gu-dev and gu-prod

The `shared-gateway` in the `default` namespace uses a **wildcard listener** that covers all service subdomains:

```bash
kubectl get gateway shared-gateway -n default \
  -o jsonpath='{range .spec.listeners[*]}{.name}{"\t"}{.hostname}{"\t"}{.protocol}{"\n"}{end}'
# Expected output includes:
#   https    *.vks.security.broadcom.com    HTTPS
```

The wildcard `*.vks.security.broadcom.com` covers both `gu-dev.vks.security.broadcom.com` and `gu-prod.vks.security.broadcom.com` automatically.

Verify `gu-dev` and `gu-prod` are in the allowed namespaces:

```bash
kubectl get gateway shared-gateway -n default \
  -o jsonpath='{.spec.listeners[?(@.name=="https")].allowedRoutes.namespaces.selector}' \
  | python3 -m json.tool
# gu-dev and gu-prod should appear in the values list
```

> **If the wildcard listener is not present** — the listeners must be added manually. See `k8s/envoy-gateway/shared-gateway-listener-patch.yaml` for the exact YAML, then patch the gateway:
> ```bash
> kubectl edit gateway shared-gateway -n default
> ```
> Add both `gu-dev-https` and `gu-prod-https` listeners under `spec.listeners` as shown in the patch file. Verify with `kubectl get gateway shared-gateway -n default -o yaml`.

---

### Step 10 — Create ConfigMaps (one per environment)

| Field | DEV | PROD |
|---|---|---|
| `namespace` | `gu-dev` | `gu-prod` |
| `sourceGateway` / `targetGateway` | dev gateway alias names | prod gateway alias names |
| `redirectUri` | `https://gu-dev.vks.security.broadcom.com/auth/callback` | `https://gu-prod.vks.security.broadcom.com/auth/callback` |
| `postLogoutRedirectUri` | `https://gu-dev.vks.security.broadcom.com/login` | `https://gu-prod.vks.security.broadcom.com/login` |

```bash
# DEV
sed 's/namespace: gateway-utility/namespace: gu-dev/' k8s/configmap.yaml \
  | kubectl apply -f -

# PROD — update configmap.yaml for prod gateway/redirect values first, then:
sed 's/namespace: gateway-utility/namespace: gu-prod/' k8s/configmap.yaml \
  | kubectl apply -f -
```

---

### Step 11 — Create Secrets (one per environment)

**Docker Hub registry pull secret** (required to pull the image):

```bash
# DEV
kubectl create secret docker-registry private-registry-secret \
  --namespace gu-dev \
  --docker-server=docker.io \
  --docker-username=bradhakr \
  --docker-password=<your-docker-hub-access-token>

# PROD
kubectl create secret docker-registry private-registry-secret \
  --namespace gu-prod \
  --docker-server=docker.io \
  --docker-username=bradhakr \
  --docker-password=<your-docker-hub-access-token>
```

> The secret name `private-registry-secret` is referenced in `k8s/deployment.yaml` under `imagePullSecrets`.

**Graphman credentials** (the gateway connection configuration):

```bash
# DEV
kubectl create secret generic gateway-utility-graphman \
  --namespace gu-dev \
  --from-file=graphman.configuration=/path/to/dev-graphman.configuration \
  --dry-run=client -o yaml | kubectl apply -f -

# PROD
kubectl create secret generic gateway-utility-graphman \
  --namespace gu-prod \
  --from-file=graphman.configuration=/path/to/prod-graphman.configuration \
  --dry-run=client -o yaml | kubectl apply -f -
```

> The `graphman.configuration` files follow the same format as for local dev — see README.md Step 2a for the template. Use separate files for dev and prod (different gateway addresses and credentials).

**Session signing secrets** (use separate keys for dev and prod):

```bash
# DEV
kubectl create secret generic gateway-utility-session \
  --namespace gu-dev \
  --from-literal=session-secret="$(openssl rand -hex 32)"

# PROD
kubectl create secret generic gateway-utility-session \
  --namespace gu-prod \
  --from-literal=session-secret="$(openssl rand -hex 32)"
```

> Use different session keys in each environment. The key is used to sign cookies — if it changes all existing sessions are invalidated.

**GitHub repository configuration** (optional — required only when using Repository SyncUp):

The `github-repos.json` file holds the GitHub repository entries (owner, repo name, branch, Personal Access Token) used by the Repository SyncUp tool. The pod starts and runs normally without this secret — Repository SyncUp simply shows "no repositories configured".

```bash
# Option A — from a filled-in github-repos.json file
kubectl create secret generic gateway-utility-github-repos \
  --namespace gu-dev \
  --from-file=github-repos.json=/path/to/dev-github-repos.json \
  --dry-run=client -o yaml | kubectl apply -f -

kubectl create secret generic gateway-utility-github-repos \
  --namespace gu-prod \
  --from-file=github-repos.json=/path/to/prod-github-repos.json \
  --dry-run=client -o yaml | kubectl apply -f -
```

```bash
# Option B — from the filled-in template
cp k8s/github-repos-secret.yaml.template k8s/github-repos-secret.yaml
# Edit k8s/github-repos-secret.yaml — fill in owner, repo, branch, PAT
kubectl apply -f k8s/github-repos-secret.yaml -n gu-dev
kubectl apply -f k8s/github-repos-secret.yaml -n gu-prod
```

After creating or updating the secret, restart the pod to pick it up:

```bash
kubectl rollout restart deployment/gateway-utility -n gu-dev
kubectl rollout restart deployment/gateway-utility -n gu-prod
```

> **Important:** In a Kubernetes deployment the secret is mounted **read-only** at `/app/github-repos.json`. The **GitHub Config** page (`/github-config`) will return an error if you try to save changes through the browser while running in-cluster. Manage repository entries by updating the secret via `kubectl` and restarting the pod — exactly the same workflow as `graphman.configuration`.

> **PAT scope required:** Classic PAT — `repo` scope. Fine-grained PAT — **Repository permissions → Contents: Read and write**.

> Never commit `github-repos-secret.yaml` — it contains real PATs and is already in `.gitignore`.

---

### Step 12 — Deploy the application

```bash
# DEV
sed 's/namespace: gateway-utility/namespace: gu-dev/' k8s/deployment.yaml \
  | kubectl apply -f -
sed 's/namespace: gateway-utility/namespace: gu-dev/' k8s/service.yaml \
  | kubectl apply -f -

# PROD
sed 's/namespace: gateway-utility/namespace: gu-prod/' k8s/deployment.yaml \
  | kubectl apply -f -
sed 's/namespace: gateway-utility/namespace: gu-prod/' k8s/service.yaml \
  | kubectl apply -f -

# Watch rollout
kubectl rollout status deployment/gateway-utility -n gu-dev
kubectl rollout status deployment/gateway-utility -n gu-prod
```

---

### Step 13 — Apply HTTPRoutes

```bash
kubectl apply -f k8s/envoy-gateway/gu-dev-httproute.yaml
kubectl apply -f k8s/envoy-gateway/gu-prod-httproute.yaml
```

---

### Step 14 — Verify end-to-end

```bash
# HTTPRoute status — look for Accepted and ResolvedRefs
kubectl get httproute gateway-utility -n gu-dev  -o yaml | grep -A10 "conditions:"
kubectl get httproute gateway-utility -n gu-prod -o yaml | grep -A10 "conditions:"

# Pods running
kubectl get pods -n gu-dev
kubectl get pods -n gu-prod

# Confirm sessionAffinity: ClientIP on both services
kubectl get svc gateway-utility -n gu-dev  -o jsonpath='{.spec.sessionAffinity}'
kubectl get svc gateway-utility -n gu-prod -o jsonpath='{.spec.sessionAffinity}'
# Expected: ClientIP (both)

# Application health
kubectl logs -n gu-dev  deployment/gateway-utility --tail=30
kubectl logs -n gu-prod deployment/gateway-utility --tail=30

# HTTPS connectivity
curl -sI https://gu-dev.vks.security.broadcom.com/api/health
curl -sI https://gu-prod.vks.security.broadcom.com/api/health
# Expected: HTTP/2 200
```

---

### Step 15 — Scale for high availability (optional)

```bash
kubectl scale deployment/gateway-utility -n gu-dev  --replicas=2
kubectl scale deployment/gateway-utility -n gu-prod --replicas=2

kubectl get pods -n gu-dev  -o wide
kubectl get pods -n gu-prod -o wide
```

Sticky sessions remain intact — each client IP is pinned to one pod for 3 hours regardless of replica count.

---

## Quick Rebuild (after code changes)

Use after any code change. See [Rebuild-Guide.md](./Rebuild-Guide.md) for more detail.

```bash
cd /path/to/GatewayUtility

export TAG=$(date +%Y%m%d)

# 1. Build frontend
npm run build

# 2. Build and push image
./scripts/package-image.sh \
  --npm-token "$TOKEN" \
  --registry  docker.io/bradhakr \
  --name      gateway-utility \
  --tag       $TAG \
  --push

docker tag  docker.io/bradhakr/gateway-utility:$TAG \
            docker.io/bradhakr/gateway-utility:latest
docker push docker.io/bradhakr/gateway-utility:latest

# 3. Zero-downtime rolling restart
kubectl rollout restart deployment/gateway-utility -n gu-dev
kubectl rollout restart deployment/gateway-utility -n gu-prod

kubectl rollout status deployment/gateway-utility -n gu-dev
kubectl rollout status deployment/gateway-utility -n gu-prod
```

> **Local test build** (no push, native platform):
> ```bash
> ./scripts/package-image.sh --local-graphman ../../graphman-client-main
> docker run -p 3002:3002 \
>   -v $(pwd)/config.json:/app/config.json:ro \
>   -v $(pwd)/auth-config.json:/app/auth-config.json:ro \
>   -v $(pwd)/../../graphman-client-main/graphman.configuration:/app/graphman-client/graphman.configuration:ro \
>   -v $(pwd)/github-repos.json:/app/github-repos.json:ro \
>   gateway-utility:latest
> # Then open http://localhost:3002
> # The -v github-repos.json line is optional — omit it if you don't use Repository SyncUp
> ```

---

## Troubleshooting

### HTTPRoute — `No listeners match this parent ref`

**Symptom:**
```
message: No listeners match this parent ref
reason: NoMatchingParent
status: "False"
type: Accepted
```

**Diagnose in order:**

#### 1. Verify the wildcard listener exists in shared-gateway

```bash
kubectl get gateway shared-gateway -n default \
  -o jsonpath='{.spec.listeners[*].name}' | tr ' ' '\n'
# Expected output must include: https
```

If the wildcard listener is missing, add the named listeners using the patch file:
```bash
kubectl edit gateway shared-gateway -n default
# Add listeners from k8s/envoy-gateway/shared-gateway-listener-patch.yaml
```

#### 2. Verify hostname consistency

The HTTPRoute `hostnames` and the gateway listener `hostname` must be identical:

```bash
# Listener hostname
kubectl get gateway shared-gateway -n default \
  -o jsonpath='{.spec.listeners[?(@.name=="https")].hostname}'

# HTTPRoute hostname
kubectl get httproute gateway-utility -n gu-dev \
  -o jsonpath='{.spec.hostnames[0]}'
```

If they differ, re-apply the HTTPRoute after fixing:
```bash
kubectl apply -f k8s/envoy-gateway/gu-dev-httproute.yaml
```

#### 3. Verify namespace label

```bash
kubectl get namespace gu-dev --show-labels | grep metadata.name
# Expected: kubernetes.io/metadata.name=gu-dev
```

If missing:
```bash
kubectl label namespace gu-dev kubernetes.io/metadata.name=gu-dev
```

#### 4. Verify ReferenceGrant exists

```bash
kubectl get referencegrant -n gu-dev
# Expected: allow-shared-gateway-to-gu-dev
```

If missing:
```bash
kubectl apply -f k8s/envoy-gateway/gu-dev-referencegrant.yaml
```

#### 5. Full status after any fix

```bash
kubectl apply -f k8s/envoy-gateway/gu-dev-httproute.yaml

# Wait ~10 s for reconciliation, then:
kubectl get httproute gateway-utility -n gu-dev \
  -o jsonpath='{.status.parents[0].conditions}' | python3 -m json.tool
# Look for: "reason": "Accepted", "status": "True"

curl -sI https://gu-dev.vks.security.broadcom.com/api/health
# Expected: HTTP/2 200
```
