import {
  startTransition,
  useDeferredValue,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent as ReactDragEvent
} from "react";
import { bridge } from "./lib/bridge";
import type {
  AgentSettings,
  ExportFormat,
  KnowledgeDocument,
  QaPair,
  SplitJob,
  SplitResult,
  UploadedFilePayload
} from "./lib/types";

const EMPTY_SETTINGS: AgentSettings = {
  apiBaseUrl: "",
  apiKey: "",
  model: "",
  systemPrompt: "",
  tikaJarPath: "",
  javaBinPath: "",
  ocrEnabled: true,
  ocrPythonPath: "",
  ocrLanguage: "ch",
  qianxinBrowserPath: "",
  qianxinBrowserArgs: ""
};

const ACTIVE_JOB_STORAGE_KEY = "splitall-active-job-id";

type LocalFile = {
  id: string;
  name: string;
  path: string;
  displayPath?: string;
  file?: File;
  mediaType: string;
};

type BrowserFileWithPath = File & {
  path?: string;
  webkitRelativePath?: string;
  splitAllRelativePath?: string;
};

type BrowserFileSystemEntry = {
  isFile: boolean;
  isDirectory: boolean;
  fullPath?: string;
  name: string;
};

type BrowserFileSystemFileEntry = BrowserFileSystemEntry & {
  file: (
    successCallback: (file: File) => void,
    errorCallback?: (error: DOMException) => void
  ) => void;
};

type BrowserFileSystemDirectoryEntry = BrowserFileSystemEntry & {
  createReader: () => {
    readEntries: (
      successCallback: (entries: BrowserFileSystemEntry[]) => void,
      errorCallback?: (error: DOMException) => void
    ) => void;
  };
};

type BrowserDragItem = DataTransferItem & {
  webkitGetAsEntry?: () => BrowserFileSystemEntry | null;
};

function formatDate(value: string) {
  try {
    return new Date(value).toLocaleString("zh-CN", {
      hour12: false
    });
  } catch {
    return value;
  }
}

function fileNameFromPath(filePath: string) {
  const segments = filePath.split(/[/\\]/);
  return segments[segments.length - 1] || filePath;
}

function matchesQuery(
  query: string,
  fields: Array<string | string[] | undefined>
) {
  if (!query.trim()) {
    return true;
  }

  const normalized = query.trim().toLowerCase();
  return fields.some((field) => {
    if (Array.isArray(field)) {
      return field.some((item) => item.toLowerCase().includes(normalized));
    }

    return field?.toLowerCase().includes(normalized);
  });
}

function createBrowserFileId(file: File, filePath = "") {
  return filePath || `${file.name}-${file.lastModified}-${file.size}`;
}

function resolveBrowserFilePath(file: BrowserFileWithPath) {
  return (
    file.path ||
    file.webkitRelativePath ||
    file.splitAllRelativePath ||
    ""
  );
}

function hasFilePayload(dataTransfer?: DataTransfer | null) {
  if (!dataTransfer) {
    return false;
  }

  if (dataTransfer.files && dataTransfer.files.length > 0) {
    return true;
  }

  if (dataTransfer.items && dataTransfer.items.length > 0) {
    return Array.from(dataTransfer.items).some((item) => item.kind === "file");
  }

  return Array.from(dataTransfer.types || []).some(
    (type) => type === "Files" || type === "public.file-url"
  );
}

function extractDroppedFiles(dataTransfer?: DataTransfer | null) {
  if (!dataTransfer || !dataTransfer.files || dataTransfer.files.length === 0) {
    return [];
  }

  return Array.from(dataTransfer.files) as BrowserFileWithPath[];
}

function toRelativeEntryPath(entryPath = "") {
  return entryPath.replace(/^[/\\]+/, "");
}

function readBrowserEntryFile(entry: BrowserFileSystemFileEntry) {
  return new Promise<BrowserFileWithPath>((resolve, reject) => {
    entry.file(
      (file) => {
        const nextFile = file as BrowserFileWithPath;
        nextFile.splitAllRelativePath = toRelativeEntryPath(entry.fullPath || entry.name);
        resolve(nextFile);
      },
      (error) => reject(error)
    );
  });
}

