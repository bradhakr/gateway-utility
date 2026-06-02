# Gateway Utility — Docker Build, Push & Kubernetes Deployment Guide

**Docker Hub:** `docker.io/bradhakr`  
**Image:** `docker.io/bradhakr/gateway-utility`  
**Last updated:** May 2026

---

## Session Affinity — Confirmed

`sessionAffinity: ClientIP` is confirmed active in `k8s/service.yaml` with a **3-hour sticky timeout**.

| Scenario | Behaviour |
|---|---|
| Different users from different machines | Each IP routes independently — no interference |
| Same user, multiple browser tabs | Same IP → pinned to the same pod → shared scratch space and session cookie. Works perfectly |
| Same user logged in twice simultaneously | Same IP → same pod → same session cookie → treated as one session. No clash |
| Same user from two different machines | Different IPs → may land on different pods, each with its own independent session |

---

## Part 1 — Docker Build and Push

### Prerequisites

```bash
docker --version          # Docker 20+ with buildx
kubectl version --client  # kubectl 1.24+
```

Outbound HTTPS access required to:
- `registry-1.docker.io` — Docker Hub push
- `packages.broadcom.com` — Graphman npm fetch inside the build (Mode A only)

> **Broadcom Artifactory token** — `packages.broadcom.com` requires an auth token to download `@layer7/graphman`.  
> Use `--npm-token` or `--npm-token-file` (see Step 3).  
> Alternatively use `--local-graphman` (Mode B) to copy your already-installed client — no token needed.

> **Platform / architecture** — `Package.sh` uses `docker buildx` and defaults to `--platform linux/amd64,linux/arm64` (multi-platform manifest).  
> A single image tag works on both Intel/AMD and Apple Silicon / ARM Kubernetes nodes — the right layer is pulled automatically.  
> Multi-platform builds require `--push`. Local test builds (no `--push`) automatically fall back to the native platform of your machine.

---

### Step 1 — Log in to Docker Hub

```bash
docker login docker.io
# Username: bradhakr
# Password: <Access Token — hub.docker.com → Account Settings → Security → New Access Token>
```

---

### Step 2 — Choose an image tag

```bash
export TAG=$(date +%Y%m%d)   # e.g. 20260530  (date-stamped — recommended)
# or semantic:
export TAG=1.0.0
```

---

### Step 3 — Build and push using Package.sh

> `Package.sh` uses `docker buildx` and defaults to `--platform linux/amd64,linux/arm64` (multi-platform manifest).  
> A single pushed image works on both Intel/AMD and Apple Silicon / ARM Kubernetes nodes.  
> Multi-platform requires `--push`. Local test builds (no `--push`) automatically fall back to your machine's native platform.

```bash
cd /path/to/GatewayUtility

TOKEN=$(my-broadcom-token-fetch-script)

./Package.sh \
  --npm-token "$TOKEN" \
  --registry  docker.io/bradhakr \
  --name      gateway-utility \
  --tag       $TAG \
  --push

# Also move the 'latest' pointer
docker tag  docker.io/bradhakr/gateway-utility:$TAG \
            docker.io/bradhakr/gateway-utility:latest
docker push docker.io/bradhakr/gateway-utility:latest
```

To pin a specific Graphman client version (recommended for production):

```bash
./Package.sh \
  --npm-token        "$TOKEN" \
  --registry         docker.io/bradhakr \
  --name             gateway-utility \
  --tag              $TAG \
  --graphman-version 1.3.0 \
  --push
```

## Option 1 — token inline (e.g. from a shell variable your fetch process exports):

TOKEN=$(my-broadcom-token-fetch-script)
./Package.sh \
  --npm-token "$TOKEN" \
  --registry  docker.io/bradhakr \
  --push
## Option 2 — token file (your fetch process writes to a file):

my-broadcom-token-fetch-script > /tmp/broadcom-token.txt
./Package.sh \
  --npm-token-file /tmp/broadcom-token.txt \
  --registry       docker.io/bradhakr \
  --push
## Option 3 — local copy (no token needed today):

