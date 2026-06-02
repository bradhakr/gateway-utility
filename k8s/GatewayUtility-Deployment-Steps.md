Session Affinity — Confirmed
sessionAffinity: ClientIP is active in k8s/service.yaml with a 3-hour sticky timeout. The same client IP is pinned to the same pod for the full session. Multiple tabs from the same machine all hit the same pod and share the same scratch space and session cookie. No clitch regardless of concurrent users.

Part 1 — Docker Build and Push to docker.io/bradhakr
Step 1 — Log in to Docker Hub
docker login docker.io
# Username: bradhakr
# Password: <Access Token from hub.docker.com → Account Settings → Security>
Step 2 — Choose a tag
export TAG=$(date +%Y%m%d)    # e.g. 20260530  (date-stamped, recommended)
# or: export TAG=1.0.0        # semantic version
Step 3 — Build and push
cd /Users/br661896/Documents/APIM/Graphman/Scripts/GatewayUtility
./Package.sh \
  --registry docker.io/bradhakr \
  --name     gateway-utility \
  --tag      $TAG \
  --push
# Also move the 'latest' pointer
docker tag  docker.io/bradhakr/gateway-utility:$TAG \
            docker.io/bradhakr/gateway-utility:latest
docker push docker.io/bradhakr/gateway-utility:latest
To pin a specific Graphman client version (recommended):

./Package.sh \
  --registry        docker.io/bradhakr \
  --name            gateway-utility \
  --tag             $TAG \
  --graphman-version 1.3.0 \
  --push
Step 4 — Verify the pushed image
docker pull docker.io/bradhakr/gateway-utility:$TAG
docker inspect docker.io/bradhakr/gateway-utility:$TAG \
  --format '{{json .Config.Labels}}' | python3 -m json.tool
# Expected: build.date, build.version, layer7.graphman.version labels
Part 2 — Kubernetes Preparation (Dev and Prod instances)
The app deploys as two independent instances: one in gu-dev, one in gu-prod. Both share the shared-gateway (Envoy) in the default namespace.

File map for what's in k8s/
k8s/
├── namespace.yaml              ← original gateway-utility namespace (not used for dev/prod)
├── configmap.yaml              ← template — copy and edit per environment
├── secret.yaml.template        ← graphman.configuration credentials template
├── session-secret.yaml.template← OIDC session key template
├── deployment.yaml             ← template — set namespace per environment
├── service.yaml                ← template — set namespace per environment
└── envoy-gateway/
    ├── shared-gateway-listener-patch.yaml  ← read this, edit your shared-gateway
    ├── gu-dev-namespace.yaml
    ├── gu-dev-httproute.yaml
    ├── gu-dev-referencegrant.yaml
    ├── gu-prod-namespace.yaml
    ├── gu-prod-httproute.yaml
    └── gu-prod-referencegrant.yaml
Step 5 — Confirm kubectl context
kubectl config current-context
kubectl config get-contexts
kubectl config use-context <your-cluster-context>
Step 6 — Create the gu-dev and gu-prod namespaces
kubectl apply -f k8s/envoy-gateway/gu-dev-namespace.yaml
kubectl apply -f k8s/envoy-gateway/gu-prod-namespace.yaml
kubectl get namespaces gu-dev gu-prod
The namespaces carry the label kubernetes.io/metadata.name which matches the allowedRoutes selector in the shared-gateway listeners.

Step 7 — Apply ReferenceGrants (allow shared-gateway to reach each namespace)
These must exist before the HTTPRoutes are applied, otherwise Envoy will reject the cross-namespace backendRefs.

kubectl apply -f k8s/envoy-gateway/gu-dev-referencegrant.yaml
kubectl apply -f k8s/envoy-gateway/gu-prod-referencegrant.yaml
kubectl get referencegrant -n gu-dev
kubectl get referencegrant -n gu-prod
Step 8 — Prepare the TLS certificate
The wildcard cert wildcard.vks.security.broadcom.com-tls must be accessible to the Envoy Gateway controller. Choose one option:

Option A (simplest) — copy the cert to the default namespace:

