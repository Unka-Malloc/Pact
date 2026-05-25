import path from "node:path";
import { hashClientString, serverToken } from "../../common/security/client-strings.mjs";
import { preprocessWordCloudVocabulary as defaultPreprocessWordCloudVocabulary } from "../knowledge/preprocessing/word-cloud/preprocess.mjs";

function result(status, payload) {
  return { status, payload };
}

async function publishProtocolEvent(protocolEventBus, topic, payload, options = {}) {
  if (!protocolEventBus || typeof protocolEventBus.publish !== "function") {
    return null;
  }
  return protocolEventBus.publish(topic, payload, options);
}

function mutationErrorResult(error) {
  const statusCode = Number(error?.statusCode || 500);
  return result(statusCode >= 400 && statusCode < 600 ? statusCode : 500, {
    ok: false,
    code: error?.code || "word_cloud_error",
    error: error?.message || "词袋操作失败。"
  });
}

function clampRequestInteger(value, fallback, min = 1, max = 1000000000) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, Math.floor(numeric)));
}

function normalizeAuditCorpusPaths(values = []) {
  const paths = [];
  const source = Array.isArray(values) ? values : [values];
  const seen = new Set();
  for (const value of source) {
    const record = typeof value === "string" ? { path: value } : value || {};
    const selectedPath = String(record.path || "").trim();
    if (!selectedPath) {
      continue;
    }
    const type = String(record.type || "").trim();
    const normalized = {
      type: type === "file" || type === "directory" ? type : "",
      path: selectedPath,
      basename: path.basename(selectedPath)
    };
    const key = `${normalized.type}:${normalized.path}`.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    paths.push(normalized);
  }
  return paths;
}

function flattenedInputValues(value) {
  if (Array.isArray(value)) {
    return value.flatMap((item) => flattenedInputValues(item));
  }
  return [value];
}

function normalizeWordCloudCorpusPath(value) {
  if (!value) {
    return null;
  }
  if (typeof value === "object") {
    const selectedPath = String(value.path || "").trim();
    if (!selectedPath) {
      return null;
    }
    const type = String(value.type || "").trim();
    return {
      type: type === "file" || type === "directory" ? type : "",
      path: selectedPath
    };
  }
  const raw = String(value || "").trim();
  if (!raw) {
    return null;
  }
  const [type, ...pathParts] = raw.split(":");
  const selectedPath = pathParts.join(":");
  return selectedPath && ["file", "directory"].includes(type)
    ? { type, path: selectedPath }
    : { path: raw };
}

function normalizeWordCloudCorpusPaths(input = {}) {
  const values = [
    ...flattenedInputValues(input.corpusPath),
    ...flattenedInputValues(input["corpus-path"]),
    ...flattenedInputValues(input.corpusPaths),
    ...flattenedInputValues(input["corpus-paths"])
  ].filter((value) => value !== undefined && value !== null && value !== "");
  const paths = [];
  const seen = new Set();
  for (const value of values) {
    const normalized = normalizeWordCloudCorpusPath(value);
    if (!normalized) {
      continue;
    }
    const key = `${normalized.type || ""}:${normalized.path}`.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    paths.push(normalized);
  }
  return paths;
}

function normalizeWordCloudOperationInput(input = {}) {
  const normalized = input && typeof input === "object" ? { ...input } : {};
  const corpusPaths = normalizeWordCloudCorpusPaths(normalized);
  if (corpusPaths.length > 0) {
    normalized.corpusPaths = corpusPaths;
  }
  return normalized;
}

function extractJsonObjectFromText(value) {
  const text = String(value || "").trim();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    // Some model adapters wrap JSON in prose or fenced blocks.
  }
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    try {
      return JSON.parse(fenced[1].trim());
    } catch {
      // Fall through to brace extraction.
    }
  }
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(text.slice(start, end + 1));
    } catch {
      return null;
    }
  }
  return null;
}

function normalizePromptHint(value = "") {
  const normalized = String(value || "").trim();
  if (!normalized) {
    return "目标分类";
  }
  const stopWords = new Set([
    "词云",
    "词汇",
    "分组",
    "分类",
    "创建",
    "生成",
    "提取",
    "列表",
    "聚类"
  ]);
  const candidates = normalized
    .replace(/[\u0000-\u001f]/g, " ")
    .split(/[\s,/，。.!?！?、;；]/g)
    .map((item) => String(item || "").trim())
    .filter((item) => item && !stopWords.has(item));
  return candidates[0] || "目标分类";
}

