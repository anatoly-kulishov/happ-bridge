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
# sha512 must be Base64 (electron-builder format). Hex also works in newer
# electron-updater, but Base64 is what builder emits and what we verify against.
YML_FILE="$ROOT/release/latest-mac.yml"

sha512_b64() {
  # openssl dgst -sha512 -binary | base64; portable on macOS and Linux CI
  openssl dgst -sha512 -binary "$1" | openssl base64 -A
}

ZIP_CANDIDATE="$(ls "$ROOT"/release/*-"${VERSION}"-arm64.zip 2>/dev/null | head -1)"
DMG_CANDIDATE="$(ls "$ROOT"/release/*-"${VERSION}"-arm64.dmg 2>/dev/null | head -1)"
if [[ -z "$ZIP_CANDIDATE" || -z "$DMG_CANDIDATE" ]]; then
  echo "Error: local ZIP/DMG for ${VERSION} not found in release/" >&2
  exit 1
fi

ZIP_SHA512="$(sha512_b64 "$ZIP_CANDIDATE")"
ZIP_SIZE="$(stat -f %z "$ZIP_CANDIDATE" 2>/dev/null || stat -c %s "$ZIP_CANDIDATE" 2>/dev/null)"
DMG_SHA512="$(sha512_b64 "$DMG_CANDIDATE")"
DMG_SIZE="$(stat -f %z "$DMG_CANDIDATE" 2>/dev/null || stat -c %s "$DMG_CANDIDATE" 2>/dev/null)"
RELEASE_DATE="$(date -u +%Y-%m-%dT%H:%M:%S.000Z)"

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
releaseDate: ${RELEASE_DATE}
YML_EOF

echo "Generated latest-mac.yml:"
cat "$YML_FILE"

# Upload the corrected latest-mac.yml
echo "Uploading latest-mac.yml..."
gh release upload "$TAG" "$YML_FILE" --repo "$REPO" --clobber

# Verify: latest-mac.yml downloadable and contains correct version + filenames.
# Draft→public and CDN can lag a few seconds after upload.
YML_DOWNLOAD_URL="https://github.com/${REPO}/releases/download/${TAG}/latest-mac.yml"
# Ensure the release is published (electron-builder may have created a draft).
gh release edit "$TAG" --repo "$REPO" --draft=false >/dev/null 2>&1 || true
YML_CONTENT=""
for attempt in 1 2 3 4 5 6 7 8; do
  if YML_CONTENT="$(curl -fsSL "$YML_DOWNLOAD_URL" 2>/dev/null)"; then
    break
  fi
  echo "Waiting for latest-mac.yml to become public (attempt ${attempt}/8)…"
  sleep 3
done
if [[ -z "$YML_CONTENT" ]]; then
  echo "Error: Cannot download latest-mac.yml from $YML_DOWNLOAD_URL" >&2
  exit 1
fi
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
# electron-builder uses Base64 sha512; reject accidental hex (128 hex chars).
PUBLISHED_SHA="$(echo "$YML_CONTENT" | awk '/^sha512:/{print $2; exit}')"
if [[ -z "$PUBLISHED_SHA" ]]; then
  echo "Error: latest-mac.yml missing top-level sha512" >&2
  exit 1
fi
if [[ ${#PUBLISHED_SHA} -eq 128 && "$PUBLISHED_SHA" =~ ^[0-9a-fA-F]+$ ]]; then
  echo "Error: latest-mac.yml sha512 looks like hex; electron-updater expects Base64" >&2
  echo "  got: $PUBLISHED_SHA" >&2
  exit 1
fi
if [[ "$PUBLISHED_SHA" != "$ZIP_SHA512" ]]; then
  echo "Error: published sha512 does not match local ZIP hash" >&2
  echo "  published: $PUBLISHED_SHA" >&2
  echo "  local:     $ZIP_SHA512" >&2
  exit 1
fi

echo ""
echo "Release ${TAG} published and verified."
echo "  DMG: $DMG_NAME"
echo "  ZIP: $ZIP_NAME"
echo "  latest-mac.yml: OK (sha512 Base64)"
