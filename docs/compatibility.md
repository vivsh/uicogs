# Runtime Compatibility

UiCogs targets modern browsers and Node.js 22 and 24.

## Browsers

The supported browser families are:

- Chromium
- Firefox
- WebKit

Browser tests run at desktop and mobile viewports.

The default transport requires Fetch. SSE also requires streaming Fetch and `ReadableStream`.

## Node.js

Node.js 22 and 24 provide the required Fetch APIs.

Schema parsing, validation, local resources, and direct cache operations do not require Fetch.

`@uicogs/storage` local and session adapters require the corresponding browser storage API. Its IndexedDB adapter requires IndexedDB. Browser globals are resolved only when an adapter operation starts.

## Module Formats

Published packages contain:

- ESM exports
- CommonJS exports
- TypeScript declarations

Packed-package tests install the built tarballs into clean ESM, CommonJS, strict TypeScript, Vue, React, and Quasar consumers.

## Framework Versions

Framework support follows each package's peer dependency range.

Core does not initialize DOM, storage, Vue, React, Quasar, or Node-specific services when a module is imported.

## Server Rendering

UiCogs does not provide SSR hydration APIs or an SSR cache-transfer protocol.

Do not treat browser runtime state as process-global server state. Applications that use UiCogs during server rendering must own isolation and disposal explicitly.
