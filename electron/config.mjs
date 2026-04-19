import fs from "node:fs/promises";
import path from "node:path";

export const LEGACY_SYSTEM_PROMPT = `
你是一个知识切分智能体。你需要把输入材料切成“最小可分割单元”的知识文档，并生成模拟问答对。

输出要求：
1. 只输出 JSON，不要输出解释、Markdown、代码块。
2. 严格遵循这个结构：
{
  "documents": [
    {
      "title": "知识单元标题",
      "source": "来源文件名或“粘贴文本”",
      "content": "单一知识点正文",
      "tags": ["标签1", "标签2"],
      "timestamp": "ISO-8601 时间戳"
    }
  ],
  "qaPairs": [
    {
      "question": "问题",
      "answer": "答案",
      "source": "来源文件名或“粘贴文本”",
      "documentTitles": ["相关知识单元标题"],
      "timestamp": "ISO-8601 时间戳"
    }
  ]
}
3. 必须尽量细颗粒度切分，但每个知识单元仍需自洽，可单独复用。
4. 只能依据输入内容作答，不得虚构事实。
5. 所有 documents 和 qaPairs 都必须带 timestamp。
6. 当输入包含图片时，允许基于图中可直接观察到的内容补充描述，但不要臆测未出现的信息。
`.trim();

export const DEFAULT_SYSTEM_PROMPT = `
你是一个知识整理智能体。输入材料已经先经过规则切分器，形成了带 chunkId 的稳定知识块。

你的职责：
1. 基于已有 chunks 生成高质量知识文档与模拟问答对。
2. 不要跨不相关 chunks 合并内容。
3. 不要改写事实，不要补充输入中不存在的信息。

输出要求：
1. 只输出 JSON，不要输出解释、Markdown、代码块。
2. 严格遵循这个结构：
{
  "documents": [
    {
      "title": "知识单元标题",
      "source": "来源文件名或“粘贴文本”",
      "content": "知识单元正文",
      "tags": ["标签1", "标签2"],
      "chunkIds": ["source::chunk-1"],
      "timestamp": "ISO-8601 时间戳"
    }
  ],
  "qaPairs": [
    {
      "question": "问题",
      "answer": "答案",
      "source": "来源文件名或“粘贴文本”",
      "documentTitles": ["相关知识单元标题"],
      "chunkIds": ["source::chunk-1"],
      "timestamp": "ISO-8601 时间戳"
    }
  ]
}
3. 允许在同一个 chunk 内细分多个知识文档，但不要跨 chunk 任意拼接。
4. 所有 documents 和 qaPairs 都必须带 timestamp，并使用提供的统一时间戳。
5. 当输入包含图片时，只能基于图中可直接观察到的内容补充描述，不要臆测。
`.trim();

export const DEFAULT_SETTINGS = {
  apiBaseUrl: process.env.SPLITALL_API_BASE_URL || "https://api.openai.com/v1",
  apiKey: "",
  model: process.env.SPLITALL_MODEL || "gpt-4.1-mini",
  systemPrompt: DEFAULT_SYSTEM_PROMPT,
  tikaJarPath: process.env.SPLITALL_TIKA_JAR_PATH || "",
  javaBinPath: process.env.SPLITALL_JAVA_BIN_PATH || "",
  ocrEnabled:
    process.env.SPLITALL_OCR_ENABLED === undefined
      ? true
      : process.env.SPLITALL_OCR_ENABLED !== "0",
  ocrPythonPath: process.env.SPLITALL_OCR_PYTHON_PATH || "",
  ocrLanguage: process.env.SPLITALL_PADDLEOCR_LANG || "ch",
  qianxinBrowserPath: process.env.SPLITALL_QAX_BROWSER_PATH || "",
  qianxinBrowserArgs:
    process.env.SPLITALL_QAX_BROWSER_ARGS ||
    (process.platform === "linux" ? "--no-sandbox" : "")
};

function getSettingsPath(userDataPath) {
  return path.join(userDataPath, "settings.json");
}

export async function loadSettings(userDataPath) {
  const settingsPath = getSettingsPath(userDataPath);

  try {
    const content = await fs.readFile(settingsPath, "utf8");
    const parsed = JSON.parse(content);
    const migratedPrompt =
      !parsed.systemPrompt || parsed.systemPrompt === LEGACY_SYSTEM_PROMPT
        ? DEFAULT_SYSTEM_PROMPT
        : parsed.systemPrompt;

    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      systemPrompt: migratedPrompt
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function saveSettings(userDataPath, incomingSettings) {
  const settingsPath = getSettingsPath(userDataPath);
  const current = await loadSettings(userDataPath);
  const merged = {
    ...current,
    ...incomingSettings
  };

  await fs.mkdir(path.dirname(settingsPath), { recursive: true });
  await fs.writeFile(settingsPath, JSON.stringify(merged, null, 2), "utf8");
  return merged;
}
