# Security Policy

## Supported versions

| Version | Supported |
| ------- | --------- |
| 1.1.x   | yes       |
| 1.0.x   | yes       |

## Reporting a vulnerability

Open a private GitHub Security Advisory if possible, or email the maintainer via GitHub profile.
Do not disclose proxy-bypass or remote-code issues publicly until a fix is available.

Happ Bridge binds only to `127.0.0.1` by design. Reports that require changing this default to listen on LAN are out of scope unless framed as an explicit opt-in feature request.

Optional config inject (Cursor / WebStorm / Firefox) only runs after an explicit user action in the UI. It does not change the macOS system proxy.
