#!/usr/bin/env node
import assert from "node:assert/strict";
import http from "node:http";
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

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve(server.address());
    });
  });
}

function closeServer(server) {
  return new Promise((resolve) => server.close(() => resolve()));
}

async function createMockOAuthProvider() {
  const calls = {
    authorize: [],
    token: []
  };
  const server = http.createServer(async (request, response) => {
    const requestUrl = new URL(request.url || "/", "http://127.0.0.1");
    if (requestUrl.pathname === "/authorize") {
      calls.authorize.push(Object.fromEntries(requestUrl.searchParams.entries()));
      const redirectUri = requestUrl.searchParams.get("redirect_uri");
      const state = requestUrl.searchParams.get("state");
      const callback = new URL(redirectUri);
      callback.searchParams.set("code", "mock-oauth-code");
      callback.searchParams.set("state", state);
      response.writeHead(302, { location: callback.toString() });
      response.end();
      return;
    }
    if (requestUrl.pathname === "/token") {
      let rawBody = "";
      for await (const chunk of request) {
        rawBody += chunk.toString();
      }
      const body = Object.fromEntries(new URLSearchParams(rawBody).entries());
      calls.token.push({
        body,
        authorization: request.headers.authorization || ""
      });
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({
        access_token: "mock-access-token",
        refresh_token: "mock-refresh-token",
        token_type: "Bearer",
        expires_in: 3600,
        scope: body.scope || "files.read"
      }));
      return;
    }
    response.writeHead(404, { "content-type": "text/plain" });
    response.end("not found");
  });
  const address = await listen(server);
  return {
    server,
    calls,
    baseUrl: `http://127.0.0.1:${address.port}`
  };
}

function runCliOAuth(args, { input = "", timeoutMs = 15000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [pactCli, ...args], {
      cwd: repoRoot,
      stdio: ["pipe", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    let opened = false;
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`OAuth CLI timed out. stderr=${stderr}`));
    }, timeoutMs);
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
      const match = stderr.match(/oauthAuthorizationUrl=(\S+)/);
      if (!opened && match) {
        opened = true;
        fetch(match[1]).catch((error) => {
          child.kill("SIGTERM");
          reject(error);
        });
      }
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
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

  const mockOAuth = await createMockOAuthProvider();
  try {
    const clientSecret = "mock-client-secret";
    const oauth = await runCliOAuth([
      "secret",
      "google-drive",
      "oauth",
      "--data-dir",
      dataDir,
      "--client-id",
      "mock-client-id",
      "--client-secret-stdin",
      "--auth-url",
      `${mockOAuth.baseUrl}/authorize`,
      "--token-url",
      `${mockOAuth.baseUrl}/token`,
      "--scope",
      "files.read files.write",
      "--client-auth",
      "body",
      "--no-open",
      "--timeout-ms",
      "10000"
    ], { input: `${clientSecret}\n` });
    assert.equal(oauth.code, 0, oauth.stderr || oauth.stdout);
    assert.equal(oauth.stdout.includes("mock-access-token"), false, "OAuth stdout must not print access token");
    assert.equal(oauth.stdout.includes("mock-refresh-token"), false, "OAuth stdout must not print refresh token");
    assert.equal(oauth.stdout.includes(clientSecret), false, "OAuth stdout must not print client secret");
    const oauthResult = JSON.parse(oauth.stdout);
    assert.equal(oauthResult.ok, true);
    assert.equal(oauthResult.provider, "google-drive");
    assert.equal(oauthResult.oauth.hasRefreshToken, true);
    assert.ok(oauthResult.oauth.redirectUri.startsWith("http://127.0.0.1:"));
    assert.equal(mockOAuth.calls.authorize.length, 1);
    assert.equal(mockOAuth.calls.authorize[0].client_id, "mock-client-id");
    assert.equal(mockOAuth.calls.authorize[0].code_challenge_method, "S256");
    assert.equal(mockOAuth.calls.token.length, 1);
    assert.equal(mockOAuth.calls.token[0].body.code, "mock-oauth-code");
    assert.equal(mockOAuth.calls.token[0].body.client_secret, clientSecret);
    assert.ok(mockOAuth.calls.token[0].body.code_verifier);

    const driveManifestAfterOAuth = await readJson(path.join(dataDir, "agent-workspaces", "cloud-drive-connections.json"));
    const googleConnection = Object.values(driveManifestAfterOAuth.connections).find((connection) => connection.provider === "google-drive");
    assert.ok(googleConnection);
    assert.equal(googleConnection.secretRef, "secret://pact/drive/google-drive-oauth");
    assert.equal(googleConnection.credentialConfigured, true);
    assert.equal(JSON.stringify(driveManifestAfterOAuth).includes("mock-refresh-token"), false, "drive manifest must not contain OAuth redirect token");

    const registryAfterOAuth = await readJson(path.join(dataDir, "secrets", "registry.json"));
    assert.equal(registryAfterOAuth.refs["secret://pact/drive/google-drive-oauth"].provider, "google-drive");
    assert.equal(JSON.stringify(registryAfterOAuth).includes("mock-refresh-token"), false, "registry must not contain OAuth redirect token");
    assert.equal(await localSecretConfigured({ dataDir, provider: "google-drive" }), true);
  } finally {
    await closeServer(mockOAuth.server);
  }

  console.log("verify-secret-init-cli passed");
}

await main();
