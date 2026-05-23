---
name: splitall-mount-author
description: Use when creating or reviewing a SplitAll external mount module for documentParser, ocr, multimodalParser, analysis, knowledgeBase, vectorStore, graphStore, or a custom named mount.
---

# SplitAll Mount Author

## Purpose

Create mount modules that match `new/server/runtime/mount-manager.mjs`.

## Contract

A mount module may export `createMount`, `default`, or `createMountNameMount`. The factory receives `{ mountName, userDataPath, runtimeOptions }`.

Useful methods:

- `supports({ extension, mediaTypeHint, sourceKind })`
- `extractDocument(input)`
- `extractText(input)`
- `onBatchCompleted({ batchId, jobId, result, settings })`
- `reload({ settings, mountName, runtimeOptions })`
- `close()`

## Template

Start from:

```text
/Users/unka/DevSpace/Unka-Malloc/Pact/skills/server-ops/splitall-mount-author/assets/mount-template.mjs
```

Validate with `$splitall-module-contract-test` before wiring it into `mount-modules.json`.
