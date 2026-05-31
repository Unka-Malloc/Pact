# External Knowledge Distillation Service

Standalone HTTP service used to verify and evolve Pact external distillation registration.

The service is intentionally standalone. It exposes a route-first, windowed, classified distillation baseline that separates unrelated source groups before producing human-readable Markdown and an agent-readable JSON message. The local reference framework manifest tracks the open-source systems Pact uses for ongoing comparison.

The service does not hide unsupported binary parsing behind a generic Tika call. Every source first receives a `routePlan` based on extension, media type, source kind, and text fallback. Archive entries and email attachments are recursively routed as child documents before distillable text is split into bounded windows, so large projects can converge through window, document, topic-group, and project layers.

Request payloads can provide either direct text fields or a base64 file payload:

- Direct text: `text`, `content`, `markdown`, or `body`.
- File payload: `contentBase64`, `base64`, `dataBase64`, or `bytesBase64`.
- Mounted single-node file payload: `filePath`, `contentPath`, `inputPath`, or `contentRef` under the configured input roots. Text, Markdown, source code, CSV/TSV, and JSONL references are scanned in chunks into window plans instead of being loaded as one full in-memory payload.
- Streaming document manifest: `rawDocumentsManifestPath`, `rawDocumentsManifestRef`, `documentsManifestPath`, or `manifestPath` can point to an allowed JSONL manifest. The service streams the manifest line by line, then routes each referenced document through the same filePath/contentRef parser chain so large project requests do not need large JSON bodies.
- Mounted archive payloads are expanded from their file path through ZIP/TAR/TGZ/7z extractors; child entries are routed as documents and streamable text entries use chunked windowing.
- Mounted PDF payloads use Poppler `pdftotext` into a temporary text stream and then the normal windowing path.
- Mounted DOCX, PPTX, XLSX, OpenDocument, and EPUB payloads are expanded as ZIP containers from their file path, structural XML/XHTML is streamed into temporary text, and the normal windowing path is used for distillation.
- Mounted legacy Office and RTF payloads such as DOC, PPT, XLS, and RTF use Apache Tika from their file path into temporary text, then the normal windowing path is used for distillation.
- Oversized mounted binary files without a format-specific file parser are rejected from the direct in-memory path with `payload.file-ref-deferred`; they need a streaming parser path instead of risking process memory.
- File hints: `fileName`, `mediaType`, `byteSize`, `sourceId`, and optional `metadata`.

API namespace:

- `GET /health`
- `GET /v1/capabilities`
- `GET /v1/runtime/health`
- `GET /v1/reference-frameworks`
- `GET /v1/reference-gap-report`
- `GET /v1/distillation/runs`
- `POST /v1/distillation/runs`
- `GET /v1/distillation/runs/:runId`
- `POST /v1/distillation/runs/:runId/cancel`
- `GET /v1/distillation/runs/:runId/evidence`
- `GET /v1/projects/:projectId/evidence`
- `GET /v1/distillation/runs/:runId/artifacts/:artifactId`

Artifacts:

- `portable-markdown`: human-readable classified distillation output.
- `portable-docx`: valid OpenXML Word document for human review.
- `agent-message-json`: machine-readable classification and evidence message for agents.
- `result-json`: full run record.
- `project-snapshot-json`: project-level fingerprint, text-unit/window hashes, group snapshot, and incremental diff plan.
- `evidence-pack-json`: GraphRAG-style text units, entities, relationships, claims/covariates, communities, and community reports.
- `format-conversion-plan-json`: per-document professional parser/conversion plan for PDF, Word, PowerPoint, Excel, Markdown, and OpenDocument.
- `reference-gap-report-json`: machine-readable comparison between the service and local RAGFlow, MinerU, Docling, LlamaIndex, Marker, GraphRAG, Haystack, and Unstructured checkouts.
- `workspace-package-zip`: complete delivery package with Markdown, DOCX, agent JSON, result JSON, snapshot, evidence pack, and manifest sizes/hashes.

Core response fields:

- `runtimeDoctor`: optional parser runtime availability for Java/Tika fallback, PyMuPDF, Poppler, Tesseract, and PaddleOCR.
- `routePlan`: per-source format, content shape, parser chain, fallback parsers, risk flags, and reference frameworks.
- `corpusPlan`: route-then-window source plan with byte counts, character counts, element counts, window counts, and evidence strength.
- `elementPlan`: document-element model for structured sources, with element type counts, sampled element metadata, and by-title chunking references.
- `parserTrace`: per-source parser stages, including direct text, JSON, CSV/TSV, mounted file references, chunked text windowing, MSG Tika extraction, MBOX message splitting, email attachment routing, archive child routing, and OOXML extraction.
- `classification`: hashing-embedding document groups plus window communities before distillation, with a weak-evidence garbage pool, per-topic distillation units, group cohesion, and inter-group separation scores.
- `convergence`: window-to-window-community-to-document-to-topic-to-project convergence plan with community reports for large project synthesis.
- `incrementalPlan`: project snapshot and reuse plan keyed by `projectId`/`workspaceId`/`repositoryId`, with added, changed, removed, and reusable source/window counts.
- `graphEvidence`: graph-lite evidence pack containing `text_units`, `entities`, `relationships`, `covariates`, `communities`, and `community_reports`.
- `referenceGapReport`: absorbed patterns, baseline patterns, open gaps, and local checkout audit status mapped from the reference framework manifest.
- `grounding`: claim-to-evidence top-k support, cross-topic conflict evidence, and candidate promotion gates for generated summaries and requested claims.
- `timeRange` and `timeSignals`: document/window-level time hints extracted from table date fields such as `payment_date`, `Report Date`, or localized date headers so agents can filter evidence by time without reparsing table text.
- `evidence query`: bounded agent API over `graphEvidence` filtered by entity, relationship, claim status, claim text, source id, group id, and time range.
- `project evidence query`: project-level agent API that merges graph evidence from multiple runs sharing the same `projectId`, preserving `sourceRunId`, project fingerprints, incremental modes, and bounded graph tables for large-project convergence reads.

Agent/API requests can include a `timeFilter` object:

- `from` and `to`: inclusive `YYYY-MM-DD` date range.
- `timeField`: `eventTime`, `documentTime`, or `any`.
- `confidenceMin`: minimum date extraction confidence.
- `excludeWeakEvidence`: remove undated or low-confidence evidence from the filtered corpus.
- `includeUnknownTime`: keep undated evidence when strict exclusion is not requested.

Routed format families:

- PDF: text extraction, visual layout fallback, OCR fallback, and text-operator geometry (`page`, `x/y`, approximate `bbox`) for evidence windows and conversion profiles.
- Office and OpenDocument: DOC/DOCX, RTF, PPT/PPTX, XLS/XLSX, ODT/ODS/ODP with paragraph, heading, Word comments/footnotes/endnotes, Word/PowerPoint/OpenDocument table row/cell metadata, slide, PresentationML shape geometry, sheet-row, cell-coordinate, SpreadsheetML formula metadata, and table elements for OOXML/OpenDocument payloads.
- Ebooks: EPUB.
- Text, configuration, and structured data: Markdown, TXT, YAML, TOML, INI, properties, dotenv, JSON, JSONL, CSV, TSV, and logs. Markdown is parsed as block elements rather than treated as plain text.
- Markup documents: HTML, XHTML, XML, reStructuredText, AsciiDoc, Org, LaTeX, and MediaWiki with element-type extraction.
- Diagrams: SVG, draw.io, Mermaid, and PlantUML with node, edge, and label extraction.
- Notebooks: Jupyter `.ipynb` with markdown, code, and output cell extraction.
- Change sets: Git/unified `.diff` and `.patch` with file, hunk, addition, and deletion extraction.
- Email: EML, MSG, MBOX with attachment child routing.
- Images: PNG, JPEG, TIFF, WEBP, BMP, HEIC, PBM, PGM, PNM.
- Source code: JavaScript, TypeScript, Python, Java, Go, Rust, Swift, Kotlin, C, and C++ with static import/symbol extraction.
- Calendar events: iCalendar `.ics` and vCalendar `.vcs` with event/todo and timeline extraction.
- Recursively routed ZIP, TAR, GZip/TGZ, and 7z archives.

Built-in payload parsers:

- Direct text, Markdown block structure, markup structure, and source code text.
- Markup normalization for HTML/XHTML/XML/RST/AsciiDoc/Org/LaTeX/MediaWiki headings, lists, links, table rows, code blocks, citations, and formulas.
- JSON and JSONL normalization.
- Configuration key-value normalization for YAML, TOML, INI, properties, and dotenv files.
- Diagram structure normalization for SVG, draw.io, Mermaid, and PlantUML files.
- Jupyter Notebook cell normalization for `.ipynb` files.
- Source code structure normalization for imports, symbols, entry points, TODOs, and line-aware excerpts without executing code.
- Unified diff/patch normalization for changed files, hunks, additions, deletions, and context lines.
- iCalendar/vCalendar normalization for events, todos, dates, locations, organizers, and descriptions.
- CSV and TSV row normalization.
- EML-style header/body extraction.
- MSG binary text extraction through Apache Tika for direct payloads and mounted file references.
- MBOX mailbox splitting into child EML messages, preserving message-level trace and recursively routed attachments.
- MIME attachment extraction with recursive child-file routing.
- Basic text PDF content streams, including FlateDecode streams where text operators are present.
- Image OCR through Tesseract when `tesseract-ocr` is installed.
- Scanned PDF OCR through Poppler page rasterization plus Tesseract when both runtimes are installed.
- Mounted file references from configured input roots, with chunked text windowing for streamable text formats.
- Mounted archive file references with child-entry file refs, so project packages do not need to be base64 encoded or fully loaded into Node memory.
- Mounted PDF file references with Poppler `pdftotext` extraction into chunked windows.
- Mounted structured ZIP file references for DOCX, PPTX, XLSX, ODT/ODS/ODP, and EPUB, with structural text extraction into chunked windows or element-aware windows when native OOXML structure is available.
- XLSX extraction preserves sheet, header row, row number, cell reference, formula, and `header=value` pairs so table evidence can be classified and grounded without losing cell context.
- XLSX, CSV, and TSV table rows feed a table time index when date-like headers are present; extracted dates are attached to document and window records as `timeRange`, `timeConfidence`, and `timeSignals`.
- Mounted legacy Office file references for DOC, PPT, XLS, and RTF through Apache Tika into chunked windows.
- ZIP, TAR, and GZip/TGZ manifest extraction plus child-file routing for project packages.
- 7z extraction through the packaged `7zz`/`7z` runtime when available.
- OOXML container extraction for DOCX, PPTX, and XLSX.
- OpenDocument extraction for ODT, ODS, and ODP.
- EPUB chapter extraction.
- Apache Tika app fallback for legacy Office and other binary text extraction routes when Java/Tika is installed.

Container runtime:

- The Docker image installs Poppler and Tesseract English OCR so scanned PDF and image OCR paths are executable in single-node deployment.
- The Docker image installs Java and Apache Tika app so legacy Office fallback is executable without relying on the embedded Pact server.
- The Docker image installs 7zip so 7z project packages can be expanded as child documents.
- `npm run server:verify:external-knowledge-distillation-container` builds the image, starts the service, checks `/v1/runtime/health`, and verifies OCR image, image-only scanned PDF, legacy Office fallback, OpenDocument, EPUB, project ZIP/TAR/TGZ/7z packages, mounted file references, streaming JSONL document manifests, mounted archive packages, mounted PDF payloads, mounted DOCX/PPTX/XLSX/OpenDocument/EPUB payloads, mounted DOC/PPT/XLS/RTF payloads, configuration files, markup files, diagram files, notebook files, source code files, diff/patch files, calendar files, MSG Tika extraction, MBOX mailbox splitting, and email attachment payloads become distillable corpus through `ocr.image`, `ocr.page`, `tika.text`, `tika.text.file-ref`, `open-document.structured`, `open-document.tables`, `office.presentation.tables`, `ebook.epub`, `pdf.text.pdftotext`, `structured-zip.file-ref.extract`, `table.sheet.headers`, `table.sheet.cells`, `table.sheet.formulas`, `table.time-index`, `config.key-value`, `markup.structure`, `diagram.structure`, `notebook.cells`, `code.structure`, `diff.unified`, `calendar.ics`, `archive.expand-route`, `archive.file-ref.expand`, `archive.entry-file-ref`, `archive.tar.container`, `archive.gzip.decompress`, `archive.7z.extract`, `input.manifest.jsonl`, `payload.file-ref`, `payload.stream-text`, `email.msg.tika`, `email.msg.tika.file-ref`, `email.mbox`, `email.mbox-route`, and `email.attachment-route`.

External runtime still required:

- PDF visual layout extraction.
- Multimodal image understanding.

When these runtimes are unavailable, parser traces use `unavailable` rather than hiding the failure. When a runtime is installed but this baseline service has not executed that parser stage, traces use `available-not-executed`.

If no distillable text can be produced, the run is marked `failed` with `EMPTY_RAW_CORPUS`; the service does not return a fake successful distillation.

Built-in algorithm baseline:

- `hashing_embedding_window_community_classification_v2`: dependency-free 128-dimensional semantic hashing vectors with fixed concept dimensions, document-level Leader-Clustering, per-topic window communities, low-coupling/high-cohesion separation scores, and isolated distillation units for unrelated input sets.
- `inline-or-streaming-manifest-document-input.v1`: accepts small API bodies that reference JSONL manifests, streams manifest records from disk, and sends each record through the normal route-first file parser path for large project distillation.
- `claim-evidence-topk-conflict-gating.v2`: every generated summary claim and optional requested claim is matched back to top-k evidence, checked against cross-topic conflicts, and used to gate candidate promotion.
- `project-snapshot-incremental-convergence.v1`: stores a compact project snapshot and compares later runs for the same project to reuse unchanged text units/window communities and recompute only changed windows before convergence.
- `graph-lite-entity-relationship-evidence-pack.v1`: builds deterministic text-unit, entity, relationship, claim/covariate, community, and community-report tables for agent retrieval and graph-style inspection.
- `graph-lite-evidence-query.v1`: returns filtered graph evidence slices for agent reads without requiring full evidence-pack artifact scans.
- `project-graph-evidence-convergence-query.v1`: merges graph evidence across project runs and supports `mode=all|latest`, `runLimit`, source, entity, claim, group, and time filters for engineering-project convergence queries.
- `document-element-model.v1` and `element-aware-by-title-windowing.v1`: keep structured elements, heading paths, table/code/annotation isolation, element refs, basic PDF geometry, Word annotations, Word/PowerPoint/OpenDocument table cells, spreadsheet cell coordinates and formulas, and PresentationML shape geometry on agent windows and graph text units.
- `office-document-professional-adaptation.v1`: exposes per-document parsing/conversion profiles for PDF, Word, PowerPoint, Excel, Markdown, and OpenDocument, separating human-readable exports from agent-readable JSON/evidence packs.
- `reference-framework-gap-report.v1`: maps local reference framework learnings to absorbed service capabilities, baseline-only patterns, and open gaps that still need parser, graph, pipeline, or evaluation work.
- `reference-framework-local-checkout-audit.v1`: verifies each declared local reference checkout exists, is a Git worktree, and matches the manifest commit before treating it as a current comparison source.
- Weak or tiny inputs are assigned to a garbage group and are not promoted as core distillation candidates.

Reference patterns currently absorbed into the local baseline:

- GraphRAG-style text units, entities, relationships, covariates, communities, and community reports.
- GraphRAG-style community reports for corpus-wide convergence.
- GraphRAG-style period/size snapshots and text-unit ids for incremental merges.
- LlamaIndex-style node/window metadata attached to agent-readable outputs.
- Haystack-style explicit pipeline stages exposed through route plans, parser traces, and capability metadata.
- Haystack-style pipeline snapshots for replayable agent/debug context.
- Docling/Haystack-style converter boundaries for HTML, Markdown, AsciiDoc, XML, LaTeX-like markup, OOXML, OpenDocument, EPUB, and PDF text documents.
- Docling-style basic PDF text-block geometry derived from text positioning operators, plus PresentationML shape bbox metadata for slide evidence.
- Unstructured-style element families for Markdown, markup, and structured-document headings, paragraphs, lists, links, images, table headers, table rows, code, citations, and formulas.
- Unstructured `chunk_by_title`-style element-aware windows with table/code isolation, plus LlamaIndex-style node refs in graph text-unit metadata.

Reference framework checkout root:

- `build/reference-frameworks/knowledge-distillation`

Reference framework audit:

- `/v1/reference-frameworks`, `/v1/capabilities`, and `/v1/reference-gap-report` expose `localAudit` with expected, present, Git checkout, commit-match, dirty, and missing counts.
- Single-node Docker images do not include the large reference checkout tree by default; in that case `localAudit` reports missing checkouts explicitly instead of implying live comparison.