./Package.sh \
  --local-graphman ~/Documents/APIM/Graphman/graphman-client-main \
  --registry       docker.io/bradhakr \
  --push
## Weekly CI/CD update pattern (pin with date tag so you can roll back):

## This option is been used. 
TOKEN=$(my-broadcom-token-fetch-script)
./Package.sh \
  --npm-token        "$TOKEN" \
  --graphman-version latest \
  --registry         docker.io/bradhakr \
  --tag              $(date +%Y%m%d) \
  --push
## kubectl rollout restart deployment/gateway-utility -n gateway-utility

---

### Step 3b — Re-tag and push `latest` (required for deployment.yaml)

> **Important:** `k8s/deployment.yaml` uses the `latest` tag by default. If you only push a versioned tag (e.g. `1.0.0`) and skip this step, Kubernetes will fail with:
> `Failed to pull image … :latest: not found`

```bash
# After any Package.sh build+push, always also push the latest pointer:
docker tag  docker.io/bradhakr/gateway-utility:$TAG \
            docker.io/bradhakr/gateway-utility:latest
docker push docker.io/bradhakr/gateway-utility:latest
```

**OR** — pin a specific tag directly in `deployment.yaml` and skip `latest` entirely:

```yaml
# k8s/deployment.yaml — change this line:
image: docker.io/bradhakr/gateway-utility:1.0.0
```

Then apply the change:
```bash
kubectl apply -f k8s/deployment.yaml -n gu-dev
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

The app deploys as **two independent instances**: one in `gu-dev`, one in `gu-prod`.  
Both are exposed through the existing `shared-gateway` (Envoy) in the `default` namespace.

### File map

```
k8s/
├── configmap.yaml                   ← edit per environment before applying
├── secret.yaml.template             ← graphman.configuration credentials template
├── session-secret.yaml.template     ← OIDC session key template
├── deployment.yaml                  ← imagePullSecrets: private-registry-secret
├── service.yaml                     ← set namespace per environment
└── envoy-gateway/
    ├── shared-gateway-listener-patch.yaml   ← read this, edit shared-gateway manually
    ├── gu-dev-namespace.yaml
    ├── gu-dev-httproute.yaml
    ├── gu-dev-referencegrant.yaml
    ├── gu-prod-namespace.yaml
    ├── gu-prod-httproute.yaml
    └── gu-prod-referencegrant.yaml
```

---

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

The namespaces carry the label `kubernetes.io/metadata.name` which matches the `allowedRoutes` selector in the shared-gateway listeners.

---

### Step 7 — Apply ReferenceGrants

These must exist **before** HTTPRoutes are applied. Without them Envoy rejects cross-namespace backendRefs.

```bash
kubectl apply -f k8s/envoy-gateway/gu-dev-referencegrant.yaml
kubectl apply -f k8s/envoy-gateway/gu-prod-referencegrant.yaml

kubectl get referencegrant -n gu-dev
kubectl get referencegrant -n gu-prod
```

---

### Step 8 — Prepare the TLS certificate

The wildcard cert `wildcard.vks.security.broadcom.com-tls` must be accessible to the Envoy Gateway controller.

**Option A (simplest) — copy the cert to the default namespace:**

```bash
kubectl get secret wildcard.vks.security.broadcom.com-tls -n gu-dev \
  -o yaml \
  | sed 's/namespace: gu-dev/namespace: default/' \
  | kubectl apply -f -

kubectl get secret wildcard.vks.security.broadcom.com-tls -n default
```

The shared-gateway listeners will reference `namespace: default`.

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

### Step 9 — Verify shared-gateway already covers gu-dev and gu-prod

The `shared-gateway` in the `default` namespace already has a **single wildcard listener** that covers all services:

```bash
kubectl get gateway shared-gateway -n default \
  -o jsonpath='{range .spec.listeners[*]}{.name}{"\t"}{.hostname}{"\t"}{.protocol}{"\n"}{end}'