function buildWordCloudAgentPrompt({ terms, prompt }) {
  const supervisorPrompt = String(prompt || "").trim();
  const wordBagHint = normalizePromptHint(supervisorPrompt);
  const lines = [
    "你是 Pact 词云分组智能体。你只能根据输入的语料词频进行分组，不要编造新词。",
    "任务：根据用户意图自动判断需要多少个分类卡片，把词语归集到可嵌套的词云树。",
    "一个词可以属于多个顶层卡片；同一卡片内部如果词语被放进子分组，就不要再留在父卡片 terms 中。",
    "无法归类的高置信词先放进 label 为 Default 的顶层卡片。",
    "明显乱码、噪声、低置信词放到 otherTerms（后续会进入其它卡片）。",
    "不要使用算法解释，只输出 JSON。每张卡片需要 label、summary、terms，可选 children。",
    "每个 term 来源于输入词频，禁止新增新词。",
    "relation 可用 separate、overlap、contains，表示与其它卡片的大致关系。"
  ];
  if (supervisorPrompt) {
    lines.push(`人工监督要求：${supervisorPrompt}`);
  }
  lines.push(
    "输出格式：",
    `{"title":"语料词云","wordBags":[{"wordBagId":"word-bag-1","label":"${wordBagHint}","summary":"...","relation":"overlap","terms":[{"term":"...","weight":1}],"children":[{"wordBagId":"word-bag-1-1","label":"...","terms":[{"term":"..."}]}]}],"otherTerms":[{"term":"...","weight":0.1}],"defaultTerms":[{"term":"...","weight":0.1}]}`,
    "说明：otherTerms 表示 low-weight/噪声词；defaultTerms 表示正常无法归类词。",
    "语料词频：",
    JSON.stringify(terms)
  );
  return lines.join("\n");
}

function wordCloudTermIdentity(value = {}) {
  const term = typeof value === "string" ? value : value?.term;
  return String(term || "").trim().toLowerCase();
}

function buildWordCloudTermFrequencyMap(terms = []) {
  const map = new Map();
  for (const item of Array.isArray(terms) ? terms : []) {
    const identity = wordCloudTermIdentity(item);
    if (!identity) {
      continue;
    }
    const frequency = Number(item?.frequency || 0);
    map.set(identity, Number.isFinite(frequency) ? Math.max(0, Math.floor(frequency)) : 0);
  }
  return map;
}

function normalizeWordCloudTermForAgent(value = {}, sourceFrequencyByTerm = new Map()) {
  const identity = wordCloudTermIdentity(value);
  if (!identity) {
    return null;
  }
  const frequencyFromSource = sourceFrequencyByTerm.get(identity) || sourceFrequencyByTerm.get(identity.toLowerCase()) || 0;
  const frequency = Number(value?.frequency ?? value?.count ?? frequencyFromSource);
  const weight = Number(value?.weight || 0);
  return {
    term: identity,
    frequency: Number.isFinite(frequency) ? Math.max(0, Math.floor(frequency)) : Number(frequencyFromSource || 0),
    weight: Number.isFinite(weight) ? Math.max(0, weight) : 0
  };
}

function normalizeWordCloudWordBagsFromAgent(rawWordBags = [], sourceFrequencyByTerm = new Map()) {
  if (!Array.isArray(rawWordBags)) {
    return [];
  }

  const usedWordBagIds = new Set();
  const assignWordBagId = (rawCloud = {}, index = 0) => {
    let rawWordBagId = String(rawCloud?.wordBagId || rawCloud?.id || `word-bag-${index + 1}`).trim();
    if (!rawWordBagId) {
      rawWordBagId = `word-bag-${index + 1}`;
    }
    let wordBagId = rawWordBagId;
    let suffix = 1;
    while (usedWordBagIds.has(wordBagId)) {
      suffix += 1;
      wordBagId = `${rawWordBagId}-${suffix}`;
    }
    usedWordBagIds.add(wordBagId);
    return wordBagId;
  };

  return rawWordBags.map((rawCloud, index) => {
    const source = rawCloud && typeof rawCloud === "object" ? rawCloud : {};
    const usedTerms = new Set();
    const terms = [];
    const relation = String(source.relation || "separate").trim() || "separate";
    for (const item of Array.isArray(source.terms) ? source.terms : []) {
      const normalized = normalizeWordCloudTermForAgent(item, sourceFrequencyByTerm);
      if (!normalized) {
        continue;
      }
      const identity = wordCloudTermIdentity(normalized);
      if (!identity || usedTerms.has(identity)) {
        continue;
      }
      usedTerms.add(identity);
      terms.push(normalized);
    }

    const children = normalizeWordCloudWordBagsFromAgent(source.children || source.subgroups || source.groups || [], sourceFrequencyByTerm);

    return {
      wordBagId: assignWordBagId(source, index),
      label: String(source.label || "").trim() || "词云",
      summary: typeof source.summary === "string" ? source.summary.trim() : "",
      relation,
      terms,
      children: Array.isArray(children) ? children : [],
      parentWordBagId: String(source.parentWordBagId || "").trim() || undefined
    };
  });
}

function normalizeWordCloudTermArray(rawTerms = [], sourceFrequencyByTerm = new Map(), reserved = new Set()) {
  const used = new Set(Array.isArray(reserved) ? reserved : []);
  const terms = [];
  for (const item of Array.isArray(rawTerms) ? rawTerms : []) {
    const normalized = normalizeWordCloudTermForAgent(item, sourceFrequencyByTerm);
    if (!normalized) {
      continue;
    }
    const identity = wordCloudTermIdentity(normalized);
    if (!identity || used.has(identity)) {
      continue;
    }
    used.add(identity);
    terms.push(normalized);
  }
  return terms;
}

