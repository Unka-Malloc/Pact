function extractJson(text) {
  const trimmed = text.trim();

  try {
    return JSON.parse(trimmed);
  } catch {
    const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fencedMatch) {
      return JSON.parse(fencedMatch[1].trim());
    }

    const firstBrace = trimmed.indexOf("{");
    const lastBrace = trimmed.lastIndexOf("}");

    if (firstBrace >= 0 && lastBrace > firstBrace) {
      return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1));
    }

    throw new Error("模型返回的内容不是有效 JSON。");
  }
}

function normalizeTimestamp(value, fallback) {
  if (!value) {
    return fallback;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return fallback;
  }

  return parsed.toISOString();
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item) => String(item).trim()).filter(Boolean);
}

function extractAssistantText(responseBody) {
  const content = responseBody?.choices?.[0]?.message?.content;

  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") {
          return part;
        }

        if (part?.type === "text") {
          return part.text || "";
        }

        return "";
      })
      .join("\n");
  }

  throw new Error("没有从云端智能体拿到可解析的回复。");
}

function buildChunkContent(chunks) {
  return chunks.map((chunk) =>
    [
      `Chunk ID: ${chunk.id}`,
      `Source: ${chunk.sourceName}`,
      `Title Path: ${chunk.titlePath.join(" > ") || "无"}`,
      `Chunk Type: ${chunk.chunkType}`,
      `Token Count: ${chunk.tokenCount}`,
      "Content:",
      chunk.content
    ].join("\n")
  );
}

function buildDocumentSeedContent(documents) {
  return documents.map((document) =>
    [
      `Document ID: ${document.id}`,
      `Title: ${document.title}`,
      `Source: ${document.source}`,
      `Chunk IDs: ${document.chunkIds?.join(", ") || "无"}`,
      `Tags: ${document.tags.join(", ") || "无"}`,
      "Content:",
      document.content
    ].join("\n")
  );
}

function buildUserContent({ sources, chunks, documents, generatedAt }) {
  const content = [
    {
      type: "text",
      text: [
        `统一时间戳：${generatedAt}`,
        `规则切分器已生成 ${chunks.length} 个 chunks 和 ${documents.length} 个基础知识文档。`,
        "请基于这些 chunks 和基础文档生成最终输出。",
        "不要跨不相关 chunks 合并内容；如果基础文档已经合理，可以直接沿用。",
        "所有输出的 timestamp 都必须直接使用上面的统一时间戳。"
      ].join("\n")
    }
  ];

  if (chunks.length > 0) {
    content.push({
      type: "text",
      text: `以下是规则切分后的 chunks：\n\n${buildChunkContent(chunks).join("\n\n---\n\n")}`
    });
  } else {
    const rawSourceText = sources
      .filter((source) => source.text)
      .map((source) => `来源：${source.name}\n内容开始\n${source.text}\n内容结束`)
      .join("\n\n---\n\n");

    if (rawSourceText) {
      content.push({
        type: "text",
        text: `未能形成稳定 chunks，以下是原始文本内容：\n\n${rawSourceText}`
      });
    }
  }

  if (documents.length > 0) {
    content.push({
      type: "text",
      text: `以下是本地规则生成的基础知识文档：\n\n${buildDocumentSeedContent(documents).join(
        "\n\n---\n\n"
      )}`
    });
  }

  for (const source of sources) {
    if (source.kind !== "image") {
      continue;
    }

    content.push({
      type: "text",
      text: `来源：${source.name}\n以下是需要纳入理解的图片。`
    });
    content.push({
      type: "image_url",
      image_url: {
        url: source.imageDataUrl
      }
    });
  }

  return content;
}

function buildDocumentFallbackMap(documents) {
  const byChunkId = new Map();

  for (const document of documents) {
    for (const chunkId of document.chunkIds || []) {
      if (!byChunkId.has(chunkId)) {
        byChunkId.set(chunkId, document);
      }
    }
  }

  return byChunkId;
}

