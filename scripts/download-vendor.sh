#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# download-vendor.sh
#
# Downloads all Gateway Utility npm packages as .tgz tarballs into:
#   scripts/vendor/<package>-<version>.tgz
#
# Download order (first success wins for each package):
#   1. Broadcom Artifactory layer7-npm  (for @layer7/ packages)
#   2. Broadcom Artifactory npm-proxy   (for standard packages, if available)
#   3. Official npmjs.org               (fallback for public packages)
#
# A manifest file (scripts/vendor/manifest.json) is written with:
#   - package name, version, source registry, filename, SHA-512 checksum
#
# This vendor/ directory can then be used with build-from-vendor.sh to build
# the Docker image completely offline (no internet access inside Docker).
#
# USAGE:
#   cd /path/to/GatewayUtility
#   ./scripts/download-vendor.sh [--prod-only]
#
# OPTIONS:
#   --prod-only    Download only production dependencies (skip devDependencies)
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
VENDOR_DIR="$SCRIPT_DIR/vendor"
MANIFEST="$VENDOR_DIR/manifest.json"

BROADCOM_LAYER7_REGISTRY="https://packages.broadcom.com/artifactory/api/npm/layer7-npm"
BROADCOM_NPM_PROXY="https://packages.broadcom.com/artifactory/api/npm/npm-proxy"
NPMJS_REGISTRY="https://registry.npmjs.org"

PROD_ONLY=false
[[ "${1:-}" == "--prod-only" ]] && PROD_ONLY=true