function ensureCloudCardByLabel(wordBags = [], label = "", terms = []) {
  const list = Array.isArray(wordBags) ? [...wordBags] : [];
  const normalizedLabel = String(label || "").trim();
  const labelKey = normalizedLabel.toLowerCase();
  if (!normalizedLabel) {
    return list;
  }

  const fallback = {
    wordBagId: labelKey === "默认" || labelKey === "default" ? "default" : labelKey === "其它" || labelKey === "其他" ? "other" : labelKey,
    label: normalizedLabel,
    summary: `${normalizedLabel}卡片。`,
    relation: "separate",
    terms: [],
    children: []
  };
  if (labelKey === "default" || labelKey === "默认") {
    fallback.summary = "所有尚未进入明确分组的词汇。";
  }
  if (labelKey === "其它" || labelKey === "其他") {
    fallback.summary = "低权重、低置信或噪声词汇。";
  }

  const existingIndex = list.findIndex((cloud) => String(cloud?.label || "").trim().toLowerCase() === labelKey);
  if (existingIndex >= 0) {
    const existing = list[existingIndex] || {};
    const normalizedExistingTerms = normalizeWordCloudTermArray(existing?.terms || [], new Map(), []);
    const dedupTerms = normalizeWordCloudTermArray(terms, new Map(), new Set(normalizedExistingTerms.map((item) => item.term)));
    list[existingIndex] = {
      ...existing,
      wordBagId: String(existing.wordBagId || fallback.wordBagId).trim() || fallback.wordBagId,
      label: normalizedLabel,
      relation: String(existing.relation || fallback.relation).trim() || fallback.relation,
      terms: [...normalizedExistingTerms, ...dedupTerms]
    };
    return list;
  }

  fallback.terms = normalizeWordCloudTermArray(terms, new Map(), new Set());
  list.push(fallback);
  return list;
}

function buildWordCloudFromAgentResponse({
  parsed = {},
  fullTerms = [],
  fallbackRaw = {}
}) {
  const sourceTermList = Array.isArray(fullTerms) ? fullTerms : [];
  const sourceFrequencyByTerm = buildWordCloudTermFrequencyMap(sourceTermList);
  const sourceTerms = sourceTermList
    .map((term) => normalizeWordCloudTermForAgent(term, sourceFrequencyByTerm))
    .filter((term) => term && term.term);

  const knownIdentities = new Set(
    sourceTerms
      .map((term) => wordCloudTermIdentity(term))
      .filter(Boolean)
  );

  const parsedWordBags = normalizeWordCloudWordBagsFromAgent(parsed.wordBags || [], sourceFrequencyByTerm);
  const assignedIdentities = collectWordCloudAssignedTermIds(parsedWordBags);

  const parsedDefaultTerms = normalizeWordCloudTermArray(parsed.defaultTerms || [], sourceFrequencyByTerm, new Set());
  const parsedOtherTerms = normalizeWordCloudTermArray(parsed.otherTerms || [], sourceFrequencyByTerm, new Set());
  const fallbackKnownLowTerms = normalizeWordCloudTermArray(
    Array.isArray(fallbackRaw?.lowQualityTerms) ? fallbackRaw.lowQualityTerms : [],
    sourceFrequencyByTerm,
    new Set()
  );
  const lowQualitySet = new Set(
    sourceTerms
      .filter((item) => String(item?.quality || "normal").toLowerCase() === "low")
      .map((item) => wordCloudTermIdentity(item))
      .filter(Boolean)
  );

  const mergedOtherSeed = normalizeWordCloudTermArray(
    [...parsedOtherTerms, ...fallbackKnownLowTerms],
    sourceFrequencyByTerm,
    new Set()
  );
  const otherSet = new Set(mergedOtherSeed.map((term) => wordCloudTermIdentity(term)));
  const defaultSet = new Set(parsedDefaultTerms.map((term) => wordCloudTermIdentity(term)));

  if (otherSet.size > 0) {
    for (const identity of otherSet) {
      defaultSet.delete(identity);
    }
    for (const identity of otherSet) {
      assignedIdentities.delete(identity);
    }
  }

  const fallbackTerms = sourceTerms
    .filter((term) => {
      const identity = wordCloudTermIdentity(term);
      return identity && !assignedIdentities.has(identity) && !otherSet.has(identity) && !lowQualitySet.has(identity);
    })
    .filter((term) => {
      if (defaultSet.has(wordCloudTermIdentity(term))) {
        return false;
      }
      return true;
    });

  const mergedDefaultTerms = normalizeWordCloudTermArray(
    [...parsedDefaultTerms, ...fallbackTerms],
    sourceFrequencyByTerm,
    new Set(Array.isArray(fallbackRaw.excludedTerms) ? fallbackRaw.excludedTerms : [])
  );
  const mergedOtherTerms = normalizeWordCloudTermArray(
    [...mergedOtherSeed, ...sourceTerms.filter((term) => lowQualitySet.has(wordCloudTermIdentity(term)))],
    sourceFrequencyByTerm,
    new Set()
  );
  const finalWordBags = ensureCloudCardByLabel(
    ensureCloudCardByLabel(parsedWordBags, "默认", mergedDefaultTerms),
    "其它",
    mergedOtherTerms
  );
  const finalAssigned = collectWordCloudAssignedTermIds(finalWordBags);
  const unassignedTerms = normalizeWordCloudTermArray(sourceTerms, sourceFrequencyByTerm, finalAssigned);

  return {
    title: String(parsed?.title || "").trim() || "语料词云",
    wordBags: finalWordBags,
    modelParsed: {
      parsedKnownCount: assignedIdentities.size,
      modelWordBagCount: parsedWordBags.length,
      modelDefaultCount: mergedDefaultTerms.length,
      modelOtherCount: mergedOtherTerms.length,
      defaultCount: mergedDefaultTerms.length,
      otherCount: mergedOtherTerms.length
    },
    unassignedTerms,
    knownIdentities,
    sourceTermCount: sourceTerms.length,
    sourceFrequencyByTerm
  };
}

