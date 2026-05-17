export const DEFAULT_SETTINGS = {
  embeddingModel: {
    text: "builtin:hashing-multilingual-v1",
    image: "builtin:asset-ocr-caption-v1",
    joint: "builtin:mixed-evidence-v1"
  },
  retrieval: {
    topK: 20,
    bm25Weight: 0.55,
    vectorWeight: 0.3,
    imageWeight: 0.15,
    graphWeight: 0.05,
    feedbackBoost: 0.08,
    recencyWeight: 0.08,
    queryMatchWeight: 0.12,
    recencyHalfLifeDays: 45,
    recencyFloor: 0.05,
    parentExpansionDepth: 1,
    hierarchicalIndexEnabled: true,
    hierarchyWeight: 0.18,
    hierarchyBranchTopK: 12,
    hierarchyBackoffLimit: 16,
    hierarchyMinBranchCandidates: 3,
    hierarchyReasoningEnabled: false,
    outlineMinDocumentBlocks: 8,
    outlineMaxTreeNodes: 80,
    localMirrorWeight: 0.72,
    vectorLexicalGuard: true,
    vectorLexicalMinScore: 0.01,
    learningEnabled: true,
    retrievalProfileId: "balanced"
  },
  learning: {
    enabled: true,
    autoApplyRetrievalProfiles: true,
    feedbackWindowHours: 168,
    minFeedbackForAutoTune: 1,
    requireEvaluationBeforeProfileActivation: true,
    canaryEnabled: true,
    canaryTrafficPercent: 10,
    explicitModelRequired: true,
    noImplicitDownloads: true
  },
  maintenance: {
    reindexBatchSize: 500,
    staleIndexHours: 24,
    requireOcrOrCaption: true
  },
  markdown: {
    imagePolicy: "relative-asset-path",
    includeMachineReadableAppendix: true
  }
};

export const LICENSE_MANIFEST = {
  policy: "MIT_OR_APACHE2_COMPATIBLE_ONLY",
  acceptedLicenses: ["MIT", "Apache-2.0"],
  components: [
    {
      id: "better-sqlite3",
      role: "structured metadata store",
      license: "MIT"
    },
    {
      id: "builtin:hashing-multilingual-v1",
      role: "offline deterministic text embedding fallback",
      license: "project-internal"
    },
    {
      id: "builtin:asset-ocr-caption-v1",
      role: "offline image evidence fallback based on OCR/caption/asset metadata",
      license: "project-internal"
    },
    {
      id: "builtin:deterministic-learning-runtime",
      role: "auditable retrieval profile tuning and query fusion fallback",
      license: "project-internal"
    }
  ],
  optionalCompatibleTargets: [
    {
      id: "sqlite-vec",
      role: "native SQLite vector index",
      license: "MIT OR Apache-2.0",
      status: "protocol-ready-not-bundled"
    },
    {
      id: "intfloat/multilingual-e5-small",
      role: "text embedding model",
      license: "MIT",
      status: "license-gated-external-model"
    },
    {
      id: "llama-index",
      role: "optional retrieval orchestration framework",
      license: "MIT",
      status: "license-gated-external-component-via-js-adapter"
    },
    {
      id: "lancedb",
      role: "optional vector, FTS, hybrid search, and reranking backend",
      license: "Apache-2.0",
      status: "license-gated-external-component-via-js-adapter-or-service"
    }
  ],
  rejectedClasses: ["GPL", "AGPL", "unknown model weights", "cloud-only runtime"]
};
