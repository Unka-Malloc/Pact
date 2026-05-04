import { createKnowledgePipeline } from "../chunking/pipeline.mjs";
import {
  listAvailableAnalysisModules,
  runConfiguredAnalysisModule
} from "./analysis-engine-registry.mjs";
import { saveSettings } from "../config.mjs";
import { loadEmailRules } from "../email-rules.mjs";
import { readInputSources } from "../modules/FileProcessor/index.mjs";
import { generateNormalizedDocuments } from "../modules/FileProcessor/FileNormalizer/NormalizedDocuments/index.mjs";
import { resolveUploadSessionFiles } from "../protocols/checkpoint/upload-session-store.mjs";

function serializeSourceFilesForClient(sources) {
  return sources.map((source) => ({
    id: source.id,
    name: source.name,
    path: source.path,
    kind: source.kind,
    sourceCreatedAt: source.sourceCreatedAt || "",
    sourceUpdatedAt: source.sourceUpdatedAt || "",
    sourceCollectedAt: source.sourceCollectedAt || "",
    text: source.text || "",
    mediaType: source.mediaType || "",
    imageDataUrl: source.imageDataUrl || "",
    rawObjectId: source.rawObject?.objectId || "",
    originalFileName: source.rawObject?.originalFileName || "",
    originalRelativePath:
      source.rawObject?.originalRelativePath || source.originalRelativePath || "",
    rawObjectSha256: source.rawObject?.sha256 || source.originalSha256 || "",
    rawObjectByteSize: source.rawObject?.byteSize || source.originalByteSize || 0,
    documentParserId: source.documentParserId || "",
    documentMetadata: source.documentMetadata || {},
    embeddedDocuments: source.embeddedDocuments || []
  }));
}

function createInitialContext({ userDataPath, payload, runtime, reportProgress, jobId, generatedAt }) {
  const executionRuntime =
    runtime && typeof runtime.createExecutionView === "function"
      ? runtime.createExecutionView()
      : runtime;
  return {
    userDataPath,
    payload,
    runtime: executionRuntime,
    reportProgress,
    jobId,
    generatedAt,
    metadataStore: executionRuntime.metadataStore || runtime.metadataStore,
    warnings: [],
    settings: null,
    rules: null,
    uploadSessionFiles: [],
    sources: [],
    prepared: null,
    analysis: null,
    lifecycle: null,
    normalizedDocuments: null,
    result: null
  };
}

export function createJobPipeline({ userDataPath, payload, runtime, reportProgress, jobId, generatedAt }) {
  const pipeline = createKnowledgePipeline();

  return {
    createContext() {
      return createInitialContext({
        userDataPath,
        payload,
        runtime,
        reportProgress,
        jobId,
        generatedAt
      });
    },
    async run(context) {
      context.reportProgress({
        progressPercent: 8,
        stage: "保存配置"
      });
      context.settings = await saveSettings(userDataPath, payload.settings);
      context.rules = await loadEmailRules(userDataPath);
      context.metadataStore.beginBatch({
        batchId: jobId,
        jobId,
        generatedAt,
        settings: context.settings
      });

      context.reportProgress({
        progressPercent: 26,
        stage: "读取输入邮件"
      });
      if (payload.uploadSessionId) {
        context.uploadSessionFiles = await resolveUploadSessionFiles(userDataPath, payload.uploadSessionId);
      }
      const sourceReadResult = await readInputSources({
        inputText: payload.inputText || "",
        filePaths: Array.isArray(payload.filePaths) ? payload.filePaths : [],
        fileManifestPath: payload.fileManifestPath || payload.knowledgeSource?.fileManifestPath || "",
        uploadedFiles:
          context.uploadSessionFiles.length > 0
            ? context.uploadSessionFiles
            : Array.isArray(payload.uploadedFiles)
              ? payload.uploadedFiles
              : [],
        settings: context.settings,
        userDataPath,
        generatedAt,
        batchId: jobId,
        runtime: context.runtime,
        reportProgress: context.reportProgress
      });
      context.sources = sourceReadResult.sources;
      context.warnings.push(...(sourceReadResult.warnings || []));
      context.metadataStore.persistSources({
        batchId: jobId,
        sources: context.sources,
        warnings: context.warnings
      });

      context.reportProgress({
        progressPercent: 54,
        stage: "提取正文结构"
      });
      context.prepared = await pipeline.run(context.sources, generatedAt);

      context.reportProgress({
        progressPercent: 76,
        stage: "分析事务与人物网络"
      });
      const analysisResult = await runConfiguredAnalysisModule({
        runtime: context.runtime,
        sources: context.sources,
        chunks: context.prepared.chunks,
        generatedAt,
        settings: context.settings,
        rules: context.rules
      });
      context.analysis = analysisResult.analysis;
      context.lifecycle = context.metadataStore.resolveTransactionLifecycle({
        batchId: jobId,
        transactions: context.analysis.transactions,
        timeline: context.analysis.timeline,
        settings: context.settings,
        rules: context.rules,
        generatedAt
      });
      context.analysis.transactions = context.lifecycle.transactions;
      context.analysis.timeline = context.lifecycle.timeline;
      context.analysis.overview.timelineCount = context.analysis.timeline.length;

      context.reportProgress({
        progressPercent: 94,
        stage: "生成归一化 DOCX 知识文档"
      });
      context.normalizedDocuments = await generateNormalizedDocuments({
        userDataPath,
        jobId,
        generatedAt,
        sources: context.sources,
        chunks: context.prepared.chunks,
        analysis: context.analysis
      });
      context.warnings.push(...(context.normalizedDocuments.warnings || []));

      context.result = {
        batchId: jobId,
        generatedAt,
        overview: context.analysis.overview,
        emails: context.analysis.emails,
        threads: context.analysis.threads,
        transactions: context.analysis.transactions,
        people: context.analysis.people,
        timeline: context.analysis.timeline,
        network: context.analysis.network,
        associations: context.analysis.associations,
        lifecycle: context.lifecycle.summary,
        analysisRuntime: {
          ...analysisResult.runtimeInfo,
          availableModules: await listAvailableAnalysisModules(
            context.runtime,
            context.settings
          ),
          selectedModuleId: analysisResult.runtimeInfo.moduleId
        },
        retrieval: context.analysis.retrieval,
        warnings: context.warnings,
        normalizedDocuments: context.normalizedDocuments,
        sourceFiles: serializeSourceFilesForClient(context.sources)
      };

      context.reportProgress({
        progressPercent: 100,
        stage: "结果已生成"
      });

      context.metadataStore.persistAnalysis({
        batchId: jobId,
        result: context.result,
        warnings: context.warnings,
        rules: context.rules
      });

      for (const hook of context.runtime.postCommitHooks || []) {
        await hook.execute({
          batchId: jobId,
          result: context.result,
          settings: context.settings,
          rules: context.rules,
          metadataStore: context.metadataStore
        });
      }

      return context.result;
    }
  };
}
