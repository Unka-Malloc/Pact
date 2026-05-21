import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));
const serverRoot = path.join(projectRoot, "server");
const allowedExtensions = new Set([".mjs", ".json", ".md"]);
const ignoredDirectories = new Set(["node_modules", ".git", "__pycache__"]);
const ignoredFileNames = new Set([".DS_Store"]);
const runtimeAssetPrefixes = [
  "server/platform/modules/knowledge/runtime/jre/",
  "server/platform/modules/knowledge/tika/",
  "server/platform/modules/knowledge/ocr/runtime/",
  "server/platform/modules/knowledge/pdf/runtime/"
];
const runtimeAssetFiles = new Set([
  "server/platform/modules/knowledge/ocr/paddle_ocr_extract.py",
  "server/platform/modules/knowledge/pdf/pdf_visual_extract.py"
]);
const declarativeConfigFiles = new Set([
  "server/config/frontend-feature-registry.yaml"
]);

function toPosix(relativePath) {
  return relativePath.split(path.sep).join("/");
}

function isRuntimeAsset(filePath) {
  const relativePath = toPosix(path.relative(projectRoot, filePath));
  return (
    declarativeConfigFiles.has(relativePath) ||
    runtimeAssetFiles.has(relativePath) ||
    runtimeAssetPrefixes.some((prefix) => relativePath.startsWith(prefix))
  );
}

async function walk(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (ignoredDirectories.has(entry.name)) {
      continue;
    }
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(absolutePath)));
      continue;
    }
    if (entry.isFile()) {
      if (ignoredFileNames.has(entry.name)) {
        continue;
      }
      files.push(absolutePath);
    }
  }
  return files;
}

const files = await walk(serverRoot);
const violations = files.filter((filePath) => {
  if (allowedExtensions.has(path.extname(filePath))) {
    return false;
  }
  return !isRuntimeAsset(filePath);
});

if (violations.length > 0) {
  console.error("Server language policy violation: server/ implementation files must be JavaScript.");
  console.error("Allowed server implementation file extensions: .mjs, .json, .md");
  console.error("Runtime assets are allowed only under server/platform/modules/knowledge/runtime/jre, server/platform/modules/knowledge/tika, server/platform/modules/knowledge/ocr, and server/platform/modules/knowledge/pdf.");
  for (const filePath of violations) {
    console.error(`- ${path.relative(projectRoot, filePath)}`);
  }
  process.exit(1);
}

console.log("Server language policy verification passed.");
