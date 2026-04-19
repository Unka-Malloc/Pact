export type AgentSettings = {
  apiBaseUrl: string;
  apiKey: string;
  model: string;
  systemPrompt: string;
  tikaJarPath: string;
  javaBinPath: string;
  ocrEnabled: boolean;
  ocrPythonPath: string;
  ocrLanguage: string;
  qianxinBrowserPath: string;
  qianxinBrowserArgs: string;
};

export type SourceFile = {
  id: string;
  name: string;
  path: string;
  kind: "text" | "pdf" | "docx" | "document" | "image";
  text?: string;
  mediaType?: string;
  imageDataUrl?: string;
  imageBuffer?: unknown;
};

export type KnowledgeDocument = {
  id: string;
  title: string;
  source: string;
  content: string;
  tags: string[];
  chunkIds?: string[];
  timestamp: string;
};

export type QaPair = {
  id: string;
  question: string;
  answer: string;
  source: string;
  documentTitles: string[];
  chunkIds?: string[];
  timestamp: string;
};

export type ChunkRecord = {
  id: string;
  sourceId: string;
  sourceName: string;
  title: string;
  titlePath: string[];
  chunkType: "section" | "table" | "list" | "code";
  tokenCount: number;
  content: string;
  blockIds: string[];
};

export type SplitResult = {
  generatedAt: string;
  documents: KnowledgeDocument[];
  qaPairs: QaPair[];
  warnings: string[];
  sourceFiles: SourceFile[];
  chunks: ChunkRecord[];
};

export type SplitJobStatus = "queued" | "running" | "completed" | "failed";

export type SplitJob = {
  id: string;
  status: SplitJobStatus;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  finishedAt?: string;
  progressPercent: number;
  stage: string;
  error?: string;
  resultSummary?: {
    documents: number;
    qaPairs: number;
    warnings: number;
  };
};

export type SplitPayload = {
  inputText: string;
  filePaths: string[];
  uploadedFiles: UploadedFilePayload[];
  settings: AgentSettings;
};

export type ExportFormat = "json" | "md" | "docx";

export type ExportResultPayload = {
  format: ExportFormat;
  result: SplitResult;
};

export type UploadedFilePayload = {
  name: string;
  mediaType: string;
  dataBase64: string;
  relativePath?: string;
};

export type RuntimeMode = "electron" | "browser";

export type BridgeResult = {
  canceled: boolean;
  filePath?: string;
};
