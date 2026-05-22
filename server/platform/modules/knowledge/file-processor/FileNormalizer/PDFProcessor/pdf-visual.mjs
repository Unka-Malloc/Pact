import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "../../../../../../..");
const PDF_VISUAL_SCRIPT_NAME = "pdf_visual_extract.py";

function createPdfVisualError(message, code = "PDF_VISUAL_FAILED", details = "") {
  const error = new Error(message);
  error.code = code;
  if (details) {
    error.details = details;
  }
  return error;
}

function getPythonExecutableName() {
  return process.platform === "win32" ? "python.exe" : "python";
}

function getLocalVenvPythonCandidates() {
  const executableName = getPythonExecutableName();
  if (process.platform === "win32") {
    return [
      path.join(projectRoot, ".venv-pdf", "Scripts", executableName),
      path.join(projectRoot, ".venv", "Scripts", executableName)
    ];
  }
  return [
    path.join(projectRoot, ".venv-pdf", "bin", executableName),
    path.join(projectRoot, ".venv", "bin", executableName),
    path.join(projectRoot, ".venv-pdf", "bin", "python3"),
    path.join(projectRoot, ".venv", "bin", "python3")
  ];
}

function getBundledPdfRuntimeRoots() {
  const runtimeKey = `${process.platform}-${process.arch}`;
  const roots = [];
  if (process.resourcesPath) {
    roots.push(path.join(process.resourcesPath, "server", "platform", "modules", "knowledge", "pdf", "runtime", runtimeKey));
  }
  roots.push(path.join(process.cwd(), "server", "platform", "modules", "knowledge", "pdf", "runtime", runtimeKey));
  roots.push(path.join(projectRoot, "server", "platform", "modules", "knowledge", "pdf", "runtime", runtimeKey));
  return roots;
}

function getBundledPdfPythonCandidates() {
  const executableName = getPythonExecutableName();
  if (process.platform === "win32") {
    return getBundledPdfRuntimeRoots().flatMap((runtimeRoot) => [
      path.join(runtimeRoot, executableName),
      path.join(runtimeRoot, "Scripts", executableName),
      path.join(runtimeRoot, ".venv", "Scripts", executableName),
      path.join(runtimeRoot, "venv", "Scripts", executableName)
    ]);
  }
  return getBundledPdfRuntimeRoots().flatMap((runtimeRoot) => [
    path.join(runtimeRoot, "bin", executableName),
    path.join(runtimeRoot, "bin", "python3"),
    path.join(runtimeRoot, "python", "bin", "python3"),
    path.join(runtimeRoot, ".venv", "bin", executableName),
    path.join(runtimeRoot, "venv", "bin", executableName)
  ]);
}

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function resolveFirstExistingPath(candidates) {
  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }
    if (await pathExists(candidate)) {
      return candidate;
    }
  }
  return "";
}

async function resolvePdfVisualScriptPath() {
  const candidates = [
    path.join(projectRoot, "server", "platform", "modules", "knowledge", "pdf", PDF_VISUAL_SCRIPT_NAME),
    path.join(process.cwd(), "server", "platform", "modules", "knowledge", "pdf", PDF_VISUAL_SCRIPT_NAME)
  ];
  if (process.resourcesPath) {
    candidates.unshift(path.join(process.resourcesPath, "server", "platform", "modules", "knowledge", "pdf", PDF_VISUAL_SCRIPT_NAME));
  }
  const resolvedPath = await resolveFirstExistingPath(candidates);
  if (resolvedPath) {
    return resolvedPath;
  }
  throw createPdfVisualError(
    "未找到 PDF 视觉解析脚本。请确认 server/platform/modules/knowledge/pdf/pdf_visual_extract.py 已随程序分发。",
    "PDF_VISUAL_UNAVAILABLE"
  );
}

async function resolvePythonCommand(settings = {}) {
  const explicitPath =
    settings.pdfVisualPythonPath?.trim() ||
    process.env.PACT_PDF_VISUAL_PYTHON_PATH ||
    settings.ocrPythonPath?.trim() ||
    process.env.PACT_OCR_PYTHON_PATH ||
    "";
  const resolvedPath = await resolveFirstExistingPath([
    explicitPath,
    ...getBundledPdfPythonCandidates(),
    ...getLocalVenvPythonCandidates()
  ]);
  return resolvedPath || (process.platform === "win32" ? "python" : "python3");
}

function collectStream(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    stream.on("error", reject);
    stream.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
  });
}

async function spawnCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    let closedCode = 1;
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
      env: {
        ...process.env,
        PYTHONIOENCODING: "utf-8",
        ...options.env
      }
    });
    child.once("error", reject);
    child.once("close", (code) => {
      closedCode = typeof code === "number" ? code : 1;
    });
    Promise.all([collectStream(child.stdout), collectStream(child.stderr)])
      .then(([stdout, stderr]) => {
        if (child.exitCode === null) {
          child.once("close", () => {
            resolve({ code: closedCode, stdout, stderr });
          });
          return;
        }
        resolve({
          code: typeof child.exitCode === "number" ? child.exitCode : closedCode,
          stdout,
          stderr
        });
      })
      .catch(reject);
  });
}

