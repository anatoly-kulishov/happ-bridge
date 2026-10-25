# Happ Bridge

### **Stable localhost proxy to Happ on your phone.**

[![Release](https://img.shields.io/github/v/release/anatoly-kulishov/happ-bridge?display_name=tag)](https://github.com/anatoly-kulishov/happ-bridge/releases)
[![Platform](https://img.shields.io/badge/platform-macOS%20Apple%20Silicon-111111.svg)](#install)
[![Electron](https://img.shields.io/badge/Electron-menu%20bar-47848F.svg)](https://www.electronjs.org/)
[![Site](https://img.shields.io/badge/site-GitHub%20Pages-222.svg)](https://anatoly-kulishov.github.io/happ-bridge/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/anatoly-kulishov/happ-bridge/pulls)

[Русский](#happ-bridge-рус) · [English](#happ-bridge-en) · [Download](#install) · [Site](https://anatoly-kulishov.github.io/happ-bridge/) · [Changelog](docs/CHANGELOG.md) · [Security](docs/SECURITY.md)

**Current version:** 1.3.0

---

**macOS menu bar app** that keeps a stable local SOCKS5 / HTTP bridge to [Happ](https://happ.su) on your phone.

Set Telegram, Cursor, Firefox, and WebStorm to `127.0.0.1` **once**. When the phone IP changes on Wi‑Fi, Happ Bridge updates the tunnel automatically.

| Type | Stable address |
| :--- | :------------- |
| SOCKS5 | `127.0.0.1:10808` |
| HTTP | `127.0.0.1:10809` |

**Keywords:** Happ proxy, Happ LAN, SOCKS5 macOS, HTTP proxy iPhone, Telegram SOCKS5, Cursor proxy, WebStorm proxy, Firefox proxy, menu bar proxy, phone Wi‑Fi IP change, local TCP relay.

```mermaid
flowchart LR
  Apps[Telegram / Cursor / IDE] --> Local["127.0.0.1:10808 / 10809"]
  Local --> Bridge[Happ Bridge]
  Bridge --> Phone[Happ on phone LAN]
```

---

<a id="happ-bridge-рус"></a>

## Happ Bridge (рус)

### Зачем это нужно

Happ на iPhone раздаёт SOCKS5 / HTTP прокси в локальную сеть. IP телефона часто меняется - и в Telegram, Cursor, Firefox, WebStorm приходится править адрес вручную.

**Happ Bridge** находит телефон в Wi‑Fi и держит постоянные адреса на Mac (таблица выше).

### Кому подойдёт

- macOS (Apple Silicon) + телефон с Happ и включённым **«Разрешить LAN подключение»**
- кто устал обновлять прокси в Telegram / Cursor / IDE после смены Wi‑Fi

### Возможности (1.3.0)

- **автообновление, которое ставится**: после «Установить» ZIP подменяет `.app` (unsigned-сборка без ShipIt), снимает quarantine и перезапускает
- **lean packaging**: `.app` ~197 MB, prune Framework locales, Preact + hand CSS, lazy Wizard/Inject/diagnostics
- **тёмная тема на дизайн-токенах** (`--hb-*`): единая палитра, semantic UI, системные шрифты и `color-scheme: dark`
- **контраст и анти-скажки**: читабельный мелкий текст, стабильная вёрстка при загрузке/поиске/прописке
- **защита от потери данных**: при закрытии окна с несохранёнными настройками - подтверждение
- **диагностика подключения** в `main.log`: ошибки и таймауты к телефону, смена target, восстановление
- автопоиск Happ в Wi‑Fi; несколько телефонов - список и ручной выбор
- устойчивый поиск после перезагрузки Mac (ожидание Wi‑Fi, backoff, подсказка Local Network)
- один тумблер **«Мост к Happ»**
- **реальные иконки** Cursor / WebStorm / Firefox в списке прописки
- локальный TCP-relay только на `127.0.0.1` (соседи по Wi‑Fi не видят прокси)
- опциональный **логин/пароль Happ LAN** (Keychain; peer на SSID; предупреждение в чужой Wi‑Fi)
- soft-reconnect при смене IP телефона без обрыва слушателей
- watchdog, реакция на смену сети, автозапуск при входе в macOS
- проверка обновлений через GitHub Releases

### Установка {#install}

Сборка **без Apple Developer ID**. Установщик копирует приложение в «Программы» и снимает quarantine Gatekeeper.

#### Готовый .dmg

1. Скачайте `.dmg` с [Releases](https://github.com/anatoly-kulishov/happ-bridge/releases) (файл вида `Happ Bridge-*-arm64.dmg`).
2. Откройте диск: двойной клик по `.dmg` → **Install Happ Bridge.command** → «Установить».
3. Если macOS блокирует **установщик** (диск из шага 2 должен быть открыт):

```bash
if [ ! -d "/Volumes/Happ Bridge" ]; then
  echo "Диск «Happ Bridge» не открыт. Двойной клик по .dmg в Загрузках, дождитесь диска и повторите."
  exit 1
fi
xattr -cr "/Volumes/Happ Bridge/Install Happ Bridge.command"
open "/Volumes/Happ Bridge/Install Happ Bridge.command"
```

4. Если приложение уже в «Программах», но **не запускается**:

```bash
if [ ! -d "/Applications/Happ Bridge.app" ]; then
  echo "Приложение не установлено. Сначала выполните шаг 2 (Install Happ Bridge.command)."
  exit 1
fi
xattr -cr "/Applications/Happ Bridge.app"
open "/Applications/Happ Bridge.app"
```

5. Разрешите доступ к локальной сети, если система спросит. Иконка - в строке меню.

Подробности - в **READ ME.txt** на диске образа.

#### Сборка из исходников

```bash
git clone https://github.com/anatoly-kulishov/happ-bridge.git
cd happ-bridge
npm install
npm test
npm run dist
```

Готовый файл: `release/Happ-Bridge-1.3.0-arm64.dmg` · разработка: `npm run dev`

### Как пользоваться

1. На телефоне: Happ + **Разрешить LAN подключение**.
2. Запустите Happ Bridge, пройдите мастер, дождитесь статуса «Подключено».
3. Вставьте в приложения `127.0.0.1:10808` (SOCKS5) / `127.0.0.1:10809` (HTTP)  
   **или** в настройках: Cursor / WebStorm / Firefox / Codex CLI → **Прописать** → согласитесь на перезапуск.
4. Окно можно закрыть - приложение остаётся в строке меню. Откат прописки - кнопка **Откатить**.

### Как это работает (технически)

- **Локальный релей.** Слушатели только на `127.0.0.1`: SOCKS5 `:10808` и HTTP `:10809`; оба форвардят TCP в SOCKS5 телефона по LAN. Системный прокси macOS не меняется.
- **Порты слушают всегда (fail-open).** Пока приложение запущено, `127.0.0.1:10808/10809` открыты. Если телефон не найден или Happ молчит, порт работает напрямую (SOCKS5/HTTP CONNECT обслуживаются самим мостом, трафик идёт через сеть Mac) — терминал и IDE не ломаются, а просто перестают ходить через телефон.
- **Поиск без broadcast.** Никакого mDNS/ARP/ICMP: только TCP-проба SOCKS5-порта. Кандидаты: ручной IP → IP для текущего SSID → недавние → последний → `/24` подсеть.
- **«Пинг» = рукопожатие SOCKS5.** Greeting `05 01 00` (с паролем `05 01 02`); принимается только `VER=5` + метод no-auth/user-pass.
- **Сканирование.** До 64 параллельных проб; перед первым поиском после логина ждём локальный IPv4.
- **Watchdog.** Health-check ~каждые 8 с; 3 промаха → реконнект; sleep/wake и смена сети учитываются.
- **Ограничения.** Только `/24` и IPv4; спящий телефон не найдётся - укажите IP вручную.

### Безопасность

- слушатели только на localhost
- системный proxy macOS не меняется
- прописка в приложениях - только по вашей кнопке
- пароль LAN в Keychain; мост **не шифрует** Wi‑Fi Mac↔телефон (туннель шифрует Happ)
- подробнее: [SECURITY.md](docs/SECURITY.md)

### Стек

Electron · Vite · React · TypeScript · Tailwind

### Лицензия

[MIT](LICENSE)

---

<a id="happ-bridge-en"></a>

## Happ Bridge (EN)

Stable localhost proxy bridge to a phone running Happ on your LAN. Stop editing proxy IPs in Telegram, Cursor, Firefox, and WebStorm every time DHCP moves your phone.

**Version 1.3.0** - auto-update that replaces the unsigned `.app` (ZIP apply after quit, no ShipIt), lean packaging (~197 MB), semantic CSS/UI polish.

### Why

| Without Happ Bridge | With Happ Bridge |
| :--- | :--- |
| Phone IP changes → edit every app | Apps stay on `127.0.0.1` |
| System proxy hacks | Localhost-only TCP relay |
| Guessing which LAN device is Happ | SOCKS5 handshake probe + optional LAN auth |

### Quick start

1. Download the `.dmg` from [Releases](https://github.com/anatoly-kulishov/happ-bridge/releases).
2. Open the disk → **Install Happ Bridge.command** → Install (copies to `/Applications`; unsigned, no Apple Developer ID).
3. If macOS blocks the **installer** (disk from step 2 must be open):

```bash
if [ ! -d "/Volumes/Happ Bridge" ]; then
  echo "Disk «Happ Bridge» not mounted. Double-click the .dmg in Downloads, wait for the disk, then retry."
  exit 1
fi
xattr -cr "/Volumes/Happ Bridge/Install Happ Bridge.command"
open "/Volumes/Happ Bridge/Install Happ Bridge.command"
```

4. If the app is installed but **won't open**:

```bash
if [ ! -d "/Applications/Happ Bridge.app" ]; then
  echo "App not installed yet. Run step 2 first (Install Happ Bridge.command)."
  exit 1
fi
xattr -cr "/Applications/Happ Bridge.app"
open "/Applications/Happ Bridge.app"
```

5. Allow Local Network access if prompted. The icon lives in the menu bar.

Point apps at `127.0.0.1:10808` (SOCKS5) and `127.0.0.1:10809` (HTTP), or use **Прописать** in Settings for Cursor / WebStorm / Firefox.

Build from source: `npm install && npm test && npm run dist`

### Keywords

Happ VPN LAN proxy, SOCKS5 bridge macOS, HTTP proxy phone, Telegram SOCKS5, Cursor HTTP proxy, menu bar proxy utility, local network phone discovery.

---

## Contributing

Issues and PRs welcome. Keep changes focused; run `npm test` and `npm run build` before opening a PR.

## Disclaimer

Happ Bridge is an independent open-source utility. It is not affiliated with Happ / Happ.su. Use only on networks and devices you own or administer.

---

**If Happ Bridge saves you from IP hell - ⭐ the [repo](https://github.com/anatoly-kulishov/happ-bridge).**
