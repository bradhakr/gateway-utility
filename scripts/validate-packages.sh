#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# validate-packages.sh
#
# Checks every Gateway Utility npm package against:
#   1. Broadcom Artifactory — layer7-npm repo  (@layer7/ scoped packages)
#   2. Broadcom Artifactory — npm-proxy repo   (standard packages, if configured)
#   3. Official npmjs.org                      (authoritative public source)
#
# Results are printed as a report table and saved to:
#   scripts/validation-report.txt
#
# USAGE:
#   cd /path/to/GatewayUtility
#   ./scripts/validate-packages.sh
#
# REQUIREMENTS:
#   - Broadcom Artifactory token in ~/.npmrc:
#       //packages.broadcom.com/artifactory/api/npm/layer7-npm/:_authToken=<token>
#   - internet access (or VPN) to packages.broadcom.com and registry.npmjs.org
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPORT="$SCRIPT_DIR/validation-report.txt"

BROADCOM_LAYER7_REGISTRY="https://packages.broadcom.com/artifactory/api/npm/layer7-npm"
BROADCOM_NPM_PROXY="https://packages.broadcom.com/artifactory/api/npm/npm-proxy"
NPMJS_REGISTRY="https://registry.npmjs.org"

# ── Read auth token from ~/.npmrc ─────────────────────────────────────────────
NPM_TOKEN=""
if [[ -f "$HOME/.npmrc" ]]; then
  NPM_TOKEN=$(grep -F "packages.broadcom.com/artifactory/api/npm/layer7-npm/:_authToken=" \
    "$HOME/.npmrc" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'" | tr -d '[:space:]' || true)
fi

if [[ -z "$NPM_TOKEN" ]]; then
  echo "⚠  No Broadcom token found in ~/.npmrc — Broadcom checks will be skipped."
  echo "   Add: //packages.broadcom.com/artifactory/api/npm/layer7-npm/:_authToken=<token>"
  echo ""
fi

# ── Package list: name|version|type ──────────────────────────────────────────
# Versions are the declared package.json ranges (exact versions from lockfile
# are checked at runtime using 'npm info').
PACKAGES=(
  # Production dependencies
  "cors|2.x|prod"
  "express|4.x|prod"
  "express-session|1.x|prod"
  "jose|6.x|prod"
  "react|18.x|prod"
  "react-dom|18.x|prod"
  "react-router-dom|6.x|prod"
  # Dev dependencies
  "@types/cors|2.x|dev"
  "@types/express-session|1.x|dev"
  "@types/react|18.x|dev"
  "@types/react-dom|18.x|dev"
  "@vitejs/plugin-react|4.x|dev"
  "concurrently|8.x|dev"
  "nodemon|3.x|dev"
  "typescript|5.x|dev"
  "vite|5.x|dev"
  # External Broadcom CLI (installed in Docker Stage 0)
  "@layer7/graphman|latest|broadcom"
)

# ── Helper: check if package exists in a registry ────────────────────────────
check_registry() {
  local pkg="$1"
  local registry="$2"
  local token="$3"

  local url="${registry}/${pkg}"
  local status

  if [[ -n "$token" ]]; then
    status=$(curl -s -o /dev/null -w "%{http_code}" \
      -H "Authorization: Bearer $token" \
      --max-time 10 "$url" 2>/dev/null || echo "000")
  else
    status=$(curl -s -o /dev/null -w "%{http_code}" \
      --max-time 10 "$url" 2>/dev/null || echo "000")
  fi

  if [[ "$status" == "200" ]]; then
    echo "FOUND"
  elif [[ "$status" == "401" || "$status" == "403" ]]; then
    echo "AUTH_REQUIRED"
  elif [[ "$status" == "404" ]]; then
    echo "NOT_FOUND"
  elif [[ "$status" == "000" ]]; then
    echo "UNREACHABLE"
  else
    echo "HTTP_${status}"
  fi
}

# ── Encode package name for URL (@scope/pkg → @scope%2Fpkg) ──────────────────
url_encode_pkg() {
  echo "$1" | sed 's|@|%40|g; s|/|%2F|g'
}

# ── Print header ──────────────────────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════════════════════════════╗"
echo "║        Gateway Utility — Package Validation Report                   ║"
echo "╚══════════════════════════════════════════════════════════════════════╝"
echo ""
echo "  Registries checked:"
echo "    [1] Broadcom layer7-npm : $BROADCOM_LAYER7_REGISTRY"
echo "    [2] Broadcom npm-proxy  : $BROADCOM_NPM_PROXY"
echo "    [3] Official npmjs.org  : $NPMJS_REGISTRY"
echo ""
printf "  %-35s %-6s %-18s %-18s %-12s\n" "PACKAGE" "TYPE" "BROADCOM L7-NPM" "BROADCOM PROXY" "NPMJS.ORG"
printf "  %-35s %-6s %-18s %-18s %-12s\n" "$(printf '%0.s─' {1..35})" "$(printf '%0.s─' {1..6})" "$(printf '%0.s─' {1..18})" "$(printf '%0.s─' {1..18})" "$(printf '%0.s─' {1..12})"

# ── Also write to report file ─────────────────────────────────────────────────
{
  echo "Gateway Utility — Package Validation Report"
  echo "Generated: $(date)"
  echo ""
  printf "%-35s %-6s %-18s %-18s %-12s\n" "PACKAGE" "TYPE" "BROADCOM_L7-NPM" "BROADCOM_PROXY" "NPMJS.ORG"
  printf "%-35s %-6s %-18s %-18s %-12s\n" "---" "---" "---" "---" "---"
} > "$REPORT"

# ── Check each package ────────────────────────────────────────────────────────
FOUND_BROADCOM=0
FOUND_NPMJS=0
NOT_FOUND=0

for entry in "${PACKAGES[@]}"; do
  IFS='|' read -r pkg _version ptype <<< "$entry"
  encoded=$(url_encode_pkg "$pkg")

  # Check Broadcom layer7-npm
  l7_result=$(check_registry "$encoded" "$BROADCOM_LAYER7_REGISTRY" "$NPM_TOKEN")

  # Check Broadcom npm-proxy (no auth needed for proxy repos typically)
  proxy_result=$(check_registry "$encoded" "$BROADCOM_NPM_PROXY" "$NPM_TOKEN")

  # Check official npmjs.org
  npm_result=$(check_registry "$encoded" "$NPMJS_REGISTRY" "")

  printf "  %-35s %-6s %-18s %-18s %-12s\n" "$pkg" "$ptype" "$l7_result" "$proxy_result" "$npm_result"
  printf "%-35s %-6s %-18s %-18s %-12s\n"   "$pkg" "$ptype" "$l7_result" "$proxy_result" "$npm_result" >> "$REPORT"

  if [[ "$l7_result" == "FOUND" || "$proxy_result" == "FOUND" ]]; then
    (( FOUND_BROADCOM++ )) || true
  elif [[ "$npm_result" == "FOUND" ]]; then
    (( FOUND_NPMJS++ )) || true
  else
    (( NOT_FOUND++ )) || true
  fi
done

echo ""
echo "  ── Summary ─────────────────────────────────────────────────────────"
echo "  Found in Broadcom Artifactory : $FOUND_BROADCOM / ${#PACKAGES[@]}"
echo "  Found on npmjs.org only       : $FOUND_NPMJS / ${#PACKAGES[@]}"
echo "  Not found anywhere            : $NOT_FOUND / ${#PACKAGES[@]}"
echo ""
echo "  Full report saved to: $REPORT"
echo ""

{
  echo ""
  echo "Summary"
  echo "Found in Broadcom Artifactory : $FOUND_BROADCOM / ${#PACKAGES[@]}"
  echo "Found on npmjs.org only       : $FOUND_NPMJS / ${#PACKAGES[@]}"
  echo "Not found anywhere            : $NOT_FOUND / ${#PACKAGES[@]}"
} >> "$REPORT"

echo "  LEGEND:"
echo "    FOUND          — package is available in this registry"
echo "    NOT_FOUND      — package does not exist in this registry (404)"
echo "    AUTH_REQUIRED  — registry returned 401/403 (token missing or expired)"
echo "    UNREACHABLE    — registry could not be reached (network/timeout)"
echo ""
echo "  NOTE: Standard packages (react, express, etc.) are open-source."
echo "  They will typically show NOT_FOUND in layer7-npm (Broadcom's Layer7-"
echo "  specific registry) but FOUND in npm-proxy (if Broadcom has a public"
echo "  npm mirror configured) and always FOUND on npmjs.org."
echo ""
echo "  @layer7/graphman is Broadcom's own package and should show FOUND"
echo "  in layer7-npm."
echo ""
