# Support Policy

The current `0.x` release line receives bug and security fixes. The latest stable `1.x` release receives bug, security, and documented compatibility fixes. Earlier versions receive migration guidance only.

Supported runtimes are current Chromium, Firefox and WebKit, plus maintained Node.js 20 and 22 releases. Framework packages support the peer dependency ranges declared in their package manifests. A runtime outside those ranges may work but is not part of release verification.

Use the repository issue tracker for reproducible defects. Include a minimal public-API reproduction, runtime and package versions, expected behavior, actual behavior, and a sanitized failure. Usage questions should first be checked against the guides in `docs/`. Security reports follow `SECURITY.md`.