function readDirectoryEntries(directoryEntry: BrowserFileSystemDirectoryEntry) {
  return new Promise<BrowserFileSystemEntry[]>((resolve, reject) => {
    const reader = directoryEntry.createReader();
    const entries: BrowserFileSystemEntry[] = [];

    function pump() {
      reader.readEntries(
        (chunk) => {
          if (!chunk.length) {
            resolve(entries);
            return;
          }

          entries.push(...chunk);
          pump();
        },
        (error) => reject(error)
      );
    }

    pump();
  });
}

async function readDroppedEntryTree(
  entry: BrowserFileSystemEntry
): Promise<BrowserFileWithPath[]> {
  if (entry.isFile) {
    return [await readBrowserEntryFile(entry as BrowserFileSystemFileEntry)];
  }

  if (!entry.isDirectory) {
    return [];
  }

  const childEntries = await readDirectoryEntries(
    entry as BrowserFileSystemDirectoryEntry
  );
  const files: BrowserFileWithPath[] = [];

  for (const childEntry of childEntries) {
    files.push(...(await readDroppedEntryTree(childEntry)));
  }

  return files;
}

async function extractBrowserDropPayload(dataTransfer?: DataTransfer | null) {
  if (!dataTransfer) {
    return [];
  }

  const items = Array.from(dataTransfer.items || []) as BrowserDragItem[];
  const entryItems = items
    .map((item) => item.webkitGetAsEntry?.())
    .filter(Boolean) as BrowserFileSystemEntry[];

  if (entryItems.length > 0) {
    const files = [];

    for (const entry of entryItems) {
      files.push(...(await readDroppedEntryTree(entry)));
    }

    return files;
  }

  return extractDroppedFiles(dataTransfer);
}

function isJobRunning(job: SplitJob | null) {
  return job?.status === "queued" || job?.status === "running";
}

function buildJobMessage(job: SplitJob | null) {
  if (!job) {
    return "";
  }

  if (job.status === "queued") {
    return "后台任务已提交，等待执行。";
  }

  if (job.status === "running") {
    return `后台任务进行中 · ${job.stage} · ${job.progressPercent}%`;
  }

  return "";
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }

      reject(new Error("无法读取文件内容"));
    };

    reader.onerror = () => {
      reject(reader.error || new Error("文件读取失败"));
    };

    reader.readAsDataURL(file);
  });
}

async function serializeUploadedFile(file: File): Promise<UploadedFilePayload> {
  const dataUrl = await readFileAsDataUrl(file);
  const [, dataBase64 = ""] = dataUrl.split(",", 2);
  const browserFile = file as BrowserFileWithPath;

  return {
    name: file.name,
    mediaType: file.type || "application/octet-stream",
    dataBase64,
    relativePath: resolveBrowserFilePath(browserFile)
  };
}

function SectionLabel({
  eyebrow,
  title,
  note
}: {
  eyebrow: string;
  title: string;
  note: string;
}) {
  return (
    <div className="section-label">
      <span>{eyebrow}</span>
      <h2>{title}</h2>
      <p>{note}</p>
    </div>
  );
}