# Output:
#   https    *.vks.security.broadcom.com    HTTPS
```

The wildcard `*.vks.security.broadcom.com` automatically covers `gu-dev.vks.security.broadcom.com` and `gu-prod.vks.security.broadcom.com`. The `allowedRoutes` on this listener already includes both namespaces.

> **No changes to shared-gateway are required.** The HTTPRoutes simply reference `sectionName: https` (the wildcard listener) and use their specific hostnames for routing.

Verify `gu-dev` and `gu-prod` are in the allowed namespaces:

```bash
kubectl get gateway shared-gateway -n default \
  -o jsonpath='{.spec.listeners[?(@.name=="https")].allowedRoutes.namespaces.selector}' \
  | python3 -m json.tool
# gu-dev and gu-prod should appear in the values list
```

---

### Step 10 — Create ConfigMaps (one per environment)

| Field | DEV | PROD |
|---|---|---|
| `namespace` | `gu-dev` | `gu-prod` |
| `sourceGateway` / `targetGateway` | dev gateway names | prod gateway names |
| `redirectUri` | `https://gu-dev.vks.security.broadcom.com/auth/callback` | `https://gu-prod.vks.security.broadcom.com/auth/callback` |
| `postLogoutRedirectUri` | `https://gu-dev.vks.security.broadcom.com/login` | `https://gu-prod.vks.security.broadcom.com/login` |

```bash
# DEV
sed 's/namespace: gateway-utility/namespace: gu-dev/' k8s/configmap.yaml \
  | kubectl apply -f -

# PROD — edit configmap.yaml for prod values first, then:
sed 's/namespace: gateway-utility/namespace: gu-prod/' k8s/configmap.yaml \
  | kubectl apply -f -
```

---

### Step 11 — Create Secrets (one per environment)

**Registry pull secret — required to pull the image from Docker Hub:**

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

> Get a Docker Hub access token at: hub.docker.com → Account Settings → Security → New Access Token  
> The secret name `private-registry-secret` is already referenced in `k8s/deployment.yaml` under `imagePullSecrets`.

---

**Graphman credentials:**

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

**Session signing secrets — use separate keys for dev and prod:**

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

# Watch rollouts
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
# Expected: ClientIP

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

## Quick Rebuild Command

Use this after any code change or when you need to push a new image.  
Replace `1.0.0` with your new tag (or use `$(date +%Y%m%d)` for a date stamp).

```bash
cd /Users/br661896/Documents/APIM/Graphman/Scripts/GatewayUtility

export TAG=1.0.0          # or: export TAG=$(date +%Y%m%d)
TOKEN=$(my-broadcom-token-fetch-script)

# Build multi-platform (linux/amd64 + linux/arm64) and push
./Package.sh \
  --npm-token "$TOKEN" \
  --registry  docker.io/bradhakr \
  --name      gateway-utility \
  --tag       $TAG \
  --push

# Also move the latest pointer
docker tag  docker.io/bradhakr/gateway-utility:$TAG \
            docker.io/bradhakr/gateway-utility:latest
docker push docker.io/bradhakr/gateway-utility:latest

# Rolling restart (zero downtime)
kubectl rollout restart deployment/gateway-utility -n gu-dev
kubectl rollout restart deployment/gateway-utility -n gu-prod

# Confirm
kubectl rollout status deployment/gateway-utility -n gu-dev
kubectl rollout status deployment/gateway-utility -n gu-prod
```

> **Local test build** (no push, no registry needed — falls back to native platform):
> ```bash
> ./Package.sh --npm-token "$TOKEN"
> docker run -p 3002:3002 \
>   -v $(pwd)/config.json:/app/config.json:ro \
>   -v $(pwd)/graphman.configuration:/app/graphman-client/graphman.configuration:ro \
>   gateway-utility:latest
> ```

---

## Update Procedure (Weekly / On Demand)

```bash
export TAG=$(date +%Y%m%d)

# 1. Build and push new image
./Package.sh \
  --registry docker.io/bradhakr \
  --name     gateway-utility \
  --tag      $TAG \
  --push

docker tag  docker.io/bradhakr/gateway-utility:$TAG \
            docker.io/bradhakr/gateway-utility:latest
docker push docker.io/bradhakr/gateway-utility:latest

# 2. Zero-downtime rolling restart
kubectl rollout restart deployment/gateway-utility -n gu-dev
kubectl rollout restart deployment/gateway-utility -n gu-prod

# 3. Confirm
kubectl rollout status deployment/gateway-utility -n gu-dev
kubectl rollout status deployment/gateway-utility -n gu-prod
```

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

