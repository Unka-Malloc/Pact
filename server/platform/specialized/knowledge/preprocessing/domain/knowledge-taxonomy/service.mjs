import { callCodexChatGptJson, getCodexOAuthStatus } from "../../../../../common/security/auth/codex-oauth-service.mjs";
import { resolveModelForModule } from "../../../../../common/platform-core/settings.mjs";
import { loadKnowledgeGuidance } from "./index.mjs";
import {
  classifyTextByKnowledgeTaxonomy,
  loadBundledKnowledgeTaxonomy,
  taxonomyPaths
} from "./default-taxonomy.mjs";

const GEMINI_API_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

function normalizeWhitespace(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function truncate(value, maxLength) {
  const normalized = normalizeWhitespace(value);
  return normalized.length <= maxLength
    ? normalized
    : `${normalized.slice(0, Math.max(1, maxLength - 1)).trimEnd()}…`;
}

function uniqueStrings(values = [], limit = 10) {
  const seen = new Set();
  const result = [];
  for (const value of values) {
    const item = normalizeWhitespace(value);
    const key = item.toLowerCase();
    if (!item || seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(item);
    if (result.length >= limit) {
      break;
    }
  }
  return result;
}

function keywordList(text, taxonomy, limit = 8) {
  const stopWords = new Set((taxonomy?.keywordStopwords || []).map((item) => item.toLowerCase()));
  const tokens = String(text || "")
    .toLowerCase()
    .match(/[\p{Letter}\p{Number}][\p{Letter}\p{Number}_+-]{1,}/gu) || [];
  return uniqueStrings(
    tokens.filter((item) => !stopWords.has(item)),
    limit
  );
}

function senderDomain(sender) {
  const match = String(sender || "").match(/[A-Z0-9._%+-]+@([A-Z0-9.-]+\.[A-Z]{2,})/i);
  return match ? match[1].toLowerCase() : "";
}

function inferEntity(document) {
  const sender = normalizeWhitespace(document.sender || "");
  const match = sender.match(/^([^<]+)</);
  if (match && match[1].trim()) {
    return match[1].trim();
  }
  const domain = senderDomain(sender);
  return domain ? domain.split(".").slice(-2, -1)[0] || domain : "";
}

function localClassify(document, provider = "local-fallback", taxonomy = loadBundledKnowledgeTaxonomy()) {
  const localKeywords = Array.isArray(document.localKeywords) ? document.localKeywords : [];
  const text = [
    document.title,
    document.sender,
    document.recipients,
    document.mailboxPath,
    document.localTaxonomyPath,
    ...localKeywords
  ]
    .join(" ")
    .toLowerCase();
  const classification = classifyTextByKnowledgeTaxonomy(text, {
    taxonomy,
    fallbackPath: document.localTaxonomyPath
  });

  return {
    id: String(document.id || document.messageKey || ""),
    messageKey: String(document.messageKey || document.id || ""),
    docId: Number(document.docId || 0),
    taxonomyPath: classification.path,
    keywords: uniqueStrings([
      ...keywordList(document.title, taxonomy, 8),
      ...localKeywords,
      ...classification.positiveHits
    ], 10),
    entity: inferEntity(document),
    intent: classification.intentLabel || inferIntent(text, taxonomy),
    confidence: classification.confidence,
    provider,
    updatedAt: new Date().toISOString()
  };
}

function inferIntent(text, taxonomy = loadBundledKnowledgeTaxonomy()) {
  const normalized = normalizeWhitespace(text).toLowerCase();
  for (const entry of taxonomy?.fallbackIntents || []) {
    if ((entry.terms || []).some((term) => normalized.includes(String(term || "").toLowerCase()))) {
      return entry.intent;
    }
  }
  return taxonomy?.defaultIntent || "";
}

function buildPrompt(documents, taxonomy = loadBundledKnowledgeTaxonomy()) {
  const compactDocuments = documents.map((document) => ({
    id: String(document.messageKey || document.id || ""),
    docId: Number(document.docId || 0),
    title: truncate(document.title, 180),
    sender: truncate(document.sender, 140),
    recipients: truncate(document.recipients, 120),
    mailboxPath: truncate(document.mailboxPath, 80),
    date: truncate(document.date, 60),
    localTaxonomyPath: truncate(document.localTaxonomyPath, 80),
    localKeywords: uniqueStrings(document.localKeywords || [], 10)
  }));
  const promptConfig = taxonomy.classifierPrompt || {};
  const promptRules = Array.isArray(promptConfig.rules) ? promptConfig.rules : [];
  const outputSchema = normalizeWhitespace(promptConfig.outputSchema);

  return [
    normalizeWhitespace(promptConfig.role),
    ...promptRules.map(normalizeWhitespace),
    outputSchema ? `JSON schema：${outputSchema}` : "",
    "",
    `候选 taxonomyPath：${taxonomyPaths(taxonomy).join("；")}`,
    taxonomy.fallbackPath ? `fallbackPath：${taxonomy.fallbackPath}` : "",
    "",
    "邮件元数据：",
    JSON.stringify(compactDocuments)
  ].join("\n");
}

function extractJsonText(rawText) {
  const normalized = String(rawText || "").trim();
  const fencedMatch = normalized.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fencedMatch) {
    return fencedMatch[1].trim();
  }
  const start = normalized.indexOf("{");
  const end = normalized.lastIndexOf("}");
  return start >= 0 && end > start ? normalized.slice(start, end + 1) : normalized;
}

async function callGeminiJson({ apiKey, model, prompt }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45000);
  try {
    const response = await fetch(
      `${GEMINI_API_BASE_URL}/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey
        },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.15,
            responseMimeType: "application/json"
          }
        }),
        signal: controller.signal
      }
    );

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload?.error?.message || `Gemini 请求失败：${response.status}`);
    }
    const text = payload?.candidates?.[0]?.content?.parts?.map((part) => part?.text || "").join("") || "";
    return JSON.parse(extractJsonText(text));
  } finally {
    clearTimeout(timer);
  }
}

function normalizeCloudItem(item, document, provider, taxonomy = loadBundledKnowledgeTaxonomy()) {
  const activePaths = taxonomyPaths(taxonomy);
  const taxonomyPath = activePaths.includes(normalizeWhitespace(item?.taxonomyPath))
    ? normalizeWhitespace(item?.taxonomyPath)
    : normalizeWhitespace(document.localTaxonomyPath) || taxonomy.fallbackPath || "";
  return {
    id: String(document.id || document.messageKey || item?.id || ""),
    messageKey: String(document.messageKey || document.id || item?.id || ""),
    docId: Number(document.docId || item?.docId || 0),
    taxonomyPath,
    keywords: uniqueStrings(item?.keywords || keywordList(document.title, taxonomy, 8), 10),
    entity: truncate(item?.entity || inferEntity(document), 80),
    intent: truncate(item?.intent || inferIntent(document.title, taxonomy), 40),
    confidence: Math.max(0, Math.min(1, Number(item?.confidence || 0.6))),
    provider,
    updatedAt: new Date().toISOString()
  };
}

export async function enhanceAffairTaxonomy({ documents = [], settings = {}, userDataPath = "" }) {
  const taxonomy = userDataPath
    ? await loadKnowledgeGuidance(userDataPath)
    : loadBundledKnowledgeTaxonomy();
  const selected = (Array.isArray(documents) ? documents : [])
    .filter((item) => item && (item.messageKey || item.id))
    .slice(0, 80);
  const moduleModel = resolveModelForModule(settings, "knowledgeTaxonomy");
  const provider = moduleModel.provider;
  const googleModel =
    provider === "google-gemini"
      ? moduleModel.model
      : String(settings.googleModel || "gemini-flash-lite-latest").trim() ||
        "gemini-flash-lite-latest";
  const openAiModel =
    provider === "openai-chatgpt"
      ? moduleModel.model
      : String(settings.openAiModel || "gpt-5.4-mini").trim() || "gpt-5.4-mini";
  const apiKey = String(settings.googleApiKey || "").trim();
  const cloudEnabled = moduleModel.enabled !== false;

  if (!cloudEnabled || selected.length === 0) {
    return {
      provider: "local-fallback",
      executed: false,
      model: "",
      warnings: cloudEnabled ? [] : ["云端语义增强未启用。"],
      items: selected.map((document) => localClassify(document, "local-fallback", taxonomy))
    };
  }

  if (provider === "openai-chatgpt") {
    const oauthStatus = await getCodexOAuthStatus();
    if (!oauthStatus.valid) {
      return {
        provider: "local-fallback",
        executed: false,
        model: openAiModel,
        warnings: [`ChatGPT OAuth 不可用：${oauthStatus.reason || "请重新验证 Codex。"}`],
        authRequired: true,
        authStatus: oauthStatus,
        items: selected.map((document) => localClassify(document, "local-fallback", taxonomy))
      };
    }

    try {
      const parsed = await callCodexChatGptJson({
        model: openAiModel,
        prompt: buildPrompt(selected, taxonomy)
      });
      const byId = new Map();
      for (const item of Array.isArray(parsed?.items) ? parsed.items : []) {
        byId.set(String(item?.id || item?.messageKey || ""), item);
      }
      return {
        provider: "openai-chatgpt",
        executed: true,
        model: openAiModel,
        warnings: [],
        items: selected.map((document) =>
          normalizeCloudItem(byId.get(String(document.messageKey || document.id || "")), document, "openai-chatgpt", taxonomy)
        )
      };
    } catch (error) {
      return {
        provider: "local-fallback",
        executed: false,
        model: openAiModel,
        warnings: [`ChatGPT 语义增强失败：${error instanceof Error ? error.message : "未知错误"}`],
        authRequired: error?.code === "CODEX_OAUTH_REQUIRED",
        items: selected.map((document) => localClassify(document, "local-after-cloud-error", taxonomy))
      };
    }
  }

  if (!apiKey) {
    return {
      provider: "local-fallback",
      executed: false,
      model: googleModel,
      warnings: ["Google Gemini API Key 未配置。"],
      items: selected.map((document) => localClassify(document, "local-fallback", taxonomy))
    };
  }

  try {
    const parsed = await callGeminiJson({
      apiKey,
      model: googleModel,
      prompt: buildPrompt(selected, taxonomy)
    });
    const byId = new Map();
    for (const item of Array.isArray(parsed?.items) ? parsed.items : []) {
      byId.set(String(item?.id || item?.messageKey || ""), item);
    }
    return {
      provider: "google-gemini",
      executed: true,
      model: googleModel,
      warnings: [],
      items: selected.map((document) =>
        normalizeCloudItem(byId.get(String(document.messageKey || document.id || "")), document, "google-gemini", taxonomy)
      )
    };
  } catch (error) {
    return {
      provider: "local-fallback",
      executed: false,
      model: googleModel,
      warnings: [`云端语义增强失败：${error instanceof Error ? error.message : "未知错误"}`],
      items: selected.map((document) => localClassify(document, "local-after-cloud-error", taxonomy))
    };
  }
}