function MetricPill({
  label,
  value
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="metric-pill">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function FileToken({
  file,
  onRemove
}: {
  file: LocalFile;
  onRemove: (id: string) => void;
}) {
  return (
    <button className="file-token" type="button" onClick={() => onRemove(file.id)}>
      <strong>{file.name}</strong>
      <span>
        {file.displayPath || file.path || `浏览器上传 · ${file.mediaType || "未标注类型"}`}
      </span>
    </button>
  );
}

function DocumentItem({ item }: { item: KnowledgeDocument }) {
  return (
    <article className="result-item">
      <header>
        <div>
          <h4>{item.title}</h4>
          <p>{item.source}</p>
        </div>
        <time>{formatDate(item.timestamp)}</time>
      </header>
      <div className="tag-line">
        {item.tags.length > 0 ? (
          item.tags.map((tag) => <span key={tag}>{tag}</span>)
        ) : (
          <span>未标注标签</span>
        )}
      </div>
      <p>{item.content}</p>
    </article>
  );
}

function QaItem({ item }: { item: QaPair }) {
  return (
    <article className="result-item">
      <header>
        <div>
          <h4>{item.question}</h4>
          <p>{item.source}</p>
        </div>
        <time>{formatDate(item.timestamp)}</time>
      </header>
      <div className="qa-answer">{item.answer}</div>
      <div className="tag-line">
        {item.documentTitles.length > 0 ? (
          item.documentTitles.map((title) => <span key={title}>{title}</span>)
        ) : (
          <span>未关联知识单元</span>
        )}
      </div>
    </article>
  );
}

function App() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const directoryInputRef = useRef<HTMLInputElement | null>(null);
  const resultJobIdRef = useRef("");
  const [settings, setSettings] = useState<AgentSettings>(EMPTY_SETTINGS);
  const [inputText, setInputText] = useState("");
  const [files, setFiles] = useState<LocalFile[]>([]);
  const [result, setResult] = useState<SplitResult | null>(null);
  const [activeJob, setActiveJob] = useState<SplitJob | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [activeTab, setActiveTab] = useState<"documents" | "qa">("documents");
  const isRunning = isJobRunning(activeJob);
  const jobMessage = buildJobMessage(activeJob);

  useEffect(() => {
    bridge
      .getSettings()
      .then((loadedSettings) => setSettings(loadedSettings))
      .catch((loadError) => {
        const message =
          loadError instanceof Error ? loadError.message : "加载配置失败";
        setError(message);
      });
  }, []);

  useEffect(() => {
    if (!directoryInputRef.current) {
      return;
    }

    directoryInputRef.current.setAttribute("webkitdirectory", "");
    directoryInputRef.current.setAttribute("directory", "");
  }, []);

  useEffect(() => {
    if (bridge.mode !== "browser") {
      return;
    }

    function preventBrowserFileDrop(event: DragEvent) {
      if (!hasFilePayload(event.dataTransfer)) {
        return;
      }

      event.preventDefault();
      if (event.type === "drop") {
        void extractBrowserDropPayload(event.dataTransfer)
          .then((files) => appendBrowserFiles(files))
          .catch(() => {
            setError("文件夹拖拽读取失败，请改用“选择文件夹”。");
          });
      }
    }

    window.addEventListener("dragover", preventBrowserFileDrop);
    window.addEventListener("drop", preventBrowserFileDrop);

    return () => {
      window.removeEventListener("dragover", preventBrowserFileDrop);
      window.removeEventListener("drop", preventBrowserFileDrop);
    };
  }, []);

  async function hydrateJobResult(jobId: string) {
    if (resultJobIdRef.current === jobId) {
      return;
    }

    resultJobIdRef.current = jobId;

    try {
      const nextResult = await bridge.getJobResult(jobId);

      startTransition(() => {
        setResult(nextResult);
        setActiveTab(nextResult.documents.length > 0 ? "documents" : "qa");
      });

      setNotice(
        `已生成 ${nextResult.documents.length} 条知识文档和 ${nextResult.qaPairs.length} 条问答对。`
      );
      setError("");
      window.localStorage.removeItem(ACTIVE_JOB_STORAGE_KEY);
    } catch (loadError) {
      resultJobIdRef.current = "";
      const message =
        loadError instanceof Error ? loadError.message : "读取任务结果失败";
      setError(message);
    }
  }

  async function refreshJob(jobId: string) {
    let job;

    try {
      job = await bridge.getJob(jobId);
    } catch (loadError) {
      if (loadError instanceof Error && loadError.message.includes("任务不存在")) {
        setActiveJob(null);
        window.localStorage.removeItem(ACTIVE_JOB_STORAGE_KEY);
        return;
      }

      throw loadError;
    }

    if (!job) {
      setActiveJob(null);
      window.localStorage.removeItem(ACTIVE_JOB_STORAGE_KEY);
      return;
    }

    setActiveJob(job);

    if (job.status === "completed") {
      await hydrateJobResult(job.id);
      return;
    }

    if (job.status === "failed") {
      setError(job.error || "后台任务失败");
      setNotice("");
      window.localStorage.removeItem(ACTIVE_JOB_STORAGE_KEY);
    }
  }

  useEffect(() => {
    const savedJobId = window.localStorage.getItem(ACTIVE_JOB_STORAGE_KEY);
    if (!savedJobId) {
      return;
    }

    refreshJob(savedJobId).catch((resumeError) => {
      const message =
        resumeError instanceof Error ? resumeError.message : "恢复后台任务失败";
      setError(message);
      window.localStorage.removeItem(ACTIVE_JOB_STORAGE_KEY);
    });
  }, []);

  useEffect(() => {
    if (!activeJob || !isJobRunning(activeJob)) {
      return;
    }

    const timer = window.setInterval(() => {
      refreshJob(activeJob.id).catch((pollError) => {
        const message =
          pollError instanceof Error ? pollError.message : "查询任务状态失败";
        setError(message);
      });
    }, 1400);

    return () => window.clearInterval(timer);
  }, [activeJob?.id, activeJob?.status]);

  const filteredDocuments = result?.documents.filter((item) =>
    matchesQuery(deferredQuery, [item.title, item.source, item.content, item.tags])
  );
  const filteredQaPairs = result?.qaPairs.filter((item) =>
    matchesQuery(deferredQuery, [
      item.question,
      item.answer,
      item.source,
      item.documentTitles
    ])
  );

  function appendEntries(entries: LocalFile[]) {
    setFiles((currentFiles) => {
      const next = [...currentFiles];
      const seen = new Set(next.map((file) => file.id));

      for (const entry of entries) {
        if (seen.has(entry.id)) {
          continue;
        }

        next.push(entry);
        seen.add(entry.id);
      }

      return next;
    });
  }

  function appendFilePaths(filePaths: string[]) {
    appendEntries(
      filePaths.map((filePath) => ({
        id: filePath,
        name: fileNameFromPath(filePath),
        path: filePath,
        displayPath: filePath,
        mediaType: ""
      }))
    );
  }

  function appendBrowserFiles(fileList: BrowserFileWithPath[]) {
    appendEntries(
      fileList.map((file) => {
        const filePath = resolveBrowserFilePath(file);

        return {
          id: createBrowserFileId(file, filePath),
          name: file.name,
          path: "",
          displayPath: filePath,
          file,
          mediaType: file.type || ""
        };
      })
    );
  }

  async function handlePickFiles() {
    setError("");

    if (bridge.mode === "electron") {
      try {
        const selected = await bridge.pickFiles();
        appendFilePaths(selected);
      } catch (pickError) {
        const message =
          pickError instanceof Error ? pickError.message : "文件选择失败";
        setError(message);
      }

      return;
    }

    fileInputRef.current?.click();
  }

  async function handlePickFolders() {
    setError("");

    if (bridge.mode === "electron") {
      try {
        const selected = await bridge.pickFolders();
        appendFilePaths(selected);
      } catch (pickError) {
        const message =
          pickError instanceof Error ? pickError.message : "文件夹选择失败";
        setError(message);
      }

      return;
    }

    directoryInputRef.current?.click();
  }

  async function handleDrop(event: ReactDragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();

    if (!hasFilePayload(event.dataTransfer)) {
      return;
    }

    try {
      appendBrowserFiles(await extractBrowserDropPayload(event.dataTransfer));
    } catch {
      setError("文件夹拖拽读取失败，请改用“选择文件夹”。");
    }
  }

  function handleDragOver(event: ReactDragEvent<HTMLDivElement>) {
    if (!hasFilePayload(event.dataTransfer)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
  }

  function handleBrowserFileInput(event: ChangeEvent<HTMLInputElement>) {
    appendBrowserFiles([...(event.target.files || [])] as BrowserFileWithPath[]);
    event.target.value = "";
  }

  function handleBrowserDirectoryInput(event: ChangeEvent<HTMLInputElement>) {
    appendBrowserFiles([...(event.target.files || [])] as BrowserFileWithPath[]);
    event.target.value = "";
  }

  async function handleSaveSettings() {
    try {
      const saved = await bridge.saveSettings(settings);
      setSettings(saved);
      setNotice("云端连接和奇安信浏览器配置已保存。");
      setError("");
    } catch (saveError) {
      const message =
        saveError instanceof Error ? saveError.message : "保存配置失败";
      setError(message);
    }
  }

  async function buildUploadedFiles() {
    const pendingUploads = files.filter((file) => file.file);
    return Promise.all(
      pendingUploads.map((item) => serializeUploadedFile(item.file as File))
    );
  }

  async function handleRun() {
    setError("");
    setNotice("");

    try {
      const createdJob = await bridge.createJob({
        inputText,
        filePaths: files.filter((file) => !file.file && file.path).map((file) => file.path),
        uploadedFiles: await buildUploadedFiles(),
        settings
      });

      resultJobIdRef.current = "";
      setActiveJob(createdJob);
      window.localStorage.setItem(ACTIVE_JOB_STORAGE_KEY, createdJob.id);
    } catch (runError) {
      const message = runError instanceof Error ? runError.message : "处理失败";
      setError(message);
    }
  }

  async function handleExport(format: ExportFormat) {
    if (!result) {
      return;
    }

    try {
      const exported = await bridge.exportResult({
        format,
        result
      });

      if (!exported.canceled && exported.filePath) {
        setNotice(`已导出到 ${exported.filePath}`);
      }
    } catch (exportError) {
      const message =
        exportError instanceof Error ? exportError.message : "导出失败";
      setError(message);
    }
  }

  return (
    <div className="app-shell">
      <input
        ref={fileInputRef}
        type="file"
        multiple
        hidden
        onChange={handleBrowserFileInput}
      />
      <input
        ref={directoryInputRef}
        type="file"
        multiple
        hidden
        onChange={handleBrowserDirectoryInput}
      />

      <header className="topbar">
        <div className="topbar-title">
          <span className="brand-mark">SplitAll</span>
          <h1>知识切分台</h1>
        </div>
        <div className="topbar-actions">
          <MetricPill label="文件" value={files.length} />
          <MetricPill label="文档" value={result?.documents.length || 0} />
          <MetricPill label="问答" value={result?.qaPairs.length || 0} />
          <button className="secondary-action" type="button" onClick={handlePickFiles}>
            选择文件
          </button>
          <button className="secondary-action" type="button" onClick={handlePickFolders}>
            选择文件夹
          </button>
          <button
            className="primary-action"
            type="button"
            onClick={handleRun}
            disabled={isRunning}
          >
            {isRunning ? "后台处理中..." : "开始切分"}
          </button>
        </div>
      </header>

      {(jobMessage || notice || error || result?.warnings.length) && (
        <section className="message-strip">
          {jobMessage ? <p className="job-line">{jobMessage}</p> : null}
          {notice ? <p className="notice-line">{notice}</p> : null}
          {error ? <p className="error-line">{error}</p> : null}
          {result?.warnings.map((warning) => (
            <p className="warning-line" key={warning}>
              {warning}
            </p>
          ))}
        </section>
      )}

      <main className="workspace">
        <section className="input-column">
          <div className="panel input-panel">
            <SectionLabel
              eyebrow="Input"
              title="输入材料"
              note="粘贴文本，或拖入文件。"
            />
            <textarea
              className="editor"
              value={inputText}
              onChange={(event) => setInputText(event.target.value)}
              placeholder="把原始内容粘贴到这里..."
            />
            <div className="drop-surface" onDrop={handleDrop} onDragOver={handleDragOver}>
              <strong>拖入文件或文件夹</strong>
              <span>自动递归抓取文本、Office、PDF、图片</span>
            </div>
            <div className="file-list compact">
              {files.length > 0 ? (
                files.map((file) => (
                  <FileToken
                    key={file.id}
                    file={file}
                    onRemove={(id) =>
                      setFiles((currentFiles) =>
                        currentFiles.filter((currentFile) => currentFile.id !== id)
                      )
                    }
                  />
                ))
              ) : (
                <p className="muted-line">还没有挂载文件。</p>
              )}
            </div>
          </div>

          <details className="settings-panel">
            <summary>连接设置</summary>
            <div className="settings-grid">
              <label>
                <span>API Base URL</span>
                <input
                  value={settings.apiBaseUrl}
                  onChange={(event) =>
                    setSettings({ ...settings, apiBaseUrl: event.target.value })
                  }
                  placeholder="https://api.openai.com/v1"
                />
              </label>
              <label>
                <span>API Key</span>
                <input
                  type="password"
                  value={settings.apiKey}
                  onChange={(event) =>
                    setSettings({ ...settings, apiKey: event.target.value })
                  }
                  placeholder="输入你的密钥"
                />
              </label>
              <label>
                <span>模型</span>
                <input
                  value={settings.model}
                  onChange={(event) =>
                    setSettings({ ...settings, model: event.target.value })
                  }
                  placeholder="gpt-4.1-mini"
                />
              </label>
              <label>
                <span>Tika JAR 路径</span>
                <input
                  value={settings.tikaJarPath}
                  onChange={(event) =>
                    setSettings({ ...settings, tikaJarPath: event.target.value })
                  }
                  placeholder="如 /opt/splitall/tika/tika-app-3.2.3.jar"
                />
              </label>
              <label>
                <span>Java 路径</span>
                <input
                  value={settings.javaBinPath}
                  onChange={(event) =>
                    setSettings({ ...settings, javaBinPath: event.target.value })
                  }
                  placeholder="如 /opt/splitall/jre/bin/java"
                />
              </label>
              <label className="checkbox-field">
                <span>PaddleOCR</span>
                <input
                  type="checkbox"
                  checked={settings.ocrEnabled}
                  onChange={(event) =>
                    setSettings({ ...settings, ocrEnabled: event.target.checked })
                  }
                />
              </label>
              <label>
                <span>OCR Python 路径</span>
                <input
                  value={settings.ocrPythonPath}
                  onChange={(event) =>
                    setSettings({ ...settings, ocrPythonPath: event.target.value })
                  }
                  placeholder="如 /opt/splitall/.venv-paddleocr/bin/python"
                />
              </label>
              <label>
                <span>OCR 语言</span>
                <input
                  value={settings.ocrLanguage}
                  onChange={(event) =>
                    setSettings({ ...settings, ocrLanguage: event.target.value })
                  }
                  placeholder="如 ch / en"
                />
              </label>
              <label>
                <span>奇安信浏览器路径</span>
                <input
                  value={settings.qianxinBrowserPath}
                  onChange={(event) =>
                    setSettings({
                      ...settings,
                      qianxinBrowserPath: event.target.value
                    })
                  }
                  placeholder="可留空"
                />
              </label>
              <label>
                <span>奇安信浏览器参数</span>
                <input
                  value={settings.qianxinBrowserArgs}
                  onChange={(event) =>
                    setSettings({
                      ...settings,
                      qianxinBrowserArgs: event.target.value
                    })
                  }
                  placeholder="如 --no-sandbox"
                />
              </label>
              <label className="full-width">
                <span>系统提示词</span>
                <textarea
                  value={settings.systemPrompt}
                  onChange={(event) =>
                    setSettings({ ...settings, systemPrompt: event.target.value })
                  }
                  rows={8}
                />
              </label>
            </div>
            <button className="secondary-action" type="button" onClick={handleSaveSettings}>
              保存配置
            </button>
          </details>
        </section>

        <section className="results-panel">
          <div className="results-toolbar">
            <SectionLabel
              eyebrow="Output"
              title="结果"
              note="搜索、检查、导出。"
            />
            <div className="toolbar-actions">
              <input
                className="search-input"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索..."
              />
              <button
                className="secondary-action"
                type="button"
                onClick={() => handleExport("json")}
                disabled={!result}
              >
                JSON
              </button>
              <button
                className="secondary-action"
                type="button"
                onClick={() => handleExport("md")}
                disabled={!result}
              >
                Markdown
              </button>
              <button
                className="primary-action"
                type="button"
                onClick={() => handleExport("docx")}
                disabled={!result}
              >
                Word
              </button>
            </div>
          </div>

          <div className="tab-strip">
            <button
              type="button"
              data-active={activeTab === "documents"}
              onClick={() => setActiveTab("documents")}
            >
              知识文档
            </button>
            <button
              type="button"
              data-active={activeTab === "qa"}
              onClick={() => setActiveTab("qa")}
            >
              模拟问答
            </button>
          </div>

          <div className="results-list">
            {!result ? (
              <div className="empty-state">
                <strong>还没有结果</strong>
                <p>先输入材料，再开始切分。</p>
              </div>
            ) : activeTab === "documents" ? (
              filteredDocuments && filteredDocuments.length > 0 ? (
                filteredDocuments.map((item) => <DocumentItem key={item.id} item={item} />)
              ) : (
                <div className="empty-state">
                  <strong>没有匹配的知识文档</strong>
                  <p>试试更短的搜索词。</p>
                </div>
              )
            ) : filteredQaPairs && filteredQaPairs.length > 0 ? (
              filteredQaPairs.map((item) => <QaItem key={item.id} item={item} />)
            ) : (
              <div className="empty-state">
                <strong>没有匹配的问答对</strong>
                <p>试试更短的搜索词。</p>
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;
