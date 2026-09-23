#!/usr/bin/env bash
# Ensure DMG installer is executable before electron-builder packs the disk image.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CMD="${ROOT}/resources/macos/Install Happ Bridge.command"
chmod +x "$CMD"
# Avoid macOS appending quarantine to the script when packing from a cloud-synced tree
xattr -cr "$CMD" 2>/dev/null || true
xattr -cr "${ROOT}/resources/macos/READ ME.txt" 2>/dev/null || true
echo "installer ready: $CMD"
