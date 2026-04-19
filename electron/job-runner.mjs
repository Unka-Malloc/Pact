import { runAgent } from "./agent.mjs";
import { createKnowledgePipeline } from "./chunking/pipeline.mjs";
import { saveSettings } from "./config.mjs";
import { readInputSources } from "./file-ingest.mjs";

function noop() {}

function serializeSourceFilesForClient(sources) {
  return sources.map((source) => ({
    id: source.id,
    name: source.name,
    path: source.path,
    kind: source.kind,
    text: source.text || "",
    mediaType: source.mediaType || "",
    imageDataUrl: source.imageDataUrl || ""
  }));
}

function serializeChunksForClient(chunks) {
  return chunks.map((chunk) => ({
    id: chunk.id,
    sourceId: chunk.sourceId,
    sourceName: chunk.sourceName,
    title: chunk.title,
    titlePath: chunk.titlePath,
    chunkType: chunk.chunkType,
    tokenCount: chunk.tokenCount,
    content: chunk.content,
    blockIds: chunk.blockIds
  }));
}

export async function runSplitJob(userDataPath, payload, options = {}) {
  const reportProgress =
    typeof options.onProgress === "function" ? options.onProgress : noop;
  const generatedAt = new Date().toISOString();
  reportProgress({
    progressPercent: 8,
    stage: "保存配置"
  });
  const settings = await saveSettings(userDataPath, payload.settings);
  reportProgress({
    progressPercent: 24,
    stage: "读取输入材料"
  });
  const { sources, warnings } = await readInputSources({
    inputText: payload.inputText || "",
    filePaths: Array.isArray(payload.filePaths) ? payload.filePaths : [],
    uploadedFiles: Array.isArray(payload.uploadedFiles) ? payload.uploadedFiles : [],
    settings,
    userDataPath
  });
  const pipeline = createKnowledgePipeline();
  reportProgress({
    progressPercent: 56,
    stage: "执行规则切分"
  });
  const prepared = await pipeline.run(sources, generatedAt);
  reportProgress({
    progressPercent: 82,
    stage: "调用云端智能体"
  });
  const generated = await runAgent({
    sources,
    chunks: prepared.chunks,
    documents: prepared.documents,
    settings,
    generatedAt
  });
  reportProgress({
    progressPercent: 100,
    stage: "结果已生成"
  });

  return {
    generatedAt,
    documents: generated.documents,
    qaPairs: generated.qaPairs,
    warnings,
    sourceFiles: serializeSourceFilesForClient(sources),
    chunks: serializeChunksForClient(prepared.chunks)
  };
}