function normalizeDocuments(rawDocuments, fallbackDocuments, fallbackTimestamp) {
  const fallbackByChunkId = buildDocumentFallbackMap(fallbackDocuments);
  const normalized = (Array.isArray(rawDocuments) ? rawDocuments : [])
    .filter((item) => item && (item.title || item.content))
    .map((item, index) => {
      const chunkIds = normalizeStringArray(item.chunkIds);
      const fallbackDocument =
        chunkIds
          .map((chunkId) => fallbackByChunkId.get(chunkId))
          .find(Boolean) || fallbackDocuments[index];

      return {
        id: fallbackDocument?.id || `doc-${index + 1}`,
        title: item.title?.trim() || fallbackDocument?.title || `知识单元 ${index + 1}`,
        source: item.source?.trim() || fallbackDocument?.source || "未标注来源",
        content: item.content?.trim() || fallbackDocument?.content || "",
        tags:
          normalizeStringArray(item.tags).length > 0
            ? normalizeStringArray(item.tags)
            : fallbackDocument?.tags || [],
        chunkIds: chunkIds.length > 0 ? chunkIds : fallbackDocument?.chunkIds || [],
        timestamp: normalizeTimestamp(item.timestamp, fallbackTimestamp)
      };
    });

  if (normalized.length > 0) {
    return normalized;
  }

  return fallbackDocuments.map((document) => ({
    ...document,
    timestamp: normalizeTimestamp(document.timestamp, fallbackTimestamp)
  }));
}

function normalizeQaPairs(rawPairs, fallbackDocuments, fallbackTimestamp) {
  const fallbackTitles = new Set(fallbackDocuments.map((document) => document.title));

  return (Array.isArray(rawPairs) ? rawPairs : [])
    .filter((item) => item && (item.question || item.answer))
    .map((item, index) => ({
      id: `qa-${index + 1}`,
      question: item.question?.trim() || `模拟问题 ${index + 1}`,
      answer: item.answer?.trim() || "",
      source: item.source?.trim() || "未标注来源",
      documentTitles: normalizeStringArray(item.documentTitles).filter((title) =>
        fallbackTitles.size === 0 ? true : fallbackTitles.has(title)
      ),
      chunkIds: normalizeStringArray(item.chunkIds),
      timestamp: normalizeTimestamp(item.timestamp, fallbackTimestamp)
    }));
}

function getChatCompletionsUrl(apiBaseUrl) {
  const normalized = apiBaseUrl.trim().replace(/\/+$/, "");
  return normalized.endsWith("/chat/completions")
    ? normalized
    : `${normalized}/chat/completions`;
}

export async function runAgent({
  sources,
  chunks,
  documents,
  settings,
  generatedAt
}) {
  if (!settings.apiKey.trim()) {
    throw new Error("请先配置云端智能体 API Key。");
  }

  if (!settings.apiBaseUrl.trim()) {
    throw new Error("请先配置云端智能体 API Base URL。");
  }

  if (!settings.model.trim()) {
    throw new Error("请先配置模型名称。");
  }

  const response = await fetch(getChatCompletionsUrl(settings.apiBaseUrl), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${settings.apiKey.trim()}`
    },
    body: JSON.stringify({
      model: settings.model.trim(),
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content: settings.systemPrompt.trim()
        },
        {
          role: "user",
          content: buildUserContent({
            sources,
            chunks,
            documents,
            generatedAt
          })
        }
      ]
    })
  });

  if (!response.ok) {
    const failureText = await response.text();
    throw new Error(`云端智能体调用失败：${response.status} ${failureText}`);
  }

  const responseBody = await response.json();
  const assistantText = extractAssistantText(responseBody);
  const parsed = extractJson(assistantText);

  return {
    documents: normalizeDocuments(parsed.documents, documents, generatedAt),
    qaPairs: normalizeQaPairs(parsed.qaPairs, documents, generatedAt)
  };
}
