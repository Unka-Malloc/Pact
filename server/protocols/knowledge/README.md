# SplitAll Knowledge Protocol

Protocol version: `splitall.knowledge.v1`

The application layer talks to a knowledge module through this method protocol. It must not depend on the module's database, vector index, embedding runtime, or storage layout.

This protocol is intentionally independent from HTTP, JSON-RPC, CLI, SQLite, and the built-in `KnowledgeCore` implementation. Public interfaces map requests into `knowledge.*` methods through the operation registry; they do not call KnowledgeCore internals.

## Methods

| Method | Purpose |
| --- | --- |
| `knowledge.capabilities` | Return supported modalities, storage backends, output formats, internal protocol versions, and license policy. |
| `knowledge.ingest.batch` | Ingest a completed SplitAll job result into the knowledge module. |
| `knowledge.upsert.documents` | Upsert already-normalized knowledge documents. |
| `knowledge.delete.batch` | Remove all knowledge objects derived from a batch/job. |
| `knowledge.search` | Return evidence packs, not bare chunks. Evidence may include text blocks and image assets. |
| `knowledge.get.evidence` | Read a previously materialized evidence pack. |
| `knowledge.asset` | Read an image or binary asset referenced by an evidence pack. |
| `knowledge.render.markdown` | Render an evidence pack as Markdown with local image references and machine-readable metadata. |
| `knowledge.export.docx` | Export accepted knowledge documents, sections, blocks, assets, and evidence locators as a standard DOCX corpus for external knowledge bases. |
| `knowledge.sync` | Return downstream synchronization changes. Default scope is summary; `scope=mirror` returns client mirror objects. |
| `knowledge.reindex` | Rebuild embeddings/indexes for the active module implementation. |
| `knowledge.maintenance.get` | Read adjustable retrieval, embedding, Markdown, and maintenance parameters. |
| `knowledge.maintenance.set` | Update maintenance parameters without changing application code. |
| `knowledge.health` | Return counts, missing assets, active providers, and capability status. |
| `knowledge.feedback` | Record user/search/evidence feedback as auditable learning signals. |
| `knowledge.suggestions` | List system-generated knowledge evolution suggestions. |
| `knowledge.suggestion_resolve` | Accept, reject, or manually merge a suggestion. |
| `knowledge.learning.jobs` | Run a bounded learning/evaluation task. |
| `knowledge.learning.health` | Report LearningRuntime, current retrieval profile, and degradation status. |

## Public Interface Mapping

| Surface | Boundary |
| --- | --- |
| HTTP | Routes such as `POST /api/knowledge/search`, `GET /api/knowledge/evidence/:evidenceId`, `GET /api/knowledge/assets/:assetId`, `POST /api/knowledge/render/markdown`, and `GET /api/knowledge/export/docx` map into protocol methods. |
| JSON-RPC | Methods keep the same protocol names, for example `knowledge.search`, `knowledge.get.evidence`, `knowledge.asset`, `knowledge.render.markdown`, and `knowledge.export.docx`. |
| CLI | `splitall knowledge ...` commands call the registered HTTP/RPC surfaces; they do not read module storage. |
| Module/RPC adapter | An external knowledge module may call a local or remote service internally, but it must adapt the result back to this method protocol. |

The application layer owns orchestration. The knowledge module owns knowledge storage, retrieval, asset, embedding, and rendering details. Neither side reaches across the boundary through private imports, SQLite table reads, or asset path concatenation.

## Three-Layer Knowledge Boundary

SplitAll separates knowledge management into three layers:

| Layer | Responsibility |
| --- | --- |
| `raw-corpus-construction` | Parse raw files, mail, attachments, chats, local mirrors, and directories into structure-preserving `sources`, `chunks`, normalized DOCX packages, source ranges, timelines, transaction chains, and raw object references. |
| `knowledge-index-construction` | Parse and map the normalized corpus into the built-in `KnowledgeCore` or an external knowledge-base adapter. This layer owns document/section/block/asset/evidence/embedding/relationship indexing and exposes RAG-safe evidence through `splitall.knowledge.v1`. |
| `knowledge-distillation` | Consume second-layer evidence only, then generate lossy summaries, governance candidates, and workspace/context background. It must not replace `knowledge.search` as the full-query surface. |