# Copy from gu-dev (or wherever the cert already lives)
kubectl get secret wildcard.vks.security.broadcom.com-tls -n gu-dev \
  -o yaml \
  | sed 's/namespace: gu-dev/namespace: default/' \
  | kubectl apply -f -
# Verify
kubectl get secret wildcard.vks.security.broadcom.com-tls -n default
The shared-gateway listener will then reference namespace: default.

Option B — keep cert in each app namespace (cross-namespace reference):

The ReferenceGrants already include a Secret target, so Envoy is already permitted. Just ensure the cert exists in both namespaces:

# Copy into gu-dev and gu-prod if not already there
for NS in gu-dev gu-prod; do
  kubectl get secret wildcard.vks.security.broadcom.com-tls -n default \
    -o yaml \
    | sed "s/namespace: default/namespace: $NS/" \
    | kubectl apply -f -
done
Then reference namespace: gu-dev / namespace: gu-prod in the respective listener's certificateRefs.

Step 9 — Update shared-gateway with two new listeners
Read k8s/envoy-gateway/shared-gateway-listener-patch.yaml for the exact listener YAML to add. Then patch your existing Gateway:

kubectl edit gateway shared-gateway -n default
Add these two listeners under spec.listeners (adjust namespace: based on the TLS cert option chosen above):

  - name: gu-dev-https
    protocol: HTTPS
    port: 443
    hostname: gu.dev.vks.security.broadcom.com
    tls:
      mode: Terminate
      certificateRefs:
        - kind: Secret
          name: wildcard.vks.security.broadcom.com-tls
          namespace: default          # Option A  (or gu-dev for Option B)
    allowedRoutes:
      namespaces:
        from: Selector
        selector:
          matchLabels:
            kubernetes.io/metadata.name: gu-dev
  - name: gu-prod-https
    protocol: HTTPS
    port: 443
    hostname: gu-prod.vks.security.broadcom.com
    tls:
      mode: Terminate
      certificateRefs:
        - kind: Secret
          name: wildcard.vks.security.broadcom.com-tls
          namespace: default          # Option A  (or gu-prod for Option B)
    allowedRoutes:
      namespaces:
        from: Selector
        selector:
          matchLabels:
            kubernetes.io/metadata.name: gu-prod
Verify the Gateway accepts the new listeners:

kubectl get gateway shared-gateway -n default -o jsonpath='{.status.listeners}' \
  | python3 -m json.tool | grep -A5 "gu-dev\|gu-prod"
# Look for "conditions[0].reason: Accepted"
Step 10 — Create ConfigMaps (one per environment)
Edit k8s/configmap.yaml for each environment. The key differences:

Field	DEV	PROD
namespace
gu-dev
gu-prod
sourceGateway / targetGateway
dev gateway names
prod gateway names
auth-config.json redirectUri
https://gu.dev.vks.security.broadcom.com/auth/callback
https://gu-prod.vks.security.broadcom.com/auth/callback
auth-config.json postLogoutRedirectUri
https://gu.dev.vks.security.broadcom.com/login
https://gu-prod.vks.security.broadcom.com/login
# Apply dev ConfigMap
sed 's/namespace: gateway-utility/namespace: gu-dev/' k8s/configmap.yaml \
  | kubectl apply -f -
# Apply prod ConfigMap (edit the file for prod values first)
sed 's/namespace: gateway-utility/namespace: gu-prod/' k8s/configmap.yaml \
  | kubectl apply -f -
Step 11 — Create Secrets (one per environment)
Graphman credentials:

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
Session signing secrets (use separate keys for dev and prod):

# DEV
DEV_SECRET=$(openssl rand -hex 32)
kubectl create secret generic gateway-utility-session \
  --namespace gu-dev \
  --from-literal=session-secret="$DEV_SECRET"
# PROD
PROD_SECRET=$(openssl rand -hex 32)
kubectl create secret generic gateway-utility-session \
  --namespace gu-prod \
  --from-literal=session-secret="$PROD_SECRET"
