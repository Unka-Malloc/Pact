# KnowledgeCore

`KnowledgeCore` is the built-in implementation of `splitall.knowledge.v1`.

It is intentionally separate from the application layer. The server registers public HTTP/RPC/CLI operations, but those handlers call the `knowledgeBase` mount protocol instead of directly using a database or retrieval algorithm.

## Responsibilities

- Ingest completed job results from `onBatchCompleted`.
- Convert source files, normalized DOCX manifest entries, transactions, and messages into a common object model.
- Store text blocks and image assets as first-class knowledge objects.
- Maintain local embeddings through a replaceable vector protocol boundary.
- Return evidence packs that combine text, image assets, source locators, scores, and retrieval reasons.
- Render evidence packs as Markdown with local image references and machine-readable metadata.
- Expose maintenance settings, health, and reindex operations.
- Record feedback, maintain versioned retrieval profiles, and generate auditable suggestions for self-evolution.

## Storage

The built-in storage is local and offline:

- `knowledge-core/knowledge.sqlite`: collections, documents, sections, blocks, assets, embeddings, evidence, relationships, settings, and maintenance runs.
- `knowledge-core/assets/`: binary assets addressed by SHA-256.

The current vector implementation uses `sqlite-vec` as the primary local KNN backend and also stores JSON vectors for deterministic fallback. The `splitall.vector.v1` boundary stays stable for later LanceDB or Qdrant adapters.

## Learning Runtime

`KnowledgeCore` includes a `splitall.learning.v1` boundary. The bundled runtime is deterministic and offline-safe: it can auto-apply retrieval profile tuning after feedback replay passes its metric gate, but it never mutates canonical facts, relations, entity merges, or taxonomy entries without creating a reviewable suggestion first.

Optional LlamaIndex + LanceDB support is exposed through JavaScript adapters or external services behind `server/platform/specialized/knowledge/runtime/learning-runtime` and the LanceDB vector adapter. Operators must install and configure those external components explicitly; startup must not download model weights implicitly.

## License Policy

The module enforces the project policy that production-bundled knowledge dependencies must be MIT, Apache-2.0, project-internal, or explicitly compatible. Unknown model weights, GPL/AGPL components, cloud-only runtimes, and implicit downloads are not acceptable for offline server packages. LlamaIndex, LanceDB, and reranker/embedding models remain license-gated optional runtime components until explicitly configured.
