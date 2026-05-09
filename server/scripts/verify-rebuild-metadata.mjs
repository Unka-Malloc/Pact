import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { startHttpServer } from "../services/server-runtime/http-server.mjs";
import { rebuildMetadataStore } from "../platform/common/storage/rebuild-metadata.mjs";
import { getMetadataDatabasePath } from "../platform/common/storage/schema-manager.mjs";
import { installAuthenticatedFetch } from "./test-auth-helper.mjs";

const mockDocumentParserModulePath = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "../../tests/server/mock-structured-document-parser.mjs"
);

function buildUploadedFile(name, relativePath, text) {
  const buffer = Buffer.from(text, "utf8");
  const dataBase64 = buffer.toString("base64");
  return {
    name,
    relativePath,
    mediaType: "message/rfc822",
    dataBase64,
    byteSize: buffer.length
  };
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} ${JSON.stringify(payload)}`);
  }
  return payload;
}

async function waitForJob(baseUrl, jobId) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const job = await fetchJson(`${baseUrl}/api/jobs/${jobId}`);
    if (job.status === "completed") {
      return job;
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error("Job did not complete in time.");
}

const userDataPath = await fs.mkdtemp(path.join(os.tmpdir(), "splitall-rebuild-"));
const server = await startHttpServer({
  userDataPath,
  runtimeOptions: {
    mountModules: {
      documentParser: mockDocumentParserModulePath
    }
  }
});
const auth = await installAuthenticatedFetch(server);

try {
  const job = await fetchJson(`${server.url}/api/jobs`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      uploadedFiles: [
        buildUploadedFile(
          "weekly.eml",
          "mailbox/weekly.eml",
          [
            "From: Alice <alice@example.com>",
            "To: Bob <bob@example.com>",
            "Subject: 华东项目周报",
            "Date: 2026-04-01T09:00:00Z",
            "",
            "本周完成接口联调，待确认上线窗口。"
          ].join("\n")
        )
      ],
      settings: {}
    })
  });

  await waitForJob(server.url, job.id);
  const beforeSummary = await fetchJson(`${server.url}/api/storage/summary`);
  const beforeSearch = await fetchJson(`${server.url}/api/search?q=${encodeURIComponent("上线窗口")}`);

  await server.close();
  await fs.rm(path.dirname(getMetadataDatabasePath(userDataPath)), {
    recursive: true,
    force: true
  });

  const rebuildSummary = await rebuildMetadataStore({
    userDataPath
  });
  assert.ok(rebuildSummary.rebuiltCompletedCount >= 1);

  const rebuiltServer = await startHttpServer({
    userDataPath,
    runtimeOptions: {
      mountModules: {
        documentParser: mockDocumentParserModulePath
      }
    }
  });
  await installAuthenticatedFetch(rebuiltServer, { auth });
  try {
    const afterSummary = await fetchJson(`${rebuiltServer.url}/api/storage/summary`);
    const afterSearch = await fetchJson(
      `${rebuiltServer.url}/api/search?q=${encodeURIComponent("上线窗口")}`
    );

    assert.equal(afterSummary.batchCount, beforeSummary.batchCount);
    assert.equal(afterSummary.transactionCount, beforeSummary.transactionCount);
    assert.equal(afterSummary.retrievalCount, beforeSummary.retrievalCount);
    assert.ok(afterSearch.items.length >= beforeSearch.items.length);
  } finally {
    await rebuiltServer.close();
  }
} finally {
  await fs.rm(userDataPath, {
    recursive: true,
    force: true
  });
}

console.log("Metadata rebuild verification passed.");