The second layer is the external knowledge-base integration point. For that reason raw document parsing is shared across the first two layers: the first layer preserves and normalizes original structure; the second layer parses normalized packages, manifests, source metadata, and asset locators into whichever index backend is active. External knowledge-base adapters may call remote ingestion/search APIs internally, but public search, evidence, asset, export, and render behavior must adapt back to this protocol.

## External Knowledge-Base Adapter Protocol

External knowledge-base adapters implement the `knowledgeBase` mount behind `splitall.knowledge.v1`. The first conformance target is mature open-source knowledge-base backends only: PostgreSQL + pgvector, Qdrant, OpenSearch, and optional Weaviate. Product-level RAG apps, orchestration frameworks, proprietary services, and experimental graph/RAG stacks stay outside the required adapter matrix until the mature OSS fixture is stable.

Reference conformance backends:

| Backend | Test purpose | First-pass status |
| --- | --- | --- |
| PostgreSQL + pgvector | Baseline relational knowledge store: SplitAll ids, sourceTrace, permission scopes, tombstones, DOCX export state, and vector retrieval live in one auditable database. | Required |
| Qdrant | Vector backend with payload filters: validates tenant/workspace/source-scope prefiltering and sidecar evidence/asset mapping. | Required |
| OpenSearch | Full-text + vector hybrid search backend: validates lexical retrieval, semantic retrieval, score fusion, and production-style filtering. | Required |
| Weaviate | Object-oriented vector/hybrid backend: useful when testing collection schema and object properties, but not required for the first fixture. | Optional |

Implemented mount:

```text
server/platform/specialized/knowledge/storage/external-knowledge-base/index.mjs
```

The mount keeps `KnowledgeCore` as the canonical evidence, asset, DOCX export, and maintenance store, then mirrors searchable records into the external backend. It currently implements `qdrant`, `opensearch`, and `pgvector`; Weaviate remains an optional future backend.

Minimum conformance set:

| Operation class | Public method | Adapter responsibility | Required |
| --- | --- | --- | --- |
| Capabilities and health | `knowledge.capabilities`, `knowledge.health` | Report backend identity, supported modalities, indexing features, license/deployment status, freshness, degraded modes, and missing dependencies. | Yes |
| Ingest normalized corpus | `knowledge.ingest.batch`, `knowledge.upsert.documents` | Parse first-layer normalized packages, manifests, source metadata, assets, and chunk/section boundaries into backend-native index objects. | Yes |
| Search | `knowledge.search` | Return ranked evidence packs with hierarchy, citations, sourceTrace, score reasons, and backend trace metadata. | Yes |
| Evidence read | `knowledge.get.evidence` | Rehydrate a materialized evidence pack without requiring callers to know backend ids or storage paths. | Yes |
| Asset read | `knowledge.asset` | Resolve opaque `assetId` to bytes, stream metadata, or a missing-asset status without exposing filesystem or backend private paths. | Conditional: required when evidence can reference assets |
| Export | `knowledge.export.docx` | Export accepted knowledge objects from the active mount as a standard DOCX corpus with evidence locators. | Yes |
| Lifecycle | `knowledge.delete.batch`, `knowledge.reindex`, `knowledge.sync` | Delete, rebuild, and mirror index state while preserving SplitAll ids and tombstones. | Required for production adapters |
| Governance | `knowledge.feedback`, `knowledge.suggestions`, `knowledge.suggestion_resolve`, `knowledge.learning.*` | Accept feedback and expose reviewable evolution suggestions without mutating canonical facts directly. | Optional unless advertised in capabilities |

### Adapter Capability Shape

