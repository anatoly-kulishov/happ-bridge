# Security Policy

## Supported versions

| Version | Supported |
| ------- | --------- |
| 1.1.x   | yes       |
| 1.0.x   | yes       |

## Reporting a vulnerability

Open a private GitHub Security Advisory if possible, or email the maintainer via GitHub profile.
Do not disclose proxy-bypass or remote-code issues publicly until a fix is available.

## Design (what Happ Bridge does and does not protect)

### Localhost-only listeners

Happ Bridge binds SOCKS5/HTTP only to `127.0.0.1`. Neighbors on Wi‑Fi cannot connect to the Mac relay.

Reports that require changing this default to listen on the LAN are out of scope unless framed as an explicit opt-in feature request.

### Optional Happ LAN login/password (1.1.3+)

The bridge itself does **not** encrypt Wi‑Fi. Encryption of tunneled traffic is Happ’s job.

To reduce **LAN abuse / spoofing** of the phone’s open SOCKS:

1. Enable login/password for LAN in Happ on the phone.
2. Enter the **same** credentials in Happ Bridge settings.
3. Discovery and health probes then require a successful SOCKS5 user/pass (method `0x02`). Open no-auth decoys are rejected when credentials are set.
4. Manual inject / copy presets pass those credentials into Cursor, WebStorm, Firefox, and Telegram cheat-sheets.

Credentials are stored in Electron `userData` (`settings.json`) on the Mac - treat the Mac account as trusted.

### Relay session hygiene (1.1.3+)

- Soft-disconnect and peer switch **tear down live TCP pipes** so traffic cannot keep flowing to a cleared or previous phone IP.
- SOCKS5 probe no longer treats method `0xff` (no acceptable methods) as a Happ identity.
- Probe connect has a hard timeout so filtered hosts cannot hang discovery.

### What the bridge does not do

- It does not add TLS between Mac and phone (plaintext SOCKS/HTTP on Wi‑Fi).
- It does not fix phone-side routing if Happ LAN mode breaks internet **on the phone** - that is entirely Happ/OS.
- It does not change the macOS system proxy.

### Config inject

Optional config inject (Cursor / WebStorm / Firefox) only runs after an explicit user action in the UI.