function buildWordCloudFallbackResult(fullTerms = [], preprocess = null) {
  const sourceTermList = Array.isArray(fullTerms) ? fullTerms : [];
  const sourceFrequencyByTerm = buildWordCloudTermFrequencyMap(sourceTermList);
  const sourceTerms = sourceTermList
    .map((term) => normalizeWordCloudTermForAgent(term, sourceFrequencyByTerm))
    .filter((term) => term && term.term);
  const lowQualityTermSet = new Set(
    sourceTerms
      .filter((term) => String(term?.quality || "normal").toLowerCase() === "low")
      .map((term) => wordCloudTermIdentity(term))
      .filter(Boolean)
  );
  const fallbackKnownLowTerms = normalizeWordCloudTermArray(
    Array.isArray(preprocess?.lowQualityTerms) ? preprocess.lowQualityTerms : [],
    sourceFrequencyByTerm,
    lowQualityTermSet
  );
  const otherTerms = normalizeWordCloudTermArray(
    sourceTerms.filter((term) => lowQualityTermSet.has(wordCloudTermIdentity(term))),
    sourceFrequencyByTerm,
    new Set()
  );
  const mergedOtherTerms = normalizeWordCloudTermArray(
    [...otherTerms, ...fallbackKnownLowTerms],
    sourceFrequencyByTerm,
    new Set()
  );
  const defaultTerms = normalizeWordCloudTermArray(
    sourceTerms.filter((term) => !lowQualityTermSet.has(wordCloudTermIdentity(term))),
    sourceFrequencyByTerm,
    new Set(mergedOtherTerms.map((item) => wordCloudTermIdentity(item)))
  );

  const fallback = normalizeWordCloudWordBagsFromAgent([], sourceFrequencyByTerm);
  const finalWordBags = ensureCloudCardByLabel(
    ensureCloudCardByLabel(fallback, "默认", defaultTerms),
    "其它",
    mergedOtherTerms
  );
  const finalAssigned = collectWordCloudAssignedTermIds(finalWordBags);
  const fallbackUnassignedTerms = normalizeWordCloudTermArray(sourceTerms, sourceFrequencyByTerm, finalAssigned);

  return {
    title: "语料词云",
    wordBags: finalWordBags,
    modelParsed: {
      parsedKnownCount: 0,
      modelWordBagCount: 0,
      modelDefaultCount: defaultTerms.length,
      modelOtherCount: mergedOtherTerms.length,
      defaultCount: defaultTerms.length,
      otherCount: mergedOtherTerms.length,
      fallbackMode: true
    },
    unassignedTerms: fallbackUnassignedTerms,
    knownIdentities: new Set(defaultTerms.map((item) => wordCloudTermIdentity(item)).concat(mergedOtherTerms.map((item) => wordCloudTermIdentity(item))).filter(Boolean)),
    sourceTermCount: sourceTerms.length,
    sourceFrequencyByTerm
  };
}

function collectWordCloudAssignedTermIds(wordBags = [], target = new Set()) {
  for (const cloud of Array.isArray(wordBags) ? wordBags : []) {
    for (const term of Array.isArray(cloud?.terms) ? cloud.terms : []) {
      const identity = wordCloudTermIdentity(term);
      if (identity) {
        target.add(identity);
      }
    }
    collectWordCloudAssignedTermIds(cloud?.children || cloud?.subgroups || cloud?.groups || [], target);
  }
  return target;
}

function wordCloudQueueInput(run = {}, patch = {}) {
  return {
    kind: "knowledge_word_cloud",
    ownerId: run.runId,
    queueId: run.queueId,
    label: "词云分类后台任务",
    source: "knowledge-word-cloud",
    phase: patch.phase || run.status || "queued",
    status: patch.status || run.status || "queued",
    checkpointId: run.checkpointId || "",
    metadata: {
      featureId: "knowledge-word-cloud",
      modelAlias: run.modelAlias || "",
      termCount: run.termCount || 0,
      promptHash: run.promptHash || "",
      ...(patch.metadata || {})
    }
  };
}

async function queueMonitorStarted(queueMonitor, input) {
  if (typeof queueMonitor?.registerStarted === "function") {
    return queueMonitor.registerStarted(input);
  }
  return null;
}

async function queueMonitorHeartbeat(queueMonitor, input) {
  if (typeof queueMonitor?.registerHeartbeat === "function") {
    return queueMonitor.registerHeartbeat(input);
  }
  return null;
}

