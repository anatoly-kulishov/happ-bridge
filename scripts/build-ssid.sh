#!/usr/bin/env bash
# Compile the CoreLocation SSID helper once for release.
# macOS → arm64 only (artifact is -arm64). Binary ships in resources/macos/ssid
# and is copied into the .app by extraResources.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="${ROOT}/native/ssid.swift"
OUT="${ROOT}/resources/macos/ssid"
mkdir -p "$(dirname "$OUT")"
swiftc -O -static -target arm64-apple-macos12 "$SRC" -o "$OUT"
chmod +x "$OUT"
codesign --force --sign - "$OUT" 2>/dev/null || true
echo "ssid helper built: $OUT"