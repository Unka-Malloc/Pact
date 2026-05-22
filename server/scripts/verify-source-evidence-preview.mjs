#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  getSourceFileIndexRun,
  indexKnowledgeSourceFiles,
  sourceEvidenceIdForPath
} from "../platform/specialized/knowledge/storage/source-file-index-service.mjs";
import {
  getSourceFileEvidence,
  searchSourceFiles
} from "../platform/specialized/knowledge/retrieval/source-file-search-service.mjs";
import { getSourceSearchRulesPath } from "../platform/specialized/knowledge/preprocessing/domain/rules/source-search-rules.mjs";

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

const userDataPath = await fs.mkdtemp(path.join(os.tmpdir(), "pact-source-evidence-"));

try {
  const sourceRoot = path.join(userDataPath, "sources");
  const ignoredRoot = path.join(sourceRoot, "node_modules");
  await fs.mkdir(sourceRoot, { recursive: true });
  await fs.mkdir(ignoredRoot, { recursive: true });

  const largeBody = "Google billing line\n".repeat(5000);
  const largeFile = path.join(sourceRoot, "google-billing.eml");
  const hsbcStatementFile = path.join(sourceRoot, "hsbc-statement.eml");
  await fs.writeFile(
    largeFile,
    [
      "From: billing@example.test",
      "To: owner@example.test",
      "Subject: Google 账单",
      "Date: Fri, 01 May 2026 10:00:00 +0000",
      "Content-Type: text/plain; charset=utf-8",
      "",
      largeBody,
      "END-OF-FILE-SHOULD-NOT-BE-IN-PREVIEW"
    ].join("\n")
  );
  await fs.writeFile(
    hsbcStatementFile,
    [
      "From: HSBC Documents <documents@hsbc.example>",
      "To: owner@example.test",
      "Subject: HSBC =?UTF-8?B?6LSm5Y2V?=",
      "Date: Fri, 01 May 2026 11:00:00 +0000",
      "Content-Type: multipart/alternative; boundary=hsbc-boundary",
      "",
      "--hsbc-boundary",
      "Content-Type: text/plain; charset=UTF-8",
      "Content-Transfer-Encoding: quoted-printable",
      "",
      "Your HSBC statement is ready. =E8=B4=A6=E5=8D=95 =E5=B7=B2=E7=94=9F=E6=88=90.",
      "--hsbc-boundary--"
    ].join("\n")
  );

  await fs.writeFile(
    path.join(ignoredRoot, "ignored.eml"),
    [
      "Subject: Ignored source",
      "",
      "ignored-unique-token"
    ].join("\n")
  );
  for (let index = 0; index < 40; index += 1) {
    await fs.writeFile(
      path.join(sourceRoot, `batch-${index}.eml`),
      [
        `Subject: Batch ${index}`,
        "",
        `batch-token-${index} `.repeat(2000)
      ].join("\n")
    );
  }

  await writeJson(getSourceSearchRulesPath(userDataPath), {
    schemaVersion: 1,
    updatedAt: new Date().toISOString(),
    maxFileBytes: 2 * 1024 * 1024,
    maxEvidenceBytes: 32 * 1024,
    maxScanFiles: 1000,
    readConcurrency: 4,
    indexConcurrency: 4,
    indexMaxTermsPerFile: 2000,
    cacheTtlMs: 1000,
    includeKnowledgeSources: false,
    useInvertedIndex: false,
    scanFallbackWhenIndexMissing: false,
    knowledgeSourceExtensions: [".eml"],
    ignoredDirectories: ["node_modules"],
    scanRoots: [
      {
        id: "fixture-mail",
        label: "Fixture mail",
        relativePath: "sources",
        extensions: [".eml"],
        enabled: true
      }
    ],
    queryExpansions: [],
    snippetWindow: 160
  });

  const ignoredSearch = await searchSourceFiles({
    userDataPath,
    query: "ignored-unique-token",
    limit: 10
  });
  assert.equal(ignoredSearch.items.length, 0, "ignored directories must not be scanned");

  const search = await searchSourceFiles({
    userDataPath,
    query: "Google billing",
    limit: 10
  });
  assert.ok(search.items.length >= 1, "large source file should be searchable when under maxFileBytes");
  assert.equal(search.items[0].evidenceId, sourceEvidenceIdForPath(userDataPath, largeFile));

  const hsbcSearch = await searchSourceFiles({
    userDataPath,
    query: "HSBC 账单",
    limit: 10
  });
  assert.ok(hsbcSearch.items.length >= 1, "quoted-printable mail should be searchable as readable text");
  assert.equal(hsbcSearch.items[0].evidenceId, sourceEvidenceIdForPath(userDataPath, hsbcStatementFile));
  assert.equal(hsbcSearch.items[0].relevanceTier, "high");
  assert.ok(hsbcSearch.items[0].snippet.includes("账单"));

  const evidence = await getSourceFileEvidence({
    userDataPath,
    evidenceId: search.items[0].evidenceId
  });
  assert.ok(evidence, "source evidence should resolve");
  assert.equal(evidence.evidenceId, search.items[0].evidenceId);
  assert.equal(evidence.sourceLocator.truncated, true);
  assert.ok(evidence.payload.blocks[0].text.includes("Google 账单"));
  assert.ok(evidence.payload.blocks[0].text.includes("只显示前"));
  assert.equal(
    evidence.payload.blocks[0].text.includes("END-OF-FILE-SHOULD-NOT-BE-IN-PREVIEW"),
    false,
    "source evidence preview must not return the full large file"
  );

  const indexRun = await indexKnowledgeSourceFiles({
    userDataPath,
    source: {
      sourceId: "fixture-mail",
      directoryPath: sourceRoot,
      enabled: true,
      recursive: true
    },
    reason: "verify-source-evidence-preview",
    force: true
  });
  assert.equal(indexRun.skipped, false);
  assert.equal(indexRun.failedCount, 0);
  assert.ok(indexRun.indexedCount >= 42, "source index should process files in bounded chunks");
  const persistedIndexRun = await getSourceFileIndexRun({ userDataPath, sourceId: "fixture-mail" });
  assert.equal(persistedIndexRun.status, "indexed");

  console.log("source evidence preview verification passed");
} finally {
  await fs.rm(userDataPath, { recursive: true, force: true });
}