async function queueMonitorClosed(queueMonitor, input) {
  if (typeof queueMonitor?.registerClosed === "function") {
    return queueMonitor.registerClosed(input);
  }
  return null;
}

async function runWordCloudClassificationTask({
  userDataPath,
  metadataStore,
  protocolEventBus,
  contextRuntime,
  clientRuntimeAllocator,
  queueMonitor,
  run,
  terms,
  prompt,
  modelAlias,
  preprocess,
  agentRuntimeProvider
}) {
  const preprocessing = preprocess && typeof preprocess === "object" ? preprocess : null;
  const sourceTerms = Array.isArray(terms) ? terms : [];
  const modelTerms = Array.isArray(preprocessing?.agentTerms) && preprocessing.agentTerms.length > 0
    ? preprocessing.agentTerms
    : sourceTerms;
  try {
    await queueMonitorHeartbeat(queueMonitor, wordCloudQueueInput(run, {
      phase: "model_call",
      status: "running"
    }));
    if (!agentRuntimeProvider || typeof agentRuntimeProvider.callGatewayWithRuntimeSettings !== "function") {
      throw new Error("Agent runtime provider is not configured.");
    }
    const gatewayResult = await agentRuntimeProvider.callGatewayWithRuntimeSettings({
      userDataPath,
      contextRuntime,
      clientRuntimeAllocator,
      contextCompactionSource: "knowledge-word-cloud",
      input: {
        modelAlias,
        moduleId: "knowledge",
        featureId: "knowledge-word-cloud",
        taskId: "knowledge.word_clouds.propose",
        question: buildWordCloudAgentPrompt({
          terms: modelTerms,
          prompt
        }),
        parameters: {
          response_format: { type: "json_object" },
          temperature: 0.2,
          max_tokens: 3200
        }
      }
    });
    await queueMonitorHeartbeat(queueMonitor, wordCloudQueueInput(run, {
      phase: "persist_result",
      status: "running"
    }));
    const parsed = extractJsonObjectFromText(gatewayResult.answer || gatewayResult.text || "");
    if (!parsed || typeof parsed !== "object") {
      throw new Error("智能体没有返回可解析的词云 JSON。");
    }
    const parsedResult = buildWordCloudFromAgentResponse({
      parsed,
      fullTerms: sourceTerms,
      fallbackRaw: preprocessing
    });
    const saved = await metadataStore.saveKnowledgeWordCloudSet({
      limit: sourceTerms.length || 1,
      wordBagSet: {
        wordBagSetId: run.wordBagSetId,
        title: parsedResult.title || "语料词云",
        status: "completed",
        wordBagCount: parsedResult.wordBags.length,
        termsSnapshot: sourceTerms,
        wordBags: parsedResult.wordBags,
        unassignedTerms: parsedResult.unassignedTerms || [],
        modelAlias,
        agentResponse: {
          run: {
          ...run,
          status: "completed",
          completedAt: new Date().toISOString()
          },
          preprocess: preprocessing,
          parsedModel: {
            fallbackMode: false,
            sourceTermsCount: sourceTerms.length,
            modelTermsCount: modelTerms.length
          },
          parsed,
          upstream: gatewayResult.upstream || null,
          answer: gatewayResult.answer || gatewayResult.text || ""
        }
      }
    });
    await queueMonitorClosed(queueMonitor, wordCloudQueueInput(
      { ...run, status: "completed" },
      {
        phase: "closed",
        status: "completed",
        metadata: { wordBagSetId: saved.wordBagSet?.wordBagSetId || run.wordBagSetId }
      }
    ));
    await publishProtocolEvent(
      protocolEventBus,
      "knowledge.word_clouds",
      saved,
      { type: "knowledge.word_clouds.proposed" }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error || "词云分类任务失败。");
    const fallback = sourceTerms.length > 0
      ? buildWordCloudFallbackResult(sourceTerms, preprocessing)
      : null;
    if (fallback) {
      const fallbackSaved = await metadataStore.saveKnowledgeWordCloudSet({
        limit: sourceTerms.length || 1,
        wordBagSet: {
          wordBagSetId: run.wordBagSetId,
          title: fallback.title || "语料词云",
          status: "completed",
          wordBagCount: fallback.wordBags.length,
          termsSnapshot: sourceTerms,
          wordBags: fallback.wordBags,
          unassignedTerms: fallback.unassignedTerms || sourceTerms,
          modelAlias,
          agentResponse: {
            run: {
            ...run,
            status: "completed",
            completedAt: new Date().toISOString()
            },
            preprocess: preprocessing,
            parsed: {
              fallback: true,
              wordBags: fallback.wordBags,
              modelParsed: fallback.modelParsed,
              errorMessage
            },
            fallback: true,
            fallbackReason: errorMessage,
            parsedModel: {
              fallbackMode: true,
              sourceTermsCount: sourceTerms.length,
              modelTermsCount: modelTerms.length,
              parsedKnownCount: fallback.modelParsed?.parsedKnownCount || 0
            }
          }
        }
      });
      await queueMonitorClosed(queueMonitor, wordCloudQueueInput(
        { ...run, status: "completed" },
        {
          phase: "closed",
          status: "completed",
          metadata: {
            wordBagSetId: fallbackSaved.wordBagSet?.wordBagSetId || run.wordBagSetId,
            degraded: true,
            fallbackReason: errorMessage
          }
        }
      ));
      await publishProtocolEvent(
        protocolEventBus,
        "knowledge.word_clouds",
        fallbackSaved,
        { type: "knowledge.word_clouds.proposed" }
      );
      return;
    }
    const failed = await metadataStore.saveKnowledgeWordCloudSet({
      limit: sourceTerms.length || 1,
      wordBagSet: {
        wordBagSetId: run.wordBagSetId,
        title: "语料词云",
        status: "failed",
        wordBagCount: 0,
        termsSnapshot: sourceTerms,
        wordBags: [],
        unassignedTerms: sourceTerms,
        modelAlias,
        agentResponse: {
          run: {
          ...run,
          status: "failed",
          failedAt: new Date().toISOString()
          },
          preprocess: preprocessing,
          fallback: false,
          parsedModel: {
            fallbackMode: false,
            sourceTermsCount: sourceTerms.length,
            modelTermsCount: modelTerms.length
          },
          error: errorMessage
        }
      }
    });
    await queueMonitorClosed(queueMonitor, wordCloudQueueInput(
      { ...run, status: "failed" },
      {
        phase: "closed",
        status: "failed",
        metadata: { error: errorMessage }
      }
    ));
    await publishProtocolEvent(
      protocolEventBus,
      "knowledge.word_clouds",
      failed,
      { type: "knowledge.word_clouds.failed" }
    );
  }
}