# ── Read auth token ───────────────────────────────────────────────────────────
NPM_TOKEN=""
if [[ -f "$HOME/.npmrc" ]]; then
  NPM_TOKEN=$(grep -F "packages.broadcom.com/artifactory/api/npm/layer7-npm/:_authToken=" \
    "$HOME/.npmrc" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'" | tr -d '[:space:]' || true)
fi

[[ -z "$NPM_TOKEN" ]] && echo "⚠  No Broadcom token found — Broadcom registries will be skipped."

mkdir -p "$VENDOR_DIR"

# ── Package list: name|declared-range|type ────────────────────────────────────
PROD_PACKAGES=(
  "cors|^2.8.5|prod"
  "express|^4.18.2|prod"
  "express-session|^1.19.0|prod"
  "jose|^6.2.3|prod"
  "react|^18.2.0|prod"
  "react-dom|^18.2.0|prod"
  "react-router-dom|^6.22.0|prod"
  "@layer7/graphman|latest|broadcom"
)

DEV_PACKAGES=(
  "@types/cors|^2.8.17|dev"
  "@types/express-session|^1.19.0|dev"
  "@types/react|^18.2.0|dev"
  "@types/react-dom|^18.2.0|dev"
  "@vitejs/plugin-react|^4.2.1|dev"
  "concurrently|^8.2.2|dev"
  "nodemon|^3.1.14|dev"
  "typescript|^5.3.3|dev"
  "vite|^5.1.0|dev"
)

if [[ "$PROD_ONLY" == "true" ]]; then
  ALL_PACKAGES=("${PROD_PACKAGES[@]}")
else
  ALL_PACKAGES=("${PROD_PACKAGES[@]}" "${DEV_PACKAGES[@]}")
fi

# ── Helper: resolve latest matching version from a registry ──────────────────
resolve_version() {
  local pkg="$1"
  local range="$2"
  local registry="$3"
  local token="$4"

  local version
  if [[ -n "$token" ]]; then
    version=$(npm info "$pkg" version \
      --registry "$registry" \
      --userconfig /dev/null \
      --//$(echo "$registry" | sed 's|https://||')/:_authToken="$token" \
      2>/dev/null || echo "")
  else
    version=$(npm info "$pkg" version \
      --registry "$registry" \
      2>/dev/null || echo "")
  fi
  echo "$version"
}

# ── Helper: download tarball from a registry ─────────────────────────────────
download_from_registry() {
  local pkg="$1"
  local version="$2"
  local registry="$3"
  local token="$4"
  local dest="$5"

  local tmp_dir
  tmp_dir="$(mktemp -d)"

  local result=1
  if [[ -n "$token" ]]; then
    (
      cd "$tmp_dir"
      npm pack "${pkg}@${version}" \
        --registry "$registry" \
        --userconfig /dev/null \
        --//$(echo "$registry" | sed 's|https://||')/:_authToken="$token" \
        2>/dev/null
    ) && result=0 || result=1
  else
    (
      cd "$tmp_dir"
      npm pack "${pkg}@${version}" \
        --registry "$registry" \
        2>/dev/null
    ) && result=0 || result=1
  fi

  if [[ $result -eq 0 ]]; then
    local tarball
    tarball=$(ls "$tmp_dir"/*.tgz 2>/dev/null | head -1)
    if [[ -n "$tarball" ]]; then
      mv "$tarball" "$dest"
      rm -rf "$tmp_dir"
      return 0
    fi
  fi

  rm -rf "$tmp_dir"
  return 1
}

# ── Start report ──────────────────────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════════════════════════════╗"
echo "║        Gateway Utility — Package Vendor Download                     ║"
echo "╚══════════════════════════════════════════════════════════════════════╝"
echo ""
echo "  Output directory: $VENDOR_DIR"
echo "  Packages:         ${#ALL_PACKAGES[@]}"
[[ "$PROD_ONLY" == "true" ]] && echo "  Mode:             Production only" || echo "  Mode:             All (prod + dev)"
echo ""

# Start manifest JSON
echo "[" > "$MANIFEST"
FIRST_ENTRY=true

PASS=0
FAIL=0

for entry in "${ALL_PACKAGES[@]}"; do
  IFS='|' read -r pkg range ptype <<< "$entry"

  echo -n "  ► $pkg  "

  # Determine which registries to try based on package type
  declare -a REGISTRIES=()
  declare -a REGISTRY_TOKENS=()
  declare -a REGISTRY_NAMES=()

  if [[ "$pkg" == "@layer7/"* ]]; then
    REGISTRIES=("$BROADCOM_LAYER7_REGISTRY" "$NPMJS_REGISTRY")
    REGISTRY_TOKENS=("$NPM_TOKEN" "")
    REGISTRY_NAMES=("Broadcom-layer7-npm" "npmjs.org")
  else
    REGISTRIES=("$BROADCOM_NPM_PROXY" "$NPMJS_REGISTRY")
    REGISTRY_TOKENS=("$NPM_TOKEN" "")
    REGISTRY_NAMES=("Broadcom-npm-proxy" "npmjs.org")
  fi

  DOWNLOADED=false
  SOURCE_REGISTRY=""
  RESOLVED_VERSION=""
  FILENAME=""

  for i in "${!REGISTRIES[@]}"; do
    reg="${REGISTRIES[$i]}"
    tok="${REGISTRY_TOKENS[$i]}"
    reg_name="${REGISTRY_NAMES[$i]}"

    # Skip Broadcom proxy if no token
    if [[ "$reg" == *"broadcom"* && -z "$tok" ]]; then
      continue
    fi

    # Resolve version
    version=$(resolve_version "$pkg" "$range" "$reg" "$tok" 2>/dev/null || echo "")
    [[ -z "$version" ]] && continue

    # Build filename
    safe_name="${pkg//\//-}"
    safe_name="${safe_name//@/}"
    local_filename="${safe_name}-${version}.tgz"
    dest="$VENDOR_DIR/$local_filename"

    # Skip if already downloaded
    if [[ -f "$dest" ]]; then
      echo "✓  already exists (${version}, ${reg_name})"
      DOWNLOADED=true
      SOURCE_REGISTRY="$reg_name"
      RESOLVED_VERSION="$version"
      FILENAME="$local_filename"
      break
    fi

    # Download
    if download_from_registry "$pkg" "$version" "$reg" "$tok" "$dest"; then
      checksum=$(shasum -a 512 "$dest" | awk '{print $1}')
      echo "✓  ${version}  [${reg_name}]  sha512:${checksum:0:16}..."
      DOWNLOADED=true
      SOURCE_REGISTRY="$reg_name"
      RESOLVED_VERSION="$version"
      FILENAME="$local_filename"

      # Write to manifest
      [[ "$FIRST_ENTRY" == "false" ]] && echo "," >> "$MANIFEST"
      cat >> "$MANIFEST" << EOF
  {
    "name": "$pkg",
    "version": "$RESOLVED_VERSION",
    "type": "$ptype",
    "source": "$SOURCE_REGISTRY",
    "file": "$FILENAME",
    "sha512": "$checksum"
  }
EOF
      FIRST_ENTRY=false
      (( PASS++ )) || true
      break
    fi
  done

  if [[ "$DOWNLOADED" == "false" ]]; then
    echo "✗  FAILED — not found in any registry"
    (( FAIL++ )) || true
  fi
done

echo "]" >> "$MANIFEST"

echo ""
echo "  ── Summary ─────────────────────────────────────────────────────────"
echo "  Downloaded : $PASS"
echo "  Failed     : $FAIL"
echo "  Manifest   : $MANIFEST"
echo ""

if [[ $FAIL -gt 0 ]]; then
  echo "  ⚠  Some packages failed to download."
  echo "     Check network access and Broadcom token validity."
fi
echo ""
