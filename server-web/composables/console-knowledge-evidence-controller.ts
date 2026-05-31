import { computed, ref, type ComputedRef, type Ref } from "vue";
import { bridge } from "../lib/bridge";
import { evidenceIdFromHref } from "../lib/rendering";
import type {
  EvidencePack,
  KnowledgeAssetRef,
  KnowledgeSearchResult,
} from "../lib/types";
import type { DebugTab } from "../types/app";
import {
  evidenceDisplayTitle,
  candidateTextFromRecord,
  knowledgeResultEvidenceId,
  readableSnippetFromText,
} from "./console-knowledge-search-utils";
import {
  isImageAsset,
  resolveEvidenceAssetUrl,
} from "./console-evidence-utils";
import {
  emailToSafeHtml as emailToSafeHtmlCore,
  embedEvidenceAssets as embedEvidenceAssetsCore,
  renderEmailFrame as renderEmailFrameCore,
  renderEmailImage as renderEmailImageCore,
  renderEmailNode as renderEmailNodeCore,
  renderEvidenceImageGallery as renderEvidenceImageGalleryCore,
  renderEvidenceReadableHtml as renderEvidenceReadableHtmlCore,
  renderReadableHtmlDocument as renderReadableHtmlDocumentCore,
  rewriteInlineAssetRefs as rewriteInlineAssetRefsCore,
  safeEmailImageSrc as safeEmailImageSrcCore,
  sanitizeEmailCssUrls as sanitizeEmailCssUrlsCore,
  sanitizeEmailFrameDocument as sanitizeEmailFrameDocumentCore,
  type EvidenceReadableKindLabel,
  type EvidenceRenderContext,
} from "./console-evidence-rendering";
import { asRecord } from "./console-model-utils";

type LoadEvidenceOptions = {
  revealKnowledgeSearch?: boolean;
};

type ConsoleKnowledgeEvidenceControllerOptions = {
  busyKey: ComputedRef<string>;
  clearAllBusy: () => void;
  currentAgentExploreQuery: () => string;
  error: Ref<string>;
  infoFeedQuery: () => string;
  knowledgeSearchResults: Ref<KnowledgeSearchResult[]>;
  agentExploreContextBuildRecordId: () => string;
  openDebugTab: (tab: DebugTab) => void;
  recordFeedback: (action: string, context?: Record<string, unknown>) => void;
  setBusy: (key: string) => void;
};

