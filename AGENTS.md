# UiCogs Agent Guide

- Keep the library standalone and domain-neutral.
- Preserve immutable schema and resource-definition contracts.
- Keep transient loading and error state out of shared caches.
- Core must not import Vue, React, Quasar, Axios, browser storage, or Node-only APIs.
- Public APIs must not expose `any` or weak object aliases.
- Add type tests for every public generic contract and runtime tests for behavior.
