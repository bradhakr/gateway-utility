#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# package-image.sh — Build and push the Gateway Utility Docker image
#
# USAGE:
#   ./scripts/package-image.sh [OPTIONS]
#
# OPTIONS:
#   -r, --registry          <registry>   Container registry  (e.g. docker.io/bradhakr)
#   -n, --name              <name>       Image name          (default: gateway-utility)
#   -t, --tag               <tag>        Image tag           (default: latest)
#       --platform          <platform>   Target platform     (default: linux/amd64)
#   -g, --graphman-version  <version>    @layer7/graphman version (default: latest)
#       --npm-token         <token>      Broadcom Artifactory auth token
#       --npm-token-file    <path>       File containing the auth token
#       --local-graphman    <path>       Use a local graphman-client directory
#                                        instead of fetching from npm
#   -p, --push                           Push image after build
#       --no-cache                       Build without Docker cache
#   -h, --help                           Show this help
#
# EXAMPLES:
#   # Build and push (amd64):
#   ./scripts/package-image.sh --npm-token "$TOKEN" --registry docker.io/bradhakr --tag 1.0.0 --push
#
#   # Local graphman-client, no registry access needed:
#   ./scripts/package-image.sh --local-graphman ~/graphman-client-main --registry docker.io/bradhakr --push
#
#   # Local test build only (no push):
#   ./scripts/package-image.sh --npm-token "$TOKEN"
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

REGISTRY="${REGISTRY:-}"
IMAGE_NAME="${IMAGE_NAME:-gateway-utility}"
IMAGE_TAG="${IMAGE_TAG:-latest}"
PLATFORM="${PLATFORM:-linux/amd64}"
GRAPHMAN_VERSION="${GRAPHMAN_VERSION:-latest}"
NPM_TOKEN="${NPM_TOKEN:-}"
NPM_TOKEN_FILE="${NPM_TOKEN_FILE:-}"
LOCAL_GRAPHMAN="${LOCAL_GRAPHMAN:-}"
PUSH_IMAGE="${PUSH_IMAGE:-false}"
NO_CACHE="${NO_CACHE:-false}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    -r|--registry)          REGISTRY="$2";         shift 2 ;;
    -n|--name)              IMAGE_NAME="$2";        shift 2 ;;
    -t|--tag)               IMAGE_TAG="$2";         shift 2 ;;
       --platform)          PLATFORM="$2";          shift 2 ;;
    -g|--graphman-version)  GRAPHMAN_VERSION="$2";  shift 2 ;;
       --npm-token)         NPM_TOKEN="$2";         shift 2 ;;
       --npm-token-file)    NPM_TOKEN_FILE="$2";    shift 2 ;;
       --local-graphman)    LOCAL_GRAPHMAN="$2";    shift 2 ;;
    -p|--push)              PUSH_IMAGE=true;        shift ;;
       --no-cache)          NO_CACHE=true;          shift ;;
    -h|--help)
      grep '^#' "$0" | grep -v '^#!/' | sed 's/^# \?//'
      exit 0 ;;
    *) echo "✗ Unknown option: $1"; exit 1 ;;
  esac
done

# ── Validation ────────────────────────────────────────────────────────────────
if [[ "$PUSH_IMAGE" == "true" && -z "$REGISTRY" ]]; then
  echo "✗  --push requires --registry."; exit 1
fi

if [[ -n "$NPM_TOKEN_FILE" ]]; then
  NPM_TOKEN_FILE="$(eval echo "$NPM_TOKEN_FILE")"
  [[ -f "$NPM_TOKEN_FILE" ]] || { echo "✗  --npm-token-file not found: $NPM_TOKEN_FILE"; exit 1; }
  NPM_TOKEN="$(tr -d '[:space:]' < "$NPM_TOKEN_FILE")"
fi

if [[ -n "$LOCAL_GRAPHMAN" ]]; then
  LOCAL_GRAPHMAN="$(eval echo "$LOCAL_GRAPHMAN")"
  [[ -d "$LOCAL_GRAPHMAN" ]] || { echo "✗  --local-graphman not found: $LOCAL_GRAPHMAN"; exit 1; }
  [[ -f "$LOCAL_GRAPHMAN/cli-main.js" ]] || { echo "✗  cli-main.js not found in $LOCAL_GRAPHMAN"; exit 1; }
fi

FULL_IMAGE="${REGISTRY:+${REGISTRY}/}${IMAGE_NAME}:${IMAGE_TAG}"

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║         Gateway Utility — Docker Package Script          ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo "  Image:    $FULL_IMAGE"
echo "  Platform: $PLATFORM"
echo ""

