import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

export const TIKA_VERSION = "3.2.3";
export const TIKA_IMPORT_EXTENSIONS = [
  "doc",
  "docx",
  "dotx",
  "ppt",
  "pptx",
  "pps",
  "ppsx",
  "xls",
  "xlsx",
  "xlsm",
  "rtf",
  "odt",
  "ods",
  "odp",
  "pdf",
  "msg",
  "eml",
  "epub"
];

const TIKA_DOCUMENT_EXTENSIONS = new Set(TIKA_IMPORT_EXTENSIONS.map((value) => `.${value}`));
const TIKA_MEDIA_TYPES = new Set([
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.template",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/rtf",
  "application/vnd.oasis.opendocument.text",
  "application/vnd.oasis.opendocument.spreadsheet",
  "application/vnd.oasis.opendocument.presentation",
  "application/pdf",
  "application/vnd.ms-outlook",
  "message/rfc822",
  "application/epub+zip"
]);
const TIKA_JAR_FILE_NAMES = [`tika-app-${TIKA_VERSION}.jar`, "tika-app.jar"];

function createTikaError(message, code = "TIKA_FAILED") {
  const error = new Error(message);
  error.code = code;
  return error;
}

function getJavaExecutableName() {
  return process.platform === "win32" ? "java.exe" : "java";
}

function getPlatformRuntimeFolderName() {
  return `${process.platform}-${process.arch}`;
}

function getVendorRoots() {
  const roots = [path.join(projectRoot, "vendor")];

  if (process.resourcesPath) {
    roots.unshift(path.join(process.resourcesPath, "vendor"));
  }

  return roots;
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

async function resolveTikaJarPath(settings = {}) {
  const explicitPath = settings.tikaJarPath?.trim() || process.env.SPLITALL_TIKA_JAR_PATH || "";
  const vendorCandidates = getVendorRoots().flatMap((vendorRoot) =>
    TIKA_JAR_FILE_NAMES.map((fileName) => path.join(vendorRoot, "tika", fileName))
  );
  const resolvedPath = await resolveFirstExistingPath([explicitPath, ...vendorCandidates]);

  if (resolvedPath) {
    return resolvedPath;
  }

  throw createTikaError(
    `未找到 Tika 应用包。请在设置中填写 Tika JAR 路径，或把 ${TIKA_JAR_FILE_NAMES[0]} 放到 vendor/tika/ 下。`,
    "TIKA_UNAVAILABLE"
  );
}

async function resolveJavaCommand(settings = {}) {
  const explicitPath = settings.javaBinPath?.trim() || process.env.SPLITALL_JAVA_BIN_PATH || "";
  const vendorCandidates = getVendorRoots().map((vendorRoot) =>
    path.join(vendorRoot, "jre", getPlatformRuntimeFolderName(), "bin", getJavaExecutableName())
  );
  const resolvedPath = await resolveFirstExistingPath([explicitPath, ...vendorCandidates]);

  return resolvedPath || "java";
}

function collectStream(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];

    stream.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    stream.on("error", reject);
    stream.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
  });
}

async function spawnCommand(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true
    });
    let exitCode = 1;

    child.once("error", reject);
    child.once("close", (code) => {
      exitCode = typeof code === "number" ? code : 1;
    });

    Promise.all([collectStream(child.stdout), collectStream(child.stderr)])
      .then(([stdout, stderr]) => {
        if (child.exitCode === null) {
          child.once("close", () => {
            resolve({
              code: exitCode,
              stdout,
              stderr
            });
          });
          return;
        }

        resolve({
          code: typeof child.exitCode === "number" ? child.exitCode : exitCode,
          stdout,
          stderr
        });
      })
      .catch(reject);
  });
}

async function ensureTempExtractionFile({ buffer, fileName, userDataPath }) {
  const extension = path.extname(fileName || "").toLowerCase() || ".bin";
  const tempDirectory = path.join(userDataPath, "tmp", "tika");
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

export function isTikaBackedDocument({ extension = "", mediaTypeHint = "" }) {
  return (
    TIKA_DOCUMENT_EXTENSIONS.has(extension.toLowerCase()) ||
    TIKA_MEDIA_TYPES.has(mediaTypeHint.toLowerCase())
  );
}

export async function extractTextWithTika({
  buffer,
  filePath = "",
  fileName = "",
  settings = {},
  userDataPath
}) {
  const tikaJarPath = await resolveTikaJarPath(settings);
  const javaCommand = await resolveJavaCommand(settings);
  let targetPath = filePath;
  let cleanupPath = "";

  if (!targetPath || !path.isAbsolute(targetPath)) {
    cleanupPath = await ensureTempExtractionFile({
      buffer,
      fileName,
      userDataPath
    });
    targetPath = cleanupPath;
  }

  try {
    const result = await spawnCommand(javaCommand, [
      "-jar",
      tikaJarPath,
      "--text",
      "--encoding=UTF-8",
      targetPath
    ]);

    if (result.code !== 0) {
      const details = (result.stderr || result.stdout || "").trim();
      if (/Unable to locate a Java Runtime|No Java runtime present/i.test(details)) {
        throw createTikaError(
          "当前机器没有可用的 Java 运行时。请配置 Java 17，或在打包时附带 JRE 17。",
          "TIKA_UNAVAILABLE"
        );
      }

      const message =
        details ||
        "Tika 提取失败。请检查文件是否损坏，或确认 JRE 17 / tika-app.jar 是否可用。";
      throw createTikaError(message, "TIKA_FAILED");
    }

    return result.stdout.replace(/\r\n/g, "\n").trim();
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw createTikaError(
        "未找到可用的 Java 运行时。请在设置中填写 Java 路径，或把 JRE 17 放到 vendor/jre/<platform-arch>/ 下。",
        "TIKA_UNAVAILABLE"
      );
    }

    if (
      error instanceof Error &&
      /Unable to locate a Java Runtime|No Java runtime present/i.test(error.message)
    ) {
      throw createTikaError(
        "当前机器没有可用的 Java 运行时。请配置 Java 17，或在打包时附带 JRE 17。",
        "TIKA_UNAVAILABLE"
      );
    }

    throw error;
  } finally {
    await safeUnlink(cleanupPath);
  }
}
