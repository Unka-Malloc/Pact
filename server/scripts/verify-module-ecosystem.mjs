#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { SERVER_API_OPERATIONS } from "../platform/common/operation-dispatcher/operation-registry.mjs";
import {
  listModuleTemplates,
  MODULE_ECOSYSTEM_PROTOCOL_VERSION,
  planModuleScaffold,
  runModuleContractTest,
  scaffoldModule,
  validateCapabilityPackageScaffoldManifest
} from "../platform/common/module-manager/module-ecosystem/index.mjs";
import { createToolCatalog } from "../platform/specialized/capabilities/tools/tool-management-core/catalog.mjs";

const execFileAsync = promisify(execFile);

async function verifyMountScaffold(tempRoot) {
  const targetDir = path.join(tempRoot, "acme-parser");
  const plan = await planModuleScaffold({
    template: "documentParser",
    moduleId: "acme.document-parser",
    targetDir
  });
  assert.equal(plan.protocolVersion, MODULE_ECOSYSTEM_PROTOCOL_VERSION);
  assert.equal(plan.template.templateId, "documentParser");
  assert.ok(plan.files.some((file) => file.path === "module.json" && file.action === "create"));
  assert.ok(plan.files.some((file) => file.path === ".github/workflows/contract-test.yml"));

  const scaffold = await scaffoldModule({
    template: "documentParser",
    moduleId: "acme.document-parser",
    targetDir
  });
  assert.equal(scaffold.targetDir, targetDir);
  assert.ok(scaffold.written.some((file) => file.path === "index.mjs"));

  const manifest = JSON.parse(await fs.readFile(path.join(targetDir, "module.json"), "utf8"));
  assert.equal(manifest.protocolVersion, "agentstudio.mount-module.v1");
  assert.equal(manifest.ecosystemProtocolVersion, MODULE_ECOSYSTEM_PROTOCOL_VERSION);
  assert.equal(manifest.mountName, "documentParser");

  const samplePath = path.join(targetDir, "samples", "sample.txt");
  const contract = await runModuleContractTest({
    modulePath: path.join(targetDir, "index.mjs"),
    mountName: "documentParser",
    samplePath,
    userDataPath: path.join(tempRoot, "data")
  });
  assert.equal(contract.ok, true);
  assert.ok(contract.checks.some((check) => check.name === "extractDocument text" && check.ok));

  const cliContract = await execFileAsync(process.execPath, [
    "server/scripts/agentstudio-module-contract-test.mjs",
    "--module",
    path.join(targetDir, "index.mjs"),
    "--mount-name",
    "documentParser",
    "--sample",
    samplePath,
    "--data-dir",
    path.join(tempRoot, "cli-data")
  ]);
  const cliReport = JSON.parse(cliContract.stdout);
  assert.equal(cliReport.ok, true);

  const conflictPlan = await planModuleScaffold({
    template: "documentParser",
    moduleId: "acme.document-parser",
    targetDir
  });
  assert.ok(conflictPlan.files.some((file) => file.action === "conflict"));
}

async function verifyPackageScaffold(tempRoot) {
  const targetDir = path.join(tempRoot, "acme-tool");
  await execFileAsync(process.execPath, [
    "server/scripts/agentstudio-create-module.mjs",
    "--template",
    "toolPackage",
    "--module-id",
    "acme.http-tool",
    "--target",
    targetDir,
    "--json"
  ]);
  const manifest = JSON.parse(await fs.readFile(path.join(targetDir, "capability-package.json"), "utf8"));
  const validation = validateCapabilityPackageScaffoldManifest({ manifest });
  assert.equal(validation.protocolVersion, MODULE_ECOSYSTEM_PROTOCOL_VERSION);
  assert.equal(validation.ok, true);
  assert.equal(validation.manifest.kind, "tool");

  const cliValidation = await execFileAsync(process.execPath, [
    "server/scripts/agentstudio-module-contract-test.mjs",
    "--manifest",
    path.join(targetDir, "capability-package.json")
  ]);
  const cliReport = JSON.parse(cliValidation.stdout);
  assert.equal(cliReport.ok, true);
}

function verifyOperationsAndTools() {
  const operations = new Map(SERVER_API_OPERATIONS.map((operation) => [operation.id, operation]));
  for (const id of [
    "module_ecosystem.templates",
    "module_ecosystem.plan",
    "module_ecosystem.scaffold",
    "module_ecosystem.contract_test"
  ]) {
    assert.ok(operations.has(id), `${id} must be registered`);
  }
  assert.equal(operations.get("module_ecosystem.templates").http.path, "/api/modules/templates");
  assert.equal(operations.get("module_ecosystem.scaffold").target.method, "handleModuleScaffold");
  assert.equal(operations.get("module_ecosystem.scaffold").safety.requiresConfirmation, true);

  const catalog = createToolCatalog({ operations: SERVER_API_OPERATIONS });
  const scaffoldTool = catalog.tools.find((tool) => tool.id === "agentstudio.modules.scaffold");
  assert.ok(scaffoldTool, "module scaffold tool must be exposed");
  assert.ok(scaffoldTool.toolsets.includes("agentstudio.mount.dev"));
  assert.equal(scaffoldTool.requiresApproval, true);
}

async function main() {
  const templates = listModuleTemplates();
  assert.equal(templates.protocolVersion, MODULE_ECOSYSTEM_PROTOCOL_VERSION);
  assert.ok(templates.templates.some((template) => template.templateId === "documentParser"));
  assert.ok(templates.templates.some((template) => template.templateId === "toolPackage"));
  assert.ok(templates.templates.some((template) => template.templateId === "skillPackage"));

  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "agentstudio-module-ecosystem-"));
  try {
    await verifyMountScaffold(tempRoot);
    await verifyPackageScaffold(tempRoot);
    verifyOperationsAndTools();
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
  console.log("[module-ecosystem] ok");
}

await main();