`knowledge.capabilities` must include enough information for routing, packaging, and conformance checks:

```json
{
  "protocolVersion": "splitall.knowledge.v1",
  "adapterProtocolVersion": "splitall.external-knowledge-adapter.v1",
  "backend": {
    "adapterId": "enterprise-search",
    "backendKind": "external",
    "vendor": "example",
    "deployment": "remote",
    "profileId": "default"
  },
  "supports": {
    "ingestNormalizedDocuments": true,
    "search": true,
    "evidenceRead": true,
    "assetRead": true,
    "docxExport": true,
    "hierarchy": true,
    "relationships": true,
    "vectorSearch": true,
    "lexicalSearch": true,
    "hybridSearch": true,
    "metadataFilters": true,
    "rerank": false,
    "syncMirror": true,
    "deleteBatch": true,
    "reindex": true
  },
  "objectModel": {
    "externalIdsStable": true,
    "storesSourceTrace": true,
    "storesCitations": true,
    "storesAssetLocators": true,
    "opaqueAssetIds": true
  },
  "limits": {
    "maxBatchDocuments": 10000,
    "maxBlockBytes": 65536,
    "maxTopK": 200,
    "maxAssetBytes": 52428800
  },
  "license": {
    "runtimeClass": "external-service",
    "status": "operator-configured"
  }
}
```

`knowledge.health` must report `ok`, `degraded`, `generation`, `lastIngestAt`, `lastSearchAt`, object counts when available, backend reachability, configured index names, and actionable missing-dependency messages. Health output must not include credentials.

### Ingest Contract

Adapters ingest first-layer corpus packages through `knowledge.ingest.batch` or `knowledge.upsert.documents`. The input is a normalized object graph, not a backend-specific payload:

```json
{
  "protocolVersion": "splitall.knowledge.v1",
  "batchId": "job-123",
  "corpus": {
    "packageType": "splitall.normalized-documents",
    "manifestId": "manifest::job-123",
    "generatedAt": "2026-05-17T00:00:00.000Z"
  },
  "documents": [
    {
      "documentId": "document::job-123::message-1",
      "kind": "message",
      "title": "Customer escalation thread",
      "mediaType": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "sourceTrace": {
        "clientUid": "client-a",
        "sourceType": "mail",
        "providerId": "macos-mail",
        "externalId": "message-id",
        "syncBatchId": "sync-1",
        "contentHash": "sha256:...",
        "capturedAt": "2026-05-17T00:00:00.000Z"
      },
      "sections": [
        {
          "sectionId": "section::1",
          "headingPath": ["Thread", "Timeline"],
          "sourceRange": {"startLine": 1, "endLine": 42}
        }
      ],
      "blocks": [
        {
          "blockId": "block::1",
          "sectionId": "section::1",
          "text": "Normalized content...",
          "blockType": "paragraph",
          "sourceRange": {"startLine": 8, "endLine": 12},
          "metadata": {"threadId": "thread-1", "transactionId": "tx-1"}
        }
      ],
      "assets": [
        {
          "assetId": "asset::sha256:...",
          "mediaType": "image/png",
          "sha256": "...",
          "sourceLocator": {"documentId": "document::job-123::message-1", "blockId": "block::1"}
        }
      ],
      "relationships": [
        {
          "relationshipId": "relationship::tx-1",
          "type": "transaction_member",
          "fromId": "document::job-123::message-1",
          "toId": "transaction::tx-1",
          "sourceBlockIds": ["block::1"]
        }
      ]
    }
  ],
  "policy": {
    "tenantId": "local",
    "remoteCallsAllowed": true,
    "visibility": "private",
    "requiredScopes": ["knowledge:maintain"]
  }
}
```

Ingest response:

```json
{
  "protocolVersion": "splitall.knowledge.v1",
  "batchId": "job-123",
  "backend": {"adapterId": "enterprise-search", "generation": 17},
  "indexedCounts": {"documents": 1, "sections": 1, "blocks": 1, "assets": 1, "relationships": 1},
  "mappings": [
    {
      "splitallId": "document::job-123::message-1",
      "externalId": "kb-doc-987",
      "kind": "document"
    }
  ],
  "warnings": [],
  "cursor": "17"
}
```

Adapters must persist or reconstruct mappings from SplitAll ids to backend ids. Mapping loss is a health issue because evidence, asset reads, delete, sync, and export all depend on stable ids.

### Search Contract

`knowledge.search` is the only full-query surface for RAG callers. It must accept backend-neutral query controls:

```json
{
  "query": "Which customer escalations are still unresolved?",
  "topK": 12,
  "filters": {
    "sourceTypes": ["mail"],
    "batchIds": ["job-123"],
    "timeRange": {"from": "2026-01-01T00:00:00.000Z", "to": "2026-05-17T00:00:00.000Z"},
    "metadata": {"transactionStatus": "open"}
  },
  "retrieval": {
    "mode": "hybrid",
    "hierarchyReasoning": true,
    "rerank": true,
    "includeRelationships": true,
    "includeAssets": true
  },
  "policy": {
    "tenantId": "local",
    "requiredScopes": ["knowledge:read"]
  }
}
```

Search response must be evidence-first:

```json
{
  "protocolVersion": "splitall.knowledge.v1",
  "queryId": "query-1",
  "backend": {"adapterId": "enterprise-search", "generation": 17},
  "evidence": [
    {
      "evidenceId": "evidence::query-1::1",
      "score": 0.91,
      "scoreReasons": ["metadata_filter", "hybrid_match", "relationship_boost"],
      "document": {"documentId": "document::job-123::message-1", "title": "Customer escalation thread"},
      "section": {"sectionId": "section::1", "headingPath": ["Thread", "Timeline"]},
      "blocks": [
        {
          "blockId": "block::1",
          "text": "Normalized content...",
          "sourceRange": {"startLine": 8, "endLine": 12}
        }
      ],
      "assets": [{"assetId": "asset::sha256:...", "mediaType": "image/png"}],
      "citations": [
        {
          "citationId": "citation::1",
          "documentId": "document::job-123::message-1",
          "blockId": "block::1",
          "sourceRange": {"startLine": 8, "endLine": 12}
        }
      ],
      "sourceTrace": {
        "sourceType": "mail",
        "providerId": "macos-mail",
        "externalId": "message-id",
        "capturedAt": "2026-05-17T00:00:00.000Z"
      },
      "backendTrace": {
        "externalDocumentId": "kb-doc-987",
        "retrievalMode": "hybrid"
      }
    }
  ],
  "hierarchy": {
    "enforced": true,
    "selected": {"documentIds": ["document::job-123::message-1"], "sectionIds": ["section::1"]}
  },
  "warnings": []
}
```

Adapters may return backend-specific diagnostics under `backendTrace`, but callers must not depend on those fields for correctness.

### Evidence, Asset, Export, And Delete Semantics

- `knowledge.get.evidence` accepts `evidenceId` plus optional `includeBlocks`, `includeAssets`, and `renderMarkdown` flags. It returns the same evidence shape as search and must work after the original query response has been cached.
- `knowledge.asset` accepts only opaque `assetId`. It returns `{ found, mediaType, byteLength, sha256, stream|bytes|url, missingReason }`. If the external backend owns the asset, the adapter must proxy or sign access without exposing private backend paths.
- `knowledge.export.docx` exports from the active mount. External adapters may regenerate DOCX from their backend objects, but exports must preserve SplitAll ids, evidence locators, citations, sourceTrace, and asset references.
- `knowledge.delete.batch` must remove or tombstone every object derived from a batch. If the backend only supports soft delete, search and sync must hide tombstoned objects.
- `knowledge.reindex` may rebuild backend indexes, embeddings, graph projections, or payload indexes, but must not change SplitAll ids or evidence locators.

### Failure And Consistency Semantics