Step 12 — Deploy the application (dev then prod)
# DEV — deploy with gu-dev namespace
sed 's/namespace: gateway-utility/namespace: gu-dev/' k8s/deployment.yaml \
  | kubectl apply -f -
sed 's/namespace: gateway-utility/namespace: gu-dev/' k8s/service.yaml \
  | kubectl apply -f -
# PROD — deploy with gu-prod namespace
sed 's/namespace: gateway-utility/namespace: gu-prod/' k8s/deployment.yaml \
  | kubectl apply -f -
sed 's/namespace: gateway-utility/namespace: gu-prod/' k8s/service.yaml \
  | kubectl apply -f -
# Watch rollout
kubectl rollout status deployment/gateway-utility -n gu-dev
kubectl rollout status deployment/gateway-utility -n gu-prod
Step 13 — Apply HTTPRoutes
kubectl apply -f k8s/envoy-gateway/gu-dev-httproute.yaml
kubectl apply -f k8s/envoy-gateway/gu-prod-httproute.yaml
Step 14 — Verify end-to-end
# Check HTTPRoute status — look for "Accepted" and "ResolvedRefs"
kubectl get httproute -n gu-dev gateway-utility -o yaml | grep -A10 "conditions:"
kubectl get httproute -n gu-prod gateway-utility -o yaml | grep -A10 "conditions:"
# Check pods are running
kubectl get pods -n gu-dev
kubectl get pods -n gu-prod
# Confirm sessionAffinity is set on both services
kubectl get svc gateway-utility -n gu-dev  -o jsonpath='{.spec.sessionAffinity}'
kubectl get svc gateway-utility -n gu-prod -o jsonpath='{.spec.sessionAffinity}'
# Expected: ClientIP  (both)
# Check application logs
kubectl logs -n gu-dev  deployment/gateway-utility --tail=30
kubectl logs -n gu-prod deployment/gateway-utility --tail=30
# HTTPS connectivity test
curl -sI https://gu.dev.vks.security.broadcom.com/api/health
curl -sI https://gu-prod.vks.security.broadcom.com/api/health
# Expected: HTTP/2 200
Step 15 — Scale for high availability
kubectl scale deployment/gateway-utility -n gu-dev  --replicas=2
kubectl scale deployment/gateway-utility -n gu-prod --replicas=2
kubectl get pods -n gu-dev  -o wide
kubectl get pods -n gu-prod -o wide
Sticky sessions remain intact — each client IP is pinned to one pod for 3 hours.

Update Procedure
export TAG=$(date +%Y%m%d)
# 1. Build and push new image
./Package.sh \
  --registry docker.io/bradhakr \
  --name gateway-utility \
  --tag $TAG \
  --push
docker tag  docker.io/bradhakr/gateway-utility:$TAG \
            docker.io/bradhakr/gateway-utility:latest
docker push docker.io/bradhakr/gateway-utility:latest
# 2. Rolling restart — zero downtime (old pod stays until new is Ready)
kubectl rollout restart deployment/gateway-utility -n gu-dev
kubectl rollout restart deployment/gateway-utility -n gu-prod
# 3. Confirm new image
kubectl get pods -n gu-dev  -o wide
kubectl get pods -n gu-prod -o wide
Architecture Summary
Internet / Browser
       │  HTTPS (443)
       ▼
Envoy Gateway — shared-gateway (default namespace)
  ├── Listener: gu-dev-https  → gu.dev.vks.security.broadcom.com
  │     TLS: wildcard.vks.security.broadcom.com-tls (terminated)
  │     sessionAffinity: ClientIP ──► Pod A (gu-dev)
  │                                ──► Pod B (gu-dev)
  │
  └── Listener: gu-prod-https → gu-prod.vks.security.broadcom.com
        TLS: wildcard.vks.security.broadcom.com-tls (terminated)
        sessionAffinity: ClientIP ──► Pod A (gu-prod)
                                   ──► Pod B (gu-prod)
Each environment is completely isolated — separate namespace, separate ConfigMap, separate secrets, separate emptyDir scratch volumes, separate OIDC session store.
