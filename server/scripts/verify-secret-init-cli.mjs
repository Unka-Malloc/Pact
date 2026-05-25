#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { localSecretConfigured } from "../platform/common/security/secrets/local-secret-store.mjs";

const repoRoot = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));
const pactCli = path.join(repoRoot, "server/scripts/pact.mjs");

function runCli(args, { input = "" } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [pactCli, ...args], {
      cwd: repoRoot,
      stdio: ["pipe", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({
        code: Number(code ?? 1),
        stdout,
        stderr
      });
    });
    child.stdin.end(input);
  });
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

async function assertPrivateFile(filePath) {
  const stat = await fs.stat(filePath);
  assert.equal(stat.mode & 0o077, 0, `${filePath} must not be group/world-readable`);
}

async function main() {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "pact-secret-init-"));
  const gerritPassword = "verify-secret-init-password";
  const difyKey = "verify-dify-api-key";
  const oauthPayload = { refreshToken: "verify-refresh-token", clientSecret: "verify-client-secret" };

  const gerrit = await runCli([
    "secret",
    "gerrit",
    "init",
    "--data-dir",
    dataDir,
    "--base-url",
    "https://gerrit.example.invalid",
    "--username",
    "svc-pact",
    "--http-password-stdin",
    "--mode",
    "live"
  ], { input: `${gerritPassword}\n` });
  assert.equal(gerrit.code, 0, gerrit.stderr || gerrit.stdout);
  assert.equal(gerrit.stdout.includes(gerritPassword), false, "CLI stdout must not print secret values");
  const gerritResult = JSON.parse(gerrit.stdout);
  assert.equal(gerritResult.ok, true);
  assert.equal(gerritResult.provider, "gerrit");
  assert.equal(gerritResult.secretRef, "secret://pact/codespace/gerrit-service-account");
  await assertPrivateFile(gerritResult.valuePath);

  const dify = await runCli([
    "secret.dify.init",
    "--data-dir",
    dataDir,
    "--endpoint",
    "https://dify.example.invalid",
    "--api-key-stdin"
  ], { input: `${difyKey}\n` });
  assert.equal(dify.code, 0, dify.stderr || dify.stdout);
  assert.equal(dify.stdout.includes(difyKey), false, "CLI stdout must not print Dify key");

  const onedrive = await runCli([
    "secret",
    "onedrive",
    "init",
    "--data-dir",
    dataDir,
    "--oauth-json-stdin",
    "--workspace-id",
    "workspace-secret-verify"
  ], { input: JSON.stringify(oauthPayload) });
  assert.equal(onedrive.code, 0, onedrive.stderr || onedrive.stdout);
  assert.equal(onedrive.stdout.includes(oauthPayload.refreshToken), false, "CLI stdout must not print OAuth token");

  const list = await runCli(["secret", "list", "--data-dir", dataDir]);
  assert.equal(list.code, 0, list.stderr || list.stdout);
  const listResult = JSON.parse(list.stdout);
  assert.equal(listResult.count, 3);
  assert.equal(listResult.entries.every((entry) => entry.credentialConfigured === true), true);

  const registry = await readJson(path.join(dataDir, "secrets", "registry.json"));
  assert.equal(registry.refs["secret://pact/codespace/gerrit-service-account"].provider, "gerrit");
  assert.equal(JSON.stringify(registry).includes(gerritPassword), false, "registry must not contain raw secret values");
  await assertPrivateFile(path.join(dataDir, "secrets", "registry.json"));
  await assertPrivateFile(path.join(dataDir, "secrets", "audit.jsonl"));

  const codespaceManifest = await readJson(path.join(dataDir, "code-management", "codespace-providers.json"));
  assert.equal(codespaceManifest.providers.gerrit.secretRef, "secret://pact/codespace/gerrit-service-account");
  assert.equal(codespaceManifest.providers.gerrit.mode, "live");
  assert.equal(codespaceManifest.providers.gerrit.credentialConfigured, true);
  assert.equal(JSON.stringify(codespaceManifest).includes(gerritPassword), false, "codespace manifest must not contain raw secret values");

  const knowledgeManifest = await readJson(path.join(dataDir, "knowledge", "knowledge-backends.json"));
  assert.equal(knowledgeManifest.providers.dify.secretRef, "secret://pact/knowledge/dify-api-key");
  assert.equal(knowledgeManifest.providers.dify.credentialConfigured, true);
  assert.equal(JSON.stringify(knowledgeManifest).includes(difyKey), false, "knowledge manifest must not contain raw secret values");

  const driveManifest = await readJson(path.join(dataDir, "agent-workspaces", "cloud-drive-connections.json"));
  const driveConnection = Object.values(driveManifest.connections).find((connection) => connection.provider === "onedrive");
  assert.ok(driveConnection);
  assert.equal(driveConnection.secretRef, "secret://pact/drive/onedrive-oauth");
  assert.equal(driveConnection.credentialConfigured, true);
  assert.equal(driveConnection.contractVerified, true);
  assert.equal(JSON.stringify(driveManifest).includes(oauthPayload.refreshToken), false, "drive manifest must not contain raw secret values");

  assert.equal(await localSecretConfigured({ dataDir, provider: "gerrit" }), true);
  assert.equal(await localSecretConfigured({ dataDir, provider: "dify" }), true);
  assert.equal(await localSecretConfigured({ dataDir, provider: "onedrive" }), true);

  const configRefs = await readJson(path.join(dataDir, "config", "refs.json"));
  assert.equal(configRefs.refs["config://pact/codespace/gerrit-endpoint"].value, "https://gerrit.example.invalid");
  assert.equal(configRefs.refs["config://pact/knowledge/dify-endpoint"].value, "https://dify.example.invalid");

  console.log("verify-secret-init-cli passed");
}

await main();