export function createConsoleKnowledgeEvidenceController(
  options: ConsoleKnowledgeEvidenceControllerOptions,
) {
  const selectedEvidence = ref<EvidencePack | null>(null);
  const selectedEvidenceId = ref("");
  const evidenceLoadError = ref("");
  const agentEvidencePreviewOpen = ref(false);
  const evidenceLoadSequence = ref(0);

  const selectedEvidenceDisplayTitle = computed(() =>
    selectedEvidence.value ? evidenceDisplayTitle(selectedEvidence.value) : selectedEvidenceId.value || "来源详情",
  );
  const selectedEvidencePayload = computed(() =>
    asRecord(selectedEvidence.value?.payload) || null,
  );
  const selectedEvidenceDocument = computed(() =>
    (asRecord(selectedEvidence.value?.document) ||
      asRecord(selectedEvidencePayload.value?.document) ||
      null) as Record<string, unknown> | null,
  );
  const selectedEvidenceSection = computed(() =>
    (asRecord(selectedEvidence.value?.section) ||
      asRecord(selectedEvidencePayload.value?.section) ||
      null) as Record<string, unknown> | null,
  );
  const selectedEvidenceBlocks = computed(() => {
    const direct = Array.isArray(selectedEvidence.value?.blocks)
      ? selectedEvidence.value?.blocks
      : Array.isArray(selectedEvidencePayload.value?.blocks)
        ? selectedEvidencePayload.value?.blocks
        : [];
    return (direct || []).map((item) => asRecord(item)).filter(Boolean) as Record<string, unknown>[];
  });
  const evidenceAssets = computed(() => {
    const direct = selectedEvidence.value?.assets || [];
    const payloadAssets = Array.isArray(selectedEvidencePayload.value?.assets)
      ? selectedEvidencePayload.value?.assets
      : [];
    return [...direct, ...payloadAssets].filter(Boolean) as KnowledgeAssetRef[];
  });

  const evidenceReadableHtml = computed(() => renderEvidenceReadableHtml());
  const evidenceReadableKind = computed(() => evidenceReadableKindLabel());

  function hydrateSearchResultPreview(evidence: EvidencePack) {
    const evidenceId = String(evidence.evidenceId || selectedEvidenceId.value || "");
    if (!evidenceId) {
      return;
    }
    const title = evidenceDisplayTitle(evidence);
    const snippet = readableSnippetFromText(candidateTextFromRecord(evidence));
    options.knowledgeSearchResults.value = options.knowledgeSearchResults.value.map((item) => {
      if (knowledgeResultEvidenceId(item) !== evidenceId) {
        return item;
      }
      return {
        ...item,
        title: title || item.title,
        snippet: snippet || item.snippet,
      };
    });
  }

  function evidencePrimaryText() {
    const blockText = selectedEvidenceBlocks.value
      .map((block) => String(block.text || block.snippet || "").trim())
      .filter(Boolean)
      .join("\n\n");
    return String(
      blockText ||
      selectedEvidence.value?.text ||
      selectedEvidence.value?.snippet ||
      "",
    ).trim();
  }

  function evidenceMainText() {
    return evidencePrimaryText() || "当前证据没有可展示的正文。";
  }

  function safeEmailImageSrc(value: string) {
    return safeEmailImageSrcCore(value, evidenceRenderContext());
  }

  function sanitizeEmailCssUrls(value: string) {
    return sanitizeEmailCssUrlsCore(value, evidenceRenderContext());
  }

  function sanitizeEmailFrameDocument(rawHtml: string) {
    return sanitizeEmailFrameDocumentCore(rawHtml, evidenceRenderContext());
  }

  function renderEmailFrame(rawHtml: string) {
    return renderEmailFrameCore(rawHtml, evidenceRenderContext());
  }

  function imageEvidenceAssets() {
    return evidenceAssets.value.filter((asset) => isImageAsset(asset));
  }

  function assetUrlForReference(reference: string) {
    return resolveEvidenceAssetUrl(
      reference,
      imageEvidenceAssets(),
      (assetId) => bridge.knowledgeAssetUrl(assetId),
    );
  }

  function evidenceRenderContext(): EvidenceRenderContext {
    return {
      origin: () => window.location.origin,
      imageAssets: imageEvidenceAssets,
      assetUrlForReference,
      assetUrlForAssetId: (assetId) => bridge.knowledgeAssetUrl(assetId),
    };
  }

  function rewriteInlineAssetRefs(html: string) {
    return rewriteInlineAssetRefsCore(html, evidenceRenderContext());
  }

  function renderEmailImage(element: Element) {
    return renderEmailImageCore(element, evidenceRenderContext());
  }

  function renderEmailNode(node: Node): string {
    return renderEmailNodeCore(node, evidenceRenderContext());
  }

  function renderReadableHtmlDocument(rawHtml: string, options: { headers?: Array<[string, string]>; title?: string } = {}) {
    return renderReadableHtmlDocumentCore(rawHtml, evidenceRenderContext(), options);
  }

  function emailToSafeHtml(rawText: string) {
    return emailToSafeHtmlCore(rawText, evidenceRenderContext());
  }

  function evidenceSourceHint() {
    const locator =
      asRecord(selectedEvidence.value?.sourceLocator) ||
      asRecord(selectedEvidence.value?.locator) ||
      null;
    const documentRecord = selectedEvidenceDocument.value || {};
    return [
      documentRecord.documentType,
      documentRecord.mediaType,
      documentRecord.sourcePath,
      documentRecord.title,
      locator?.sourcePath,
      selectedEvidence.value?.title,
    ].map((item) => String(item || "").toLowerCase()).join(" ");
  }

  function evidenceReadableKindLabel(): EvidenceReadableKindLabel {
    const text = evidencePrimaryText();
    const hint = evidenceSourceHint();
    if (/\.(eml|msg)\b|message\/rfc822|^from:|^subject:/i.test(`${hint}\n${text.slice(0, 500)}`)) {
      return "EML";
    }
    if (/\.html?\b|text\/html|^\s*(<!doctype\s+html|<html|<body)\b/i.test(`${hint}\n${text.slice(0, 500)}`)) {
      return "HTML";
    }
    if (/\.md\b|\.markdown\b|text\/markdown/i.test(hint)) {
      return "Markdown";
    }
    if (!text && imageEvidenceAssets().length > 0) {
      return "图片";
    }
    return "文本";
  }

  function renderEvidenceImageGallery(excludedAssetIds = new Set<string>()) {
    return renderEvidenceImageGalleryCore(evidenceRenderContext(), excludedAssetIds);
  }

  function embedEvidenceAssets(html: string) {
    return embedEvidenceAssetsCore(html, evidenceRenderContext());
  }

  function renderEvidenceReadableHtml() {
    return renderEvidenceReadableHtmlCore(
      {
        text: evidencePrimaryText(),
        kind: evidenceReadableKindLabel(),
      },
      evidenceRenderContext(),
    );
  }

  function evidenceSourceDetails() {
    const locator =
      asRecord(selectedEvidence.value?.sourceLocator) ||
      asRecord(selectedEvidence.value?.locator) ||
      null;
    const document = selectedEvidenceDocument.value || {};
    const section = selectedEvidenceSection.value || {};
    return [
      { label: "文档", value: String(document.title || document.documentId || "未记录") },
      { label: "章节", value: String(section.title || section.sectionId || "未记录") },
      { label: "来源", value: String(locator?.sourcePath || "未记录") },
      { label: "批次", value: String(locator?.batchId || selectedEvidence.value?.batchId || "未记录") },
    ].filter((item: any) => item.value && item.value !== "未记录");
  }

  function evidenceReasonText() {
    const reasons = selectedEvidence.value?.reasons || [];
    if (!Array.isArray(reasons) || reasons.length === 0) {
      return "暂无命中说明。";
    }
    return reasons
      .map((reason) => (typeof reason === "string" ? reason : JSON.stringify(reason)))
      .join("；");
  }

  async function openKnowledgeSearchResult(item: KnowledgeSearchResult) {
    const evidenceId = knowledgeResultEvidenceId(item);
    if (!evidenceId) {
      options.error.value = "这个检索结果没有可打开的 evidenceId。";
      return;
    }
    await loadEvidence(evidenceId);
  }

  async function loadEvidence(evidenceId: string, loadOptions: LoadEvidenceOptions = {}) {
    const normalized = String(evidenceId || "").trim();
    if (!normalized) {
      return;
    }
    const sequence = evidenceLoadSequence.value + 1;
    evidenceLoadSequence.value = sequence;
    const requestBusyKey = `knowledge:evidence:${normalized}`;
    options.setBusy(requestBusyKey);
    selectedEvidenceId.value = normalized;
    selectedEvidence.value = null;
    evidenceLoadError.value = "";
    options.error.value = "";
    try {
      const evidence = await bridge.getKnowledgeEvidence(normalized);
      if (sequence !== evidenceLoadSequence.value) {
        return;
      }
      if (!evidence || typeof evidence !== "object") {
        throw new Error("服务端没有返回可展示的证据内容。");
      }
      selectedEvidence.value = evidence;
      selectedEvidenceId.value = String(evidence.evidenceId || normalized);
      hydrateSearchResultPreview(evidence);
      if (loadOptions.revealKnowledgeSearch !== false) {
        options.openDebugTab("knowledgeRecall");
      }
    } catch (nextError) {
      if (sequence !== evidenceLoadSequence.value) {
        return;
      }
      const message = nextError instanceof Error ? nextError.message : "加载证据包失败。";
      evidenceLoadError.value = message;
      options.error.value = message;
    } finally {
      if (sequence === evidenceLoadSequence.value && options.busyKey.value === requestBusyKey) {
        options.clearAllBusy();
      }
    }
  }

  async function openAgentEvidencePreview(evidenceId: string) {
    const normalized = String(evidenceId || "").trim();
    if (!normalized) {
      return;
    }
    agentEvidencePreviewOpen.value = true;
    selectedEvidenceId.value = normalized;
    selectedEvidence.value = null;
    evidenceLoadError.value = "";
    await loadEvidence(normalized, { revealKnowledgeSearch: false });
    options.recordFeedback("open", {
      surface: "evidence_preview",
      evidenceId: normalized,
      query: options.currentAgentExploreQuery() || options.infoFeedQuery() || "",
      contextBuildRecordId: options.agentExploreContextBuildRecordId(),
    });
  }

  function closeAgentEvidencePreview() {
    agentEvidencePreviewOpen.value = false;
  }

  function handleAgentAnswerClick(event: MouseEvent) {
    const target = event.target as HTMLElement | null;
    const anchor = target?.closest?.("a") as HTMLAnchorElement | null;
    const href = anchor?.getAttribute("href") || "";
    const evidenceId = evidenceIdFromHref(href);
    if (!evidenceId) {
      return;
    }
    event.preventDefault();
    void openAgentEvidencePreview(evidenceId);
  }

  return {
    agentEvidencePreviewOpen,
    assetUrlForReference,
    closeAgentEvidencePreview,
    emailToSafeHtml,
    embedEvidenceAssets,
    evidenceAssets,
    evidenceLoadError,
    evidenceLoadSequence,
    evidenceMainText,
    evidencePrimaryText,
    evidenceReadableHtml,
    evidenceReadableKind,
    evidenceReadableKindLabel,
    evidenceReasonText,
    evidenceSourceDetails,
    evidenceSourceHint,
    handleAgentAnswerClick,
    hydrateSearchResultPreview,
    imageEvidenceAssets,
    loadEvidence,
    openAgentEvidencePreview,
    openKnowledgeSearchResult,
    renderEmailFrame,
    renderEmailImage,
    renderEmailNode,
    renderEvidenceImageGallery,
    renderEvidenceReadableHtml,
    renderReadableHtmlDocument,
    rewriteInlineAssetRefs,
    safeEmailImageSrc,
    sanitizeEmailCssUrls,
    sanitizeEmailFrameDocument,
    selectedEvidence,
    selectedEvidenceBlocks,
    selectedEvidenceDisplayTitle,
    selectedEvidenceDocument,
    selectedEvidenceId,
    selectedEvidencePayload,
    selectedEvidenceSection,
  };
}
