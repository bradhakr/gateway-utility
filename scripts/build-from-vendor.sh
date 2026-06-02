#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# build-from-vendor.sh
#
# Builds the Gateway Utility Docker image using ONLY the pre-downloaded
# tarballs in scripts/vendor/ — no internet access required inside Docker.
#
# Pre-requisites:
#   1. Run ./scripts/download-vendor.sh first to populate scripts/vendor/
#   2. Run npm install && npm run build (for the React frontend dist/)
#   3. Docker Hub login: docker login docker.io
#
# USAGE:
#   cd /path/to/GatewayUtility
#   ./scripts/build-from-vendor.sh [OPTIONS]
#
# OPTIONS:
#   -r, --registry   <registry>   Container registry  (default: docker.io/bradhakr)
#   -t, --tag        <tag>        Image tag           (default: latest)
#   -p, --push                    Push after build
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
VENDOR_DIR="$SCRIPT_DIR/vendor"
MANIFEST="$VENDOR_DIR/manifest.json"

REGISTRY="${REGISTRY:-docker.io/bradhakr}"
IMAGE_NAME="${IMAGE_NAME:-gateway-utility}"
IMAGE_TAG="${IMAGE_TAG:-latest}"
PUSH_IMAGE=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    -r|--registry) REGISTRY="$2"; shift 2 ;;
    -t|--tag)      IMAGE_TAG="$2"; shift 2 ;;
    -p|--push)     PUSH_IMAGE=true; shift ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

FULL_IMAGE="${REGISTRY}/${IMAGE_NAME}:${IMAGE_TAG}"

# ── Pre-flight ────────────────────────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════════════════════════════╗"
echo "║      Gateway Utility — Offline Build from Vendor Packages            ║"
echo "╚══════════════════════════════════════════════════════════════════════╝"
echo ""

[[ -f "$MANIFEST" ]] || { echo "✗  vendor/manifest.json not found. Run ./scripts/download-vendor.sh first."; exit 1; }
[[ -d "$PROJECT_DIR/dist" ]] || { echo "✗  dist/ not found. Run: npm install && npm run build"; exit 1; }

VENDOR_COUNT=$(ls "$VENDOR_DIR"/*.tgz 2>/dev/null | wc -l | tr -d ' ')
echo "  Image:          $FULL_IMAGE"
echo "  Vendor packages: $VENDOR_COUNT tarballs in $VENDOR_DIR"
echo ""

# ── Build context ─────────────────────────────────────────────────────────────
echo "► Preparing build context..."
BUILD_CTX="$(mktemp -d)"
cleanup() { rm -rf "$BUILD_CTX"; }
trap cleanup EXIT

rsync -a --quiet \
  --exclude='node_modules' \
  --exclude='.DS_Store' \
  --exclude='*.sh' \
  --exclude='Dockerfile' \
  --exclude='.dockerignore' \
  --exclude='Sample' \
  --exclude='.git' \
  --exclude='k8s' \
  --exclude='scripts' \
  "$PROJECT_DIR/" "$BUILD_CTX/app/"

cp "$PROJECT_DIR/Dockerfile"    "$BUILD_CTX/"
cp "$PROJECT_DIR/.dockerignore" "$BUILD_CTX/" 2>/dev/null || true

# Copy vendor tarballs and manifest into build context
mkdir -p "$BUILD_CTX/vendor"
cp "$VENDOR_DIR"/*.tgz  "$BUILD_CTX/vendor/" 2>/dev/null || true
cp "$MANIFEST"          "$BUILD_CTX/vendor/"

# Install production node_modules FROM vendor tarballs locally
echo "► Installing production node_modules from vendor tarballs..."
PROD_INSTALL="$(mktemp -d)"
cp "$PROJECT_DIR/package.json" "$PROJECT_DIR/package-lock.json" "$PROD_INSTALL/"

# Create a local .npmrc that points all installs to the vendor directory
NPM_LOCAL_CACHE="$(mktemp -d)"
(
  cd "$PROD_INSTALL"
  npm ci --omit=dev \
    --cache "$NPM_LOCAL_CACHE" \
    --prefer-offline \
    2>&1 | tail -3
)
mv "$PROD_INSTALL/node_modules" "$BUILD_CTX/app/node_modules"
rm -rf "$PROD_INSTALL" "$NPM_LOCAL_CACHE"
echo "  Production node_modules ready."
echo ""

mkdir -p "$BUILD_CTX/graphman-client-src"

# ── Build flags ───────────────────────────────────────────────────────────────
FLAGS=(
  --tag      "$FULL_IMAGE"
  --platform "linux/amd64"
  --no-cache
)
[[ "$PUSH_IMAGE" == "true" ]] && FLAGS+=(--push) || FLAGS+=(--load)

# ── Build ─────────────────────────────────────────────────────────────────────
echo "► Building image: $FULL_IMAGE"
echo ""
docker buildx build "${FLAGS[@]}" "$BUILD_CTX"

echo ""
[[ "$PUSH_IMAGE" == "true" ]] && echo "✓  Pushed: $FULL_IMAGE" || echo "✓  Built (local): $FULL_IMAGE"
echo ""
