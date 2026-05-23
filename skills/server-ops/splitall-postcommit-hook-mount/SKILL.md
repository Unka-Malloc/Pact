---
name: splitall-postcommit-hook-mount
description: Use when implementing a SplitAll knowledgeBase, vectorStore, graphStore, or custom mount that synchronizes completed job results through onBatchCompleted after persistence.
---

# SplitAll Postcommit Hook Mount

## Purpose

Attach external stores after SplitAll has persisted a completed batch.

## Contract

Implement:

```js
async onBatchCompleted({ batchId, jobId, result, settings }) {}
```

The hook is discovered by `new/server/runtime/mount-manager.mjs` and executed from the job pipeline after result persistence.

## Template

```text
/Users/unka/DevSpace/Unka-Malloc/Pact/skills/server-ops/splitall-postcommit-hook-mount/assets/postcommit-template.mjs
```

## Rules

- Make writes idempotent by `batchId` and entity id.
- Treat failed sync as operationally visible; do not swallow errors unless there is retry telemetry.
- Keep secret configuration out of committed module files.
