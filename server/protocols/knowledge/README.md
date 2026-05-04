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
| HTTP | Routes such as `POST /api/knowledge/search`, `GET /api/knowledge/evidence/:evidenceId`, `GET /api/knowledge/assets/:assetId`, and `POST /api/knowledge/render/markdown` map into protocol methods. |
| JSON-RPC | Methods keep the same protocol names, for example `knowledge.search`, `knowledge.get.evidence`, `knowledge.asset`, and `knowledge.render.markdown`. |
| CLI | `splitall knowledge ...` commands call the registered HTTP/RPC surfaces; they do not read module storage. |
| Module/RPC adapter | An external knowledge module may call a local or remote service internally, but it must adapt the result back to this method protocol. |

The application layer owns orchestration. The knowledge module owns knowledge storage, retrieval, asset, embedding, and rendering details. Neither side reaches across the boundary through private imports, SQLite table reads, or asset path concatenation.

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
| `LearningRuntime` | `splitall.learning.v1` | bundled deterministic JavaScript fallback; external JS adapter optional | Uses feedback to tune retrieval profiles automatically and emits reviewable suggestions for canonical knowledge changes. Optional LlamaIndex/LanceDB integration must be called through JavaScript and must not download models implicitly. |

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

Allowed licenses, allowed expressions, and blocked classes are written into the manifest. Unknown model weights, non-commercial models, cloud-only runtimes, and implicit downloads are not valid offline package contents.
