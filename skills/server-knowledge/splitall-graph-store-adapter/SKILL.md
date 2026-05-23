---
name: splitall-graph-store-adapter
description: Use when connecting SplitAll people, transactions, threads, timeline events, and associations to an external graph database through a graphStore mount.
---

# SplitAll Graph Store Adapter

## Purpose

Sync SplitAll's affair graph into a graph database after a batch completes.

## Workflow

1. Read `references/graph-store-contract.md`.
2. Implement a `graphStore` mount with `onBatchCompleted`.
3. Map people, transactions, threads, timeline events, and association edges.
4. Upsert idempotently by `batchId` plus entity id.
5. Validate with `$splitall-module-contract-test --action postCommit`.