- Partial ingest must return `warnings` and `failedItems` with SplitAll ids. Silent drop is invalid.
- Search degradation must set `warnings` and `backend.degraded=true`; callers can still use evidence if citations and sourceTrace are intact.
- Adapter retries must be idempotent by `batchId`, `documentId`, `sectionId`, `blockId`, and `assetId`.
- Remote backends must enforce tenant, workspace, and source-scope filters before returning evidence. Post-filtering after topK is not sufficient for permission boundaries.
- The adapter must expose a conformance fixture that ingests a small normalized corpus, searches it, reads evidence/assets, exports DOCX, deletes the batch, and proves the deleted objects no longer appear in search or sync.

## Object Model

The protocol normalizes all upstream files into these concepts:

| Object | Meaning |
| --- | --- |
| `collection` | A logical grouping, usually a job/batch or manually managed corpus. |
| `document` | A knowledge document such as a source file, transaction, message, or normalized DOCX manifest entry. |
| `section` | A document subdivision used for parent expansion and human-readable structure. |
| `block` | A retrievable text/table/event/image-reference unit. |
| `asset` | A first-class binary asset such as an image, with OCR/caption/source locator metadata. |
| `evidence` | A materialized retrieval result containing blocks, assets, source locator, score, and Markdown. |
| `embedding` | A provider-versioned vector for a block or asset. |
| `relationship` | A protocol-level link between documents, blocks, assets, people, transactions, or messages. |

## Downstream Mirror Sync

Clients that need offline browsing call:

```http
GET /api/knowledge/sync?since=0&limit=500&scope=mirror
```

Mirror responses use the same cursor envelope as summary sync but carry KnowledgeCore objects:

```json
{
  "protocolVersion": "splitall.knowledge.v1",
  "scope": "mirror",
  "cursor": "12",
  "latestCursor": "12",
  "hasMore": false,
  "cachePolicy": {
    "scope": "mirror",
    "storesFullEvidence": true,
    "storesNormalizedDocuments": true,
    "storesOriginalAttachments": false,
    "primaryReadableFormat": "markdown"
  },
  "changes": [
    {
      "cursor": "1",
      "kind": "document",
      "action": "upsert",
      "entityId": "document::...",
      "itemId": "document::...",
      "batchId": "job-id",
      "serverUpdatedAt": "2026-04-29T00:00:00.000Z",
      "record": {}
    }
  ]
}
```

Allowed mirror `kind` values are `document`, `section`, `block`, `asset`, `relationship`, `reviewItem`, `suggestion`, and `tombstone`.
`asset` records are metadata only; binary content is still read through `GET /api/knowledge/assets/:assetId`.
`tombstone` records use `record.targetKind` plus the target id, letting downstream caches remove stale local projections while keeping server authority.

## DOCX Corpus Export Boundary

SplitAll keeps two separate knowledge delivery paths:

| Path | Interface | Use |
| --- | --- | --- |
| Raw materials to normalized documents | `generateNormalizedDocuments`, `GET /api/jobs/:jobId/normalized-documents`, `GET /api/jobs/:jobId/normalized-documents/:documentId` | Produce `splitall.normalized-documents` DOCX packages from every accepted input format for external KB ingestion. |
| Accepted knowledge to agent context | `knowledge.search`, `knowledge.get.evidence`, `knowledge.render.markdown`, context runtime | Serve grounded evidence packs to agents at runtime. |
| Accepted knowledge to external corpus | `knowledge.export.docx`, `GET /api/knowledge/export/docx`, `knowledge export-docx --output knowledge.docx` | Export canonical knowledge objects from the active `knowledgeBase` mount as standard DOCX without bypassing the protocol boundary. |

DOCX exports are offline corpus artifacts. Agents must still use `knowledge.search` and evidence packs for live context assembly.

## Asset URL Policy

Assets are protocol objects, not static files.

