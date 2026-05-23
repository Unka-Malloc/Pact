---
name: splitall-analysis-module-author
description: Use when creating or reviewing a SplitAll external analysis module that lists analysis modules or algorithms and runs custom analysis over sources and chunks.
---

# SplitAll Analysis Module Author

## Purpose

Implement external analysis engines compatible with `new/server/application/analysis-engine-registry.mjs`.

## Contract

The mount should provide one or more of:

- `listModules()`
- `listAlgorithms()`
- `runModule(input)`
- `runAnalysis(input)`

`runModule` receives sources, chunks, settings, and module identifiers. It should return fields compatible with the server result model: emails, threads, transactions, people, timeline, network, associations, and warnings.

## Template

Start from:

```text
/Users/unka/DevSpace/Unka-Malloc/Pact/skills/server-knowledge/splitall-analysis-module-author/assets/analysis-module-template.mjs
```

Validate with:

```bash
node /Users/unka/DevSpace/Unka-Malloc/Pact/skills/server-ops/splitall-module-contract-test/scripts/splitall-module-contract-test.mjs \
  --module ./analysis-module.mjs \
  --mount-name analysis \
  --action analysis
```
