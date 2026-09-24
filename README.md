# Happ Bridge

**macOS menu bar app** that keeps a stable local proxy for [Happ](https://happ.su) on your phone.

Set Telegram, Cursor, Firefox, and WebStorm to `127.0.0.1` once. When the phone IP changes on Wi‑Fi, Happ Bridge updates the tunnel automatically.

[Русский](#happ-bridge-рус) · [English](#happ-bridge-en) · [Download](#install) · [Site](https://anatoly-kulishov.github.io/happ-bridge/) · [Changelog](CHANGELOG.md)

**Текущая версия:** 1.1.5

---

<a id="happ-bridge-рус"></a>

## Happ Bridge (рус)

### Зачем это нужно

Happ на iPhone раздаёт SOCKS5 / HTTP прокси в локальную сеть. IP телефона часто меняется - и в Telegram, Cursor, Firefox, WebStorm приходится править адрес вручную.

**Happ Bridge** находит телефон в Wi‑Fi и держит постоянные адреса на Mac:

| Тип    | Адрес (не меняется)   |
|--------|------------------------|
| SOCKS5 | `127.0.0.1:10808`      |
| HTTP   | `127.0.0.1:10809`      |

### Кому подойдёт

- macOS (Apple Silicon) + телефон с Happ и включённым **«Разрешить LAN подключение»**
- кто устал обновлять прокси в Telegram / Cursor / IDE после смены Wi‑Fi

### Возможности (1.1.5)

- автопоиск Happ в Wi‑Fi; если телефонов несколько - список и выбор вручную
- можно **выключить мост** или отключить телефон без авто-reconnect
- локальный TCP-relay только на `127.0.0.1` (соседи по Wi‑Fi не видят прокси)
- опциональный **логин/пароль Happ LAN** - проверка при поиске и прописка в приложения
- пароль LAN в **Keychain**; домашние SSID и peer на сеть; предупреждение в чужой Wi‑Fi без пароля
- soft-reconnect: смена IP телефона без обрыва слушателей
- устойчивость: 3 неудачных probe, пропуск probe при живом трафике, backoff
- реакция на смену сети
- иконка в строке меню (клик открывает меню, не отдельное окно)
- **ручная** прописка прокси в Cursor / WebStorm / Firefox + предложение перезапустить приложения
- откат прописки к прямому IP телефона (не «системный прокси»)
- мастер первого запуска, диагностика, автозапуск при входе в macOS
- проверка обновлений через GitHub Releases

### Установка {#install}

Сборка **без Apple Developer ID**. Установщик копирует приложение в «Программы» и снимает quarantine Gatekeeper.

#### Готовый .dmg

1. Скачайте `.dmg` с [Releases](https://github.com/anatoly-kulishov/happ-bridge/releases) (файл вида `Happ Bridge-1.1.5-arm64.dmg`).
2. Откройте диск и дважды нажмите **Install Happ Bridge.command** → «Установить».
3. Если macOS блокирует **установщик**, в Терминале:

```bash
xattr -cr "/Volumes/Happ Bridge/Install Happ Bridge.command" && open "/Volumes/Happ Bridge/Install Happ Bridge.command"
```

4. Если приложение уже в «Программах», но **не запускается**:

```bash
xattr -cr "/Applications/Happ Bridge.app" && open "/Applications/Happ Bridge.app"
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

Готовый файл: `release/Happ Bridge-1.1.5-arm64.dmg`

Разработка: `npm run dev`

### Как пользоваться

1. На телефоне: Happ + **Разрешить LAN подключение**.
2. Запустите Happ Bridge, пройдите мастер, дождитесь статуса «Подключено».
3. Вставьте в приложения `127.0.0.1:10808` (SOCKS5) / `127.0.0.1:10809` (HTTP)  
   **или** в настройках выберите Cursor / WebStorm / Firefox → **Прописать** → согласитесь на перезапуск.
4. Окно можно закрыть - приложение остаётся в строке меню. Откат прописки - кнопка **Откатить** (вручную).

### Ключевые слова

Happ proxy, Happ LAN, SOCKS5 macOS, HTTP proxy iPhone, Telegram proxy, Cursor proxy, WebStorm proxy, Firefox proxy, локальный прокси, мост к телефону, смена IP Wi‑Fi, menu bar VPN helper.

### Безопасность

- слушатели только на localhost
- системный proxy macOS не меняется
- прописка в приложениях - только по вашей кнопке
- опциональный логин/пароль Happ LAN (антиспуф при поиске + прописка в приложения)
- смена/сброс телефона рвёт живые TCP-pipe
- настройки: пароль LAN в Keychain; домашние SSID; peer на сеть
- мост **не шифрует** Wi‑Fi Mac↔телефон; туннель шифрует Happ
- исходный код открыт (MIT) - см. [SECURITY.md](SECURITY.md)

### Стек

Electron · Vite · React · TypeScript · Tailwind

### Лицензия

[MIT](LICENSE)

---

<a id="happ-bridge-en"></a>

## Happ Bridge (EN)

Stable localhost proxy bridge to a phone running Happ on your LAN. Stop editing proxy IPs in Telegram, Cursor, Firefox, and WebStorm every time DHCP moves your phone.

**Version 1.1.5** - bridge on/off, SOCKS port fix to Happ, Keychain LAN password, peer-per-SSID, Gatekeeper-friendly DMG.

### Quick start

1. Download the `.dmg` from [Releases](https://github.com/anatoly-kulishov/happ-bridge/releases).
2. Open **Install Happ Bridge.command** → Install (copies to `/Applications`; unsigned, no Apple Developer ID).
3. If macOS blocks the **installer**:

```bash
xattr -cr "/Volumes/Happ Bridge/Install Happ Bridge.command" && open "/Volumes/Happ Bridge/Install Happ Bridge.command"
```

4. If the app is installed but **won't open**:

```bash
xattr -cr "/Applications/Happ Bridge.app" && open "/Applications/Happ Bridge.app"
```

5. Allow Local Network access if prompted. The icon lives in the menu bar.

Point apps at `127.0.0.1:10808` (SOCKS5) and `127.0.0.1:10809` (HTTP), or use **Прописать** in Settings for Cursor / WebStorm / Firefox, then restart those apps when offered.

Build from source: `npm install && npm test && npm run dist`

### Keywords

Happ VPN LAN proxy, SOCKS5 bridge macOS, HTTP proxy phone, Telegram SOCKS5, Cursor HTTP proxy, menu bar proxy utility, local network phone discovery.

---

## Contributing

Issues and PRs welcome. Keep changes focused; run `npm test` and `npm run build` before opening a PR.

## Disclaimer

Happ Bridge is an independent open-source utility. It is not affiliated with Happ / Happ.su. Use only on networks and devices you own or administer.
