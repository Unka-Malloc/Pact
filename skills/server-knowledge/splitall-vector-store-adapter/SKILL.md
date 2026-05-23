---
name: splitall-vector-store-adapter
description: Use when connecting SplitAll chunks and source documents to an external vector database through a vectorStore postcommit mount.
---

# SplitAll Vector Store Adapter

## Purpose

Sync `result.chunks` and source metadata to a vector database after a job completes.

## Workflow

1. Read `references/vector-store-contract.md`.
2. Implement a `vectorStore` mount with `onBatchCompleted`.
3. Map chunk ids and source ids to stable external ids.
4. Upsert idempotently.
5. Validate with `$splitall-module-contract-test --action postCommit`.

Use this when retrieval should live outside local SQLite.
