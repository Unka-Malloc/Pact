import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  isSupportedImportFilePath,
  isSupportedImportPath
} from "../platform/specialized/knowledge/preprocessing/file-processor/index.mjs";
import {
  getImportExtensionRoutes,
  importFileDescriptorForPath,
  importFileTypeConfigPath,
  reloadImportFileTypeRegistry
} from "../platform/specialized/knowledge/preprocessing/file-processor/import-file-types.mjs";
import { TIKA_IMPORT_EXTENSIONS } from "../platform/modules/knowledge/file-processor/FileNormalizer/Tika/tika.mjs";
import { normalizeMountRouting } from "../platform/common/module-manager/mount-config.mjs";

const configPath = importFileTypeConfigPath();
assert.ok(configPath.endsWith("default-import-file-types.json"));

const extensionRoutes = getImportExtensionRoutes();
for (const filePath of [
  "src/main.rs",
  "src/app.swift",
  "cmd/server.go",
  "frontend/App.vue",
  "Dockerfile",
  "slides/product-roadmap.pptx",
  "docs/briefing.pdf",
  "notes/research.md"
]) {
  assert.ok(
    isSupportedImportPath(filePath),
    `${filePath} should be accepted by the import file type dictionary`
  );
}

assert.equal(importFileDescriptorForPath("Dockerfile")?.kind, "text");
assert.equal(importFileDescriptorForPath("slides/product-roadmap.pptx")?.normalizedAdapter, "presentation");
assert.equal(importFileDescriptorForPath("docs/briefing.pdf")?.route?.mountName, "pdfProcessor");
assert.equal(extensionRoutes[".rs"]?.mountName, "documentParser");
assert.ok(TIKA_IMPORT_EXTENSIONS.includes("pptx"));
assert.ok(TIKA_IMPORT_EXTENSIONS.includes("pdf"));

const routing = normalizeMountRouting();
assert.equal(routing.extensionRoutes[".go"]?.mountName, "documentParser");
assert.equal(routing.extensionRoutes[".pdf"]?.mountName, "pdfProcessor");

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "pact-import-types-"));
try {
  const unknownTextPath = path.join(tempDir, "module.customlang");
  const binaryPath = path.join(tempDir, "blob.custombin");
  await fs.writeFile(unknownTextPath, "fn main() {\n  return 42\n}\n", "utf8");
  await fs.writeFile(binaryPath, Buffer.from([0, 1, 2, 3, 4, 5, 0, 255]));
  assert.equal(await isSupportedImportFilePath(unknownTextPath), true);
  assert.equal(await isSupportedImportFilePath(binaryPath), false);
} finally {
  await fs.rm(tempDir, { recursive: true, force: true });
}

reloadImportFileTypeRegistry();
console.log("Import file type dictionary verification passed.");
