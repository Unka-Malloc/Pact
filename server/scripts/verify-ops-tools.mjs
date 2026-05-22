import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { startHttpServer } from "../services/server-runtime/http-server.mjs";
import { getMetadataDatabasePath } from "../platform/common/storage/schema-manager.mjs";
import { locateStorageEntity, reconcileStorage, runStorageDoctor } from "../platform/common/storage/ops-tools.mjs";
import { installAuthenticatedFetch } from "./test-auth-helper.mjs";

const mockDocumentParserModulePath = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "../../tests/server/mock-structured-document-parser.mjs"
);

function buildUploadedFile(name, relativePath, text) {
  const buffer = Buffer.from(text, "utf8");
  return {
    name,
    relativePath,
    mediaType: "message/rfc822",
    dataBase64: buffer.toString("base64"),
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

const userDataPath = await fs.mkdtemp(path.join(os.tmpdir(), "pact-ops-"));
const server = await startHttpServer({
  userDataPath,
  runtimeOptions: {
    mountModules: {
      documentParser: mockDocumentParserModulePath
    }
  }
});
await installAuthenticatedFetch(server);

try {
  const createdJob = await fetchJson(`${server.url}/api/jobs`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      clientUid: "ops-client-01",
      sourceType: "mail-forward",
      uploadedFiles: [
        buildUploadedFile(
          "ops.eml",
          "mailbox/ops.eml",
          [
            "From: Alice <alice@example.com>",
            "To: Bob <bob@example.com>",
            "Subject: 运维校验周报",
            "Date: 2026-04-01T09:00:00Z",
            "",
            "本周需要确认上线窗口。"
          ].join("\n")
        )
      ],
      settings: {}
    })
  });

  await waitForJob(server.url, createdJob.id);
  const result = await fetchJson(`${server.url}/api/jobs/${createdJob.id}/result`);
  const rawObjectId = result.sourceFiles[0].rawObjectId;
  const rawObjectSha256 = result.sourceFiles[0].rawObjectSha256;

  const healthyDoctor = await runStorageDoctor({ userDataPath });
  assert.equal(healthyDoctor.healthy, true);

  const jobLocation = await locateStorageEntity({
    userDataPath,
    jobId: createdJob.id
  });
  assert.equal(jobLocation.batch.batchId, createdJob.archiveBatchId);
  assert.equal(jobLocation.batch.jobId, createdJob.id);
  assert.ok(jobLocation.job.meta);

  const objectLocation = await locateStorageEntity({
    userDataPath,
    objectId: rawObjectId
  });
  assert.equal(objectLocation.object.sha256, rawObjectSha256);
  assert.equal(objectLocation.object.exists, true);
  assert.equal(objectLocation.object.clientUid, "ops-client-01");
  assert.equal(objectLocation.object.sourceType, "mail-forward");
  assert.match(objectLocation.object.archiveFileName, /^ops__.+\.eml$/);
  assert.match(
    objectLocation.object.storageRelativePath,
    /^objects\/ops-client-01\/mail-forward\/ops__.+\.eml$/
  );

  const orphanPath = path.join(userDataPath, "objects", "mail", "orphan-test", "ghost.eml");
  await fs.mkdir(path.dirname(orphanPath), { recursive: true });
  await fs.writeFile(orphanPath, "ghost", "utf8");

  const db = new Database(getMetadataDatabasePath(userDataPath), { fileMustExist: true });
  try {
    db.prepare("DELETE FROM retrieval_fts WHERE record_id IN (SELECT record_id FROM retrieval_documents LIMIT 1)").run();
  } finally {
    db.close();
  }

  const degradedDoctor = await runStorageDoctor({ userDataPath });
  assert.ok(degradedDoctor.issues.retrievalFtsMissingRows.length >= 1);
  assert.ok(degradedDoctor.issues.orphanRawObjectFiles.length >= 1);

  const dryRun = await reconcileStorage({
    userDataPath,
    apply: false,
    pruneOrphanObjects: true
  });
  assert.ok(dryRun.plannedActions.rebuildRetrievalFts >= 1);

  const applied = await reconcileStorage({
    userDataPath,
    apply: true,
    pruneOrphanObjects: true
  });
  assert.ok(applied.appliedActions.rebuiltRetrievalFts >= 1);
  assert.ok(applied.appliedActions.prunedOrphanRawObjectFiles >= 1);
  assert.equal(applied.doctor.issues.retrievalFtsMissingRows.length, 0);
  assert.equal(applied.doctor.issues.orphanRawObjectFiles.length, 0);
  assert.equal(applied.healthyAfter, true);
} finally {
  await server.close();
  await fs.rm(userDataPath, {
    recursive: true,
    force: true
  });
}

console.log("Ops tools verification passed.");