function extractJsonPayload(stdout) {
  const lines = stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    try {
      return JSON.parse(lines[index]);
    } catch {
      // Keep scanning until the final JSON line.
    }
  }
  throw createPdfVisualError("PDF 视觉解析未返回可解析的 JSON 结果。", "PDF_VISUAL_FAILED", stdout);
}

async function ensureTempPdfFile({ buffer, fileName, userDataPath }) {
  const extension = path.extname(fileName || "").toLowerCase() || ".pdf";
  const tempDirectory = path.join(userDataPath, "tmp", "pdf-visual");
  const tempPath = path.join(tempDirectory, `${randomUUID()}${extension}`);
  await fs.mkdir(tempDirectory, { recursive: true });
  await fs.writeFile(tempPath, buffer);
  return tempPath;
}

async function safeUnlink(targetPath) {
  if (!targetPath) {
    return;
  }
  try {
    await fs.unlink(targetPath);
  } catch {
    // Ignore temp cleanup failures.
  }
}

function normalizeVisualElement(element = {}) {
  const kind = String(element.kind || "").trim();
  if (!["image", "table"].includes(kind)) {
    return null;
  }
  const page = Number(element.page || 0);
  const index = Number(element.index || 0);
  const sequence = Number(element.sequence || 0);
  const base = {
    kind,
    sequence,
    page,
    index,
    title: String(element.title || `${kind} ${sequence || index || ""}`).trim(),
    bbox: Array.isArray(element.bbox) ? element.bbox : [],
    extractionMethod: String(element.extractionMethod || "").trim()
  };
  if (kind === "image") {
    return {
      ...base,
      fileName: String(element.fileName || `page-${String(page).padStart(3, "0")}-image-${String(index).padStart(3, "0")}.png`),
      mediaType: String(element.mediaType || "").trim(),
      byteSize: Number(element.byteSize || 0),
      width: Number(element.width || 0),
      height: Number(element.height || 0),
      imageDataUrl: String(element.dataUrl || "").trim(),
      bboxes: Array.isArray(element.bboxes) ? element.bboxes : [],
      xref: Number(element.xref || 0)
    };
  }
  const rows = Array.isArray(element.rows)
    ? element.rows.map((row) => Array.isArray(row) ? row.map((cell) => String(cell ?? "")) : [])
    : [];
  return {
    ...base,
    rows,
    rowCount: Number(element.rowCount || rows.length || 0),
    columnCount: Number(element.columnCount || rows.reduce((max, row) => Math.max(max, row.length), 0)),
    markdown: String(element.markdown || element.text || "").trim(),
    text: String(element.text || element.markdown || "").trim()
  };
}

export async function extractPdfVisualElements({
  buffer,
  filePath = "",
  fileName = "",
  settings = {},
  userDataPath
}) {
  const scriptPath = await resolvePdfVisualScriptPath();
  const pythonCommand = await resolvePythonCommand(settings);
  let targetPath = filePath;
  let cleanupPath = "";
  if (!targetPath || !path.isAbsolute(targetPath)) {
    cleanupPath = await ensureTempPdfFile({
      buffer,
      fileName,
      userDataPath
    });
    targetPath = cleanupPath;
  }

  try {
    const { code, stdout, stderr } = await spawnCommand(
      pythonCommand,
      [scriptPath, "--input", targetPath],
      {}
    );
    const payload = extractJsonPayload(stdout);
    if (code !== 0 || payload.ok === false) {
      const errorCode = code === 2 ? "PDF_VISUAL_UNAVAILABLE" : "PDF_VISUAL_FAILED";
      throw createPdfVisualError(
        payload.error || "PDF 视觉解析执行失败。",
        errorCode,
        payload.details || stderr || stdout
      );
    }
    const visualElements = Array.isArray(payload.elements)
      ? payload.elements.map(normalizeVisualElement).filter(Boolean)
      : [];
    return {
      parserId: "builtin/pdf-visual-extractor",
      pageCount: Number(payload.pageCount || 0),
      text: String(payload.text || "").trim(),
      pages: Array.isArray(payload.pages) ? payload.pages : [],
      imageCount: Number(payload.imageCount || visualElements.filter((item) => item.kind === "image").length),
      tableCount: Number(payload.tableCount || visualElements.filter((item) => item.kind === "table").length),
      visualElements,
      warnings: Array.isArray(payload.warnings) ? payload.warnings.map((item) => String(item || "").trim()).filter(Boolean) : []
    };
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw createPdfVisualError(
        "未找到可用的 Python 运行环境。请填写 PACT_PDF_VISUAL_PYTHON_PATH，或创建 .venv-pdf 并安装 pymupdf/pdfplumber。",
        "PDF_VISUAL_UNAVAILABLE"
      );
    }
    if (error?.code === "PDF_VISUAL_UNAVAILABLE" || error?.code === "PDF_VISUAL_FAILED") {
      throw error;
    }
    throw createPdfVisualError(error instanceof Error ? error.message : "PDF 视觉解析执行失败。");
  } finally {
    await safeUnlink(cleanupPath);
  }
}