async function resumeWordCloudClassificationTasks({
  userDataPath,
  metadataStore,
  protocolEventBus,
  contextRuntime,
  clientRuntimeAllocator,
  queueMonitor,
  agentRuntimeProvider
}) {
  const state = await metadataStore.getKnowledgeWordCloudState({
    limit: 100000,
    setLimit: 100
  });
  const pendingSets = (state.wordBagSets || []).filter((wordBagSet) =>
    ["queued", "running"].includes(String(wordBagSet?.status || ""))
  );
  for (const wordBagSet of pendingSets) {
    const run = wordBagSet.agentResponse?.run;
    const prompt = String(run?.prompt || "").trim();
    const modelAlias = String(run?.modelAlias || wordBagSet.modelAlias || "").trim();
    if (!run?.runId || !prompt || !modelAlias) {
      continue;
    }
    const preprocess = wordBagSet.agentResponse?.preprocess && typeof wordBagSet.agentResponse.preprocess === "object"
      ? wordBagSet.agentResponse.preprocess
      : null;
    const terms = wordBagSet.termsSnapshot?.length
      ? wordBagSet.termsSnapshot
      : metadataStore.listSourceCorpusRawTerms({ limit: 100000, minFrequency: 1 });
    await queueMonitorHeartbeat(queueMonitor, wordCloudQueueInput(
      { ...run, status: "running", termCount: terms.length },
      {
        phase: "resume",
        status: "running",
        metadata: { resumed: true }
      }
    ));
    setImmediate(() => {
      void runWordCloudClassificationTask({
        userDataPath,
        metadataStore,
        protocolEventBus,
        contextRuntime,
        clientRuntimeAllocator,
        queueMonitor,
        run: { ...run, status: "running", termCount: terms.length },
        terms,
        prompt,
        modelAlias,
        preprocess,
        agentRuntimeProvider
      });
    });
  }
}

function requireMetadataStore(context = {}) {
  const metadataStore = context.metadataStore;
  if (!metadataStore) {
    return { error: result(503, { ok: false, error: "元数据存储不可用。" }) };
  }
  return { metadataStore };
}

async function loadWordCloudRules(context = {}) {
  if (typeof context.loadEmailRules === "function") {
    return context.loadEmailRules(context.userDataPath);
  }
  return {};
}

function appendConsoleOperationLog(context = {}, entry = {}) {
  if (typeof context.appendConsoleOperationLog === "function") {
    context.appendConsoleOperationLog(entry);
  }
}

