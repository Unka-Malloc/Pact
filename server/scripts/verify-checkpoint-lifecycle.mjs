import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { loadCheckpointTree } from "../application/checkpoint-tree-store.mjs";
import { startHttpServer } from "../http-server.mjs";
import { installAuthenticatedFetch } from "./test-auth-helper.mjs";

const mockDocumentParserModulePath = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "../../tests/server/mock-structured-document-parser.mjs"
);

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const rawText = await response.text();

  if (!response.ok) {
    throw new Error(`${response.status} ${rawText}`);
  }

  return JSON.parse(rawText);
}

async function waitForJobStatus(baseUrl, jobId, expectedStatuses, attempts = 80) {
  let lastJob = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const job = await fetchJson(`${baseUrl}/api/jobs/${jobId}`);
    lastJob = job;
    if (expectedStatuses.includes(job.status)) {
      return job;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  throw new Error(`等待任务状态超时：${jobId}；最后状态：${JSON.stringify(lastJob)}`);
}

async function waitForNotFound(baseUrl, jobId, attempts = 20) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const response = await fetch(`${baseUrl}/api/jobs/${jobId}`);
    if (response.status === 404) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }

  throw new Error(`任务未被删除：${jobId}`);
}

async function waitForKnowledgeSearchHit(baseUrl, query, { batchId = "", attempts = 40 } = {}) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const result = await fetchJson(`${baseUrl}/api/knowledge/search`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        query,
        batchId: batchId || undefined,
        limit: 5
      })
    });
    if ((result.items || []).length > 0) {
      return result;
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }

  throw new Error(`等待增量知识检索命中超时：${query}`);
}

async function waitForImportCheckpointEntries(dataPath, jobId, minimumCount, attempts = 60) {
  const entriesPath = path.join(dataPath, "jobs", jobId, "import-checkpoint", "entries");
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const entries = (await fs.readdir(entriesPath)).filter((name) => name.endsWith(".json"));
      if (entries.length >= minimumCount) {
        return entries;
      }
    } catch {
      // The worker has not created the import checkpoint yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }

  throw new Error(`等待导入解析断点超时：${jobId}`);
}

