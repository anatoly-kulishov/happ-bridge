#!/bin/bash
# Happ Bridge installer for unsigned macOS builds.
# Clears Gatekeeper quarantine after an explicit user launch of this script.
set -euo pipefail

APP_NAME="Happ Bridge.app"
DEST="/Applications/${APP_NAME}"

here="$(cd "$(dirname "$0")" && pwd)"
SRC="${here}/${APP_NAME}"

# If launched from repo/scripts, look next to common build outputs
if [[ ! -d "$SRC" ]]; then
  for candidate in \
    "${here}/../release/mac-arm64/${APP_NAME}" \
    "${here}/../release/mac/${APP_NAME}" \
    "${here}/${APP_NAME}"
  do
    if [[ -d "$candidate" ]]; then
      SRC="$candidate"
      break
    fi
  done
fi

die() {
  local msg="$1"
  osascript -e "display dialog \"${msg}\" with title \"Happ Bridge\" buttons {\"OK\"} default button 1 with icon stop" >/dev/null 2>&1 || true
  echo "error: $msg" >&2
  exit 1
}

if [[ ! -d "$SRC" ]]; then
  die "Не найден «${APP_NAME}». Откройте DMG и запустите установщик с диска Happ Bridge."
fi

# Clear quarantine on the installer itself (harmless if absent)
xattr -cr "$0" 2>/dev/null || true
xattr -cr "$SRC" 2>/dev/null || true

choice="$(osascript <<EOF
display dialog "Установить Happ Bridge в папку «Программы»?

Скрипт скопирует приложение и снимет блокировку Gatekeeper (сборка без подписи Apple).

Если этот установщик сам не запускался из‑за блокировки macOS, в Терминале:

xattr -cr \"/Volumes/Happ Bridge/Install Happ Bridge.command\"
open \"/Volumes/Happ Bridge/Install Happ Bridge.command\"

После установки приложение запустится само. Иконка - в строке меню." \
  with title "Happ Bridge" \
  buttons {"Отмена", "Установить"} \
  default button "Установить"
EOF
)" || exit 0

if [[ "$choice" != *"Установить"* ]]; then
  exit 0
fi

# Need write access to /Applications - may prompt for admin if directed elsewhere;
# user-owned /Applications copy usually works without sudo.
if [[ -d "$DEST" ]]; then
  rm -rf "$DEST" || die "Не удалось удалить старую копию в «Программы». Закройте Happ Bridge и повторите."
fi

cp -R "$SRC" "$DEST" || die "Не удалось скопировать в «Программы»."

# Critical: remove download quarantine so Launch Services won't block the app
xattr -cr "$DEST" 2>/dev/null || true

# Drop com.apple.quarantine explicitly if still present
if xattr -p com.apple.quarantine "$DEST" >/dev/null 2>&1; then
  xattr -d com.apple.quarantine "$DEST" 2>/dev/null || true
  find "$DEST" -exec xattr -d com.apple.quarantine {} \; 2>/dev/null || true
fi

open "$DEST" || true

osascript <<EOF >/dev/null
display dialog "Готово.

Happ Bridge установлен в «Программы» и запущен.
Иконка появится в строке меню (справа вверху).

Если macOS всё ещё ругается: Системные настройки → Конфиденциальность и безопасность → «Всё равно открыть»." \
  with title "Happ Bridge" \
  buttons {"OK"} \
  default button 1
EOF

echo "Installed to ${DEST}"
