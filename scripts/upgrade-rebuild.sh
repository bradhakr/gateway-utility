#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# upgrade-rebuild.sh
#
# Rebuilds the Gateway Utility Docker image, pushes it to Docker Hub, then
# triggers a zero-downtime rolling restart on both gu-dev and gu-prod.
#
# PRE-FLIGHT CHECKS (run automatically before any build/deploy step):
#   1. VKS / kubectl  — JWT token must be valid (expires every ~10 h).
#                        Refresh:  kubectl vsphere login \
#                                    --server https://10.160.125.134 \
#                                    --vsphere-username bala@content.tmm.broadcom.lab \
#                                    --insecure-skip-tls-verify
#   2. Docker Hub     — must be logged in as bradhakr to push images.
#                        Refresh:  docker login docker.io
#   3. Broadcom npm   — _authToken for packages.broadcom.com is read
#                        automatically from ~/.npmrc so no manual step
#                        is needed as long as that token is still valid.
#                        Refresh:  Log in at https://support.broadcom.com →
#                                  My Downloads → API Token and update
#                                  ~/.npmrc with the new _authToken.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

export TAG=1.0.0

REGISTRY="docker.io/bradhakr"
IMAGE_NAME="gateway-utility"

# ── Helper ────────────────────────────────────────────────────────────────────
fail() { echo ""; echo "✗  $*"; echo ""; exit 1; }
ok()   { echo "  ✓  $*"; }
hdr()  { echo ""; echo "══ $* ══"; }

# ─────────────────────────────────────────────────────────────────────────────
# PRE-FLIGHT: 1 — VKS / kubectl authentication
# ─────────────────────────────────────────────────────────────────────────────
hdr "Pre-flight check 1/3: VKS / kubectl"

KUBE_USER=$(kubectl config view --minify -o jsonpath='{.users[0].user}' 2>/dev/null || true)
if ! kubectl auth can-i get pods -n gu-dev --quiet 2>/dev/null; then
  echo ""
  echo "  ✗  kubectl is not authenticated to the VKS cluster."
  echo "     Your vSphere token has expired (it has a ~10-hour lifetime)."
  echo ""
  echo "     To refresh, run:"
  echo ""
  echo "       kubectl vsphere login \\"
  echo "         --server https://10.160.125.134 \\"
  echo "         --vsphere-username bala@content.tmm.broadcom.lab \\"
  echo "         --insecure-skip-tls-verify"
  echo ""
  echo "     Then re-run this script."
  exit 1
fi
ok "kubectl authenticated (context: $(kubectl config current-context))"

# ─────────────────────────────────────────────────────────────────────────────
# PRE-FLIGHT: 2 — Docker Hub authentication
# ─────────────────────────────────────────────────────────────────────────────
hdr "Pre-flight check 2/3: Docker Hub (docker.io)"

DOCKER_USER=""
if command -v docker-credential-desktop &>/dev/null; then
  DOCKER_USER=$(echo "https://index.docker.io/v1/" \
    | docker-credential-desktop get 2>/dev/null \
    | python3 -c "import sys,json; print(json.load(sys.stdin).get('Username',''))" 2>/dev/null || true)
fi

if [[ -z "$DOCKER_USER" ]]; then
  echo ""
  echo "  ✗  Not logged in to Docker Hub."
  echo "     Run:  docker login docker.io"
  echo "     (use your bradhakr Docker Hub credentials / Personal Access Token)"
  echo ""
  echo "     Then re-run this script."
  exit 1
fi
ok "Docker Hub logged in as: $DOCKER_USER"

# ─────────────────────────────────────────────────────────────────────────────
# PRE-FLIGHT: 3 — Broadcom npm registry token
# ─────────────────────────────────────────────────────────────────────────────
hdr "Pre-flight check 3/3: Broadcom npm registry (@layer7/graphman)"

# .npmrc format: //registry/:_authToken="value"  (note the colon before the key)
NPM_TOKEN="${NPM_TOKEN:-}"

