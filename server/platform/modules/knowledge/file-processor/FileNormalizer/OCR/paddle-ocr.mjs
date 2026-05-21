import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "../../../../../../..");
const OCR_SCRIPT_NAME = "paddle_ocr_extract.py";

function createOcrError(message, code = "OCR_FAILED", details = "") {
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
      path.join(projectRoot, ".venv-paddleocr", "Scripts", executableName),
      path.join(projectRoot, ".venv", "Scripts", executableName)
    ];
  }

  return [
    path.join(projectRoot, ".venv-paddleocr", "bin", executableName),
    path.join(projectRoot, ".venv", "bin", executableName)
  ];
}

function getBundledOcrRuntimeRoots() {
  const runtimeKey = `${process.platform}-${process.arch}`;
  const roots = [];

  if (process.resourcesPath) {
    roots.push(path.join(process.resourcesPath, "server", "platform", "modules", "knowledge", "ocr", "runtime", runtimeKey));
  }

  roots.push(path.join(process.cwd(), "server", "platform", "modules", "knowledge", "ocr", "runtime", runtimeKey));
  roots.push(path.join(projectRoot, "server", "platform", "modules", "knowledge", "ocr", "runtime", runtimeKey));
  return roots;
}

function getBundledOcrPythonCandidates() {
  const executableName = getPythonExecutableName();

  if (process.platform === "win32") {
    return getBundledOcrRuntimeRoots().flatMap((runtimeRoot) => [
      path.join(runtimeRoot, executableName),
      path.join(runtimeRoot, "Scripts", executableName),
      path.join(runtimeRoot, ".venv", "Scripts", executableName),
      path.join(runtimeRoot, "venv", "Scripts", executableName)
    ]);
  }

  return getBundledOcrRuntimeRoots().flatMap((runtimeRoot) => [
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

async function resolveOcrScriptPath() {
  const candidates = [
    path.join(projectRoot, "server", "platform", "modules", "knowledge", "ocr", OCR_SCRIPT_NAME)
  ];
  candidates.unshift(path.join(process.cwd(), "server", "platform", "modules", "knowledge", "ocr", OCR_SCRIPT_NAME));

  if (process.resourcesPath) {
    candidates.unshift(path.join(process.resourcesPath, "server", "platform", "modules", "knowledge", "ocr", OCR_SCRIPT_NAME));
  }

  const resolvedPath = await resolveFirstExistingPath(candidates);
  if (resolvedPath) {
    return resolvedPath;
  }

  throw createOcrError(
    "未找到 PaddleOCR 脚本。请确认 server/platform/modules/knowledge/ocr/paddle_ocr_extract.py 已随程序分发。",
    "OCR_UNAVAILABLE"
  );
}

async function resolvePythonCommand(settings = {}) {
  const explicitPath =
    settings.ocrPythonPath?.trim() || process.env.AGENTSTUDIO_OCR_PYTHON_PATH || "";
  const bundledCandidates = getBundledOcrPythonCandidates();
  const localCandidates = getLocalVenvPythonCandidates();
  const resolvedPath = await resolveFirstExistingPath([
    explicitPath,
    ...bundledCandidates,
    ...localCandidates
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

    child.once("error", (error) => {
      reject(error);
    });
    child.once("close", (code) => {
      closedCode = typeof code === "number" ? code : 1;
    });

    Promise.all([collectStream(child.stdout), collectStream(child.stderr)])
      .then(([stdout, stderr]) => {
        if (child.exitCode === null) {
          child.once("close", () => {
            resolve({
              code: closedCode,
              stdout,
              stderr
            });
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
    const line = lines[index];

    try {
      return JSON.parse(line);
    } catch {
      // Keep scanning until the final JSON line.
    }
  }

  throw createOcrError("PaddleOCR 未返回可解析的 JSON 结果。", "OCR_FAILED", stdout);
}

async function ensureTempOcrFile({ buffer, fileName, userDataPath }) {
  const extension = path.extname(fileName || "").toLowerCase() || ".bin";
  const tempDirectory = path.join(userDataPath, "tmp", "ocr");
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

export async function extractTextWithPaddleOcr({
  buffer,
  filePath = "",
  fileName = "",
  fileType,
  settings = {},
  userDataPath
}) {
  if (!["image", "pdf"].includes(fileType)) {
    throw createOcrError(`不支持的 OCR 文件类型：${fileType}`, "OCR_FAILED");
  }

  const scriptPath = await resolveOcrScriptPath();
  const pythonCommand = await resolvePythonCommand(settings);
  const lang =
    settings.ocrLanguage?.trim() || process.env.AGENTSTUDIO_PADDLEOCR_LANG || "ch";
  let targetPath = filePath;
  let cleanupPath = "";

  if (!targetPath || !path.isAbsolute(targetPath)) {
    cleanupPath = await ensureTempOcrFile({
      buffer,
      fileName,
      userDataPath
    });
    targetPath = cleanupPath;
  }

  try {
    const { code, stdout, stderr } = await spawnCommand(
      pythonCommand,
      [scriptPath, "--input", targetPath, "--file-type", fileType, "--lang", lang],
      {
        env: {
          AGENTSTUDIO_PADDLEOCR_LANG: lang
        }
      }
    );
    const payload = extractJsonPayload(stdout);

    if (code !== 0) {
      const errorCode = code === 2 ? "OCR_UNAVAILABLE" : "OCR_FAILED";
      throw createOcrError(
        payload.error || "PaddleOCR 执行失败。",
        errorCode,
        payload.details || stderr || stdout
      );
    }

    return {
      text: typeof payload.text === "string" ? payload.text.trim() : "",
      pages: Array.isArray(payload.pages) ? payload.pages : [],
      inputPath: payload.inputPath || targetPath
    };
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw createOcrError(
        "未找到可用的 Python 运行环境。请填写 OCR Python 路径，或把运行时放到 server/platform/modules/knowledge/ocr/runtime/<platform-arch>/。",
        "OCR_UNAVAILABLE"
      );
    }

    if (error?.code === "OCR_UNAVAILABLE" || error?.code === "OCR_FAILED") {
      throw error;
    }

    const message = error instanceof Error ? error.message : "PaddleOCR 执行失败。";
    throw createOcrError(message, "OCR_FAILED");
  } finally {
    await safeUnlink(cleanupPath);
  }
}
