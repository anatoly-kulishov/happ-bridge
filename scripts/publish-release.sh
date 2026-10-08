#!/usr/bin/env bash
# Upload release assets to GitHub. Works both locally (with gh CLI + token) and in CI
# (GITHUB_TOKEN is auto-provided). Creates the release if it doesn't exist yet.
# IMPORTANT: latest-mac.yml is regenerated from the ACTUAL uploaded filenames
# (not derived from artifactName) to ensure URLs match.
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

# Upload local files to the release
# electron-builder produces files; we upload whatever matches the version in release/
for asset in "$ROOT"/release/*-"${VERSION}"-arm64.dmg "$ROOT"/release/*-"${VERSION}"-arm64.zip \
             "$ROOT"/release/*-"${VERSION}"-arm64.dmg.blockmap "$ROOT"/release/*-"${VERSION}"-arm64.zip.blockmap; do
  if [[ -f "$asset" ]]; then
    echo "Uploading $(basename "$asset")..."
    gh release upload "$TAG" "$asset" --repo "$REPO" --clobber
  fi
done

# Get ACTUAL uploaded filenames from GitHub API (the names GitHub stored)
# These are the real download URLs electron-updater will use.
DMG_URL="$(gh release view "$TAG" --repo "$REPO" --json assets --jq '.assets[] | select(.name | test("dmg$")) | .url')"
ZIP_URL="$(gh release view "$TAG" --repo "$REPO" --json assets --jq '.assets[] | select(.name | test("zip$")) | .url')"

if [[ -z "$DMG_URL" || -z "$ZIP_URL" ]]; then
  echo "Error: Could not find DMG or ZIP asset URLs in release" >&2
  exit 1
fi

# Extract filenames from the download URLs
DMG_NAME="$(basename "$DMG_URL")"
ZIP_NAME="$(basename "$ZIP_URL")"

echo "Confirmed upload names:"
echo "  DMG: $DMG_NAME"
echo "  ZIP: $ZIP_NAME"

# Generate latest-mac.yml from ACTUAL filenames (not derived from artifactName)
# This is critical: electron-updater uses these URLs directly.
YML_FILE="$ROOT/release/latest-mac.yml"
cat > "$YML_FILE" << YML_HEADER
version: ${VERSION}
files:
  - url: ${ZIP_NAME}
YML_HEADER

# Compute sha512 directly for both files
ZIP_CANDIDATE="$(ls "$ROOT"/release/*-"${VERSION}"-arm64.zip 2>/dev/null | head -1)"
ZIP_SHA512="$(shasum -a 512 "$ZIP_CANDIDATE" | awk '{print $1}')"
ZIP_SIZE="$(stat -f %z "$ZIP_CANDIDATE" 2>/dev/null || stat -c %s "$ZIP_CANDIDATE" 2>/dev/null)"
DMG_CANDIDATE="$(ls "$ROOT"/release/*-"${VERSION}"-arm64.dmg 2>/dev/null | head -1)"
DMG_SHA512="$(shasum -a 512 "$DMG_CANDIDATE" | awk '{print $1}')"
DMG_SIZE="$(stat -f %z "$DMG_CANDIDATE" 2>/dev/null || stat -c %s "$DMG_CANDIDATE" 2>/dev/null)"

cat > "$YML_FILE" << YML_EOF
version: ${VERSION}
files:
  - url: ${ZIP_NAME}
    sha512: ${ZIP_SHA512}
    size: ${ZIP_SIZE}
  - url: ${DMG_NAME}
    sha512: ${DMG_SHA512}
    size: ${DMG_SIZE}
path: ${ZIP_NAME}
sha512: ${ZIP_SHA512}
releaseDate: $(date -u +%Y-%m-%dT%H:%M:%S.%NZ)Z
YML_EOF

echo "Generated latest-mac.yml:"
cat "$YML_FILE"

# Upload the corrected latest-mac.yml
echo "Uploading latest-mac.yml..."
gh release upload "$TAG" "$YML_FILE" --repo "$REPO" --clobber

# Verify: latest-mac.yml downloadable and contains correct version + filenames
YML_DOWNLOAD_URL="https://github.com/${REPO}/releases/download/${TAG}/latest-mac.yml"
YML_CONTENT="$(curl -fsSL "$YML_DOWNLOAD_URL")" || {
  echo "Error: Cannot download latest-mac.yml from $YML_DOWNLOAD_URL" >&2
  exit 1
}
if ! echo "$YML_CONTENT" | grep -q "^version: ${VERSION}$"; then
  echo "Error: latest-mac.yml does not contain 'version: ${VERSION}'" >&2
  exit 1
fi
# Verify filenames in YAML match actual uploaded filenames
if ! echo "$YML_CONTENT" | grep -qF "$ZIP_NAME"; then
  echo "Error: latest-mac.yml zip name '$ZIP_NAME' not found in downloaded content" >&2
  echo "$YML_CONTENT" >&2
  exit 1
fi
if ! echo "$YML_CONTENT" | grep -qF "$DMG_NAME"; then
  echo "Error: latest-mac.yml dmg name '$DMG_NAME' not found in downloaded content" >&2
  echo "$YML_CONTENT" >&2
  exit 1
fi

echo ""
echo "Release ${TAG} published and verified."
echo "  DMG: $DMG_NAME"
echo "  ZIP: $ZIP_NAME"
echo "  latest-mac.yml: OK"
