# SplitAll Server Platform Layout

`server/platform` is the bottom-platform boundary. Product lines live one layer above in `server/services`.

| Layer | Directory | Responsibility |
| --- | --- | --- |
| Common platform | `common/platform-core` | Authentication, settings, security helpers, state mutation coordination. |
| Common platform | `common/operation-dispatcher` | Public operation registry, decorators, HTTP/RPC/CLI dispatch. |
| Common platform | `common/console` | Console HTTP facade, utilities, and controllers. |
| Common platform | `common/data-structure` | Shared durable data structures such as checkpoint trees. |
| Common platform | `common/observability` | Runtime logger, trace context, and shared log summarization helpers. |
| Common platform | `common/storage` | Metadata SQLite, raw object store, repositories, storage maintenance tools. |
| Common platform | `common/module-manager` | Mount configuration, routing, and lazy module loading. |
| Common platform | `common/devops` | Monitor alerts, process status, and unified registration. |
| Specialized platform | `specialized/knowledge/preprocessing` | File parsing, normalization, chunking, taxonomy, and stable rule semantics. |
| Specialized platform | `specialized/knowledge/storage` | KnowledgeCore persistence, source management, and source file indexing. |
| Specialized platform | `specialized/knowledge/retrieval` | Search services, evidence checks, embedding runtime, vector stores, and learning runtime. |
| Specialized platform | `specialized/knowledge/invocation` | Knowledge skills, distillation, rule authoring, evolution, and golden-rule runtime. |
| Interactive layer | `interactive` | Bottom-platform registration API, feature profile resolution, and product-facing call surface. |

## Access Rules

Bottom platforms register capabilities through `interactive/platform-registry.mjs`.
Products call bottom capabilities through `interactive/product-api.mjs` or a runtime registry handle passed by the composition root.
Developers should check `interactive/interface-manifest.mjs` first and reuse those interfaces before adding new bottom-layer implementations.

`server/services/agent` and `server/services/client` are service lines. They must not import `platform/common` directly; cross-layer calls go through `platform/interactive`.

The old top-level migration wrapper directories are removed. New code must import the final path.
