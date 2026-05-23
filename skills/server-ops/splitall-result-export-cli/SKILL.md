---
name: splitall-result-export-cli
description: Use when a completed SplitAll job result needs to be exported to JSON, Markdown, or DOCX from the command line using either a local result JSON file or the server HTTP API.
---

# SplitAll Result Export CLI

## Purpose

Turn a SplitAll analysis result into a knowledge-base-ready artifact through the same exporter used by the server.

## Workflow

Export a local `result.json`:

```bash
node /Users/unka/DevSpace/Unka-Malloc/Pact/skills/server-ops/splitall-result-export-cli/scripts/splitall-result-export.mjs \
  --repo /Users/unka/DevSpace/Unka-Malloc/Pact \
  --result-json $PACT_SERVER_DATA_DIR/jobs/JOB/result.json \
  --format docx \
  --output splitall-result.docx
```

Export canonical accepted knowledge for external knowledge-base ingestion through the live SplitAll server:

```bash
npm --prefix /Users/unka/DevSpace/Unka-Malloc/Pact run cli -- \
  knowledge export-docx \
  --output splitall-knowledge.docx
```

Export a legacy Markdown knowledge package from a local job result:

```bash
node /Users/unka/DevSpace/Unka-Malloc/Pact/skills/server-ops/splitall-result-export-cli/scripts/splitall-result-export.mjs \
  --repo /Users/unka/DevSpace/Unka-Malloc/Pact \
  --result-json $PACT_SERVER_DATA_DIR/jobs/JOB/result.json \
  --format md \
  --mode knowledge-package \
  --output splitall-knowledge.md
```

Export by server job id:

```bash
node /Users/unka/DevSpace/Unka-Malloc/Pact/skills/server-ops/splitall-result-export-cli/scripts/splitall-result-export.mjs \
  --server-url http://127.0.0.1:8787 \
  --job-id JOB \
  --format md \
  --output splitall-result.md
```

## Rules

- Valid result-export formats are `json`, `md`, and `docx`.
- Valid modes are `summary` and `knowledge-package`.
- Use `knowledge export-docx` for canonical KnowledgeCore DOCX export.
- Use `jobs normalized-doc` for raw-materials-to-normalized-docx package downloads.
- This exports job analysis results. For raw document extraction, use `$splitall-doc-extract-cli`.
