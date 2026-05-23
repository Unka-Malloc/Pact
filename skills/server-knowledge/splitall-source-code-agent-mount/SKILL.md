---
name: splitall-source-code-agent-mount
description: Use when routing source code or developer documents into a SplitAll custom sourceCodeAgent mount with language-aware metadata and safe static parsing.
---

# SplitAll Source Code Agent Mount

## Purpose

Connect developer modules so source files can be parsed as knowledge artifacts instead of generic text.

## Workflow

1. Read `references/source-code-contract.md`.
2. Implement a named mount such as `sourceCodeAgent`.
3. Route code extensions to that mount.
4. Preserve source text and add language metadata.
5. Validate with `$splitall-module-contract-test`.

Never execute untrusted source files during ingestion.
