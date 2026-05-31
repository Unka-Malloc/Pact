import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));

const allowedBridgeFiles = new Set([
  "server-web/components/BridgeDownloadButton.vue",
]);

const allowedHtmlRenderFiles = new Set([
  "server-web/components/SafeHtmlBlock.vue",
]);

const allowedUseConsoleFiles = new Set([
  "server-web/composables/useServerConsoleShell.ts",
]);

function normalizePosix(input) {
  return input.split(path.sep).join("/");
}

async function listSourceFiles(rootDir, predicate) {
  const entries = await fs.readdir(rootDir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolutePath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listSourceFiles(absolutePath, predicate));
      continue;
    }
    if (entry.isFile() && predicate(absolutePath)) {
      files.push(absolutePath);
    }
  }
  return files;
}

async function readRelativeFiles(relativeRoots, predicate) {
  const files = [];
  for (const relativeRoot of relativeRoots) {
    const absoluteRoot = path.join(repoRoot, relativeRoot);
    files.push(...await listSourceFiles(absoluteRoot, predicate));
  }
  return Promise.all(files.map(async (absolutePath) => ({
    absolutePath,
    relativePath: normalizePosix(path.relative(repoRoot, absolutePath)),
    text: await fs.readFile(absolutePath, "utf8"),
  })));
}

function assertAllowedOnly({
  files,
  allowedFiles,
  predicate,
  message,
}) {
  const violations = files
    .filter((file) => predicate(file.text))
    .map((file) => file.relativePath)
    .filter((relativePath) => !allowedFiles.has(relativePath))
    .sort();
  assert.deepEqual(violations, [], message);
}

function assertNoMissingAllowlistEntries({
  files,
  allowedFiles,
  predicate,
  message,
}) {
  const actualFiles = new Set(
    files
      .filter((file) => predicate(file.text))
      .map((file) => file.relativePath),
  );
  const staleEntries = [...allowedFiles]
    .filter((relativePath) => !actualFiles.has(relativePath))
    .sort();
  assert.deepEqual(staleEntries, [], message);
}

async function main() {
  const viewAndComponentFiles = await readRelativeFiles(
    ["server-web/views", "server-web/components"],
    (absolutePath) => absolutePath.endsWith(".vue") || absolutePath.endsWith(".ts"),
  );
  const viewAndComposableFiles = await readRelativeFiles(
    ["server-web/views", "server-web/composables"],
    (absolutePath) => (absolutePath.endsWith(".vue") || absolutePath.endsWith(".ts")) &&
      !absolutePath.endsWith(path.join("server-web", "composables", "useConsole.ts")),
  );

  assertAllowedOnly({
    files: viewAndComponentFiles,
    allowedFiles: allowedBridgeFiles,
    predicate: (text) => /\bbridge\s*\./.test(text),
    message: "view/component files must not call bridge.* directly outside the allowlisted download boundary",
  });
  assertNoMissingAllowlistEntries({
    files: viewAndComponentFiles,
    allowedFiles: allowedBridgeFiles,
    predicate: (text) => /\bbridge\s*\./.test(text),
    message: "bridge boundary allowlist contains stale entries",
  });

  assertAllowedOnly({
    files: viewAndComponentFiles,
    allowedFiles: allowedHtmlRenderFiles,
    predicate: (text) => /\bv-html\b/.test(text),
    message: "v-html must stay centralized in SafeHtmlBlock",
  });
  assertNoMissingAllowlistEntries({
    files: viewAndComponentFiles,
    allowedFiles: allowedHtmlRenderFiles,
    predicate: (text) => /\bv-html\b/.test(text),
    message: "safe-html allowlist contains stale entries",
  });

  assertAllowedOnly({
    files: viewAndComposableFiles,
    allowedFiles: allowedUseConsoleFiles,
    predicate: (text) => /=\s*useConsole\s*\(/.test(text),
    message: "new direct useConsole() callers must use route/domain contexts instead",
  });
  assertNoMissingAllowlistEntries({
    files: viewAndComposableFiles,
    allowedFiles: allowedUseConsoleFiles,
    predicate: (text) => /=\s*useConsole\s*\(/.test(text),
    message: "useConsole() allowlist contains stale entries; remove entries as callers are migrated",
  });

  console.log([
    "frontend architecture check passed:",
    `${allowedBridgeFiles.size} bridge boundary,`,
    `${allowedHtmlRenderFiles.size} safe-html boundary,`,
    `${allowedUseConsoleFiles.size} useConsole compatibility callers`,
  ].join(" "));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