| Rule | Requirement |
| --- | --- |
| Public URL | `GET /api/knowledge/assets/:assetId` is the only server URL shape for binary knowledge assets. |
| Export URL | Offline exports may rewrite assets to relative package paths, but the evidence pack must still preserve the original `assetId`. |
| Path safety | `assetId` is opaque and must not be interpreted as a filesystem path by callers. |
| Markdown | `knowledge.render.markdown` may include local image references, but those references must be produced by the module or export adapter. |
| Missing asset | Missing binary content is a recoverable evidence health issue; the protocol should return structured missing-asset metadata instead of exposing a raw path error. |

## Internal Protocol Boundaries

Knowledge modules may call internal modules through these protocol names:

| Protocol | Responsibility |
| --- | --- |
| `splitall.vector.v1` | Vector upsert/search/delete. |
| `splitall.embedding.v1` | Text, image, and joint embedding generation. |
| `splitall.assetStore.v1` | Binary asset persistence, validation, and URL/path policy. |
| `splitall.retrieval.v1` | Retrieval fusion, parent expansion, reranking, and evidence shaping. |
| `splitall.learning.v1` | Feedback aggregation, retrieval profile tuning, suggestion generation, and audited self-evolution. |

The built-in module currently provides local SQLite/object-storage implementations for these protocols. External implementations can replace them if the method shapes remain compatible.

## Built-In Components

| Component | Protocol | Bundled status | Notes |
| --- | --- | --- | --- |
| `KnowledgeCore` | `splitall.knowledge.v1` | bundled by default | Owns `knowledge-core/knowledge.sqlite`, `knowledge-core/assets/`, evidence shaping, and Markdown rendering. |
| `EmbeddingRuntime` | `splitall.embedding.v1` | bundled fallback | Uses project-internal deterministic text/image fallback; it must not download model files at startup. |
| `VectorStore` | `splitall.vector.v1` | optional module plus KnowledgeCore fallback | Built-in local backend uses `sqlite-vec` when available and keeps JSON vectors as deterministic fallback. Native/vector DB adapters must remain behind this protocol. |
| `assetStore` | `splitall.assetStore.v1` | bundled fallback | Stores assets by SHA-256 and enforces URL/path policy. |
| `retrieval` | `splitall.retrieval.v1` | bundled fallback | Handles fusion, parent expansion, rerank, and evidence pack construction. |
| `LearningRuntime` | `splitall.learning.v1` | bundled deterministic JavaScript fallback; external JS adapter optional | Uses feedback to tune retrieval profiles automatically and emits reviewable suggestions for canonical knowledge changes. Optional framework or store integrations must be called through JavaScript and must not download models implicitly. |

## Offline Package And License Gate

Offline server packages must include `license-manifest.json`. The manifest is generated by `server/scripts/pack-offline-server.mjs` and can be checked without Docker:

```bash
node server/scripts/verify-knowledge-license-manifest.mjs
node server/scripts/verify-knowledge-license-manifest.mjs --check-allowlist
node server/scripts/verify-knowledge-license-manifest.mjs --manifest path/to/license-manifest.json
```

The gate is part of this protocol boundary because a replacement knowledge module can change runtime and model obligations. Production dependencies must classify as allowed; `blocked` or `unknown` production dependency licenses fail packaging. Optional native/vector/model targets must be explicit:

| Optional target | Current package status |
| --- | --- |
| `sqlite-vec` | `allowed` when bundled through the npm package and platform optional dependency; otherwise `not-bundled-license-gated` |
| `llama-index` | `not-bundled-license-gated` until an operator installs an external component reachable through JavaScript |
| `lancedb` | `not-bundled-license-gated` until an operator installs an external component reachable through JavaScript or an external service |
| `onnxruntime-node` | `not-bundled-license-gated` |
| ONNX embedding model assets | `not-bundled-license-gated` |

Allowed licenses, allowed expressions, and blocked classes are written into the manifest. Unknown model weights, restricted models, cloud-only runtimes, and implicit downloads are not valid offline package contents.