# ── Temp file cleanup ─────────────────────────────────────────────────────────
TOKEN_FILE=""
BUILD_CTX=""
cleanup() {
  [[ -n "$TOKEN_FILE" && -f "$TOKEN_FILE" ]] && rm -f "$TOKEN_FILE"
  [[ -n "$BUILD_CTX"  && -d "$BUILD_CTX"  ]] && rm -rf "$BUILD_CTX"
}
trap cleanup EXIT

# ── Build context ─────────────────────────────────────────────────────────────
echo "► Preparing build context..."
BUILD_CTX="$(mktemp -d)"

# Copy app files from the project root — explicitly exclude Dockerfile/dockerignore
# so they don't land inside app/ and get double-copied by "COPY app/ ./".
rsync -a --quiet \
  --exclude='node_modules' \
  --exclude='.DS_Store' \
  --exclude='*.sh' \
  --exclude='Dockerfile' \
  --exclude='.dockerignore' \
  --exclude='*.md' \
  --exclude='src' \
  --exclude='public' \
  --exclude='scripts' \
  --exclude='k8s' \
  --exclude='Sample' \
  --exclude='response' \
  --exclude='generated' \
  --exclude='.git' \
  --exclude='tsconfig*.json' \
  --exclude='vite.config.*' \
  --exclude='package*.json' \
  --exclude='auth-config.json' \
  --exclude='config.json' \
  "$PROJECT_DIR/" "$BUILD_CTX/app/"

cp "$PROJECT_DIR/Dockerfile"    "$BUILD_CTX/"
cp "$PROJECT_DIR/.dockerignore" "$BUILD_CTX/" 2>/dev/null || true

# Install production-only node_modules locally so Docker never needs to run npm.
# All production deps are pure JS — macOS-built modules work on Linux unchanged.
echo "  Installing production node_modules locally..."
PROD_INSTALL="$(mktemp -d)"
cp "$PROJECT_DIR/package.json" "$PROJECT_DIR/package-lock.json" "$PROD_INSTALL/"
(cd "$PROD_INSTALL" && npm ci --omit=dev --silent)
mv "$PROD_INSTALL/node_modules" "$BUILD_CTX/app/node_modules"
rm -rf "$PROD_INSTALL"
echo "  Production node_modules ready."

# Graphman client (Mode B: local copy; Mode A: empty stub — npm install in Stage 0)
mkdir -p "$BUILD_CTX/graphman-client-src"
if [[ -n "$LOCAL_GRAPHMAN" ]]; then
  echo "  Copying local graphman-client..."
  rsync -a --quiet --exclude='node_modules' --exclude='.git' \
    "$LOCAL_GRAPHMAN/" "$BUILD_CTX/graphman-client-src/"
fi
echo ""

# ── Build flags ───────────────────────────────────────────────────────────────
FLAGS=(
  --tag      "$FULL_IMAGE"
  --platform "$PLATFORM"
  --build-arg "GRAPHMAN_VERSION=${GRAPHMAN_VERSION}"
)

[[ "$PUSH_IMAGE" == "true" ]] && FLAGS+=(--push) || FLAGS+=(--load)
[[ "$NO_CACHE"   == "true" ]] && FLAGS+=(--no-cache)

if [[ -n "$NPM_TOKEN" && -z "$LOCAL_GRAPHMAN" ]]; then
  TOKEN_FILE="$(mktemp)"
  printf '%s' "$NPM_TOKEN" > "$TOKEN_FILE"
  FLAGS+=(--secret "id=npm_token,src=$TOKEN_FILE")
fi

# ── Build ─────────────────────────────────────────────────────────────────────
echo "► Building..."
docker buildx build "${FLAGS[@]}" "$BUILD_CTX"

echo ""
if [[ "$PUSH_IMAGE" == "true" ]]; then
  echo "✓  Pushed: $FULL_IMAGE"
else
  echo "✓  Built (local): $FULL_IMAGE"
fi
echo ""
echo "  Re-tag and push:     docker tag $FULL_IMAGE ${FULL_IMAGE%:*}:latest"
echo "                       docker push ${FULL_IMAGE%:*}:latest"
echo "  Rolling K8s restart: kubectl rollout restart deployment/gateway-utility -n gu-dev"
echo "                       kubectl rollout restart deployment/gateway-utility -n gu-prod"
echo ""
