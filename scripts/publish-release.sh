#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VERSION="$(node -e "console.log(require('$ROOT/package.json').version)")"
REPO="anatoly-kulishov/happ-bridge"
ASSETS=(
  "$ROOT/release/Happ Bridge-${VERSION}-arm64.dmg"
  "$ROOT/release/Happ Bridge-${VERSION}-arm64-mac.zip"
  "$ROOT/release/latest-mac.yml"
)
for asset in "${ASSETS[@]}"; do
  if [[ -f "$asset" ]]; then
    echo "Uploading $(basename "$asset")..."
    gh release upload "v${VERSION}" "$asset" --repo "$REPO" 2>/dev/null || \
      echo "  (already uploaded or not found, skipping)"
  fi
done
echo "Done."
