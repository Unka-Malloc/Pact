import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { startHttpServer } from "../http-server.mjs";
import { authHeaders, installAuthenticatedFetch } from "./test-auth-helper.mjs";

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  return {
    status: response.status,
    ok: response.ok,
    payload: text.trim() ? JSON.parse(text) : {}
  };
}

async function fetchJson(url, options = {}) {
  const result = await requestJson(url, options);
  if (!result.ok) {
    throw new Error(`${url} failed: ${result.status} ${JSON.stringify(result.payload)}`);
  }
  return result.payload;
}

async function main() {
  const userDataPath = await fs.mkdtemp(path.join(os.tmpdir(), "splitall-knowledge-packages-"));
  const server = await startHttpServer({
    userDataPath,
    runtimeOptions: { profile: "minimal" }
  });
  try {
    const auth = await installAuthenticatedFetch(server);
    const currentVocabulary = await fetchJson(`${server.url}/api/expert-vocabulary`);
    assert.equal(currentVocabulary.vocabulary.source, "mail-expert-vocabulary");
    assert.ok(currentVocabulary.vocabulary.checksum);

    const packages = await fetchJson(`${server.url}/api/knowledge-packages`);
    assert.ok(packages.items.some((item) => item.packageId === "mail-expert-vocabulary"));

    const draft = await fetchJson(`${server.url}/api/knowledge-packages/mail-expert-vocabulary`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(auth, { method: "POST", safetyConfirm: true })
      },
      body: JSON.stringify({
        entries: [
          ...currentVocabulary.vocabulary.entries,
          {
            pathSegments: ["验证知识包", "发布"],
            label: "发布验证",
            keywords: ["knowledge-package-publish-marker"],
            domains: ["example.test"],
            status: "active",
            notes: "verify package versioning"
          }
        ],
        scope: {
          sourceKinds: ["email"],
          platforms: ["desktop"],
          domains: ["mail-index"],
          appliesTo: ["mail-index", "knowledge-index"]
        }
      })
    });
    assert.equal(draft.package.status, "draft");
    assert.equal(draft.package.version, currentVocabulary.vocabulary.version + 1);

    const published = await fetchJson(`${server.url}/api/knowledge-packages/mail-expert-vocabulary/publish`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(auth, { method: "POST", safetyConfirm: true })
      },
      body: JSON.stringify({ version: draft.package.version })
    });
    assert.equal(published.manifest.activeVersion, draft.package.version);

    const afterPublish = await fetchJson(`${server.url}/api/expert-vocabulary`);
    assert.equal(afterPublish.vocabulary.version, draft.package.version);
    assert.notEqual(afterPublish.vocabulary.checksum, currentVocabulary.vocabulary.checksum);
    assert.ok(
      afterPublish.vocabulary.entries.some((entry) =>
        (entry.keywords || []).includes("knowledge-package-publish-marker")
      )
    );

    const rollback = await fetchJson(`${server.url}/api/knowledge-packages/mail-expert-vocabulary/rollback`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(auth, { method: "POST", safetyConfirm: true })
      },
      body: JSON.stringify({ version: currentVocabulary.vocabulary.version })
    });
    assert.equal(rollback.package.rollbackOf, currentVocabulary.vocabulary.version);
    assert.equal(rollback.manifest.activeVersion, rollback.package.version);

    const afterRollback = await fetchJson(`${server.url}/api/expert-vocabulary`);
    assert.equal(afterRollback.vocabulary.checksum, rollback.package.checksum);
    assert.equal(
      afterRollback.vocabulary.entries.some((entry) =>
        (entry.keywords || []).includes("knowledge-package-publish-marker")
      ),
      false
    );

    const versions = await fetchJson(`${server.url}/api/expert-vocabulary/versions`);
    assert.ok(versions.package.versions.length >= 3);

    const audit = await fetchJson(`${server.url}/api/auth/audit?limit=200`);
    assert.ok(audit.items.some((item) => item.operationId === "knowledge_packages.publish"));
    assert.ok(audit.items.some((item) => item.operationId === "knowledge_packages.rollback"));
  } finally {
    await server.close();
  }
}

await main();
console.log("knowledge-packages verification passed");