async function readParserLog(logPath) {
  try {
    return (await fs.readFile(logPath, "utf8"))
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  } catch (error) {
    if (error?.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

async function subscribeEvents(baseUrl, { cursor = 0, topic = "", timeoutMs = 0, includeSnapshot = false } = {}) {
  const url = new URL("/api/events", baseUrl);
  url.searchParams.set("cursor", String(cursor));
  if (topic) {
    url.searchParams.set("topic", topic);
  }
  if (timeoutMs > 0) {
    url.searchParams.set("timeoutMs", String(timeoutMs));
  }
  if (includeSnapshot) {
    url.searchParams.set("includeSnapshot", "1");
  }
  return fetchJson(url.toString());
}

function sha256Hex(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function isServerToken(value, namespace) {
  const token = String(value || "").replace(/\.[a-z0-9]{1,12}$/iu, "");
  return new RegExp(`^${namespace}_[a-f0-9]{32}$`).test(token);
}

function buildUploadedFile(name, relativePath, text) {
  const buffer = Buffer.from(text, "utf8");
  return {
    name,
    relativePath,
    mediaType: "message/rfc822",
    dataBase64: buffer.toString("base64"),
    sha256: sha256Hex(buffer),
    byteSize: buffer.length
  };
}

function buildCheckpointBundle(uploadedFile, checkpointId) {
  const manifestSha256 = sha256Hex(
    Buffer.from(
      JSON.stringify([
        [uploadedFile.relativePath || uploadedFile.name, uploadedFile.sha256, uploadedFile.byteSize]
      ])
    )
  );

  return {
    manifestSha256,
    checkpoint: {
      checkpointId,
      parentCheckpointId: "",
      mode: "initial",
      inputDigest: sha256Hex(Buffer.from("", "utf8")),
      manifestDigest: manifestSha256
    },
    manifest: {
      inputDigest: sha256Hex(Buffer.from("", "utf8")),
      manifestDigest: manifestSha256,
      fileCount: 1,
      fileRecords: [
        {
          label: uploadedFile.name,
          relativePath: uploadedFile.relativePath,
          sha256: uploadedFile.sha256,
          byteSize: uploadedFile.byteSize
        }
      ],
      summary: uploadedFile.name
    }
  };
}

const userDataPath = await fs.mkdtemp(path.join(os.tmpdir(), "splitall-checkpoint-"));
const delayedDataPath = path.join(userDataPath, "delayed");
const recoveryDataPath = path.join(userDataPath, "recovery");
const parseResumeDataPath = path.join(userDataPath, "parse-resume");

const server = await startHttpServer({
  userDataPath,
  host: "127.0.0.1",
  port: 0,
  runtimeOptions: {
    profile: "minimal",
    mountModules: {
      documentParser: mockDocumentParserModulePath
    }
  }
});
await installAuthenticatedFetch(server);

let delayedServer = null;

try {
  const startupEvents = await subscribeEvents(server.url, {
    topic: "system.interfaces",
    includeSnapshot: true
  });
  assert.ok(
    startupEvents.snapshots.some((event) => event.topic === "system.interfaces"),
    "服务端应该发布 retained system.interfaces snapshot。"
  );

  const uploadedFile = buildUploadedFile(
    "weekly-report.eml",
    "mailbox/weekly-report.eml",
    [
      "From: PMO Team <pmo@example.com>",
      "To: Alice <alice@example.com>",
      "Subject: 项目周报",
      "Date: Fri, 17 Apr 2026 08:00:00 +0000",
      "",
      "本周继续推进邮件事务系统。",
      "需要确认 checkpoint 树和旧链路回收。"
    ].join("\n")
  );

  const manifestSha256 = sha256Hex(
    Buffer.from(
      JSON.stringify([
        [uploadedFile.relativePath || uploadedFile.name, uploadedFile.sha256, uploadedFile.byteSize]
      ])
    )
  );

  const payload = {
    inputText: "",
    filePaths: [],
    uploadedFiles: [uploadedFile],
    settings: {
      retrievalHalfLifeDays: 45,
      staleAfterDays: 180,
      transactionWindowDays: 45,
      ocrEnabled: false
    },
    checkpoint: {
      checkpointId: "checkpoint-receipt-test",
      parentCheckpointId: "",
      mode: "initial",
      inputDigest: sha256Hex(Buffer.from("", "utf8")),
      manifestDigest: manifestSha256
    }
  };

  const createdJob = await fetchJson(`${server.url}/api/jobs`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  assert.ok(isServerToken(createdJob.checkpointId, "checkpoint"));
  assert.notEqual(createdJob.checkpointId, "checkpoint-receipt-test");
  const jobEvents = await subscribeEvents(server.url, {
    cursor: startupEvents.nextCursor,
    topic: "jobs.job",
    timeoutMs: 1000
  });
  assert.ok(
    jobEvents.events.some((event) => event.payload?.job?.id === createdJob.id),
    "任务创建后应该通过 jobs.job topic 发布。"
  );
	  assert.ok(createdJob.checkpointReceipt);
	  assert.match(createdJob.checkpointTreeId || "", /^checkpoint_tree_[a-f0-9]{32}$/);
  assert.equal(createdJob.checkpointReceipt.checkpointId, createdJob.checkpointId);
  assert.equal(createdJob.checkpointReceipt.fileCount, 1);
  assert.match(createdJob.checkpointReceipt.manifestSha256, /^[a-f0-9]{64}$/);
  assert.ok(isServerToken(createdJob.checkpointReceipt.files[0].relativePath, "upload_file"));
  assert.equal(path.extname(createdJob.checkpointReceipt.files[0].relativePath), ".eml");
  assert.notEqual(createdJob.checkpointReceipt.files[0].relativePath, "mailbox/weekly-report.eml");
  assert.equal(createdJob.checkpointReceipt.files[0].sha256, uploadedFile.sha256);

  const repeatedJob = await fetchJson(`${server.url}/api/jobs`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  assert.equal(repeatedJob.id, createdJob.id);

	  const completedJob = await waitForJobStatus(server.url, createdJob.id, ["completed"]);
	  assert.equal(completedJob.status, "completed");
	  const completedJobTree = await loadCheckpointTree({
	    userDataPath,
	    treeId: createdJob.checkpointTreeId
	  });
	  assert.equal(completedJobTree?.status, "completed");
	  assert.ok(completedJobTree?.nodes?.["worker-run"]);
	  const checkpointTreeList = await fetchJson(`${server.url}/api/system/checkpoint-trees?kind=import_parse_job`);
	  assert.ok(
	    checkpointTreeList.items.some((item) => item.treeId === createdJob.checkpointTreeId),
	    "checkpoint tree 应该能通过系统接口列出。"
	  );
	  const checkpointTreeDetail = await fetchJson(
	    `${server.url}/api/system/checkpoint-trees/${encodeURIComponent(createdJob.checkpointTreeId)}`
	  );
	  assert.equal(checkpointTreeDetail.treeId, createdJob.checkpointTreeId);
	  const result = await fetchJson(`${server.url}/api/jobs/${createdJob.id}/result`);
  assert.equal(result.batchId, createdJob.id);
  assert.equal(result.emails.length, 1);

  const summaryAfterCompleted = await fetchJson(`${server.url}/api/storage/summary`);
  assert.equal(summaryAfterCompleted.batchCount, 1);
  assert.equal(summaryAfterCompleted.rawObjectCount, 1);

  await fs.mkdir(delayedDataPath, { recursive: true });
  delayedServer = await startHttpServer({
    userDataPath: delayedDataPath,
    host: "127.0.0.1",
    port: 0,
    runtimeOptions: {
      profile: "minimal",
      mountModules: {
        documentParser: mockDocumentParserModulePath
      },
      testHooks: {
        jobDelayMs: 1500
      }
    }
  });
  await installAuthenticatedFetch(delayedServer);

  const delayedPayload = {
    ...payload,
    checkpoint: {
      ...payload.checkpoint,
      checkpointId: "checkpoint-delete-running"
    }
  };

  const runningJob = await fetchJson(`${delayedServer.url}/api/jobs`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(delayedPayload)
  });
  assert.ok(isServerToken(runningJob.checkpointId, "checkpoint"));
  assert.notEqual(runningJob.checkpointId, "checkpoint-delete-running");

  const jobWhileRunning = await waitForJobStatus(
    delayedServer.url,
    runningJob.id,
    ["running", "completed"],
    20
  );
  assert.equal(jobWhileRunning.status, "running");
  assert.equal(jobWhileRunning.queueState?.activeJobId, runningJob.id);
  assert.ok(jobWhileRunning.queueState?.workerConcurrency >= 1);

  const duplicateManifestPayload = {
    ...payload,
    checkpoint: {
      ...payload.checkpoint,
      checkpointId: "checkpoint-duplicate-active-manifest"
    }
  };
  const duplicateManifestJob = await fetchJson(`${delayedServer.url}/api/jobs`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(duplicateManifestPayload)
  });
  assert.equal(duplicateManifestJob.id, runningJob.id);
  assert.equal(duplicateManifestJob.status, "running");

  const queuedFile = buildUploadedFile(
    "queued-behind-running.eml",
    "mailbox/queued-behind-running.eml",
    [
      "From: Queue Test <queue@example.com>",
      "To: Alice <alice@example.com>",
      "Subject: 排队诊断",
      "Date: Sat, 18 Apr 2026 09:00:00 +0000",
      "",
      "这是一封用于验证任务队列诊断字段的邮件。"
    ].join("\n")
  );
  const queuedBundle = buildCheckpointBundle(queuedFile, "checkpoint-queued-behind-running");
  const queuedBehindPayload = {
    ...payload,
    uploadedFiles: [queuedFile],
    checkpoint: queuedBundle.checkpoint
  };
  const queuedBehindJob = await fetchJson(`${delayedServer.url}/api/jobs`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(queuedBehindPayload)
  });
	  assert.ok(["queued", "running"].includes(queuedBehindJob.status));
	  if (queuedBehindJob.status === "queued") {
	    assert.ok(queuedBehindJob.queueState?.queuePosition >= 1);
	    assert.ok(
	      ["waiting_for_available_worker", "ready_to_start", "waiting_for_earlier_queued_job"].includes(
	        queuedBehindJob.queueState?.waitingReason
	      )
	    );
	  } else {
	    assert.equal(queuedBehindJob.queueState?.activeJobId, queuedBehindJob.id);
	    assert.equal(queuedBehindJob.queueState?.waitingReason, "running");
	  }

	  const queueSnapshot = await fetchJson(`${delayedServer.url}/api/jobs?limit=10`);
	  assert.ok(queueSnapshot.summary.activeJobIds.includes(runningJob.id));
	  assert.ok(queueSnapshot.summary.workerConcurrency >= 1);
	  assert.ok(
	    queueSnapshot.summary.queuedJobIds.includes(queuedBehindJob.id) ||
	      queueSnapshot.summary.activeJobIds.includes(queuedBehindJob.id)
	  );

  const deletedQueuedJob = await fetchJson(`${delayedServer.url}/api/jobs/${queuedBehindJob.id}`, {
    method: "DELETE"
  });
  assert.equal(deletedQueuedJob.ok, true);
  assert.equal(deletedQueuedJob.deletedJob.id, queuedBehindJob.id);

  const deletedJob = await fetchJson(`${delayedServer.url}/api/jobs/${runningJob.id}`, {
    method: "DELETE"
  });
  assert.equal(deletedJob.ok, true);
  assert.equal(deletedJob.deletedJob.id, runningJob.id);

  await waitForNotFound(delayedServer.url, runningJob.id);

  const delayedSummary = await fetchJson(`${delayedServer.url}/api/storage/summary`);
  assert.equal(delayedSummary.batchCount, 0);
  assert.equal(delayedSummary.rawObjectCount, 0);

  await fs.mkdir(recoveryDataPath, { recursive: true });
  const resumedServer = await startHttpServer({
    userDataPath: recoveryDataPath,
    host: "127.0.0.1",
    port: 0,
    runtimeOptions: {
      profile: "minimal",
      mountModules: {
        documentParser: mockDocumentParserModulePath
      },
      testHooks: {
        jobDelayMs: 1800
      }
    }
  });
  const recoveryAuth = await installAuthenticatedFetch(resumedServer);

  try {
    const resumedFile = buildUploadedFile(
      "resume-weekly.eml",
      "mailbox/resume-weekly.eml",
      [
        "From: PMO Team <pmo@example.com>",
        "To: Alice <alice@example.com>",
        "Subject: 续传周报",
        "Date: Fri, 17 Apr 2026 09:00:00 +0000",
        "",
        "这是一封需要断点续传和服务重启恢复的测试邮件。"
      ].join("\n")
    );
    const resumedBundle = buildCheckpointBundle(resumedFile, "checkpoint-upload-resume");
    const uploadEventBaseline = await subscribeEvents(resumedServer.url, {
      topic: "uploads.session"
    });

    const createdSession = await fetchJson(`${resumedServer.url}/api/upload-sessions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        checkpoint: resumedBundle.checkpoint,
        manifest: resumedBundle.manifest,
        files: [
          {
            name: resumedFile.name,
            relativePath: resumedFile.relativePath,
            mediaType: resumedFile.mediaType,
            sha256: resumedFile.sha256,
            byteSize: resumedFile.byteSize
          }
        ]
      })
    });
	    assert.ok(isServerToken(createdSession.sessionId, "upload_session"));
	    assert.match(createdSession.checkpointTreeId || "", /^checkpoint_tree_[a-f0-9]{32}$/);
    assert.notEqual(createdSession.sessionId, "checkpoint-upload-resume");
    assert.ok(isServerToken(createdSession.checkpointId, "checkpoint"));
    assert.ok(isServerToken(createdSession.files[0].relativePath, "upload_file"));
    assert.notEqual(createdSession.files[0].relativePath, resumedFile.relativePath);
    const uploadEvents = await subscribeEvents(resumedServer.url, {
      cursor: uploadEventBaseline.nextCursor,
      topic: "uploads.session",
      timeoutMs: 1000,
      includeSnapshot: true
    });
    assert.ok(
      uploadEvents.events.some(
        (event) => event.payload?.session?.sessionId === createdSession.sessionId
      ),
      "上传会话创建后应该通过 uploads.session topic 发布。"
    );
    assert.ok(
      uploadEvents.snapshots.some(
        (event) => event.payload?.session?.sessionId === createdSession.sessionId
      ),
      "uploads.session 应该保留最新 snapshot。"
    );
    const createTraceEvents = await fetchJson(
      `${resumedServer.url}/api/events?topic=uploads.trace&limit=100`
    );
    const createTraceText = JSON.stringify(createTraceEvents.events || []);
    assert.ok(
      (createTraceEvents.events || []).some(
        (event) =>
          event.payload?.functionName === "handleCreateUploadSession" &&
          event.payload?.stage === "request_received"
      ),
      "创建 upload session 应该记录控制器报文摘要。"
    );
    assert.ok(
      (createTraceEvents.events || []).some(
        (event) =>
          event.payload?.functionName === "createOrResumeUploadSession" &&
          event.payload?.stage === "created"
      ),
      "创建 upload session 应该记录 store 函数调用。"
    );
    assert.equal(createTraceText.includes(resumedFile.name), false);
    assert.equal(createTraceText.includes(resumedFile.relativePath), false);

    const resumedBuffer = Buffer.from(resumedFile.dataBase64, "base64");
    const splitOffset = Math.floor(resumedBuffer.length / 2);
    const firstHalf = resumedBuffer.subarray(0, splitOffset);
    const secondHalf = resumedBuffer.subarray(splitOffset);

	    const partialSession = await fetchJson(
      `${resumedServer.url}/api/upload-sessions/${createdSession.sessionId}/files/0?offset=0`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/octet-stream"
        },
        body: firstHalf
      }
	    );
	    assert.equal(partialSession.files[0].receivedBytes, firstHalf.length);
	    const partialUploadTree = await loadCheckpointTree({
	      userDataPath: recoveryDataPath,
	      treeId: createdSession.checkpointTreeId
	    });
	    assert.equal(partialUploadTree?.status, "running");
	    assert.equal(
	      partialUploadTree?.nodes?.["receive-upload-files"]?.cursor?.receivedBytes,
	      firstHalf.length
	    );

    await resumedServer.close();

    const restartedUploadServer = await startHttpServer({
      userDataPath: recoveryDataPath,
      host: "127.0.0.1",
      port: 0,
      runtimeOptions: {
        profile: "minimal",
        mountModules: {
          documentParser: mockDocumentParserModulePath
        },
        testHooks: {
          jobDelayMs: 1800
        }
      }
    });
    await installAuthenticatedFetch(restartedUploadServer, { auth: recoveryAuth });

    try {
      const resumedSession = await fetchJson(
        `${restartedUploadServer.url}/api/upload-sessions/${createdSession.sessionId}`
      );
      assert.equal(resumedSession.files[0].receivedBytes, firstHalf.length);

      const completedSession = await fetchJson(
        `${restartedUploadServer.url}/api/upload-sessions/${createdSession.sessionId}/files/0?offset=${firstHalf.length}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/octet-stream"
          },
          body: secondHalf
        }
      );
	      assert.equal(completedSession.status, "complete");
	      const completedUploadTree = await loadCheckpointTree({
	        userDataPath: recoveryDataPath,
	        treeId: createdSession.checkpointTreeId
	      });
	      assert.equal(completedUploadTree?.status, "completed");
      const chunkTraceEvents = await fetchJson(
        `${restartedUploadServer.url}/api/events?topic=uploads.trace&limit=200`
      );
      assert.ok(
        (chunkTraceEvents.events || []).some(
          (event) =>
            event.payload?.functionName === "appendUploadSessionChunk" &&
            event.payload?.stage === "accepted" &&
            event.payload?.chunkBytes === secondHalf.length
        ),
        "上传 chunk 应该记录 appendUploadSessionChunk 接收细节。"
      );
      assert.ok(
        (chunkTraceEvents.events || []).some(
          (event) =>
            event.payload?.functionName === "handleUploadChunk" &&
            event.payload?.stage === "response_sent"
        ),
        "上传 chunk 应该记录控制器响应。"
      );

      const uploadJob = await fetchJson(`${restartedUploadServer.url}/api/jobs`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          inputText: "",
          filePaths: [],
          uploadSessionId: createdSession.sessionId,
          uploadedFiles: [],
          settings: payload.settings,
          checkpoint: resumedBundle.checkpoint
        })
      });
	      const uploadCompleted = await waitForJobStatus(
        restartedUploadServer.url,
        uploadJob.id,
        ["completed"]
	      );
	      assert.equal(uploadCompleted.status, "completed");
	      assert.match(uploadJob.checkpointTreeId || "", /^checkpoint_tree_[a-f0-9]{32}$/);
	      const uploadJobTree = await loadCheckpointTree({
	        userDataPath: recoveryDataPath,
	        treeId: uploadJob.checkpointTreeId
	      });
	      assert.equal(uploadJobTree?.status, "completed");
      const uploadResult = await fetchJson(
        `${restartedUploadServer.url}/api/jobs/${uploadJob.id}/result`
      );
      assert.equal(uploadResult.emails.length, 1);
      const recoveryBundle = buildCheckpointBundle(resumedFile, "checkpoint-restart-recover");

      const recoverySession = await fetchJson(`${restartedUploadServer.url}/api/upload-sessions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          checkpoint: recoveryBundle.checkpoint,
          manifest: recoveryBundle.manifest,
          files: [
            {
              name: resumedFile.name,
              relativePath: resumedFile.relativePath,
              mediaType: resumedFile.mediaType,
              sha256: resumedFile.sha256,
              byteSize: resumedFile.byteSize
            }
          ]
        })
      });
      await fetchJson(
        `${restartedUploadServer.url}/api/upload-sessions/${recoverySession.sessionId}/files/0?offset=0`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/octet-stream"
          },
          body: resumedBuffer
        }
      );

      const recoveryJob = await fetchJson(`${restartedUploadServer.url}/api/jobs`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          inputText: "",
          filePaths: [],
          uploadSessionId: recoverySession.sessionId,
          uploadedFiles: [],
          settings: payload.settings,
          checkpoint: recoveryBundle.checkpoint
        })
      });
      const runningRecoveryJob = await waitForJobStatus(
        restartedUploadServer.url,
        recoveryJob.id,
        ["running", "completed"],
        20
      );
      assert.equal(runningRecoveryJob.status, "running");

      await restartedUploadServer.close();

      const recoveredServer = await startHttpServer({
        userDataPath: recoveryDataPath,
        host: "127.0.0.1",
        port: 0,
        runtimeOptions: {
          profile: "minimal",
          mountModules: {
            documentParser: mockDocumentParserModulePath
          }
        }
      });
      await installAuthenticatedFetch(recoveredServer, { auth: recoveryAuth });

      try {
        const recoveredJob = await waitForJobStatus(
          recoveredServer.url,
          recoveryJob.id,
          ["completed"],
          40
        );
	        assert.equal(recoveredJob.status, "completed");
	        const recoveredJobTree = await loadCheckpointTree({
	          userDataPath: recoveryDataPath,
	          treeId: recoveryJob.checkpointTreeId
	        });
	        assert.equal(recoveredJobTree?.status, "completed");
        const recoveredResult = await fetchJson(
          `${recoveredServer.url}/api/jobs/${recoveryJob.id}/result`
        );
        assert.equal(recoveredResult.emails.length, 1);
      } finally {
        await recoveredServer.close();
      }
    } finally {
      // restartedUploadServer may already be closed after recovery test.
      try {
        await restartedUploadServer.close();
      } catch {
        // Ignore double-close in verification cleanup.
      }
    }
  } catch (error) {
    try {
      await resumedServer.close();
    } catch {
      // Ignore cleanup failure after restart scenario.
    }
    throw error;
  }

  await fs.mkdir(parseResumeDataPath, { recursive: true });
  let parseResumeServer = await startHttpServer({
    userDataPath: parseResumeDataPath,
    host: "127.0.0.1",
    port: 0,
    runtimeOptions: {
      profile: "minimal",
      mountModules: {
        documentParser: mockDocumentParserModulePath
      }
    }
  });
  const parseResumeAuth = await installAuthenticatedFetch(parseResumeServer);
  const parserLogPath = path.join(parseResumeDataPath, "parser-log.jsonl");
  const staleTikaTempPath = path.join(parseResumeDataPath, "tmp", "tika", "stale-before-restart.tmp");

  try {
    const parseFiles = [
      buildUploadedFile(
        "resume-parse-a.eml",
        "mailbox/resume-parse-a.eml",
        [
          "From: PMO Team <pmo@example.com>",
          "To: Alice <alice@example.com>",
          "Subject: 解析断点 A",
          "Date: Fri, 17 Apr 2026 10:00:00 +0000",
          "",
          "第一封用于验证解析级断点。"
        ].join("\n")
      ),
      buildUploadedFile(
        "resume-parse-b.eml",
        "mailbox/resume-parse-b.eml",
        [
          "From: PMO Team <pmo@example.com>",
          "To: Alice <alice@example.com>",
          "Subject: 解析断点 B",
          "Date: Fri, 17 Apr 2026 10:05:00 +0000",
          "",
          "第二封用于验证重启后继续。"
        ].join("\n")
      ),
      buildUploadedFile(
        "resume-parse-c.eml",
        "mailbox/resume-parse-c.eml",
        [
          "From: PMO Team <pmo@example.com>",
          "To: Alice <alice@example.com>",
          "Subject: 解析断点 C",
          "Date: Fri, 17 Apr 2026 10:10:00 +0000",
          "",
          "第三封用于验证没有从头重跑。"
        ].join("\n")
      )
    ];
    const parseManifestSha256 = sha256Hex(
      Buffer.from(
        JSON.stringify(
          parseFiles.map((file) => [file.relativePath || file.name, file.sha256, file.byteSize])
        )
      )
    );
    const parseJob = await fetchJson(`${parseResumeServer.url}/api/jobs`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        inputText: "",
        filePaths: [],
        uploadedFiles: parseFiles,
        settings: {
          ...payload.settings,
          testParserDelayMs: 900,
          testParserLogFile: parserLogPath
        },
        checkpoint: {
          checkpointId: "checkpoint-parse-resume",
          parentCheckpointId: "",
          mode: "initial",
          inputDigest: sha256Hex(Buffer.from("", "utf8")),
          manifestDigest: parseManifestSha256
        }
      })
    });

    await waitForImportCheckpointEntries(parseResumeDataPath, parseJob.id, 1);
    const liveSearchResult = await waitForKnowledgeSearchHit(parseResumeServer.url, "第一封", {
      batchId: parseJob.id
    });
    assert.ok(
      liveSearchResult.items.some((item) => String(item.batchId || "") === parseJob.id),
      "导入解析进行中，已解析完成的资料应该立即进入知识检索。"
    );
    await fs.mkdir(path.dirname(staleTikaTempPath), { recursive: true });
    await fs.writeFile(staleTikaTempPath, "stale temp", "utf8");
    await parseResumeServer.close();

    parseResumeServer = await startHttpServer({
      userDataPath: parseResumeDataPath,
      host: "127.0.0.1",
      port: 0,
      runtimeOptions: {
        profile: "minimal",
        mountModules: {
          documentParser: mockDocumentParserModulePath
        }
      }
    });
    await installAuthenticatedFetch(parseResumeServer, { auth: parseResumeAuth });

	    const parseRecoveredJob = await waitForJobStatus(
      parseResumeServer.url,
      parseJob.id,
      ["completed"],
      80
	    );
	    assert.equal(parseRecoveredJob.status, "completed");
	    const parseRecoveredTree = await loadCheckpointTree({
	      userDataPath: parseResumeDataPath,
	      treeId: parseJob.checkpointTreeId
	    });
	    assert.equal(parseRecoveredTree?.status, "completed");
	    assert.ok(parseRecoveredTree?.nodes?.["recovered-queue"] || parseRecoveredTree?.nodes?.["worker-run"]);
    const parseRecoveredResult = await fetchJson(
      `${parseResumeServer.url}/api/jobs/${parseJob.id}/result`
    );
    assert.equal(parseRecoveredResult.emails.length, parseFiles.length);
    const parserLogEntries = await readParserLog(parserLogPath);
    assert.equal(
      parserLogEntries.length,
      parseFiles.length,
      "服务重启后应该复用已完成解析的文件级断点，而不是从第一封邮件重新解析。"
    );
    assert.equal(
      await fs
        .access(staleTikaTempPath)
        .then(() => true)
        .catch(() => false),
      false,
      "恢复导入前应该清理上个 session 遗留的无用 Tika 临时文件。"
    );
    assert.equal(
      await fs
        .access(path.join(parseResumeDataPath, "jobs", parseJob.id, "import-checkpoint"))
        .then(() => true)
        .catch(() => false),
      false,
      "任务完成后应该移除已无继续价值的导入解析断点缓存。"
    );
  } finally {
    try {
      await parseResumeServer.close();
    } catch {
      // Ignore cleanup failure for the parse resume scenario.
    }
  }

  console.log("Checkpoint lifecycle verification passed.");
  console.log(`Server URL: ${server.url}`);
  console.log(`Delayed server URL: ${delayedServer.url}`);
} finally {
  if (delayedServer) {
    await delayedServer.close();
  }
  await server.close();
  await fs.rm(userDataPath, { recursive: true, force: true });
}