**Two most common causes — run these diagnostics in order:**

#### 1. Verify the listener exists in shared-gateway

```bash
kubectl get gateway shared-gateway -n default \
  -o jsonpath='{.spec.listeners[*].name}' | tr ' ' '\n'
# Expected output must include:
#   gu-dev-https
#   gu-prod-https
```

If `gu-dev-https` is missing, the listener was never added. Edit the gateway and paste the listener block from Step 9:

```bash
kubectl edit gateway shared-gateway -n default
```

Add under `spec.listeners` (see Step 9 for full YAML):
```yaml
  - name: gu-dev-https
    protocol: HTTPS
    port: 443
    hostname: gu-dev.vks.security.broadcom.com
    ...
```

#### 2. Verify hostname consistency

The HTTPRoute `hostnames` and the gateway listener `hostname` **must be identical**.

```bash
# Listener hostname (from gateway)
kubectl get gateway shared-gateway -n default \
  -o jsonpath='{.spec.listeners[?(@.name=="gu-dev-https")].hostname}'
# Must output: gu-dev.vks.security.broadcom.com

# HTTPRoute hostname
kubectl get httproute gateway-utility -n gu-dev \
  -o jsonpath='{.spec.hostnames[0]}'
# Must output: gu-dev.vks.security.broadcom.com
```

If they differ, re-apply the fixed HTTPRoute:
```bash
kubectl apply -f k8s/envoy-gateway/gu-dev-httproute.yaml
```

#### 3. Verify the namespace label

The gateway listener uses `allowedRoutes.namespaces.selector` matching `kubernetes.io/metadata.name: gu-dev`. This label is auto-set by Kubernetes 1.21+ but worth confirming:

```bash
kubectl get namespace gu-dev --show-labels | grep metadata.name
# Expected: kubernetes.io/metadata.name=gu-dev
```

If missing, add it:
```bash
kubectl label namespace gu-dev kubernetes.io/metadata.name=gu-dev
```

#### 4. Verify the ReferenceGrant exists

Without the ReferenceGrant, Envoy cannot route cross-namespace to the Service:

```bash
kubectl get referencegrant -n gu-dev
# Expected: allow-shared-gateway-to-gu-dev
```

If missing:
```bash
kubectl apply -f k8s/envoy-gateway/gu-dev-referencegrant.yaml
```

#### 5. Full status check after fixing

```bash
# Re-apply the HTTPRoute after any fix
kubectl apply -f k8s/envoy-gateway/gu-dev-httproute.yaml

# Check acceptance (wait ~10 seconds for reconciliation)
kubectl get httproute gateway-utility -n gu-dev \
  -o jsonpath='{.status.parents[0].conditions}' | python3 -m json.tool
# Look for: "reason": "Accepted", "status": "True"

# End-to-end health check
curl -sI https://gu-dev.vks.security.broadcom.com/api/health
# Expected: HTTP/2 200
```

---

## Architecture Summary

```
Internet / Browser
       │  HTTPS (443) — wildcard.vks.security.broadcom.com-tls
       ▼
Envoy Gateway  (shared-gateway — default namespace)
  │
  ├── Listener: gu-dev-https  ─── gu-dev.vks.security.broadcom.com
  │     │   TLS terminated
  │     └── HTTPRoute (gu-dev ns)
  │           sessionAffinity: ClientIP ──► Pod A (gu-dev)
  │                                     ──► Pod B (gu-dev)
  │
  └── Listener: gu-prod-https ─── gu-prod.vks.security.broadcom.com
        │   TLS terminated
        └── HTTPRoute (gu-prod ns)
              sessionAffinity: ClientIP ──► Pod A (gu-prod)
                                        ──► Pod B (gu-prod)
```

Each environment is completely isolated — separate namespace, ConfigMap, Secrets, emptyDir scratch volumes, and OIDC session store.
