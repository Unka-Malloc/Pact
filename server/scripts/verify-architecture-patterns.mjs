import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));

async function read(relativePath) {
  return fs.readFile(path.join(repoRoot, relativePath), "utf8");
}

function assertTextIncludes(text, needle, message) {
  assert.equal(text.includes(needle), true, message);
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function assertTextExcludes(text, needles, file) {
  const found = needles.filter((needle) =>
    new RegExp(`\\b${escapeRegExp(needle)}\\b`).test(text)
  );
  assert.deepEqual(found, [], `${file} must keep platform assembly behind the composition root`);
}

async function assertHttpServerUsesCompositionRoot() {
  const file = "server/services/server-runtime/http-server.mjs";
  const text = await read(file);
  assertTextIncludes(
    text,
    "createServerCompositionRoot",
    "server/services/server-runtime/http-server.mjs must create its runtime through the composition root"
  );
  assertTextIncludes(
    text,
    "ensureConsoleOwner",
    "server/services/server-runtime/http-server.mjs must delegate owner bootstrapping to the composition root helper"
  );
  assertTextIncludes(
    text,
    "createServerRuntimeProviders",
    "server/services/server-runtime/http-server.mjs must create feature runtime services through the provider registry"
  );
  assertTextExcludes(
    text,
    [
      "createOptionalRuntime",
      "createPlatformRegistry",
      "registerCorePlatformServices",
      "registerModulePlatformServices",
      "registerStoragePlatformServices",
      "registerOpsPlatformServices",
      "createConsoleAuth",
      "createOperationAuditStore",
      "createServerRuntime",
      "createProtocolEventBus",
      "resolveFeatureRuntimeFromEnv",
      "filterOperationsForFeatures",
      "publicFeatureRuntime",
      "SERVER_API_OPERATIONS"
    ],
    file
  );
}

async function assertCompositionRootOwnsAssembly() {
  const file = "server/platform/interactive/composition-root.mjs";
  const text = await read(file);
  for (const needle of [
    "createPlatformRegistry",
    "registerCorePlatformServices",
    "registerModulePlatformServices",
    "registerStoragePlatformServices",
    "registerOpsPlatformServices",
    "createConsoleAuth",
    "createOperationAuditStore",
    "createServerRuntime",
    "createProtocolEventBus",
    "resolveFeatureRuntimeFromEnv",
    "filterOperationsForFeatures",
    "publicFeatureRuntime",
    "SERVER_API_OPERATIONS"
  ]) {
    assertTextIncludes(text, needle, `${file} must own ${needle}`);
  }
}

async function assertRuntimeProvidersOwnProviderImports() {
  const file = "server/platform/interactive/server-runtime-providers.mjs";
  const text = await read(file);
  for (const needle of [
    "createProvider",
    "createServerRuntimeProviders",
    "maintenance-agent-runbooks",
    "knowledge-distillation",
    "agent-exploration",
    "await import(specifier)"
  ]) {
    assertTextIncludes(text, needle, `${file} must own runtime provider selection`);
  }
}

async function assertAgentCapabilityAuditCoversMainline() {
  const file = "docs/AGENT-CAPABILITY-AUDIT.md";
  const text = await read(file);
  for (const needle of [
    "OpenCode",
    "LangChain Deep Agents",
    "OpenClaw",
    "Hermes Agent",
    "AgentWorkspace",
    "ContextRuntime",
    "AgentGateway",
    "Tool Management",
    "AgentMemory",
    "knowledge-retrieval-quality",
    "workspace-context-bundle",
    "runtime.mounts.reload",
    "不修改词云",
    "不复制外部实现代码"
  ]) {
    assertTextIncludes(text, needle, `${file} must keep agent capability audit evidence for ${needle}`);
  }
}

async function main() {
  await assertHttpServerUsesCompositionRoot();
  await assertCompositionRootOwnsAssembly();
  await assertRuntimeProvidersOwnProviderImports();
  await assertAgentCapabilityAuditCoversMainline();
}

await main();
console.log("architecture-patterns verification passed");
