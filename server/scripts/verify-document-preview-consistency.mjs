import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));

async function readText(relativePath) {
  return fs.readFile(path.join(repoRoot, relativePath), "utf8");
}

async function listSourceFiles(relativeDir, extensions = new Set([".vue", ".ts", ".tsx", ".js", ".mjs"])) {
  const root = path.join(repoRoot, relativeDir);
  const output = [];
  async function visit(current) {
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const absolutePath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await visit(absolutePath);
        continue;
      }
      if (extensions.has(path.extname(entry.name))) {
        output.push(path.relative(repoRoot, absolutePath));
      }
    }
  }
  await visit(root);
  return output.sort();
}

function assertIncludes(text, needle, message) {
  assert.ok(text.includes(needle), message || `Expected source to include ${needle}`);
}

function assertNotIncludes(text, needle, message) {
  assert.equal(text.includes(needle), false, message || `Expected source not to include ${needle}`);
}

function countLiteral(text, needle) {
  return text.split(needle).length - 1;
}

function assertOnlyOccurrences(files, needle, allowedRelativePaths, message) {
  const hits = [];
  for (const file of files) {
    const text = file.text;
    const count = countLiteral(text, needle);
    if (count > 0) {
      hits.push({ path: file.path, count });
    }
  }
  const unexpected = hits.filter((hit) => !allowedRelativePaths.includes(hit.path));
  assert.deepEqual(
    unexpected,
    [],
    `${message}\nUnexpected occurrences: ${unexpected.map((hit) => `${hit.path} x${hit.count}`).join(", ")}`
  );
  return hits;
}

const knowledgeView = await readText("server-web/views/KnowledgeView.vue");
const useConsole = await readText("server-web/composables/useConsole.ts");
const uploadSession = await readText("server-web/lib/knowledge-upload-session.ts");
const bridge = await readText("server-web/lib/bridge.ts");
const systemController = await readText("server/platform/common/console/http/controllers/system-controller.mjs");
const serverWebFiles = await Promise.all(
  (await listSourceFiles("server-web")).map(async (relativePath) => ({
    path: relativePath,
    text: await readText(relativePath)
  }))
);

const parseDocumentHits = assertOnlyOccurrences(
  serverWebFiles,
  "bridge.parseDocument(",
  ["server-web/views/KnowledgeView.vue"],
  "文档解析预览只能由知识库文档切分页调用，新增页面不得私接第二套预览入口。"
);
const parseDocumentCalls = [...knowledgeView.matchAll(/bridge\.parseDocument\(/g)];
assert.equal(
  parseDocumentHits.reduce((sum, hit) => sum + hit.count, 0),
  1,
  "前端只能保留一个文档解析预览调用点。"
);
assert.equal(
  parseDocumentCalls.length,
  1,
  "文档预览应只有一个前端 parseDocument 调用点，避免页面间分叉。"
);
assertOnlyOccurrences(
  serverWebFiles,
  "bridge.createUploadSession(",
  ["server-web/lib/knowledge-upload-session.ts"],
  "前端不得在页面或 composable 中直接创建上传会话；必须经统一上传模块。"
);
assertOnlyOccurrences(
  serverWebFiles,
  "sources: [",
  [],
  "前端不得构造 document-parser sources 旁路真实文件解析链路。"
);
assertIncludes(
  knowledgeView,
  "createKnowledgeUploadedFilesPayload",
  "文档切分预览必须用 uploadedFiles 进入后端解析运行时。"
);
assertNotIncludes(
  knowledgeView,
  "uploadSessionId:",
  "文档切分页面预览不能使用持久化 upload session。"
);
assertIncludes(
  knowledgeView,
  "dryRun: true",
  "文档预览必须显式声明 dryRun。"
);
assertIncludes(
  knowledgeView,
  "uploadedFiles,",
  "文档预览必须把文件 payload 交给统一后端解析入口。"
);
assertIncludes(
  useConsole,
  "createKnowledgeUploadSession(filesToUpload",
  "正式入库必须继续使用统一 upload session 创建 job。"
);
assertIncludes(
  uploadSession,
  "createKnowledgeUploadSession",
  "正式入库 upload session 逻辑必须集中在共用模块。"
);
assertIncludes(
  uploadSession,
  "createKnowledgeUploadedFilesPayload",
  "预览文件 payload 逻辑必须集中在共用模块。"
);
assertIncludes(
  bridge,
  'postJson<DocumentParseResponse>("/api/knowledge/document-parser/parse", payload)',
  "前端文档预览必须调用统一文档解析 HTTP 入口。"
);
assertIncludes(
  bridge,
  "cleanupUploadSession?: boolean",
  "统一文档解析入口需要支持临时 upload session 清理。"
);
assertIncludes(
  systemController,
  "documentParsingRuntime.parseDocuments",
  "后端文档 dry-run 必须调用真实文档解析运行时。"
);
assertIncludes(
  systemController,
  "dryRun: true",
  "后端文档 dry-run 入口必须强制 dryRun。"
);
assertIncludes(
  systemController,
  "deleteUploadSession",
  "upload session 形式的 dry-run 预览必须支持清理暂存文件。"
);

console.log("Document preview gate passed.");