export async function executeKnowledgeWordCloudOperation({ operationId, input = {}, context = {} } = {}) {
  const id = String(operationId || "");
  const handledOperations = new Set([
    "knowledge.word_clouds.get",
    "knowledge.word_clouds.save",
    "knowledge.word_clouds.export",
    "knowledge.word_clouds.import",
    "knowledge.word_clouds.propose",
    "knowledge.word_bags.terms",
    "knowledge.word_bags.add",
    "knowledge.word_bags.update",
    "knowledge.word_bags.delete"
  ]);
  if (!handledOperations.has(id)) {
    return null;
  }

  const { metadataStore, error } = requireMetadataStore(context);
  if (error) {
    return error;
  }
  input = normalizeWordCloudOperationInput(input);

  if (id === "knowledge.word_clouds.get") {
    return result(200, await metadataStore.getKnowledgeWordCloudState({
      ...input,
      rules: await loadWordCloudRules(context)
    }));
  }

  if (id === "knowledge.word_bags.terms") {
    try {
      return result(200, await metadataStore.getKnowledgeWordBagTerms(input));
    } catch (operationError) {
      return mutationErrorResult(operationError);
    }
  }

  if (id === "knowledge.word_clouds.save") {
    const saved = await metadataStore.saveKnowledgeWordCloudSet({
      ...input,
      rules: await loadWordCloudRules(context)
    });
    const rawAuditAction = String(input.auditAction || "").trim();
    const auditAction = ["add", "remove", "clear", "save"].includes(rawAuditAction)
      ? rawAuditAction
      : rawAuditAction
        ? "save"
        : "";
    const auditPaths = normalizeAuditCorpusPaths(input.auditPaths || []);
    if (auditAction) {
      const corpusPaths = normalizeAuditCorpusPaths(saved.wordBagSet?.corpusPaths || []);
      appendConsoleOperationLog(context, {
        operationId: "knowledge.word_clouds.corpus_paths." + auditAction,
        event: "knowledge.word_clouds.corpus_paths.changed",
        authSession: context.authSession,
        status: "ok",
        risk: "content_write",
        input: {
          action: auditAction,
          wordBagSetId: saved.wordBagSet?.wordBagSetId || input.wordBagSet?.wordBagSetId || "",
          title: saved.wordBagSet?.title || input.wordBagSet?.title || "",
          changedPathCount: auditPaths.length,
          changedPaths: auditPaths,
          corpusPathCount: corpusPaths.length,
          corpusPathTypes: [...new Set(corpusPaths.map((item) => item.type || "unknown"))]
        },
        output: {
          ok: true,
          wordBagSetId: saved.wordBagSet?.wordBagSetId || "",
          corpusPathCount: corpusPaths.length
        }
      });
    }
    await publishProtocolEvent(
      context.protocolEventBus,
      "knowledge.word_clouds",
      saved,
      { type: "knowledge.word_clouds.updated" }
    );
    return result(200, saved);
  }

  if (id === "knowledge.word_clouds.export") {
    try {
      return result(200, await metadataStore.exportKnowledgeWordCloudSet(input));
    } catch (operationError) {
      return mutationErrorResult(operationError);
    }
  }

  if (id === "knowledge.word_clouds.import") {
    try {
      const imported = await metadataStore.importKnowledgeWordCloudSet(input);
      await publishProtocolEvent(
        context.protocolEventBus,
        "knowledge.word_clouds",
        imported,
        { type: "knowledge.word_clouds.imported" }
      );
      return result(201, imported);
    } catch (operationError) {
      return mutationErrorResult(operationError);
    }
  }

  if (id === "knowledge.word_bags.add") {
    try {
      const added = await metadataStore.addKnowledgeWordBag(input);
      await publishProtocolEvent(
        context.protocolEventBus,
        "knowledge.word_clouds",
        added,
        { type: "knowledge.word_clouds.word_bag.added" }
      );
      return result(201, added);
    } catch (operationError) {
      return mutationErrorResult(operationError);
    }
  }

  if (id === "knowledge.word_bags.update") {
    try {
      const updated = await metadataStore.updateKnowledgeWordBag(input);
      await publishProtocolEvent(
        context.protocolEventBus,
        "knowledge.word_clouds",
        updated,
        { type: "knowledge.word_clouds.word_bag.updated" }
      );
      return result(200, updated);
    } catch (operationError) {
      return mutationErrorResult(operationError);
    }
  }

  if (id === "knowledge.word_bags.delete") {
    try {
      const deleted = await metadataStore.deleteKnowledgeWordBag(input);
      await publishProtocolEvent(
        context.protocolEventBus,
        "knowledge.word_clouds",
        deleted,
        { type: "knowledge.word_clouds.word_bag.deleted" }
      );
      return result(200, deleted);
    } catch (operationError) {
      return mutationErrorResult(operationError);
    }
  }

  if (id === "knowledge.word_clouds.propose") {
    const payload = input || {};
    const modelAlias = String(payload.modelAlias || "").trim();
    if (!modelAlias) {
      return result(400, {
        ok: false,
        error: "请选择用于生成词云的智能体。"
      });
    }
    const prompt = String(payload.prompt || payload.message || "").trim();
    if (!prompt) {
      return result(400, {
        ok: false,
        error: "请输入词云分组意图。"
      });
    }

    const corpusPaths = payload.corpusPaths || payload.corpusPath || [];
    const rules = await loadWordCloudRules(context);
    const minFrequency = clampRequestInteger(payload.minFrequency, 1, 1, 1000000000);
    const candidateLimit = clampRequestInteger(payload.limit, 300, 20, 120000);
    const modelTermLimit = clampRequestInteger(payload.modelTermLimit, 1800, 20, 120000);
    let terms = metadataStore.listSourceCorpusRawTerms({
      limit: 100000,
      minFrequency,
      corpusPaths,
      rules
    });
    let rebuiltVocabulary = false;
    if (terms.length === 0 && Array.isArray(corpusPaths) && corpusPaths.length > 0) {
      const rebuildResult = metadataStore.rebuildSourceVocabulary({ rules });
      rebuiltVocabulary = true;
      terms = metadataStore.listSourceCorpusRawTerms({
        limit: 100000,
        minFrequency,
        corpusPaths,
        rules
      });
      appendConsoleOperationLog(context, {
        operationId: "knowledge.word_clouds.propose_scope_rebuild",
        event: "knowledge.word_clouds.scope_rebuild",
        authSession: context.authSession,
        status: "ok",
        risk: "repair_write",
        input: {
          modelAlias,
          promptLength: prompt.length,
          corpusPathCount: Array.isArray(corpusPaths) ? corpusPaths.length : 1,
          scopeProvided: true,
          corpusPaths,
          rebuiltTermCount: rebuildResult?.sourceCorpusRawTermCount || 0
        },
        output: {
          ok: true,
          rebuiltCorpus: true,
          rebuiltCount: Number(rebuildResult?.sourceCorpusRawTermCount || 0)
        }
      });
    }
    if (terms.length === 0) {
      return result(409, {
        ok: false,
        error: rebuiltVocabulary
          ? "语料词频表已刷新，但这些语料范围还无话解析到可用文档。"
          : "语料词频表为空，请先完成文档入库并重建语料词频。"
      });
    }

    const preprocessWordCloudVocabulary = typeof context.preprocessWordCloudVocabulary === "function"
      ? context.preprocessWordCloudVocabulary
      : defaultPreprocessWordCloudVocabulary;
    const preprocessed = preprocessWordCloudVocabulary({
      prompt,
      rawTerms: terms,
      termStats: metadataStore.listSourceVocabularyTermStats({
        terms: terms.map((term) => term.term)
      }),
      limit: candidateLimit,
      modelTermLimit,
      minFrequency
    });
    const preprocessPayload = {
      ok: preprocessed.ok !== false,
      intentTerms: preprocessed.intentTerms || [],
      targetTerms: (preprocessed.targetTerms || []).map((term) => ({
        term: String(term.term || "").trim(),
        frequency: Number(term.frequency || 0),
        intentScore: Number(term.intentScore || 0),
        weight: Number(term.weight || 0)
      })),
      lowQualityTerms: (preprocessed.lowQualityTerms || []).map((term) => ({
        term: String(term.term || "").trim(),
        frequency: Number(term.frequency || 0),
        intentScore: Number(term.intentScore || 0),
        weight: Number(term.weight || 0)
      })),
      summary: preprocessed.summary || {},
      modelTermCount: Array.isArray(preprocessed.agentTerms)
        ? preprocessed.agentTerms.length
        : 0,
      allTermCount: Array.isArray(preprocessed.allTerms) ? preprocessed.allTerms.length : 0
    };
    const now = new Date().toISOString();
    const runId = serverToken("knowledge_word_cloud_run", modelAlias, prompt, now);
    const queueId = serverToken("queue_item", "knowledge_word_cloud", runId);
    const wordBagSetId = serverToken("knowledge_word_cloud_set", runId);
    const candidateTerms = preprocessed.allTerms || [];
    const modelInputTerms = preprocessed.agentTerms || candidateTerms;
    const run = {
      runId,
      queueId,
      wordBagSetId,
      status: "queued",
      modelAlias,
      prompt,
      termCount: candidateTerms.length,
      sourceTermCount: terms.length,
      modelTermCount: modelInputTerms.length,
      preprocess: preprocessPayload,
      promptHash: prompt ? hashClientString(prompt, "knowledge.word_cloud.prompt") : "",
      startedAt: now
    };
    const queued = await metadataStore.saveKnowledgeWordCloudSet({
      limit: candidateTerms.length || 1,
      wordBagSet: {
        wordBagSetId,
        title: payload.title || "语料词云",
        status: "queued",
        wordBagCount: 0,
        termsSnapshot: candidateTerms,
        wordBags: [],
        unassignedTerms: candidateTerms,
        corpusPaths: payload.corpusPaths || payload.corpusPath || [],
        modelAlias,
        agentResponse: {
          run,
          preprocess: preprocessed
        }
      }
    });
    await queueMonitorStarted(context.queueMonitor, wordCloudQueueInput(run, {
      phase: "queued",
      status: "queued"
    }));
    await publishProtocolEvent(
      context.protocolEventBus,
      "knowledge.word_clouds",
      queued,
      { type: "knowledge.word_clouds.queued" }
    );
    setImmediate(() => {
      void runWordCloudClassificationTask({
        userDataPath: context.userDataPath,
        metadataStore,
        protocolEventBus: context.protocolEventBus,
        contextRuntime: context.contextRuntime,
        clientRuntimeAllocator: context.clientRuntimeAllocator,
        queueMonitor: context.queueMonitor,
        run: { ...run, status: "running" },
        terms: modelInputTerms,
        prompt,
        modelAlias,
        preprocess: preprocessed,
        agentRuntimeProvider: context.agentRuntimeProvider
      });
    });
    return result(202, {
      ok: true,
      terms: candidateTerms,
      preprocess: preprocessPayload,
      run,
      wordBagSet: queued.wordBagSet
    });
  }

  return null;
}

export async function resumeKnowledgeWordCloudClassificationTasks(options = {}) {
  return resumeWordCloudClassificationTasks(options);
}