# Read _authToken from ~/.npmrc (written by: npm login --registry ...)
if [[ -z "$NPM_TOKEN" && -f "$HOME/.npmrc" ]]; then
  NPM_TOKEN=$(grep -F "packages.broadcom.com/artifactory/api/npm/layer7-npm/:_authToken=" \
    "$HOME/.npmrc" | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'" | tr -d '[:space:]' || true)
fi

if [[ -z "$NPM_TOKEN" ]]; then
  echo ""
  echo "  ✗  No Broadcom npm auth token found in ~/.npmrc."
  echo "     The build needs this to install @layer7/graphman from:"
  echo "     https://packages.broadcom.com/artifactory/api/npm/layer7-npm"
  echo ""
  echo "     To fix:"
  echo "       npm login --registry https://packages.broadcom.com/artifactory/api/npm/layer7-npm"
  echo "       (enter your Broadcom email + Artifactory API key as password)"
  echo ""
  exit 1
fi

# If the token looks like a JWT, verify it has not expired
if [[ "$NPM_TOKEN" == eyJ* ]]; then
  NPM_TOKEN_EXP=$(node -e "
    try {
      const p = JSON.parse(Buffer.from('${NPM_TOKEN}'.split('.')[1], 'base64').toString());
      process.stdout.write(String(p.exp || 0));
    } catch(e) { process.stdout.write('0'); }
  " 2>/dev/null || echo "0")

  NOW=$(date +%s)
  if [[ "$NPM_TOKEN_EXP" -gt 0 && "$NOW" -ge "$NPM_TOKEN_EXP" ]]; then
    EXPIRED_MIN=$(( (NOW - NPM_TOKEN_EXP) / 60 ))
    echo ""
    echo "  ✗  Broadcom npm token has EXPIRED (${EXPIRED_MIN} minutes ago)."
    echo "     Refresh it with:"
    echo ""
    echo "       npm login --registry https://packages.broadcom.com/artifactory/api/npm/layer7-npm"
    echo "       (enter your Broadcom email + Artifactory API key as password)"
    echo ""
    exit 1
  fi

  REMAINING_MIN=$(( (NPM_TOKEN_EXP - NOW) / 60 ))
  ok "Broadcom npm token valid (expires in ${REMAINING_MIN} min)"
else
  ok "Broadcom npm token found in ~/.npmrc"
fi

# ─────────────────────────────────────────────────────────────────────────────
# All pre-flight checks passed — proceed with build
# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║     All pre-flight checks passed — starting upgrade      ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# ─────────────────────────────────────────────────────────────────────────────
# STEP 1 — Build and push the Docker image
# ─────────────────────────────────────────────────────────────────────────────
echo "► Step 1: Build and push  ${REGISTRY}/${IMAGE_NAME}:${TAG}"
echo ""

"${SCRIPT_DIR}/package-image.sh" \
  --registry   "$REGISTRY"   \
  --name       "$IMAGE_NAME" \
  --tag        "$TAG"        \
  --platform   linux/amd64   \
  --npm-token  "$NPM_TOKEN"  \
  --no-cache                 \
  --push

docker buildx imagetools create \
  --tag "${REGISTRY}/${IMAGE_NAME}:latest" \
  "${REGISTRY}/${IMAGE_NAME}:${TAG}"

echo ""
echo "  ✓ Image pushed: ${REGISTRY}/${IMAGE_NAME}:${TAG}"
echo "  ✓ Image pushed: ${REGISTRY}/${IMAGE_NAME}:latest"

# ─────────────────────────────────────────────────────────────────────────────
# STEP 2 — Zero-downtime rolling restart
# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo "► Step 2: Rolling restart in gu-dev and gu-prod"
echo ""

kubectl rollout restart deployment/gateway-utility -n gu-dev
kubectl rollout restart deployment/gateway-utility -n gu-prod

# ─────────────────────────────────────────────────────────────────────────────
# STEP 3 — Wait for rollout to complete
# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo "► Step 3: Waiting for rollouts to complete..."
echo ""

kubectl rollout status deployment/gateway-utility -n gu-dev
kubectl rollout status deployment/gateway-utility -n gu-prod

echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║                  Upgrade complete!                       ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""
