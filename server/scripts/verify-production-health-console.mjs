#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SERVER_API_OPERATIONS } from "../platform/common/operation-dispatcher/operation-registry.mjs";
import {
  buildProductionHealthReport,
  PRODUCTION_HEALTH_REPORT_TYPE
} from "../platform/common/production-readiness/report-reader.mjs";

const repoRoot = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));

async function writeSampleReport(root, runId, overrides = {}) {
  const reportDir = path.join(root, runId);
  await fs.mkdir(reportDir, { recursive: true });
  const report = {
    schemaVersion: 1,
    reportType: "agentstudio.production-readiness.v1",
    runId,
    generatedAt: overrides.generatedAt || "2026-05-21T00:00:00.000Z",
    mode: overrides.mode || "full",
    repoRoot,
    git: { branch: "main", commit: "0123456789abcdef", dirtyFileCount: 2 },
    overallStatus: overrides.overallStatus || "pass",
    summary: overrides.summary || { pass: 3, fail: 0, timeout: 0, blockedP0: 0 },
    coverage: overrides.coverage || {
      required: ["architecture", "trace-observability", "backup-restore"],
      byRequirement: {
        architecture: ["architecture"],
        "trace-observability": ["trace-observability"],
        "backup-restore": ["backup-restore"]
      },
      missing: []
    },
    gates: overrides.gates || [
      {
        id: "architecture",
        title: "架构门禁",
        blockerLevel: "P0",
        owner: "platform-architecture",
        coverage: ["architecture"],
        status: "pass",
        evidencePath: `reports/production-readiness/${runId}/architecture.log`,
        commands: [{ command: "npm run server:verify:architecture-patterns", exitCode: 0, timedOut: false, elapsedMs: 12 }],
        nextStep: "修复架构治理。"
      },
      {
        id: "trace-observability",
        title: "内部 Trace 与日志脱敏",
        blockerLevel: "P0",
        owner: "observability",
        coverage: ["trace-observability"],
        status: "pass",
        evidencePath: `reports/production-readiness/${runId}/trace-observability.log`,
        commands: [{ command: "npm run server:verify:trace-context", exitCode: 0, timedOut: false, elapsedMs: 15 }],
        nextStep: "补齐 trace。"
      },
      {
        id: "backup-restore",
        title: "备份恢复和 Checkpoint",
        blockerLevel: "P0",
        owner: "ops-runtime",
        coverage: ["backup-restore"],
        status: "pass",
        evidencePath: `reports/production-readiness/${runId}/backup-restore.log`,
        commands: [{ command: "npm run server:verify:ops", exitCode: 0, timedOut: false, elapsedMs: 18 }],
        nextStep: "补齐恢复演练。"
      }
    ]
  };
  await fs.writeFile(path.join(reportDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

async function verifyReportReader() {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "agentstudio-production-health-"));
  const reportRoot = path.join(tempRoot, "reports", "production-readiness");
  try {
    const missing = await buildProductionHealthReport({
      repoRoot: tempRoot,
      reportRoot: path.join(tempRoot, "missing")
    });
    assert.equal(missing.reportType, PRODUCTION_HEALTH_REPORT_TYPE);
    assert.equal(missing.status, "missing");
    assert.equal(missing.latestReport, null);

    await writeSampleReport(reportRoot, "20260521T000000Z", {
      generatedAt: "2026-05-21T00:00:00.000Z",
      overallStatus: "blocked",
      summary: { pass: 0, fail: 1, timeout: 0, blockedP0: 1 },
      gates: [
        {
          id: "architecture",
          title: "架构门禁",
          blockerLevel: "P0",
          owner: "platform-architecture",
          coverage: ["architecture"],
          status: "fail",
          evidencePath: "reports/production-readiness/20260521T000000Z/architecture.log",
          commands: [{ command: "npm run server:verify:architecture-patterns", exitCode: 1, timedOut: false, elapsedMs: 9 }],
          nextStep: "修复架构治理。"
        }
      ]
    });
    await writeSampleReport(reportRoot, "20260522T000000Z", {
      generatedAt: "2026-05-22T00:00:00.000Z"
    });
    await writeSampleReport(reportRoot, "20260523T000000Z", {
      generatedAt: "2026-05-23T00:00:00.000Z",
      mode: "quick",
      overallStatus: "blocked",
      summary: { pass: 1, fail: 0, timeout: 0, blockedP0: 0 },
      coverage: {
        required: ["architecture", "trace-observability"],
        byRequirement: { architecture: ["architecture"], "trace-observability": [] },
        missing: ["trace-observability"]
      },
      gates: [
        {
          id: "architecture",
          title: "架构门禁",
          blockerLevel: "P0",
          owner: "platform-architecture",
          coverage: ["architecture"],
          status: "pass",
          evidencePath: "reports/production-readiness/20260523T000000Z/architecture.log",
          commands: [{ command: "npm run server:verify:architecture-patterns", exitCode: 0, timedOut: false, elapsedMs: 9 }],
          nextStep: "修复架构治理。"
        }
      ]
    });

    const health = await buildProductionHealthReport({ repoRoot: tempRoot, reportRoot });
    assert.equal(health.reportType, PRODUCTION_HEALTH_REPORT_TYPE);
    assert.equal(health.status, "pass");
    assert.equal(health.latestReport.runId, "20260522T000000Z");
    assert.equal(health.summary.pass, 3);
    assert.ok(health.sections.some((section) => section.id === "observability" && section.status === "pass"));
    assert.ok(health.gates.some((gate) => gate.id === "backup-restore" && gate.commandSummary.total === 1));
    assert.equal(health.history.length, 3);
    assert.equal(health.history[0].runId, "20260523T000000Z");
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
}

function verifyOperationRegistry() {
  const operation = SERVER_API_OPERATIONS.find((item) => item.id === "production.health");
  assert.ok(operation, "production.health operation must be registered");
  assert.equal(operation.http.method, "GET");
  assert.equal(operation.http.path, "/api/production/health");
  assert.equal(operation.target.controller, "system");
  assert.equal(operation.target.method, "handleProductionHealth");
  assert.ok(operation.requiredScopes.includes("console:read"));
  assert.equal(operation.readOnly, true);
}

async function verifyFrontendWiring() {
  const files = {
    router: await fs.readFile(path.join(repoRoot, "server-web/router/index.ts"), "utf8"),
    appTypes: await fs.readFile(path.join(repoRoot, "server-web/types/app.ts"), "utf8"),
    bridge: await fs.readFile(path.join(repoRoot, "server-web/lib/bridge.ts"), "utf8"),
    registry: await fs.readFile(path.join(repoRoot, "server/config/frontend-feature-registry.yaml"), "utf8"),
    nav: await fs.readFile(path.join(repoRoot, "server-web/ServerConsoleApp.vue"), "utf8"),
    view: await fs.readFile(path.join(repoRoot, "server-web/views/admin/ProductionHealthView.vue"), "utf8")
  };
  assert.match(files.router, /ProductionHealthView/);
  assert.match(files.router, /\/admin\/production-health/);
  assert.match(files.appTypes, /productionHealth/);
  assert.match(files.bridge, /getProductionHealth/);
  assert.match(files.bridge, /\/api\/production\/health/);
  assert.match(files.registry, /admin\.production-health/);
  assert.match(files.nav, /生产健康/);
  assert.match(files.view, /bridge\.getProductionHealth/);
  assert.match(files.view, /门禁明细/);
}

async function main() {
  await verifyReportReader();
  verifyOperationRegistry();
  await verifyFrontendWiring();
  const current = await buildProductionHealthReport({ repoRoot });
  assert.equal(current.reportType, PRODUCTION_HEALTH_REPORT_TYPE);
  console.log("[production-health-console] ok");
}

await main();
