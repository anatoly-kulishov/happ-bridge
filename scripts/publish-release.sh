#!/usr/bin/env bash
# Upload release assets to GitHub. Works both locally (with gh CLI + token) and in CI
# (GITHUB_TOKEN is auto-provided). Creates the release if it doesn't exist yet.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VERSION="$(node -e "console.log(require('$ROOT/package.json').version)")"
REPO="anatoly-kulishov/happ-bridge"
TAG="v${VERSION}"

# Auth check
if ! gh auth status &>/dev/null; then
  echo "Error: Not authenticated with GitHub. Run 'gh auth login' or set GH_TOKEN." >&2
  exit 1
fi

# Ensure release exists
if ! gh release view "$TAG" --repo "$REPO" &>/dev/null; then
  NOTES_FILE="$ROOT/docs/release-notes-${VERSION}.md"
  if [[ ! -f "$NOTES_FILE" ]]; then
    echo "Error: Release notes not found: $NOTES_FILE" >&2
    echo "Create it before running this script." >&2
    exit 1
  fi
  echo "Creating release $TAG..."
  gh release create "$TAG" \
    --title "Happ Bridge ${VERSION}" \
    --notes-file "$NOTES_FILE" \
    --repo "$REPO"
fi

# Upload assets (--clobber = overwrite existing)
ASSETS=(
  "$ROOT/release/Happ Bridge-${VERSION}-arm64.dmg"
  "$ROOT/release/Happ Bridge-${VERSION}-arm64-mac.zip"
  "$ROOT/release/latest-mac.yml"
)

for asset in "${ASSETS[@]}"; do
  if [[ ! -f "$asset" ]]; then
    echo "Warning: Asset not found, skipping: $asset" >&2
    continue
  fi
  echo "Uploading $(basename "$asset")..."
  gh release upload "$TAG" "$asset" --repo "$REPO" --clobber
done

# Verify: all 3 assets present in release
echo "Verifying release assets..."
ASSET_COUNT=$(gh release view "$TAG" --repo "$REPO" --json assets --jq '.assets | length')
if (( ASSET_COUNT < 3 )); then
  echo "Error: Expected at least 3 assets, found $ASSET_COUNT" >&2
  exit 1
fi

# Verify latest-mac.yml is downloadable and contains correct version
YML_URL="https://github.com/${REPO}/releases/download/${TAG}/latest-mac.yml"
YML_CONTENT="$(curl -fsSL "$YML_URL")" || {
  echo "Error: Cannot download latest-mac.yml from $YML_URL" >&2
  exit 1
}
if ! echo "$YML_CONTENT" | grep -q "^version: ${VERSION}$"; then
  echo "Error: latest-mac.yml does not contain 'version: ${VERSION}'" >&2
  echo "Content:" >&2
  echo "$YML_CONTENT" >&2
  exit 1
fi

echo ""
echo "Release ${TAG} published successfully."
echo "  Assets: $ASSET_COUNT"
echo "  latest-mac.yml: OK"
