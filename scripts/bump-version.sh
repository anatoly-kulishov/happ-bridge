#!/usr/bin/env bash
# Bump version across all project files.
# Usage: bash scripts/bump-version.sh <new-version>
# Example: bash scripts/bump-version.sh 1.3.0
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$SCRIPT_DIR/.."

NEW_VERSION="${1:-}"
if [[ -z "$NEW_VERSION" ]]; then
  echo "Usage: bash scripts/bump-version.sh <new-version>" >&2
  echo "Example: bash scripts/bump-version.sh 1.3.0" >&2
  exit 1
fi

if ! [[ "$NEW_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "Error: Version must match N.N.N (e.g. 1.2.0): '$NEW_VERSION'" >&2
  exit 1
fi

OLD_VERSION="$(node -e "console.log(require('$ROOT/package.json').version)")"
if [[ "$OLD_VERSION" == "$NEW_VERSION" ]]; then
  echo "Already at $NEW_VERSION"
  exit 0
fi

echo "Bumping $OLD_VERSION → $NEW_VERSION"

# --- package.json (npm version updates it properly, but we call it directly) ---
node -e "
const fs = require('fs')
const pkg = JSON.parse(fs.readFileSync('$ROOT/package.json', 'utf8'))
pkg.version = '$NEW_VERSION'
fs.writeFileSync('$ROOT/package.json', JSON.stringify(pkg, null, 2) + '\n')
"
echo "  package.json: updated"

# --- docs/index.html ---
INDEX="$ROOT/docs/index.html"
COUNT=$(grep -c "$OLD_VERSION" "$INDEX" || true)
if (( COUNT == 0 )); then
  echo "Error: No occurrences of '$OLD_VERSION' found in docs/index.html" >&2
  exit 1
fi
sed -i '' "s/$OLD_VERSION/$NEW_VERSION/g" "$INDEX"
echo "  docs/index.html: $COUNT occurrence(s) updated"

# --- README.md ---
README="$ROOT/README.md"
COUNT=$(grep -c "$OLD_VERSION" "$README" || true)
if (( COUNT == 0 )); then
  echo "Error: No occurrences of '$OLD_VERSION' found in README.md" >&2
  exit 1
fi
sed -i '' "s/$OLD_VERSION/$NEW_VERSION/g" "$README"
echo "  README.md: $COUNT occurrence(s) updated"

# --- src/dev-mock.ts ---
DEV="$ROOT/src/dev-mock.ts"
COUNT=$(grep -c "$OLD_VERSION" "$DEV" || true)
if (( COUNT > 0 )); then
  sed -i '' "s/$OLD_VERSION/$NEW_VERSION/g" "$DEV"
  echo "  src/dev-mock.ts: $COUNT occurrence(s) updated"
else
  echo "  src/dev-mock.ts: no occurrences (OK)"
fi

# --- Create release notes stub ---
NOTES="$ROOT/docs/release-notes-${NEW_VERSION}.md"
if [[ ! -f "$NOTES" ]]; then
  cat > "$NOTES" << NOTES_EOF
## Happ Bridge ${NEW_VERSION}

TODO: describe changes.

### Install
1. Download **Happ Bridge-${NEW_VERSION}-arm64.dmg**
2. Open **Install Happ Bridge.command** → Install

Or wait for the in-app updater if you already have ${OLD_VERSION}+ (after this build is published).

### Changed
-

### Fixed
-
NOTES_EOF
  echo "  Created $NOTES"
else
  echo "  $NOTES already exists (skipping)"
fi

echo ""
echo "Done. Next steps:"
echo "  1. git add -A && git commit -m 'chore: bump to $NEW_VERSION'"
echo "  2. git tag v$NEW_VERSION && git push origin main && git push origin v$NEW_VERSION"
echo "  3. npm run dist"
