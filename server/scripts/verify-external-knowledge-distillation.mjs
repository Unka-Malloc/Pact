import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { strToU8, unzipSync, zipSync } from "fflate";
import { startHttpServer } from "../services/server-runtime/http-server.mjs";
import { SERVER_API_OPERATIONS } from "../platform/common/operation-dispatcher/operation-registry.mjs";
import { createToolCatalog } from "../platform/specialized/capabilities/tools/tool-management-core/catalog.mjs";
import { authHeaders, installAuthenticatedFetch } from "./test-auth-helper.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");
const serviceEntry = path.join(repoRoot, "external-services/knowledge-distillation-service/server.mjs");

async function freePort() {
  const server = http.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return address.port;
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  return {
    status: response.status,
    ok: response.ok,
    headers: response.headers,
    payload: text.trim() ? JSON.parse(text) : {}
  };
}

async function waitForService(url, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const health = await fetchJson(`${url}/health`);
      if (health.status === 200 && health.payload.ok === true) {
        return health.payload;
      }
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
  throw new Error(`External distillation service did not become healthy: ${lastError?.message || "timeout"}`);
}

function startExternalService({ port, dataDir }) {
  const child = spawn(process.execPath, [serviceEntry], {
    cwd: repoRoot,
    env: {
      ...process.env,
      HOST: "127.0.0.1",
      PORT: String(port),
      SERVICE_DATA_DIR: dataDir
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  let stderr = "";
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString("utf8");
  });
  return {
    child,
    async close() {
      if (child.exitCode !== null) {
        return;
      }
      child.kill("SIGTERM");
      await new Promise((resolve) => {
        const timer = setTimeout(() => {
          child.kill("SIGKILL");
          resolve();
        }, 2000);
        child.once("exit", () => {
          clearTimeout(timer);
          resolve();
        });
      });
    },
    stderr: () => stderr
  };
}

const requiredOperationIds = [
  "external.knowledge.distillation.service.health",
  "external.knowledge.distillation.service.capabilities",
  "external.knowledge.distillation.service.runtime_health",
  "external.knowledge.distillation.runs.list",
  "external.knowledge.distillation.runs.create",
  "external.knowledge.distillation.runs.get",
  "external.knowledge.distillation.runs.cancel",
  "external.knowledge.distillation.evidence.query",
  "external.knowledge.distillation.projects.evidence.query",
  "external.knowledge.distillation.artifacts.export"
];

const operationIds = new Set(SERVER_API_OPERATIONS.map((operation) => operation.id));
for (const operationId of requiredOperationIds) {
  assert.equal(operationIds.has(operationId), true, `${operationId} must be registered`);
}

const catalog = createToolCatalog({ operations: SERVER_API_OPERATIONS });
const toolIds = new Set(catalog.tools.map((tool) => tool.id));
for (const toolId of [
  "pact.external.knowledge.distillation.health",
  "pact.external.knowledge.distillation.capabilities",
  "pact.external.knowledge.distillation.runtimeHealth",
  "pact.external.knowledge.distillation.runs.list",
  "pact.external.knowledge.distillation.runs.create",
  "pact.external.knowledge.distillation.runs.get",
  "pact.external.knowledge.distillation.runs.cancel",
  "pact.external.knowledge.distillation.evidence.query",
  "pact.external.knowledge.distillation.projects.evidence.query",
  "pact.external.knowledge.distillation.artifacts.export"
]) {
  assert.equal(toolIds.has(toolId), true, `${toolId} must be exposed in Tool Management catalog`);
}

const largePdfText = Array.from({ length: 420 }, (_, index) => (
  `Section ${index + 1}: Large engineering manual pages describe deployment routing, parser fallback, OCR recovery, and evidence windows for long PDF projects. `
)).join("");

function base64Text(text) {
  return Buffer.from(String(text), "utf8").toString("base64");
}

function base64Zip(entries) {
  const zipped = zipSync(Object.fromEntries(
    Object.entries(entries).map(([name, text]) => [name, strToU8(String(text))])
  ));
  return Buffer.from(zipped).toString("base64");
}

function zipBuffer(entries) {
  return Buffer.from(zipSync(Object.fromEntries(
    Object.entries(entries).map(([name, text]) => [name, strToU8(String(text))])
  )));
}

function tarOctal(value, length) {
  return String(Math.max(0, Number(value) || 0).toString(8)).padStart(length - 1, "0").slice(-(length - 1));
}

function writeTarField(header, offset, length, value) {
  header.write(String(value || "").slice(0, length), offset, length, "utf8");
}

function tarBuffer(entries = {}) {
  const chunks = [];
  for (const [name, text] of Object.entries(entries)) {
    const data = Buffer.from(String(text), "utf8");
    const header = Buffer.alloc(512, 0);
    writeTarField(header, 0, 100, name);
    writeTarField(header, 100, 8, `${tarOctal(0o644, 7)}\0`);
    writeTarField(header, 108, 8, `${tarOctal(0, 7)}\0`);
    writeTarField(header, 116, 8, `${tarOctal(0, 7)}\0`);
    writeTarField(header, 124, 12, `${tarOctal(data.length, 11)}\0`);
    writeTarField(header, 136, 12, `${tarOctal(Math.floor(Date.now() / 1000), 11)}\0`);
    header.fill(0x20, 148, 156);
    writeTarField(header, 156, 1, "0");
    writeTarField(header, 257, 6, "ustar\0");
    writeTarField(header, 263, 2, "00");
    const checksum = header.reduce((sum, byte) => sum + byte, 0);
    writeTarField(header, 148, 8, `${tarOctal(checksum, 6)}\0 `);
    chunks.push(header, data);
    const padding = (512 - (data.length % 512)) % 512;
    if (padding) {
      chunks.push(Buffer.alloc(padding, 0));
    }
  }
  chunks.push(Buffer.alloc(1024, 0));
  return Buffer.concat(chunks);
}

function base64Tar(entries = {}) {
  return tarBuffer(entries).toString("base64");
}

function base64Tgz(entries = {}) {
  return gzipSync(tarBuffer(entries)).toString("base64");
}

function multipartEmailBase64({ boundary = "pact-boundary", attachmentName = "invoice.csv", attachmentMediaType = "text/csv", attachmentText = "" } = {}) {
  const attachmentBase64 = Buffer.from(String(attachmentText || ""), "utf8").toString("base64");
  return base64Text([
    "From: analyst@example.test",
    "To: pact@example.test",
    "Subject: Attachment distillation evidence",
    "Date: Sun, 31 May 2026 10:00:00 +0000",
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=utf-8",
    "",
    "Please review the attached invoice evidence for project distillation.",
    `--${boundary}`,
    `Content-Type: ${attachmentMediaType}; name="${attachmentName}"`,
    "Content-Transfer-Encoding: base64",
    `Content-Disposition: attachment; filename="${attachmentName}"`,
    "",
    attachmentBase64,
    `--${boundary}--`,
    ""
  ].join("\r\n"));
}

function mboxBase64() {
  const attachmentBase64 = Buffer.from("vendor,total\nMboxCo,144", "utf8").toString("base64");
  return base64Text([
    "From analyst@example.test Sun May 31 10:00:00 2026",
    "From: analyst@example.test",
    "To: pact@example.test",
    "Subject: MBOX Architecture Evidence",
    "Date: Sun, 31 May 2026 10:00:00 +0000",
    "Content-Type: text/plain; charset=utf-8",
    "",
    "MBOX first message records architecture parser routing evidence.",
    "From finance@example.test Sun May 31 10:05:00 2026",
    "From: finance@example.test",
    "To: pact@example.test",
    "Subject: MBOX Invoice Attachment",
    "Date: Sun, 31 May 2026 10:05:00 +0000",
    "Content-Type: multipart/mixed; boundary=\"mbox-boundary\"",
    "",
    "--mbox-boundary",
    "Content-Type: text/plain; charset=utf-8",
    "",
    "MBOX second message contains invoice attachment evidence.",
    "--mbox-boundary",
    "Content-Type: text/csv; name=\"mbox-invoice.csv\"",
    "Content-Transfer-Encoding: base64",
    "Content-Disposition: attachment; filename=\"mbox-invoice.csv\"",
    "",
    attachmentBase64,
    "--mbox-boundary--",
    ""
  ].join("\r\n"));
}

function msgTextBase64(text = "Outlook MSG Tika fallback extracts project schedule evidence.") {
  return base64Text(text);
}

const sampleDocxBase64 = base64Zip({
  "word/document.xml": [
    "<w:document xmlns:w=\"http://schemas.openxmlformats.org/wordprocessingml/2006/main\">",
    "<w:body><w:p><w:r><w:t>Standalone DOCX payload parser extracts contract decisions.</w:t></w:r></w:p></w:body>",
    "</w:document>"
  ].join("")
});

const samplePptxBase64 = base64Zip({
  "ppt/slides/slide1.xml": [
    "<p:sld xmlns:p=\"http://schemas.openxmlformats.org/presentationml/2006/main\" ",
    "xmlns:a=\"http://schemas.openxmlformats.org/drawingml/2006/main\">",
    "<p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>Standalone PPTX slide parser extracts roadmap decisions.</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld>",
    "</p:sld>"
  ].join("")
});

const sampleXlsxBase64 = base64Zip({
  "xl/sharedStrings.xml": [
    "<sst xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\">",
    "<si><t>Vendor</t></si><si><t>Total</t></si><si><t>Payment Date</t></si>",
    "<si><t>Acme</t></si><si><t>42</t></si><si><t>2026-05-31</t></si>",
    "</sst>"
  ].join(""),
  "xl/worksheets/sheet1.xml": [
    "<worksheet xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\">",
    "<sheetData><row><c t=\"s\"><v>0</v></c><c t=\"s\"><v>1</v></c><c t=\"s\"><v>2</v></c></row><row><c t=\"s\"><v>3</v></c><c t=\"s\"><v>4</v></c><c t=\"s\"><v>5</v></c></row></sheetData>",
    "</worksheet>"
  ].join("")
});

const sampleZipBase64 = base64Zip({
  "docs/architecture.md": "# Architecture\nExternal service route-first parsing.",
  "data/invoice.csv": "vendor,total\nAcme,42"
});

const samplePdfBase64 = base64Text([
  "%PDF-1.4",
  "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj",
  "2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj",
  "3 0 obj << /Type /Page /Parent 2 0 R /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj",
  "4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj",
  "5 0 obj << /Length 92 >>",
  "stream",
  "BT /F1 12 Tf 72 720 Td (Standalone PDF payload parser extracts evidence.) Tj ET",
  "endstream",
  "endobj",
  "trailer << /Root 1 0 R >>",
  "%%EOF"
].join("\n"));

const previousUrl = process.env.PACT_EXTERNAL_KNOWLEDGE_DISTILLATION_URL;
const reuseServiceUrl = String(process.env.PACT_VERIFY_EXTERNAL_KD_SERVICE_URL || "").replace(/\/+$/, "");
const serviceDataDir = reuseServiceUrl
  ? ""
  : await fs.mkdtemp(path.join(os.tmpdir(), "pact-external-kd-service-"));
const pactDataDir = await fs.mkdtemp(path.join(os.tmpdir(), "pact-external-kd-platform-"));
const port = reuseServiceUrl ? 0 : await freePort();
const serviceUrl = reuseServiceUrl || `http://127.0.0.1:${port}`;
const service = reuseServiceUrl
  ? { async close() {} }
  : startExternalService({ port, dataDir: serviceDataDir });
let pactServer = null;
let fileRefDocument = null;
let deferredFileRefDocument = null;
let mountedArchiveDocument = null;
const mountedStructuredDocuments = [];
const mountedLegacyOfficeDocuments = [];

try {
  if (serviceDataDir) {
    const fileRefPath = path.join(serviceDataDir, "mounted-large-project.md");
    await fs.writeFile(
      fileRefPath,
      Array.from({ length: 90 }, (_, index) => (
        `Mounted project section ${index + 1}: filePath content references must avoid base64 transport and still enter route-first distillation windows.`
      )).join("\n\n")
    );
    const fileStat = await fs.stat(fileRefPath);
    fileRefDocument = {
      sourceId: "source-18",
      title: "Mounted Large Project",
      fileName: "mounted-large-project.md",
      mediaType: "text/markdown",
      byteSize: fileStat.size,
      filePath: fileRefPath
    };
    const deferredPath = path.join(serviceDataDir, "mounted-large-binary.pdf");
    await fs.writeFile(deferredPath, Buffer.alloc((9 * 1024 * 1024) + 17, 0x25));
    const deferredStat = await fs.stat(deferredPath);
    deferredFileRefDocument = {
      sourceId: "source-19",
      title: "Mounted Large Binary PDF",
      fileName: "mounted-large-binary.pdf",
      mediaType: "application/pdf",
      byteSize: deferredStat.size,
      filePath: deferredPath
    };
    const mountedArchivePath = path.join(serviceDataDir, "mounted-project-package.tar");
    const mountedArchiveText = Array.from({ length: 80_000 }, (_, index) => (
      `Mounted archive section ${index + 1}: archive filePath packages must expand without loading the whole project package into memory.`
    )).join("\n");
    await fs.writeFile(mountedArchivePath, tarBuffer({
      "mounted/large-project.md": `# Mounted Archive Project\n${mountedArchiveText}`,
      "mounted/invoice.csv": "vendor,total\nMountedArchiveCo,512"
    }));
    const mountedArchiveStat = await fs.stat(mountedArchivePath);
    mountedArchiveDocument = {
      sourceId: "source-20",
      title: "Mounted Archive Package",
      fileName: "mounted-project-package.tar",
      mediaType: "application/x-tar",
      byteSize: mountedArchiveStat.size,
      filePath: mountedArchivePath
    };
    const mountedStructuredSpecs = [
      {
        sourceId: "source-21",
        title: "Mounted DOCX Project Plan",
        fileName: "mounted-project-plan.docx",
        mediaType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        entries: {
          "word/document.xml": [
            "<w:document xmlns:w=\"http://schemas.openxmlformats.org/wordprocessingml/2006/main\"><w:body>",
            Array.from({ length: 120 }, (_, index) => (
              `<w:p><w:r><w:t>Mounted DOCX section ${index + 1} confirms structured filePath extraction, project convergence, and evidence windowing.</w:t></w:r></w:p>`
            )).join(""),
            "</w:body></w:document>"
          ].join("")
        }
      },
      {
        sourceId: "source-22",
        title: "Mounted PPTX Roadmap",
        fileName: "mounted-roadmap.pptx",
        mediaType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        entries: {
          "ppt/slides/slide1.xml": [
            "<p:sld xmlns:p=\"http://schemas.openxmlformats.org/presentationml/2006/main\" xmlns:a=\"http://schemas.openxmlformats.org/drawingml/2006/main\">",
            "<p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>Mounted PPTX slide route validates structured filePath parser coverage.</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld>",
            "</p:sld>"
          ].join("")
        }
      },
      {
        sourceId: "source-23",
        title: "Mounted XLSX Evidence Table",
        fileName: "mounted-evidence.xlsx",
        mediaType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        entries: {
          "xl/sharedStrings.xml": [
            "<sst xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\">",
            "<si><t>Parser</t></si><si><t>Status</t></si><si><t>Report Date</t></si>",
            "<si><t>structured filePath</t></si><si><t>completed</t></si><si><t>2026-06-15</t></si>",
            "</sst>"
          ].join(""),
          "xl/worksheets/sheet1.xml": [
            "<worksheet xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\">",
            "<sheetData><row><c t=\"s\"><v>0</v></c><c t=\"s\"><v>1</v></c><c t=\"s\"><v>2</v></c></row><row><c t=\"s\"><v>3</v></c><c t=\"s\"><v>4</v></c><c t=\"s\"><v>5</v></c></row></sheetData>",
            "</worksheet>"
          ].join("")
        }
      },
      {
        sourceId: "source-24",
        title: "Mounted OpenDocument Notes",
        fileName: "mounted-notes.odt",
        mediaType: "application/vnd.oasis.opendocument.text",
        entries: {
          "mimetype": "application/vnd.oasis.opendocument.text",
          "content.xml": [
            "<?xml version=\"1.0\" encoding=\"UTF-8\"?>",
            "<office:document-content xmlns:office=\"urn:oasis:names:tc:opendocument:xmlns:office:1.0\" xmlns:text=\"urn:oasis:names:tc:opendocument:xmlns:text:1.0\">",
            "<office:body><office:text><text:p>Mounted OpenDocument filePath parser keeps ODT evidence in the distillation corpus.</text:p></office:text></office:body>",
            "</office:document-content>"
          ].join("")
        }
      },
      {
        sourceId: "source-25",
        title: "Mounted EPUB Handbook",
        fileName: "mounted-handbook.epub",
        mediaType: "application/epub+zip",
        entries: {
          "mimetype": "application/epub+zip",
          "META-INF/container.xml": "<?xml version=\"1.0\"?><container version=\"1.0\"></container>",
          "OEBPS/chapter1.xhtml": [
            "<html xmlns=\"http://www.w3.org/1999/xhtml\"><body>",
            "<h1>Mounted EPUB Evidence</h1>",
            "<p>Mounted EPUB chapter routing verifies ebook filePath distillation compatibility.</p>",
            "</body></html>"
          ].join("")
        }
      }
    ];
    for (const spec of mountedStructuredSpecs) {
      const filePath = path.join(serviceDataDir, spec.fileName);
      await fs.writeFile(filePath, zipBuffer(spec.entries));
      const stat = await fs.stat(filePath);
      mountedStructuredDocuments.push({
        sourceId: spec.sourceId,
        title: spec.title,
        fileName: spec.fileName,
        mediaType: spec.mediaType,
        byteSize: stat.size,
        filePath
      });
    }
    const largeLegacyRtf = [
      "{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0 Arial;}}\\f0\\fs24",
      Array.from({ length: 90_000 }, (_, index) => (
        `Mounted legacy DOC paragraph ${index + 1} proves Tika filePath extraction avoids direct memory reads for oversized Office payloads.\\par`
      )).join("\n"),
      "}"
    ].join("\n");
    const mountedLegacySpecs = [
      {
        sourceId: "source-30",
        title: "Mounted Legacy DOC",
        fileName: "mounted-legacy-large.doc",
        mediaType: "application/msword",
        content: largeLegacyRtf
      },
      {
        sourceId: "source-31",
        title: "Mounted RTF Notes",
        fileName: "mounted-notes.rtf",
        mediaType: "application/rtf",
        content: "{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0 Arial;}}\\f0\\fs24 Mounted RTF filePath extraction keeps legacy text distillable.\\par}"
      },
      {
        sourceId: "source-32",
        title: "Mounted Legacy PPT",
        fileName: "mounted-legacy.ppt",
        mediaType: "application/vnd.ms-powerpoint",
        content: "{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0 Arial;}}\\f0\\fs24 Mounted legacy PPT route uses Tika filePath extraction.\\par}"
      },
      {
        sourceId: "source-33",
        title: "Mounted Legacy XLS",
        fileName: "mounted-legacy.xls",
        mediaType: "application/vnd.ms-excel",
        content: "{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0 Arial;}}\\f0\\fs24 Mounted legacy XLS route uses Tika filePath extraction.\\par}"
      }
    ];
    for (const spec of mountedLegacySpecs) {
      const filePath = path.join(serviceDataDir, spec.fileName);
      await fs.writeFile(filePath, spec.content);
      const stat = await fs.stat(filePath);
      mountedLegacyOfficeDocuments.push({
        sourceId: spec.sourceId,
        title: spec.title,
        fileName: spec.fileName,
        mediaType: spec.mediaType,
        byteSize: stat.size,
        filePath
      });
    }
  }
  await waitForService(serviceUrl);
  const directRuntime = await fetchJson(`${serviceUrl}/v1/runtime/health`);
  assert.equal(directRuntime.status, 200);
  assert.equal(directRuntime.payload.protocolVersion, "pact.external-knowledge-distillation.v1.runtime-doctor");
  assert.ok(directRuntime.payload.runtimes["tika.app"], "runtime doctor must report Tika fallback runtime state");
  assert.ok(directRuntime.payload.runtimes["ocr.tesseract"], "runtime doctor must report image OCR runtime state");
  assert.ok(directRuntime.payload.runtimes["pdf.pymupdf"], "runtime doctor must report PDF visual runtime state");
  assert.ok(directRuntime.payload.runtimes["pdf.pdftotext"], "runtime doctor must report PDF file-ref text extraction runtime state");
  const directGapReport = await fetchJson(`${serviceUrl}/v1/reference-gap-report`);
  assert.equal(directGapReport.status, 200);
  assert.equal(directGapReport.payload.strategy, "reference-framework-gap-report.v1");
  assert.equal(directGapReport.payload.referenceFrameworks.count >= 6, true);
  assert.equal(directGapReport.payload.frameworks.some((framework) => framework.id === "graphrag" && framework.absorbedPatterns.length > 0), true);

  process.env.PACT_EXTERNAL_KNOWLEDGE_DISTILLATION_URL = serviceUrl;
  pactServer = await startHttpServer({
    userDataPath: pactDataDir,
    distPath: "",
    port: 0,
    runtimeOptions: { profile: "minimal" }
  });
  const auth = await installAuthenticatedFetch(pactServer);

  const interfaces = await fetchJson(`${pactServer.url}/api/interfaces`, {
    headers: authHeaders(auth)
  });
  assert.equal(interfaces.status, 200);
  const runtimeOperationIds = new Set(interfaces.payload.interfaces.map((item) => item.id));
  for (const operationId of requiredOperationIds) {
    assert.equal(runtimeOperationIds.has(operationId), true, `${operationId} must be visible through /api/interfaces`);
  }

  const health = await fetchJson(`${pactServer.url}/api/external/knowledge/distillation/health`, {
    headers: authHeaders(auth)
  });
  assert.equal(health.status, 200);
  assert.equal(health.payload.serviceKind, "externalKnowledgeDistillation");
  assert.equal(health.payload.pactRegistration.namespace, "external.knowledge.distillation");
  assert.ok(health.payload.runtimeDoctor.summary, "health response must expose runtime doctor summary");

  const capabilities = await fetchJson(`${pactServer.url}/api/external/knowledge/distillation/capabilities`, {
    headers: authHeaders(auth)
  });
  assert.equal(capabilities.status, 200);
  assert.equal(capabilities.payload.api.createRun, "POST /v1/distillation/runs");
  assert.equal(capabilities.payload.api.evidenceQuery, "GET /v1/distillation/runs/:runId/evidence");
  assert.equal(capabilities.payload.api.projectEvidenceQuery, "GET /v1/projects/:projectId/evidence");
  assert.equal(capabilities.payload.api.referenceGapReport, "GET /v1/reference-gap-report");
  assert.equal(capabilities.payload.classification.supported, true);
  assert.equal(capabilities.payload.responseProfiles.includes("agent"), true);
  assert.equal(capabilities.payload.timeFiltering.supported, true);
  assert.equal(capabilities.payload.timeFiltering.strategy, "document-window-time-filter.v1");
  assert.equal(capabilities.payload.timeFiltering.timeFields.includes("eventTime"), true);
  assert.equal(capabilities.payload.largeDocumentPolicy.strategy, "streaming-windowed");
  assert.equal(capabilities.payload.parserExecution.payloadModes.includes("contentBase64"), true);
  assert.equal(capabilities.payload.parserExecution.payloadModes.includes("filePath"), true);
  assert.equal(capabilities.payload.parserExecution.payloadModes.includes("contentRef"), true);
  assert.equal(capabilities.payload.parserExecution.builtInParsers.includes("payload.file-ref"), true);
  assert.equal(capabilities.payload.parserExecution.builtInParsers.includes("payload.file-ref-deferred"), true);
  assert.equal(capabilities.payload.parserExecution.builtInParsers.includes("payload.stream-text"), true);
  assert.equal(capabilities.payload.parserExecution.builtInParsers.includes("config.key-value"), true);
  assert.equal(capabilities.payload.parserExecution.builtInParsers.includes("diagram.structure"), true);
  assert.equal(capabilities.payload.parserExecution.builtInParsers.includes("notebook.cells"), true);
  assert.equal(capabilities.payload.parserExecution.builtInParsers.includes("code.structure"), true);
  assert.equal(capabilities.payload.parserExecution.builtInParsers.includes("structured-zip.file-ref"), true);
  assert.equal(capabilities.payload.parserExecution.builtInParsers.includes("pdf.text.basic"), true);
  assert.equal(capabilities.payload.parserExecution.builtInParsers.includes("pdf.text.pdftotext"), true);
  assert.equal(capabilities.payload.parserExecution.builtInParsers.includes("tika.text.app"), true);
  assert.equal(capabilities.payload.parserExecution.builtInParsers.includes("archive.expand-route"), true);
  assert.equal(capabilities.payload.parserExecution.builtInParsers.includes("archive.child-file.route"), true);
  assert.equal(capabilities.payload.parserExecution.builtInParsers.includes("archive.file-ref.expand"), true);
  assert.equal(capabilities.payload.parserExecution.builtInParsers.includes("archive.entry-file-ref"), true);
  assert.equal(capabilities.payload.parserExecution.builtInParsers.includes("archive.tar.container"), true);
  assert.equal(capabilities.payload.parserExecution.builtInParsers.includes("archive.gzip.decompress"), true);
  assert.equal(capabilities.payload.parserExecution.builtInParsers.includes("archive.7z.extract"), true);
  assert.equal(capabilities.payload.parserExecution.builtInParsers.includes("email.msg.tika"), true);
  assert.equal(capabilities.payload.parserExecution.builtInParsers.includes("email.mbox"), true);
  assert.equal(capabilities.payload.parserExecution.builtInParsers.includes("email.attachment-route"), true);
  assert.equal(capabilities.payload.parserExecution.builtInParsers.includes("open-document.structured"), true);
  assert.equal(capabilities.payload.parserExecution.builtInParsers.includes("ebook.epub"), true);
  assert.equal(capabilities.payload.parserExecution.builtInParsers.includes("table.sheet.headers"), true);
  assert.equal(capabilities.payload.parserExecution.builtInParsers.includes("table.sheet.cells"), true);
  assert.equal(capabilities.payload.parserExecution.builtInParsers.includes("tika.text.file-ref"), true);
  assert.equal(capabilities.payload.parserExecution.emptyCorpusErrorCode, "EMPTY_RAW_CORPUS");
  assert.ok(capabilities.payload.runtimeDoctor.summary, "capabilities must expose runtime doctor summary");
  assert.equal(capabilities.payload.classification.strategy, "hashing_embedding_window_community_classification_v2");
  assert.equal(capabilities.payload.classification.embedding.dimensions, 128);
  assert.equal(capabilities.payload.classification.embedding.windowCommunityThreshold, 0.31);
  assert.equal(capabilities.payload.classification.referencePatterns.includes("graphrag.community-reports"), true);
  assert.equal(capabilities.payload.grounding.strategy, "claim-evidence-topk-conflict-gating.v2");
  assert.equal(capabilities.payload.grounding.promotionGate, "claim-grounded-promotion");
  assert.equal(capabilities.payload.incrementalConvergence.supported, true);
  assert.equal(capabilities.payload.incrementalConvergence.strategy, "project-snapshot-incremental-convergence.v1");
  assert.equal(capabilities.payload.artifacts.includes("project-snapshot-json"), true);
  assert.equal(capabilities.payload.graphEvidence.supported, true);
  assert.equal(capabilities.payload.graphEvidence.strategy, "graph-lite-entity-relationship-evidence-pack.v1");
  assert.equal(capabilities.payload.graphEvidence.tables.includes("relationships"), true);
  assert.equal(capabilities.payload.graphEvidence.query.supported, true);
  assert.equal(capabilities.payload.graphEvidence.query.strategy, "graph-lite-evidence-query.v1");
  assert.equal(capabilities.payload.graphEvidence.query.filters.includes("entity"), true);
  assert.equal(capabilities.payload.graphEvidence.projectQuery.supported, true);
  assert.equal(capabilities.payload.graphEvidence.projectQuery.strategy, "project-graph-evidence-convergence-query.v1");
  assert.equal(capabilities.payload.graphEvidence.projectQuery.modes.includes("all"), true);
  assert.equal(capabilities.payload.artifacts.includes("portable-docx"), true);
  assert.equal(capabilities.payload.artifacts.includes("workspace-package-zip"), true);
  assert.equal(capabilities.payload.artifacts.includes("evidence-pack-json"), true);
  assert.equal(capabilities.payload.artifacts.includes("reference-gap-report-json"), true);
  assert.equal(capabilities.payload.referenceGapReport.strategy, "reference-framework-gap-report.v1");
  for (const extension of [".pdf", ".docx", ".doc", ".rtf", ".xlsx", ".pptx", ".odt", ".ods", ".odp", ".epub", ".eml", ".msg", ".mbox", ".png", ".pgm", ".zip", ".tar", ".tgz", ".tar.gz", ".7z", ".md", ".json", ".ipynb", ".yaml", ".toml", ".ini", ".properties", ".env", ".svg", ".drawio", ".mmd", ".mermaid", ".puml", ".plantuml", ".js", ".ts", ".py", ".go", ".rs"]) {
    assert.equal(
      capabilities.payload.fileCompatibility.supportedExtensions.includes(extension),
      true,
      `${extension} must be advertised as a routed file format`
    );
  }
  const pdfFormat = capabilities.payload.fileCompatibility.formats.find((format) => format.id === "pdf");
  assert.ok(pdfFormat, "PDF route must be described in capabilities");
  assert.equal(pdfFormat.preferredParser, "pdf.text.tika-safe");
  assert.equal(pdfFormat.fallbackParsers.includes("ocr.page"), true);
  assert.ok(
    capabilities.payload.referenceFrameworks.frameworks.length >= 6,
    "external service must expose local reference framework baseline"
  );

  const runtimeHealth = await fetchJson(`${pactServer.url}/api/external/knowledge/distillation/runtime/health`, {
    headers: authHeaders(auth)
  });
  assert.equal(runtimeHealth.status, 200);
  assert.equal(runtimeHealth.payload.protocolVersion, "pact.external-knowledge-distillation.v1.runtime-doctor");
  assert.equal(runtimeHealth.payload.pactRegistration.namespace, "external.knowledge.distillation");
  assert.ok(runtimeHealth.payload.runtimes["tika.app"], "platform runtime health must proxy Tika fallback runtime state");
  assert.ok(runtimeHealth.payload.runtimes["ocr.tesseract"], "platform runtime health must proxy OCR runtime state");

  const createRun = await fetchJson(`${pactServer.url}/api/external/knowledge/distillation/runs`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(auth, { method: "POST" })
    },
    body: JSON.stringify({
      query: "外部知识蒸馏注册验证",
      title: "外部知识蒸馏注册验证",
      rawDocuments: [
        {
          sourceId: "source-1",
          title: "Architecture",
          fileName: "architecture.md",
          mediaType: "text/markdown",
          byteSize: 2048,
          text: "External service APIs must use the external.knowledge.distillation namespace to avoid colliding with internal knowledge.distillation APIs."
        },
        {
          sourceId: "source-2",
          title: "Invoice",
          fileName: "invoice.xlsx",
          mediaType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          byteSize: 131072,
          text: "Finance invoices, payment dates, vendors, and tax totals must be distilled separately from platform architecture notes."
        },
        {
          sourceId: "source-3",
          title: "Large PDF Manual",
          fileName: "manual.pdf",
          mediaType: "application/pdf",
          byteSize: 80 * 1024 * 1024,
          text: largePdfText
        },
        {
          sourceId: "source-4",
          title: "Screenshot",
          fileName: "capture.png",
          mediaType: "image/png",
          byteSize: 2 * 1024 * 1024,
          text: "A screenshot shows an OCR recovery warning and a page-level parser trace that should stay separate from invoice data."
        },
        {
          sourceId: "source-5",
          title: "Markdown Payload",
          fileName: "payload.md",
          mediaType: "text/markdown",
          contentBase64: base64Text("# Payload Routing\nMarkdown contentBase64 must be parsed without Tika.")
        },
        {
          sourceId: "source-6",
          title: "JSON Payload",
          fileName: "payload.json",
          mediaType: "application/json",
          contentBase64: base64Text(JSON.stringify({ decision: "agent profile", owner: "external service" }))
        },
        {
          sourceId: "source-7",
          title: "CSV Payload",
          fileName: "payload.csv",
          mediaType: "text/csv",
          contentBase64: base64Text("vendor,total,payment_date\nAcme,42,2026-05-31\nGlobex,91,2026-06-30")
        },
        {
          sourceId: "source-28",
          title: "Service Configuration",
          fileName: "service.toml",
          mediaType: "application/toml",
          contentBase64: base64Text([
            "[service]",
            "name = \"external-kd\"",
            "workers = 4",
            "[parser]",
            "strategy = \"route-first\"",
            "fallback = \"traceable\""
          ].join("\n"))
        },
        {
          sourceId: "source-29",
          title: "Architecture Diagram",
          fileName: "architecture.drawio",
          mediaType: "application/vnd.jgraph.mxfile",
          contentBase64: base64Text([
            "<mxfile>",
            "  <diagram name=\"External Distillation\">",
            "    <mxGraphModel><root>",
            "      <mxCell id=\"0\" />",
            "      <mxCell id=\"1\" parent=\"0\" />",
            "      <mxCell id=\"api\" value=\"External API\" vertex=\"1\" parent=\"1\" />",
            "      <mxCell id=\"agent\" value=\"Agent Message\" vertex=\"1\" parent=\"1\" />",
            "      <mxCell id=\"evidence\" value=\"Graph Evidence Pack\" vertex=\"1\" parent=\"1\" />",
            "      <mxCell id=\"edge-api-agent\" value=\"agent request\" edge=\"1\" source=\"api\" target=\"agent\" parent=\"1\" />",
            "      <mxCell id=\"edge-api-evidence\" value=\"grounded query\" edge=\"1\" source=\"api\" target=\"evidence\" parent=\"1\" />",
            "    </root></mxGraphModel>",
            "  </diagram>",
            "</mxfile>"
          ].join("\n"))
        },
        {
          sourceId: "source-34",
          title: "Experiment Notebook",
          fileName: "experiment.ipynb",
          mediaType: "application/x-ipynb+json",
          contentBase64: base64Text(JSON.stringify({
            cells: [
              {
                cell_type: "markdown",
                source: [
                  "# Distillation Experiment\n",
                  "The notebook records evaluation metrics for external knowledge distillation and classification routing."
                ]
              },
              {
                cell_type: "code",
                execution_count: 1,
                source: [
                  "accuracy = 0.91\n",
                  "grounding_recall = 0.87\n",
                  "print('experiment accuracy', accuracy)"
                ],
                outputs: [
                  {
                    output_type: "stream",
                    name: "stdout",
                    text: ["experiment accuracy 0.91\n"]
                  }
                ]
              }
            ],
            metadata: {
              kernelspec: { name: "python3", language: "python" },
              language_info: { name: "python" }
            },
            nbformat: 4,
            nbformat_minor: 5
          }))
        },
        {
          sourceId: "source-35",
          title: "Distillation Runtime Source",
          fileName: "runtime.ts",
          mediaType: "text/x-source-code",
          contentBase64: base64Text([
            "import { createServer } from 'node:http';",
            "import { buildEvidencePack } from './graph-evidence';",
            "",
            "export interface RuntimeOptions {",
            "  responseProfile: 'agent' | 'console' | 'api';",
            "}",
            "",
            "export class DistillationRuntime {",
            "  constructor(private readonly options: RuntimeOptions) {}",
            "  async routeSource(source: unknown) {",
            "    // TODO: preserve parser trace for code-aware evidence.",
            "    return buildEvidencePack(source);",
            "  }",
            "}",
            "",
            "export function startServer(port: number) {",
            "  return createServer().listen(port);",
            "}"
          ].join("\n"))
        },
        {
          sourceId: "source-8",
          title: "DOCX Payload",
          fileName: "payload.docx",
          mediaType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          contentBase64: sampleDocxBase64
        },
        {
          sourceId: "source-9",
          title: "Workspace Package",
          fileName: "workspace.zip",
          mediaType: "application/zip",
          contentBase64: sampleZipBase64
        },
        {
          sourceId: "source-15",
          title: "Email With Attachment",
          fileName: "attachment-email.eml",
          mediaType: "message/rfc822",
          contentBase64: multipartEmailBase64({
            attachmentName: "invoice-attachment.csv",
            attachmentMediaType: "text/csv",
            attachmentText: "vendor,total,tax\nEmailCo,88,4"
          })
        },
        {
          sourceId: "source-26",
          title: "MBOX Mailbox",
          fileName: "mailbox.mbox",
          mediaType: "application/mbox",
          contentBase64: mboxBase64()
        },
        ...(directRuntime.payload.runtimes["tika.app"]?.available
          ? [{
              sourceId: "source-27",
              title: "Outlook MSG Payload",
              fileName: "outlook-message.msg",
              mediaType: "application/vnd.ms-outlook",
              contentBase64: msgTextBase64("Outlook MSG Tika parser extracts escalation schedule evidence.")
            }]
          : []),
        {
          sourceId: "source-16",
          title: "TAR Workspace Package",
          fileName: "workspace.tar",
          mediaType: "application/x-tar",
          contentBase64: base64Tar({
            "tar/architecture.md": "# TAR Architecture\nTAR child routing must preserve project evidence.",
            "tar/invoice.csv": "vendor,total\nTarCo,64"
          })
        },
        {
          sourceId: "source-17",
          title: "TGZ Workspace Package",
          fileName: "workspace.tgz",
          mediaType: "application/gzip",
          contentBase64: base64Tgz({
            "tgz/decision.md": "# TGZ Decision\nGzip tar payloads must decompress before child routing.",
            "tgz/metrics.json": JSON.stringify({ archive: "tgz", routed: true })
          })
        },
        ...(fileRefDocument ? [fileRefDocument] : []),
        ...(deferredFileRefDocument ? [deferredFileRefDocument] : []),
        ...(mountedArchiveDocument ? [mountedArchiveDocument] : []),
        ...mountedStructuredDocuments,
        ...(directRuntime.payload.runtimes["tika.app"]?.available ? mountedLegacyOfficeDocuments : []),
        {
          sourceId: "source-12",
          title: "PDF Payload",
          fileName: "payload.pdf",
          mediaType: "application/pdf",
          contentBase64: samplePdfBase64
        },
        {
          sourceId: "source-13",
          title: "PPTX Payload",
          fileName: "payload.pptx",
          mediaType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
          contentBase64: samplePptxBase64
        },
        {
          sourceId: "source-14",
          title: "XLSX Payload",
          fileName: "payload.xlsx",
          mediaType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          contentBase64: sampleXlsxBase64
        },
        {
          sourceId: "source-10",
          title: "Supplier Settlement",
          fileName: "settlement.txt",
          mediaType: "text/plain",
          text: "Supplier remittance calendar includes VAT amounts and settlement totals."
        },
        {
          sourceId: "source-11",
          title: "Noise",
          fileName: "noise.txt",
          mediaType: "text/plain",
          text: "ok"
        }
      ],
      requestedClaims: [
        "External service APIs must use the external.knowledge.distillation namespace.",
        "Submarine coffee roasting is guaranteed by the uploaded documents."
      ],
      maxWindowCharacters: 6000,
      windowOverlapCharacters: 300,
      responseProfile: "agent"
    })
  });
  assert.equal(createRun.status, 201);
  assert.equal(createRun.payload.serviceName, "external-knowledge-distillation");
  assert.equal(createRun.payload.serviceKind, "externalKnowledgeDistillation");
  assert.equal(createRun.payload.status, "completed");
  assert.equal(createRun.payload.responseProfile, "agent");
  assert.ok(createRun.payload.runId);
  assert.ok(
    createRun.payload.result.classification.groupCount >= 2,
    "unrelated source documents should be separated into classified distillation groups"
  );
  assert.equal(createRun.payload.result.algorithmVersion, "external-service.route-window-community-claim-gated-graph-incremental-distillation.v5");
  assert.equal(createRun.payload.result.incrementalPlan.strategy, "project-snapshot-incremental-convergence.v1");
  assert.equal(createRun.payload.result.incrementalPlan.snapshot.documents.length >= createRun.payload.result.corpusPlan.documents.length, true);
  assert.equal(createRun.payload.result.graphEvidence.strategy, "graph-lite-entity-relationship-evidence-pack.v1");
  assert.equal(createRun.payload.result.graphEvidence.summary.textUnitCount >= createRun.payload.result.corpusPlan.windowCount, true);
  assert.equal(createRun.payload.result.graphEvidence.summary.entityCount > 0, true);
  assert.equal(createRun.payload.result.graphEvidence.summary.relationshipCount > 0, true);
  assert.equal(createRun.payload.result.graphEvidence.covariates.some((claim) => claim.covariate_type === "claim"), true);
  assert.equal(createRun.payload.result.referenceGapReport.strategy, "reference-framework-gap-report.v1");
  assert.equal(createRun.payload.result.referenceGapReport.frameworks.some((framework) => framework.id === "graphrag" && framework.status === "absorbed-with-open-gaps"), true);
  assert.equal(createRun.payload.result.referenceGapReport.absorbedCapabilityMap.graphEvidence.evidence.includes("graph-lite-entity-relationship-evidence-pack.v1"), true);
  assert.equal(createRun.payload.result.classification.strategy, "hashing_embedding_window_community_classification_v2");
  assert.equal(createRun.payload.result.classification.embedding.dimensions, 128);
  assert.equal(createRun.payload.result.classification.referencePatterns.includes("graphrag.community-reports"), true);
  assert.equal(createRun.payload.result.classification.lowCouplingHighCohesion.enforced, true);
  assert.equal(createRun.payload.result.classification.communityCount >= createRun.payload.result.classification.coreGroupCount, true);
  assert.equal(createRun.payload.result.classification.garbageGroupCount >= 1, true);
  const financeGroup = createRun.payload.result.classification.groups.find((group) => (
    group.sourceIds.includes("source-2") && group.sourceIds.includes("source-10")
  ));
  assert.ok(financeGroup, "semantic embedding classification should group invoice and supplier remittance documents");
  assert.equal(financeGroup.kind, "topic");
  assert.equal(financeGroup.windowCommunities.length >= 1, true);
  assert.equal(financeGroup.distillationUnit.mode, "topic-isolated");
  assert.equal(financeGroup.distillationUnit.sourceIds.includes("source-2"), true);
  assert.equal(financeGroup.distillationUnit.windowRefs.length >= 1, true);
  assert.equal(typeof financeGroup.separationScore, "number");
  assert.equal(financeGroup.boundary, "isolated");
  assert.equal(createRun.payload.result.candidates.some((candidate) => (
    candidate.sourceIds.includes("source-2") &&
    candidate.distillationUnitId &&
    candidate.windowCommunityIds.length >= 1 &&
    candidate.promotionGate.promoted === true &&
    typeof candidate.separationScore === "number"
  )), true);
  const garbageGroup = createRun.payload.result.classification.groups.find((group) => group.sourceIds.includes("source-11"));
  assert.equal(garbageGroup?.kind, "garbage");
  assert.equal(garbageGroup?.excludedFromCore, true);
  assert.equal(createRun.payload.result.agentMessage.responseProfile, "agent");
  assert.equal(createRun.payload.result.routePlan.strategy, "extension-media-shape-routing.v1");
  assert.equal(createRun.payload.result.corpusPlan.allSizePolicy, "streaming-windowed");
  assert.equal(createRun.payload.result.convergence.strategy, "window-community-topic-project-convergence.v2");
  assert.equal(createRun.payload.result.convergence.layers.includes("window-community"), true);
  assert.equal(createRun.payload.result.convergence.communityReports.length >= 1, true);
  assert.equal(createRun.payload.result.convergence.projectSynthesis.mode, "multi-topic-separated");
  const routedPdf = createRun.payload.result.routePlan.documents.find((document) => document.sourceId === "source-3");
  assert.ok(routedPdf, "large PDF source must be present in route plan");
  assert.equal(routedPdf.formatId, "pdf");
  assert.equal(routedPdf.parserChain.includes("ocr.page"), true);
  assert.equal(routedPdf.riskFlags.includes("large-file-risk"), true);
  const routedSpreadsheet = createRun.payload.result.routePlan.documents.find((document) => document.sourceId === "source-2");
  assert.equal(routedSpreadsheet?.formatId, "spreadsheet");
  const routedImage = createRun.payload.result.routePlan.documents.find((document) => document.sourceId === "source-4");
  assert.equal(routedImage?.riskFlags.includes("ocr-required"), true);
  const largePdfCorpus = createRun.payload.result.corpusPlan.documents.find((document) => document.sourceId === "source-3");
  assert.ok(largePdfCorpus.windowPlan.windowCount > 1, "large PDF text must be split into multiple windows");
  assert.equal(largePdfCorpus.windowPlan.maxCharacters, 6000);
  const markdownPayloadCorpus = createRun.payload.result.corpusPlan.documents.find((document) => document.sourceId === "source-5");
  assert.equal(markdownPayloadCorpus.parseStatus, "completed");
  assert.equal(markdownPayloadCorpus.quality.evidenceStrength, "parsed-payload");
  assert.equal(markdownPayloadCorpus.parserTrace.some((trace) => trace.stage === "text.markdown"), true);
  const jsonPayloadCorpus = createRun.payload.result.corpusPlan.documents.find((document) => document.sourceId === "source-6");
  assert.equal(jsonPayloadCorpus.parserTrace.some((trace) => trace.stage === "structured.json"), true);
  const csvPayloadCorpus = createRun.payload.result.corpusPlan.documents.find((document) => document.sourceId === "source-7");
  assert.equal(csvPayloadCorpus.parserTrace.some((trace) => trace.stage === "table.csv"), true);
  assert.equal(csvPayloadCorpus.parserTrace.some((trace) => trace.stage === "table.time-index" && trace.status === "completed" && trace.from === "2026-05-31" && trace.to === "2026-06-30"), true);
  assert.equal(csvPayloadCorpus.timeRange.from, "2026-05-31");
  assert.equal(csvPayloadCorpus.timeRange.to, "2026-06-30");
  assert.equal(csvPayloadCorpus.windowPlan.windows.some((window) => window.timeRange?.from === "2026-05-31"), true);
  const configPayloadCorpus = createRun.payload.result.corpusPlan.documents.find((document) => document.sourceId === "source-28");
  assert.equal(configPayloadCorpus.route.formatId, "config");
  assert.equal(configPayloadCorpus.parserTrace.some((trace) => trace.stage === "config.key-value" && trace.status === "completed" && trace.entries >= 4), true);
  assert.match(configPayloadCorpus.windowPlan.windows[0]?.excerpt || "", /service\.name|parser\.strategy/);
  const diagramPayloadCorpus = createRun.payload.result.corpusPlan.documents.find((document) => document.sourceId === "source-29");
  assert.equal(diagramPayloadCorpus.route.formatId, "diagram");
  assert.equal(diagramPayloadCorpus.parserTrace.some((trace) => trace.stage === "diagram.structure" && trace.status === "completed" && trace.nodes >= 3 && trace.edges >= 2), true);
  assert.match(diagramPayloadCorpus.windowPlan.windows[0]?.excerpt || "", /External API|Agent Message|Graph Evidence Pack/);
  const notebookPayloadCorpus = createRun.payload.result.corpusPlan.documents.find((document) => document.sourceId === "source-34");
  assert.equal(notebookPayloadCorpus.route.formatId, "notebook");
  assert.equal(notebookPayloadCorpus.parserTrace.some((trace) => trace.stage === "notebook.cells" && trace.status === "completed" && trace.cells === 2 && trace.markdownCells === 1 && trace.codeCells === 1 && trace.outputs === 1), true);
  assert.match(notebookPayloadCorpus.windowPlan.windows[0]?.excerpt || "", /Distillation Experiment|experiment accuracy/);
  const sourcePayloadCorpus = createRun.payload.result.corpusPlan.documents.find((document) => document.sourceId === "source-35");
  assert.equal(sourcePayloadCorpus.route.formatId, "source-code");
  assert.equal(sourcePayloadCorpus.parserTrace.some((trace) => trace.stage === "code.structure" && trace.status === "completed" && trace.language === "typescript" && trace.imports >= 2 && trace.symbols >= 3 && trace.entryPoints >= 1 && trace.todos >= 1), true);
  assert.match(sourcePayloadCorpus.windowPlan.windows[0]?.excerpt || "", /DistillationRuntime|routeSource|startServer/);
  const docxPayloadCorpus = createRun.payload.result.corpusPlan.documents.find((document) => document.sourceId === "source-8");
  assert.equal(docxPayloadCorpus.parserTrace.some((trace) => trace.stage === "office.word.structured" && trace.status === "completed"), true);
  const zipPayloadCorpus = createRun.payload.result.corpusPlan.documents.find((document) => document.sourceId === "source-9");
  assert.equal(zipPayloadCorpus.parserTrace.some((trace) => trace.stage === "archive.manifest" && trace.status === "completed"), true);
  assert.equal(zipPayloadCorpus.parserTrace.some((trace) => trace.stage === "archive.expand-route" && trace.status === "completed"), true);
  const zipMarkdownChildCorpus = createRun.payload.result.corpusPlan.documents.find((document) => document.sourceId === "source-9!docs/architecture.md");
  assert.ok(zipMarkdownChildCorpus, "archive Markdown child must be expanded into corpus");
  assert.equal(zipMarkdownChildCorpus.parentSourceId, "source-9");
  assert.equal(zipMarkdownChildCorpus.route.formatId, "markdown");
  assert.equal(zipMarkdownChildCorpus.parserTrace.some((trace) => trace.stage === "archive.entry" && trace.status === "expanded"), true);
  assert.equal(zipMarkdownChildCorpus.parserTrace.some((trace) => trace.stage === "text.markdown" && trace.status === "completed"), true);
  const zipCsvChildCorpus = createRun.payload.result.corpusPlan.documents.find((document) => document.sourceId === "source-9!data/invoice.csv");
  assert.ok(zipCsvChildCorpus, "archive CSV child must be expanded into corpus");
  assert.equal(zipCsvChildCorpus.parentSourceId, "source-9");
  assert.equal(zipCsvChildCorpus.route.formatId, "spreadsheet");
  assert.equal(zipCsvChildCorpus.parserTrace.some((trace) => trace.stage === "table.csv" && trace.status === "completed"), true);
  const emailPayloadCorpus = createRun.payload.result.corpusPlan.documents.find((document) => document.sourceId === "source-15");
  assert.ok(emailPayloadCorpus, "email parent must be present in corpus");
  assert.equal(emailPayloadCorpus.route.formatId, "email");
  assert.equal(emailPayloadCorpus.parserTrace.some((trace) => trace.stage === "email.headers-body" && trace.status === "completed"), true);
  assert.equal(emailPayloadCorpus.parserTrace.some((trace) => trace.stage === "email.attachment-route" && trace.status === "completed"), true);
  const emailAttachmentCorpus = createRun.payload.result.corpusPlan.documents.find((document) => document.sourceId === "source-15!attachment:invoice-attachment.csv");
  assert.ok(emailAttachmentCorpus, "email CSV attachment must be expanded into corpus");
  assert.equal(emailAttachmentCorpus.parentSourceId, "source-15");
  assert.equal(emailAttachmentCorpus.route.formatId, "spreadsheet");
  assert.equal(emailAttachmentCorpus.parserTrace.some((trace) => trace.stage === "email.attachment" && trace.status === "expanded"), true);
  assert.equal(emailAttachmentCorpus.parserTrace.some((trace) => trace.stage === "table.csv" && trace.status === "completed"), true);
  const mboxPayloadCorpus = createRun.payload.result.corpusPlan.documents.find((document) => document.sourceId === "source-26");
  assert.ok(mboxPayloadCorpus, "MBOX parent must be present in corpus");
  assert.equal(mboxPayloadCorpus.route.formatId, "email");
  assert.equal(mboxPayloadCorpus.parserTrace.some((trace) => trace.stage === "email.mbox" && trace.status === "completed" && trace.messages === 2), true);
  assert.equal(mboxPayloadCorpus.parserTrace.some((trace) => trace.stage === "email.mbox-route" && trace.status === "completed"), true);
  const mboxMessageCorpus = createRun.payload.result.corpusPlan.documents.find((document) => document.sourceId === "source-26!message:1");
  assert.ok(mboxMessageCorpus, "MBOX first message must be expanded into corpus");
  assert.equal(mboxMessageCorpus.parentSourceId, "source-26");
  assert.equal(mboxMessageCorpus.route.formatId, "email");
  assert.equal(mboxMessageCorpus.parserTrace.some((trace) => trace.stage === "email.mbox-message" && trace.status === "expanded"), true);
  assert.equal(mboxMessageCorpus.parserTrace.some((trace) => trace.stage === "email.headers-body" && trace.status === "completed"), true);
  const mboxAttachmentCorpus = createRun.payload.result.corpusPlan.documents.find((document) => document.sourceId === "source-26!message:2!attachment:mbox-invoice.csv");
  assert.ok(mboxAttachmentCorpus, "MBOX message CSV attachment must be expanded into corpus");
  assert.equal(mboxAttachmentCorpus.parentSourceId, "source-26!message:2");
  assert.equal(mboxAttachmentCorpus.route.formatId, "spreadsheet");
  assert.equal(mboxAttachmentCorpus.parserTrace.some((trace) => trace.stage === "email.attachment" && trace.status === "expanded"), true);
  assert.equal(mboxAttachmentCorpus.parserTrace.some((trace) => trace.stage === "table.csv" && trace.status === "completed"), true);
  if (directRuntime.payload.runtimes["tika.app"]?.available) {
    const msgPayloadCorpus = createRun.payload.result.corpusPlan.documents.find((document) => document.sourceId === "source-27");
    assert.ok(msgPayloadCorpus, "MSG payload must be present in corpus when Tika is available");
    assert.equal(msgPayloadCorpus.route.formatId, "email");
    assert.equal(msgPayloadCorpus.parserTrace.some((trace) => trace.stage === "email.msg.tika" && trace.status === "completed"), true);
    assert.equal(msgPayloadCorpus.parserTrace.some((trace) => trace.stage === "email.headers-body"), false);
    assert.ok(msgPayloadCorpus.quality.textCharacters > 0, "MSG Tika parser must produce distillable text");
  }
  const tarPayloadCorpus = createRun.payload.result.corpusPlan.documents.find((document) => document.sourceId === "source-16");
  assert.equal(tarPayloadCorpus.parserTrace.some((trace) => trace.stage === "archive.tar.container" && trace.status === "completed"), true);
  assert.equal(tarPayloadCorpus.parserTrace.some((trace) => trace.stage === "archive.expand-route" && trace.status === "completed"), true);
  const tarMarkdownChildCorpus = createRun.payload.result.corpusPlan.documents.find((document) => document.sourceId === "source-16!tar/architecture.md");
  assert.ok(tarMarkdownChildCorpus, "TAR Markdown child must be expanded into corpus");
  assert.equal(tarMarkdownChildCorpus.parentSourceId, "source-16");
  assert.equal(tarMarkdownChildCorpus.route.formatId, "markdown");
  assert.equal(tarMarkdownChildCorpus.parserTrace.some((trace) => trace.stage === "text.markdown" && trace.status === "completed"), true);
  const tgzPayloadCorpus = createRun.payload.result.corpusPlan.documents.find((document) => document.sourceId === "source-17");
  assert.equal(tgzPayloadCorpus.parserTrace.some((trace) => trace.stage === "archive.gzip.decompress" && trace.status === "completed"), true);
  assert.equal(tgzPayloadCorpus.parserTrace.some((trace) => trace.stage === "archive.tar.container" && trace.status === "completed"), true);
  const tgzJsonChildCorpus = createRun.payload.result.corpusPlan.documents.find((document) => document.sourceId === "source-17!tgz/metrics.json");
  assert.ok(tgzJsonChildCorpus, "TGZ JSON child must be expanded into corpus");
  assert.equal(tgzJsonChildCorpus.parentSourceId, "source-17");
  assert.equal(tgzJsonChildCorpus.route.formatId, "json");
  assert.equal(tgzJsonChildCorpus.parserTrace.some((trace) => trace.stage === "structured.json" && trace.status === "completed"), true);
  if (fileRefDocument) {
    const fileRefCorpus = createRun.payload.result.corpusPlan.documents.find((document) => document.sourceId === "source-18");
    assert.ok(fileRefCorpus, "filePath mounted source must be present in corpus");
    assert.equal(fileRefCorpus.route.formatId, "markdown");
    assert.equal(fileRefCorpus.quality.evidenceStrength, "parsed-payload");
    assert.equal(fileRefCorpus.quality.suppliedPayloadKind, "file-ref-stream");
    assert.equal(fileRefCorpus.windowPlan.strategy, "file-ref-stream-windowing.v1");
    assert.equal(fileRefCorpus.parserTrace.some((trace) => trace.stage === "payload.file-ref" && trace.status === "completed"), true);
    assert.equal(fileRefCorpus.parserTrace.some((trace) => trace.stage === "payload.stream-text" && trace.status === "completed"), true);
    assert.equal(fileRefCorpus.windowPlan.windowCount > 1, true, "filePath large text must enter normal windowing");
  }
  if (deferredFileRefDocument) {
    const deferredFileRefCorpus = createRun.payload.result.corpusPlan.documents.find((document) => document.sourceId === "source-19");
    assert.ok(deferredFileRefCorpus, "oversized binary filePath source must remain visible in corpus");
    assert.equal(deferredFileRefCorpus.route.formatId, "pdf");
    assert.equal(deferredFileRefCorpus.parserTrace.some((trace) => trace.stage === "payload.file-ref" && trace.status === "completed"), true);
    assert.equal(deferredFileRefCorpus.parserTrace.some((trace) => trace.stage === "pdf.text.pdftotext"), true);
    assert.equal(deferredFileRefCorpus.parserTrace.some((trace) => trace.stage === "payload.file-ref-deferred"), false);
  }
  if (mountedArchiveDocument) {
    const mountedArchiveCorpus = createRun.payload.result.corpusPlan.documents.find((document) => document.sourceId === "source-20");
    assert.ok(mountedArchiveCorpus, "mounted archive parent must remain visible in corpus");
    assert.equal(mountedArchiveCorpus.route.formatId, "archive");
    assert.equal(mountedArchiveCorpus.quality.suppliedPayloadKind, "file-ref-archive");
    assert.equal(mountedArchiveCorpus.parserTrace.some((trace) => trace.stage === "archive.tar.extract" && trace.status === "completed"), true);
    assert.equal(mountedArchiveCorpus.parserTrace.some((trace) => trace.stage === "archive.file-ref.entries" && trace.status === "completed"), true);
    assert.equal(mountedArchiveCorpus.parserTrace.some((trace) => trace.stage === "archive.file-ref.expand" && trace.status === "completed"), true);
    assert.equal(mountedArchiveCorpus.parserTrace.some((trace) => trace.stage === "archive.expand-route" && trace.status === "completed"), true);
    const mountedArchiveMarkdownChild = createRun.payload.result.corpusPlan.documents.find((document) => document.sourceId === "source-20!mounted/large-project.md");
    assert.ok(mountedArchiveMarkdownChild, "mounted archive large Markdown child must be expanded");
    assert.equal(mountedArchiveMarkdownChild.parentSourceId, "source-20");
    assert.equal(mountedArchiveMarkdownChild.route.formatId, "markdown");
    assert.equal(mountedArchiveMarkdownChild.windowPlan.strategy, "file-ref-stream-windowing.v1");
    assert.equal(mountedArchiveMarkdownChild.parserTrace.some((trace) => trace.stage === "archive.entry-file-ref" && trace.status === "expanded"), true);
    assert.equal(mountedArchiveMarkdownChild.parserTrace.some((trace) => trace.stage === "payload.stream-text" && trace.status === "completed"), true);
    assert.equal(mountedArchiveMarkdownChild.windowPlan.windowCount > 1, true);
  }
  if (mountedStructuredDocuments.length) {
    for (const [sourceId, formatId, stage] of [
      ["source-21", "word", "office.word.structured"],
      ["source-22", "presentation", "office.presentation.slides"],
      ["source-23", "spreadsheet", "table.sheet.structured"],
      ["source-24", "open-document", "open-document.structured"],
      ["source-25", "ebook", "ebook.epub"]
    ]) {
      const mountedStructuredCorpus = createRun.payload.result.corpusPlan.documents.find((document) => document.sourceId === sourceId);
      assert.ok(mountedStructuredCorpus, `${sourceId} mounted structured ZIP document must be present in corpus`);
      assert.equal(mountedStructuredCorpus.route.formatId, formatId);
      assert.equal(mountedStructuredCorpus.quality.suppliedPayloadKind, "file-ref-structured-zip");
      assert.equal(mountedStructuredCorpus.windowPlan.strategy, "file-ref-stream-windowing.v1");
      assert.equal(mountedStructuredCorpus.parserTrace.some((trace) => trace.stage === "payload.file-ref" && trace.status === "completed"), true);
      assert.equal(mountedStructuredCorpus.parserTrace.some((trace) => trace.stage === "structured-zip.file-ref.extract" && trace.status === "completed"), true);
      assert.equal(mountedStructuredCorpus.parserTrace.some((trace) => trace.stage === stage && trace.status === "completed"), true);
      if (formatId === "spreadsheet") {
        assert.equal(mountedStructuredCorpus.parserTrace.some((trace) => trace.stage === "table.sheet.headers" && trace.status === "completed"), true);
        assert.equal(mountedStructuredCorpus.parserTrace.some((trace) => trace.stage === "table.sheet.cells" && trace.status === "completed" && trace.cells >= 4), true);
        assert.equal(mountedStructuredCorpus.parserTrace.some((trace) => trace.stage === "table.time-index" && trace.status === "completed" && trace.from === "2026-06-15"), true);
        assert.equal(mountedStructuredCorpus.timeRange.from, "2026-06-15");
        assert.equal(mountedStructuredCorpus.windowPlan.windows.some((window) => window.timeRange?.from === "2026-06-15"), true);
      }
      assert.equal(mountedStructuredCorpus.parserTrace.some((trace) => trace.stage === "payload.stream-text" && trace.status === "completed"), true);
      assert.equal(mountedStructuredCorpus.parserTrace.some((trace) => trace.stage === "payload.file-ref-deferred"), false);
      assert.ok(mountedStructuredCorpus.quality.textCharacters > 0, `${sourceId} mounted structured ZIP document must produce text`);
    }
  }
  if (directRuntime.payload.runtimes["tika.app"]?.available && mountedLegacyOfficeDocuments.length) {
    for (const [sourceId, formatId] of [
      ["source-30", "word"],
      ["source-31", "word"],
      ["source-32", "presentation"],
      ["source-33", "spreadsheet"]
    ]) {
      const mountedLegacyCorpus = createRun.payload.result.corpusPlan.documents.find((document) => document.sourceId === sourceId);
      assert.ok(mountedLegacyCorpus, `${sourceId} mounted legacy Office document must be present in corpus`);
      assert.equal(mountedLegacyCorpus.route.formatId, formatId);
      assert.equal(mountedLegacyCorpus.quality.suppliedPayloadKind, "file-ref-tika");
      assert.equal(mountedLegacyCorpus.windowPlan.strategy, "file-ref-stream-windowing.v1");
      assert.equal(mountedLegacyCorpus.parserTrace.some((trace) => trace.stage === "payload.file-ref" && trace.status === "completed"), true);
      assert.equal(mountedLegacyCorpus.parserTrace.some((trace) => trace.stage === "tika.text.file-ref" && trace.status === "completed"), true);
      assert.equal(mountedLegacyCorpus.parserTrace.some((trace) => trace.stage === "payload.stream-text" && trace.status === "completed"), true);
      assert.equal(mountedLegacyCorpus.parserTrace.some((trace) => trace.stage === "payload.file-ref-deferred"), false);
      assert.ok(mountedLegacyCorpus.quality.textCharacters > 0, `${sourceId} mounted legacy Office document must produce text`);
    }
  }
  const pdfPayloadCorpus = createRun.payload.result.corpusPlan.documents.find((document) => document.sourceId === "source-12");
  assert.equal(pdfPayloadCorpus.parserTrace.some((trace) => trace.stage === "pdf.text.basic" && trace.status === "completed"), true);
  assert.equal(pdfPayloadCorpus.windowPlan.windowCount >= 1, true);
  const pptxPayloadCorpus = createRun.payload.result.corpusPlan.documents.find((document) => document.sourceId === "source-13");
  assert.equal(pptxPayloadCorpus.parserTrace.some((trace) => trace.stage === "office.presentation.slides" && trace.status === "completed"), true);
  const xlsxPayloadCorpus = createRun.payload.result.corpusPlan.documents.find((document) => document.sourceId === "source-14");
  assert.equal(xlsxPayloadCorpus.parserTrace.some((trace) => trace.stage === "table.sheet.structured" && trace.status === "completed"), true);
  assert.equal(xlsxPayloadCorpus.parserTrace.some((trace) => trace.stage === "table.sheet.headers" && trace.status === "completed"), true);
  assert.equal(xlsxPayloadCorpus.parserTrace.some((trace) => trace.stage === "table.sheet.cells" && trace.status === "completed" && trace.cells >= 4), true);
  assert.equal(xlsxPayloadCorpus.parserTrace.some((trace) => trace.stage === "table.time-index" && trace.status === "completed" && trace.from === "2026-05-31"), true);
  assert.equal(xlsxPayloadCorpus.eventTime, "2026-05-31");
  assert.equal(xlsxPayloadCorpus.timeRange.from, "2026-05-31");
  assert.match(xlsxPayloadCorpus.windowPlan.windows[0]?.excerpt || "", /Sheet 1 Header row|A1=Vendor|B2 Total=42|C2 Payment Date=2026-05-31/);
  assert.equal(xlsxPayloadCorpus.windowPlan.windows.some((window) => window.timeRange?.from === "2026-05-31"), true);
  assert.ok(
    createRun.payload.result.agentMessage.corpusPlan.documents.some((document) => document.sourceId === "source-3"),
    "agent message must include corpus window details"
  );
  assert.equal(createRun.payload.result.grounding.strategy, "claim-evidence-topk-conflict-gating.v2");
  assert.equal(createRun.payload.result.grounding.claims.some((claim) => (
    claim.source === "generated-summary" &&
    claim.topEvidence.length >= 1 &&
    claim.topEvidence.every((evidence) => evidence.groupId === claim.groupId)
  )), true);
  assert.equal(Object.values(createRun.payload.result.grounding.promotionGates).some((gate) => gate.promoted), true);
  assert.equal(createRun.payload.result.grounding.claims.some((claim) => (
    claim.source === "requested-claim" &&
    claim.text.includes("external.knowledge.distillation") &&
    claim.status === "entailed"
  )), true);
  assert.equal(createRun.payload.result.grounding.claims.some((claim) => (
    claim.source === "requested-claim" &&
    claim.text.includes("Submarine coffee") &&
    claim.status === "neutral" &&
    claim.evidenceRefs.length === 0
  )), true);
  assert.equal(
    createRun.payload.result.candidates.some((candidate) => candidate.sourceIds.includes("source-11")),
    false,
    "garbage/noise sources must not be promoted as core candidates"
  );
  assert.equal(
    createRun.payload.result.candidates.every((candidate) => candidate.promoted && candidate.promotionGate.entailed >= 1),
    true,
    "only claim-grounded groups may become candidates"
  );

  const contradictionRun = await fetchJson(`${pactServer.url}/api/external/knowledge/distillation/runs`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(auth, { method: "POST" })
    },
    body: JSON.stringify({
      query: "冲突证据门禁验证",
      title: "冲突证据门禁验证",
      responseProfile: "agent",
      requestedClaims: [
        "Legacy FTP upload is permitted for production evidence."
      ],
      rawDocuments: [
        {
          sourceId: "conflict-policy",
          title: "Policy",
          fileName: "policy.md",
          mediaType: "text/markdown",
          text: "Legacy FTP upload is not permitted for production evidence. Use signed object storage instead."
        }
      ]
    })
  });
  assert.equal(contradictionRun.status, 201);
  assert.equal(contradictionRun.payload.status, "completed");
  const contradictedClaim = contradictionRun.payload.result.grounding.claims.find((claim) => claim.source === "requested-claim");
  assert.equal(contradictedClaim.status, "contradicted");
  assert.equal(contradictedClaim.conflictEvidence.length >= 1, true);
  assert.equal(contradictedClaim.evidenceRefs.length, 0);

  const incrementalFirstRun = await fetchJson(`${pactServer.url}/api/external/knowledge/distillation/runs`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(auth, { method: "POST" })
    },
    body: JSON.stringify({
      projectId: "incremental-project-alpha",
      query: "增量工程首次快照",
      title: "增量工程首次快照",
      responseProfile: "agent",
      rawDocuments: [
        {
          sourceId: "inc-architecture",
          title: "Incremental Architecture",
          fileName: "architecture.md",
          mediaType: "text/markdown",
          text: "The project API gateway supports signed object storage and parser routing."
        },
        {
          sourceId: "inc-finance",
          title: "Incremental Finance",
          fileName: "finance.csv",
          mediaType: "text/csv",
          text: "vendor,total,payment_date\nAlpha,100,2026-06-01"
        }
      ]
    })
  });
  assert.equal(incrementalFirstRun.status, 201);
  assert.equal(incrementalFirstRun.payload.result.incrementalPlan.mode, "full-snapshot");
  assert.equal(incrementalFirstRun.payload.result.incrementalPlan.addedSourceIds.includes("inc-architecture"), true);
  assert.equal(incrementalFirstRun.payload.result.incrementalPlan.snapshot.projectId, "incremental-project-alpha");

  const incrementalSecondRun = await fetchJson(`${pactServer.url}/api/external/knowledge/distillation/runs`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(auth, { method: "POST" })
    },
    body: JSON.stringify({
      projectId: "incremental-project-alpha",
      query: "增量工程变更快照",
      title: "增量工程变更快照",
      responseProfile: "agent",
      rawDocuments: [
        {
          sourceId: "inc-architecture",
          title: "Incremental Architecture",
          fileName: "architecture.md",
          mediaType: "text/markdown",
          text: "The project API gateway supports signed object storage and parser routing."
        },
        {
          sourceId: "inc-finance",
          title: "Incremental Finance",
          fileName: "finance.csv",
          mediaType: "text/csv",
          text: "vendor,total,payment_date\nAlpha,140,2026-06-15"
        }
      ]
    })
  });
  assert.equal(incrementalSecondRun.status, 201);
  assert.equal(incrementalSecondRun.payload.result.incrementalPlan.mode, "incremental");
  assert.equal(incrementalSecondRun.payload.result.incrementalPlan.previousRunId, incrementalFirstRun.payload.runId);
  assert.equal(incrementalSecondRun.payload.result.incrementalPlan.reusedSourceIds.includes("inc-architecture"), true);
  assert.equal(incrementalSecondRun.payload.result.incrementalPlan.changedSourceIds.includes("inc-finance"), true);
  assert.equal(incrementalSecondRun.payload.result.incrementalPlan.reusedWindowCount >= 1, true);
  assert.equal(incrementalSecondRun.payload.result.agentMessage.incrementalPlan.reuseRatio > 0, true);
  const snapshotArtifact = await fetch(`${pactServer.url}/api/external/knowledge/distillation/runs/${encodeURIComponent(incrementalSecondRun.payload.runId)}/artifacts/project-snapshot-json`, {
    headers: authHeaders(auth)
  });
  assert.equal(snapshotArtifact.status, 200);
  assert.match(snapshotArtifact.headers.get("content-type") || "", /application\/json/);
  const snapshotPayload = JSON.parse(await snapshotArtifact.text());
  assert.equal(snapshotPayload.projectId, "incremental-project-alpha");
  assert.equal(snapshotPayload.previousRunId, incrementalFirstRun.payload.runId);
  assert.equal(snapshotPayload.snapshot.documents.some((document) => document.sourceId === "inc-finance"), true);

  const projectEvidence = await fetchJson(
    `${pactServer.url}/api/external/knowledge/distillation/projects/incremental-project-alpha/evidence?mode=all&runLimit=10&sourceId=inc-finance&timeFrom=2026-06-01&timeTo=2026-06-30&limit=50`,
    { headers: authHeaders(auth) }
  );
  assert.equal(projectEvidence.status, 200);
  assert.equal(projectEvidence.payload.strategy, "project-graph-evidence-convergence-query.v1");
  assert.equal(projectEvidence.payload.evidenceQueryStrategy, "graph-lite-evidence-query.v1");
  assert.equal(projectEvidence.payload.projectId, "incremental-project-alpha");
  assert.equal(projectEvidence.payload.matchedRunCount >= 2, true);
  assert.equal(projectEvidence.payload.runIds.includes(incrementalFirstRun.payload.runId), true);
  assert.equal(projectEvidence.payload.runIds.includes(incrementalSecondRun.payload.runId), true);
  assert.equal(projectEvidence.payload.text_units.length > 0, true);
  assert.equal(projectEvidence.payload.text_units.every((textUnit) => textUnit.sourceRunId), true);
  assert.equal(projectEvidence.payload.text_units.every((textUnit) => textUnit.sourceId === "inc-finance"), true);
  assert.equal(projectEvidence.payload.counts.original.text_units >= projectEvidence.payload.counts.returned.text_units, true);

  const timeFilteredRun = await fetchJson(`${pactServer.url}/api/external/knowledge/distillation/runs`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(auth, { method: "POST" })
    },
    body: JSON.stringify({
      query: "时间过滤蒸馏验证",
      title: "时间过滤蒸馏验证",
      responseProfile: "agent",
      timeFilter: {
        from: "2026-06-01",
        to: "2026-06-30",
        timeField: "eventTime",
        confidenceMin: 0.9,
        excludeWeakEvidence: true
      },
      rawDocuments: [
        {
          sourceId: "time-may",
          title: "May Payment",
          fileName: "may-payment.csv",
          mediaType: "text/csv",
          contentBase64: base64Text("vendor,total,payment_date\nMayCo,10,2026-05-31")
        },
        {
          sourceId: "time-june",
          title: "June Payment",
          fileName: "june-payment.csv",
          mediaType: "text/csv",
          contentBase64: base64Text("vendor,total,payment_date\nJuneCo,20,2026-06-15")
        },
        {
          sourceId: "time-undated",
          title: "Undated Note",
          fileName: "undated.md",
          mediaType: "text/markdown",
          text: "# Undated\nThis note should be excluded by strict time filtering."
        }
      ]
    })
  });
  assert.equal(timeFilteredRun.status, 201);
  assert.equal(timeFilteredRun.payload.status, "completed");
  assert.equal(timeFilteredRun.payload.result.corpusPlan.timeFilter.active, true);
  assert.equal(timeFilteredRun.payload.result.corpusPlan.timeFilter.matchedSourceIds.includes("time-june"), true);
  assert.equal(timeFilteredRun.payload.result.corpusPlan.timeFilter.filteredOutSourceIds.includes("time-may"), true);
  assert.equal(timeFilteredRun.payload.result.corpusPlan.timeFilter.filteredOutSourceIds.includes("time-undated"), true);
  assert.deepEqual(timeFilteredRun.payload.result.corpusPlan.documents.map((document) => document.sourceId), ["time-june"]);
  assert.equal(timeFilteredRun.payload.result.corpusPlan.documents[0].timeRange.from, "2026-06-15");
  assert.equal(timeFilteredRun.payload.result.corpusPlan.documents[0].windowPlan.windows.every((window) => window.timeRange?.from === "2026-06-15"), true);
  assert.equal(timeFilteredRun.payload.result.candidates.every((candidate) => candidate.sourceIds.includes("time-june")), true);
  assert.equal(timeFilteredRun.payload.result.candidates.some((candidate) => candidate.sourceIds.includes("time-may")), false);
  assert.equal(timeFilteredRun.payload.result.agentMessage.corpusPlan.timeFilter.matchedSourceIds.includes("time-june"), true);

  const failedRun = await fetchJson(`${pactServer.url}/api/external/knowledge/distillation/runs`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(auth, { method: "POST" })
    },
    body: JSON.stringify({
      query: "空语料失败验证",
      title: "空语料失败验证",
      rawDocuments: [
        {
          sourceId: "image-only",
          title: "Image Only",
          fileName: "image-only.png",
          mediaType: "image/png",
          contentBase64: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).toString("base64")
        }
      ],
      responseProfile: "agent"
    })
  });
  assert.equal(failedRun.status, 201);
  assert.equal(failedRun.payload.status, "failed");
  assert.equal(failedRun.payload.result.errors[0].code, "EMPTY_RAW_CORPUS");
  assert.equal(failedRun.payload.result.agentMessage.errors[0].code, "EMPTY_RAW_CORPUS");
  const imageTrace = failedRun.payload.result.corpusPlan.documents[0].parserTrace;
  assert.equal(imageTrace.some((trace) => trace.stage === "ocr.image" && ["unavailable", "available-not-executed"].includes(trace.status)), true);
  assert.equal(failedRun.payload.result.runtimeStatus.summary.ocrAvailable, Boolean(
    failedRun.payload.result.runtimeStatus.runtimes["ocr.tesseract"].available ||
    failedRun.payload.result.runtimeStatus.runtimes["ocr.paddleocr"].available
  ));

  const scannedPdfRun = await fetchJson(`${pactServer.url}/api/external/knowledge/distillation/runs`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(auth, { method: "POST" })
    },
    body: JSON.stringify({
      query: "扫描 PDF 降级验证",
      title: "扫描 PDF 降级验证",
      rawDocuments: [
        {
          sourceId: "scanned-pdf",
          title: "Scanned PDF",
          fileName: "scanned.pdf",
          mediaType: "application/pdf",
          contentBase64: base64Text("%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\n%%EOF")
        }
      ],
      responseProfile: "agent"
    })
  });
  assert.equal(scannedPdfRun.status, 201);
  assert.equal(scannedPdfRun.payload.status, "failed");
  const scannedTrace = scannedPdfRun.payload.result.corpusPlan.documents[0].parserTrace;
  assert.equal(scannedTrace.some((trace) => trace.stage === "pdf.text.basic" && trace.status === "empty"), true);
  assert.equal(scannedTrace.some((trace) => trace.stage === "pdf.visual.layout" && ["unavailable", "available-not-executed"].includes(trace.status)), true);
  assert.equal(scannedTrace.some((trace) => trace.stage === "ocr.page" && ["unavailable", "available-not-executed"].includes(trace.status)), true);

  const getRun = await fetchJson(`${pactServer.url}/api/external/knowledge/distillation/runs/${encodeURIComponent(createRun.payload.runId)}`, {
    headers: authHeaders(auth)
  });
  assert.equal(getRun.status, 200);
  assert.equal(getRun.payload.runId, createRun.payload.runId);

  const invoiceEvidence = await fetchJson(
    `${pactServer.url}/api/external/knowledge/distillation/runs/${encodeURIComponent(createRun.payload.runId)}/evidence?entity=invoice&sourceId=source-2&limit=20`,
    { headers: authHeaders(auth) }
  );
  assert.equal(invoiceEvidence.status, 200);
  assert.equal(invoiceEvidence.payload.strategy, "graph-lite-evidence-query.v1");
  assert.equal(invoiceEvidence.payload.filters.entity, "invoice");
  assert.equal(invoiceEvidence.payload.filters.sourceId, "source-2");
  assert.equal(invoiceEvidence.payload.text_units.length > 0, true);
  assert.equal(invoiceEvidence.payload.entities.some((entity) => /invoice/i.test(entity.title)), true);
  assert.equal(invoiceEvidence.payload.counts.returned.text_units <= 20, true);

  const claimEvidence = await fetchJson(
    `${pactServer.url}/api/external/knowledge/distillation/runs/${encodeURIComponent(createRun.payload.runId)}/evidence?claimStatus=TRUE&claim=external.knowledge.distillation&limit=20`,
    { headers: authHeaders(auth) }
  );
  assert.equal(claimEvidence.status, 200);
  assert.equal(claimEvidence.payload.strategy, "graph-lite-evidence-query.v1");
  assert.equal(claimEvidence.payload.filters.claimStatus, "TRUE");
  assert.equal(claimEvidence.payload.covariates.length > 0, true);
  assert.equal(claimEvidence.payload.covariates.every((claim) => claim.status === "TRUE"), true);

  const listRuns = await fetchJson(`${pactServer.url}/api/external/knowledge/distillation/runs?limit=20`, {
    headers: authHeaders(auth)
  });
  assert.equal(listRuns.status, 200);
  assert.equal(listRuns.payload.runs.some((run) => run.runId === createRun.payload.runId), true);

  const artifact = await fetch(`${pactServer.url}/api/external/knowledge/distillation/runs/${encodeURIComponent(createRun.payload.runId)}/artifacts/portable-markdown`, {
    headers: authHeaders(auth)
  });
  assert.equal(artifact.status, 200);
  assert.match(artifact.headers.get("content-type") || "", /text\/markdown/);
  const markdown = await artifact.text();
  assert.match(markdown, /external\.knowledge\.distillation/);
  assert.match(markdown, /Source Routing/);
  assert.match(markdown, /Category Distillations/);
  assert.match(markdown, /Project Convergence/);
  assert.match(markdown, /Incremental Plan/);
  assert.match(markdown, /Graph Evidence/);

  const docxArtifact = await fetch(`${pactServer.url}/api/external/knowledge/distillation/runs/${encodeURIComponent(createRun.payload.runId)}/artifacts/portable-docx`, {
    headers: authHeaders(auth)
  });
  assert.equal(docxArtifact.status, 200);
  assert.match(docxArtifact.headers.get("content-type") || "", /officedocument\.wordprocessingml\.document/);
  const docxEntries = unzipSync(new Uint8Array(await docxArtifact.arrayBuffer()));
  assert.ok(docxEntries["[Content_Types].xml"], "DOCX must include OpenXML content types");
  assert.ok(docxEntries["word/document.xml"], "DOCX must include word/document.xml");
  assert.match(Buffer.from(docxEntries["word/document.xml"]).toString("utf8"), /External Knowledge Distillation|Category Distillations/);

  const agentArtifact = await fetch(`${pactServer.url}/api/external/knowledge/distillation/runs/${encodeURIComponent(createRun.payload.runId)}/artifacts/agent-message-json`, {
    headers: authHeaders(auth)
  });
  assert.equal(agentArtifact.status, 200);
  assert.match(agentArtifact.headers.get("content-type") || "", /application\/json/);
  const agentMessage = JSON.parse(await agentArtifact.text());
  assert.equal(agentMessage.responseProfile, "agent");
  assert.ok(agentMessage.classification.groupCount >= 2);
  assert.equal(agentMessage.routePlan.strategy, "extension-media-shape-routing.v1");
  assert.equal(agentMessage.corpusPlan.allSizePolicy, "streaming-windowed");
  assert.equal(agentMessage.incrementalPlan.strategy, "project-snapshot-incremental-convergence.v1");
  assert.equal(agentMessage.graphEvidence.strategy, "graph-lite-entity-relationship-evidence-pack.v1");
  assert.equal(agentMessage.graphEvidence.summary.entityCount > 0, true);
  assert.equal(agentMessage.classification.communityCount >= agentMessage.classification.coreGroupCount, true);
  assert.equal(agentMessage.classification.groups.some((group) => group.distillationUnit?.mode === "topic-isolated"), true);
  assert.equal(agentMessage.convergence.strategy, "window-community-topic-project-convergence.v2");
  assert.equal(agentMessage.outputs.every((output) => output.promotionGate.promoted), true);
  assert.equal(agentMessage.grounding.strategy, "claim-evidence-topk-conflict-gating.v2");
  const evidenceArtifact = await fetch(`${pactServer.url}/api/external/knowledge/distillation/runs/${encodeURIComponent(createRun.payload.runId)}/artifacts/evidence-pack-json`, {
    headers: authHeaders(auth)
  });
  assert.equal(evidenceArtifact.status, 200);
  assert.match(evidenceArtifact.headers.get("content-type") || "", /application\/json/);
  const evidencePack = JSON.parse(await evidenceArtifact.text());
  assert.equal(evidencePack.strategy, "graph-lite-entity-relationship-evidence-pack.v1");
  assert.equal(evidencePack.text_units.length >= createRun.payload.result.corpusPlan.windowCount, true);
  assert.equal(evidencePack.entities.length > 0, true);
  assert.equal(evidencePack.relationships.length > 0, true);
  assert.equal(evidencePack.communities.length >= createRun.payload.result.classification.groupCount, true);
  const referenceGapArtifact = await fetch(`${pactServer.url}/api/external/knowledge/distillation/runs/${encodeURIComponent(createRun.payload.runId)}/artifacts/reference-gap-report-json`, {
    headers: authHeaders(auth)
  });
  assert.equal(referenceGapArtifact.status, 200);
  const referenceGapReport = JSON.parse(await referenceGapArtifact.text());
  assert.equal(referenceGapReport.strategy, "reference-framework-gap-report.v1");
  assert.equal(referenceGapReport.frameworks.some((framework) => framework.id === "docling" && framework.openGaps.length > 0), true);

  const workspacePackageArtifact = await fetch(`${pactServer.url}/api/external/knowledge/distillation/runs/${encodeURIComponent(createRun.payload.runId)}/artifacts/workspace-package-zip`, {
    headers: authHeaders(auth)
  });
  assert.equal(workspacePackageArtifact.status, 200);
  assert.match(workspacePackageArtifact.headers.get("content-type") || "", /application\/zip/);
  const workspaceEntries = unzipSync(new Uint8Array(await workspacePackageArtifact.arrayBuffer()));
  for (const entryName of ["manifest.json", "distillation.md", "distillation.docx", "agent-message.json", "result.json", "project-snapshot.json", "evidence-pack.json", "reference-gap-report.json"]) {
    assert.ok(workspaceEntries[entryName], `workspace package must include ${entryName}`);
  }
  const workspaceManifest = JSON.parse(Buffer.from(workspaceEntries["manifest.json"]).toString("utf8"));
  assert.equal(workspaceManifest.protocolVersion, "pact.external-knowledge-distillation.v1.workspace-package");
  assert.equal(workspaceManifest.artifacts.every((item) => item.byteSize > 0 && /^[a-f0-9]{64}$/.test(item.sha256)), true);
} finally {
  if (pactServer) {
    await pactServer.close();
  }
  await service.close();
  if (previousUrl === undefined) {
    delete process.env.PACT_EXTERNAL_KNOWLEDGE_DISTILLATION_URL;
  } else {
    process.env.PACT_EXTERNAL_KNOWLEDGE_DISTILLATION_URL = previousUrl;
  }
  if (serviceDataDir) {
    await fs.rm(serviceDataDir, { recursive: true, force: true });
  }
  await fs.rm(pactDataDir, { recursive: true, force: true });
}

console.log("external knowledge distillation registration verification passed");
