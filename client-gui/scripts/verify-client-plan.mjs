#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));
const requiredVerifierScripts = [
  "client:verify:architecture",
  "client:verify:plan",
  "client:verify:state-store",
  "client:verify:targets",
  "client:verify:config-writes",
  "client:verify:pairing-skill-cli",
  "client:verify:mcp-plugins",
  "client:verify:thin-forwarding"
];
const firstTargets = ["Codex", "OpenCode", "OpenClaw", "Antigravity", "Cursor", "Windsurf", "Gemini CLI"];
const sixModules = ["Agents", "MCP Plugins", "Skill Hub", "Model Forwarding", "Activity", "Settings"];

const failures = [];

function assert(condition, message) {
  if (!condition) {
    failures.push(message);
  }
}

async function readText(relativePath) {
  return fs.readFile(path.join(repoRoot, relativePath), "utf8");
}

async function readJson(relativePath) {
  return JSON.parse(await readText(relativePath));
}

function linesContaining(source, token) {
  return source
    .split(/\r?\n/)
    .map((line, index) => ({ line, number: index + 1 }))
    .filter((item) => item.line.includes(token));
}

const packageJson = await readJson("package.json");
const scripts = packageJson.scripts || {};
for (const scriptName of requiredVerifierScripts) {
  assert(Boolean(scripts[scriptName]), `package.json must define ${scriptName}`);
  assert(scripts["client:verify"]?.includes(scriptName), `client:verify must aggregate ${scriptName}`);
}
for (const scriptName of ["client:package:plan", "feature:build:client", "client:analyze", "client:test", "client:native:test"]) {
  assert(Boolean(scripts[scriptName]), `package.json must define ${scriptName}`);
}

const testsRunner = await readText("tests/run.mjs");
for (const suiteId of [
  "client.architecture",
  "client.plan",
  "client.targets",
  "client.config-writes",
  "client.state-store",
  "client.pairing-skill",
  "client.mcp-plugins",
  "client.thin-forwarding"
]) {
  assert(testsRunner.includes(`suite("${suiteId}"`), `tests/run.mjs must register suite ${suiteId}`);
  assert(testsRunner.includes(`"${suiteId}"`), `tests/run.mjs client profiles must include suite ${suiteId}`);
}

const architecture = await readText("docs/CLIENT_ARCHITECTURE.md");
const plan = await readText("docs/CLIENT-IMPLEMENTATION-PLAN.md");
const conformance = await readText("docs/CLIENT-DESIGN-CONFORMANCE.md");
const testFramework = await readText("docs/TEST-FRAMEWORK.md");

for (const source of [
  ["CLIENT_ARCHITECTURE", architecture],
  ["CLIENT-IMPLEMENTATION-PLAN", plan],
  ["CLIENT-DESIGN-CONFORMANCE", conformance]
]) {
  const [name, text] = source;
  assert(/destructive|破坏性/i.test(text), `${name} must state the destructive client refactor posture`);
  assert(/旧客户端(?:不再是|不是)兼容目标|not a compatibility target/i.test(text), `${name} must state that the old client is not a compatibility target`);
}
for (const target of firstTargets) {
  assert(architecture.includes(target), `CLIENT_ARCHITECTURE must include target ${target}`);
  assert(plan.includes(target), `CLIENT-IMPLEMENTATION-PLAN must include target ${target}`);
  assert(conformance.includes(target), `CLIENT-DESIGN-CONFORMANCE must classify target ${target}`);
}
for (const moduleName of sixModules) {
  assert(architecture.includes(moduleName), `CLIENT_ARCHITECTURE must include module ${moduleName}`);
  assert(conformance.includes(moduleName), `CLIENT-DESIGN-CONFORMANCE must include module ${moduleName}`);
}
for (const scriptName of requiredVerifierScripts) {
  assert(plan.includes(scriptName), `CLIENT-IMPLEMENTATION-PLAN must reference ${scriptName}`);
  assert(testFramework.includes(scriptName), `TEST-FRAMEWORK must document ${scriptName}`);
}

const skillIntegrityLines = linesContaining(plan, "client:verify:skill-integrity");
for (const item of skillIntegrityLines) {
  const normalized = item.line.toLowerCase();
  assert(
    normalized.includes("deferred") || item.line.includes("待") || item.line.includes("协议未完成"),
    `client:verify:skill-integrity must be explicitly deferred until Skill Hub protocols are designed (line ${item.number})`
  );
}
for (const source of [
  ["CLIENT_ARCHITECTURE", architecture],
  ["CLIENT-IMPLEMENTATION-PLAN", plan],
  ["CLIENT-DESIGN-CONFORMANCE", conformance]
]) {
  const protocolLines = linesContaining(source[1], "protocol_deferred");
  assert(protocolLines.length > 0, `${source[0]} must preserve protocol_deferred boundary language`);
  for (const item of protocolLines) {
    assert(!/\bdone\b|已完成|完成落地/.test(item.line), `${source[0]} must not mark protocol_deferred as done at line ${item.number}`);
  }
}

const packaging = await readJson("client-gui/packaging.modules.json");
assert(packaging.packageProfile === "future-client", "packaging.modules.json must default to future-client profile");
for (const moduleId of ["data-connectors", "knowledge-agent", "mail-index", "knowledge-graph-ui", "upload-queue", "client-daemon"]) {
  assert(packaging.modules?.[moduleId]?.profile === "legacy/dev-only", `legacy module must be isolated in packaging plan: ${moduleId}`);
}

if (failures.length > 0) {
  console.error(JSON.stringify({ ok: false, failures }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  ok: true,
  verifierScripts: requiredVerifierScripts,
  targets: firstTargets,
  modules: sixModules,
  deferredSkillIntegrityReferences: skillIntegrityLines.length
}, null, 2));
