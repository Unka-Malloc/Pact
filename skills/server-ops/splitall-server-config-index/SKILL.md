---
name: splitall-server-config-index
description: Use when explaining, documenting, or changing SplitAll server settings, environment variables, settings.json, mount config files, and server command line options.
---

# SplitAll Server Config Index

## Purpose

Provide the missing index between server code, persisted config files, environment variables, and UI controls.

## Workflow

1. Read `references/server-config-map.md`.
2. Confirm defaults in `new/server/config.mjs`.
3. Confirm UI wiring in `new/server/ui/ServerConsoleApp.vue` and `new/server/ui/lib/bridge.ts`.
4. When adding a setting, update server defaults, API serialization, UI field, and docs together.

## Guardrail

Never expose API keys or OAuth tokens in generated docs or logs.
