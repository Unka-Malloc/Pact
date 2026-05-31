import { bridge } from "./bridge";
import { createKnowledgeUploadedFilesPayload } from "./knowledge-upload-session";
import type { DocumentParseResponse, DocumentParsingConfig } from "./types";

export type KnowledgeDocumentExportFormat = "docx" | "markdown" | "html";

export type KnowledgeDocumentPreviewContract = {
  pipelineId: string;
  expectedOutputs: string[];
  contextBudget?: DocumentParsingConfig["contextBudget"];
  payloadBudget?: DocumentParsingConfig["payloadBudget"];
  granularity?: DocumentParsingConfig["granularity"];
  dynamicParsing?: DocumentParsingConfig["dynamicParsing"];
};

export function knowledgeExportUrl(format: KnowledgeDocumentExportFormat) {
  if (format === "markdown") return bridge.knowledgeMarkdownExportUrl();
  if (format === "html") return bridge.knowledgeHtmlExportUrl();
  return bridge.knowledgeDocxExportUrl();
}

export function normalizedKnowledgeDocumentUrl(batchId: string, documentId: string) {
  return bridge.normalizedDocumentUrl(batchId, documentId);
}

export async function previewKnowledgeDocuments(
  files: File[],
  contract: KnowledgeDocumentPreviewContract,
): Promise<DocumentParseResponse | null> {
  if (files.length === 0) {
    return null;
  }
  const uploadedFiles = await createKnowledgeUploadedFilesPayload(files);
  return bridge.parseDocument({
    pipelineId: contract.pipelineId,
    expectedOutputs: contract.expectedOutputs,
    uploadedFiles,
    dryRun: true,
    contextBudget: contract.contextBudget,
    payloadBudget: contract.payloadBudget,
    granularity: contract.granularity,
    dynamicParsing: contract.dynamicParsing,
  });
}
