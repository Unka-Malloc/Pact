#!/usr/bin/env node
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";

import {
  KNOWLEDGE_LICENSE_POLICY,
  createKnowledgeLicenseManifest,
  createPackagingPlan,
  validateKnowledgeLicenseManifest,
  validateKnowledgeLicensePolicy
} from "./pack-offline-server.mjs";

function parseArgs(argv) {
  const args = {
    modules: "",
    "file-processor-components": "",
    "output-json": false,
    "check-allowlist": false,
    "temp-manifest": false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--")) {
      continue;
    }
    const keyValue = item.slice(2);
    const equalIndex = keyValue.indexOf("=");
    const key = equalIndex >= 0 ? keyValue.slice(0, equalIndex) : keyValue;
    const inlineValue = equalIndex >= 0 ? keyValue.slice(equalIndex + 1) : null;
    const next = argv[index + 1];
    const value = inlineValue !== null ? inlineValue : !next || next.startsWith("--") ? true : next;
    if (inlineValue === null && value !== true) {
      index += 1;
    }
    args[key] = value;
  }

  return args;
}

function usage() {
  return [
    "Usage:",
    "  node server/scripts/verify-knowledge-license-manifest.mjs",
    "  node server/scripts/verify-knowledge-license-manifest.mjs --manifest build/release/splitall-server-linux-x64/license-manifest.json",
    "  node server/scripts/verify-knowledge-license-manifest.mjs --write build/license-manifest.json",
    "  node server/scripts/verify-knowledge-license-manifest.mjs --temp-manifest",
    "  node server/scripts/verify-knowledge-license-manifest.mjs --check-allowlist",
    "",
    "Options:",
    "  --manifest PATH                 Validate an existing manifest.",
    "  --write PATH                    Generate and validate a manifest at PATH.",
    "  --temp-manifest                 Generate and validate a temporary manifest for inspection.",
    "  --check-allowlist               Validate only the pack script license allowlist.",
    "  --modules LIST                  Optional modules to model, e.g. FileProcessor,VectorStore.",
    "  --file-processor-components LIST Optional FileProcessor components.",
    "  --output-json                   Print machine-readable validation output.",
    "  --help                          Show this help."
  ].join("\n");
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

async function writeManifest(filePath, manifest) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

function printHumanReport(report) {
  const lines = [];
  lines.push(`knowledge license verification: ${report.ok ? "ok" : "failed"}`);
  lines.push(`mode: ${report.mode}`);
  if (report.manifestPath) {
    lines.push(`manifest: ${report.manifestPath}`);
  }
  if (report.scanSource) {
    lines.push(`dependency scan: ${report.scanSource}`);
  }
  if (report.productionDependencyCount !== undefined) {
    lines.push(`production dependencies: ${report.productionDependencyCount}`);
  }
  if (report.summary) {
    lines.push(
      `summary: allowed=${report.summary.allowed || 0}, blocked=${report.summary.blocked || 0}, unknown=${
        report.summary.unknown || 0
      }`
    );
  }
  for (const warning of report.warnings || []) {
    lines.push(`warning: ${warning}`);
  }
  for (const error of report.errors || []) {
    lines.push(`error: ${error}`);
  }
  process.stdout.write(`${lines.join("\n")}\n`);
}

async function generateManifest(args) {
  const packagingPlan = createPackagingPlan(args);
  return createKnowledgeLicenseManifest({ packagingPlan });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args.h) {
    process.stdout.write(`${usage()}\n`);
    return;
  }

  const policyReport = validateKnowledgeLicensePolicy(KNOWLEDGE_LICENSE_POLICY);
  if (args["check-allowlist"]) {
    const report = {
      ok: policyReport.ok,
      mode: "check-allowlist",
      errors: policyReport.errors,
      warnings: []
    };
    if (args["output-json"]) {
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    } else {
      printHumanReport(report);
    }
    if (!report.ok) {
      process.exitCode = 1;
    }
    return;
  }

  let manifestPath = args.manifest ? path.resolve(String(args.manifest)) : "";
  let manifest;
  let mode = "generated";

  if (manifestPath) {
    manifest = await readJson(manifestPath);
    mode = "existing-manifest";
  } else {
    manifest = await generateManifest(args);
    if (args.write) {
      manifestPath = path.resolve(String(args.write));
      await writeManifest(manifestPath, manifest);
      mode = "generated-written";
    } else if (args["temp-manifest"]) {
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "splitall-knowledge-license-"));
      manifestPath = path.join(tempDir, "license-manifest.json");
      await writeManifest(manifestPath, manifest);
      mode = "generated-temp";
    }
  }

  const validation = validateKnowledgeLicenseManifest(manifest);
  const report = {
    ok: policyReport.ok && validation.ok,
    mode,
    manifestPath,
    scanSource: manifest?.npm?.scanSource || "",
    productionDependencyCount: validation.productionDependencyCount,
    summary: manifest?.npm?.summary || null,
    warnings: [...(policyReport.warnings || []), ...validation.warnings],
    errors: [...policyReport.errors, ...validation.errors]
  };

  if (args["output-json"]) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    printHumanReport(report);
  }

  if (!report.ok) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack || error.message : String(error)}\n`);
  process.exitCode = 1;
});
