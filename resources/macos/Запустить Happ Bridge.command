#!/bin/bash
# Happ Bridge: запуск уже установленной копии.
# Снимает карантин Gatekeeper и открывает приложение из «Программ».
# Полезно, если установщик уже проходил, а macOS всё равно ругается.
set -euo pipefail

DEST="/Applications/Happ Bridge.app"

if [ ! -d "$DEST" ]; then
  osascript -e 'display dialog "Приложение не установлено. Сначала выполните блок «Установить» (Install Happ Bridge.command)." with title "Happ Bridge" buttons {"OK"} default button 1 with icon stop' >/dev/null 2>&1 || true
  echo "error: ${DEST} не найден" >&2
  exit 1
fi

xattr -cr "$DEST" 2>/dev/null || true
if xattr -p com.apple.quarantine "$DEST" >/dev/null 2>&1; then
  xattr -d com.apple.quarantine "$DEST" 2>/dev/null || true
  find "$DEST" -exec xattr -d com.apple.quarantine {} \; 2>/dev/null || true
fi

open "$DEST"
