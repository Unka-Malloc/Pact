---
name: splitall-client-config-index
description: Use when explaining, documenting, or changing the SplitAll Flutter client configuration, portable data layout, logs, checkpoints, exports, bootstrap URL, and service discovery behavior.
---

# SplitAll Client Config Index

## Purpose

Document the client-side knobs that exist in code but are hard to discover from the UI alone.

## Workflow

1. Read `references/flutter-client-map.md`.
2. Trace behavior in `runtime_services.dart` and `app_controller.dart`.
3. Document user-visible setting, local file location, server endpoint, and recovery path.
4. Keep macOS Mail import details in `$splitall-mail-import-ops`.

Use this when adding a new client option or answering how to configure the desktop client.
