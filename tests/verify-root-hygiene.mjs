#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();

const forbiddenNames = new Set([
  ".DS_Store",
  "artifacts",
  "dist",
  "electron",
  "new",
  "output",
  "page-clients-full.png",
  "portable-client",
  "protocols",
  "public",
  "release",
  "src",
  "testing",
  "tmp",
  ".playwright-cli",
  ".pact-local-data",
  ".pact-server-data",
  ".pact-skill-data",
  ".agentstudio-server-data"
]);

const forbiddenPatterns = [
  /^page-v\d+\.png$/,
  /^page-.+\.png$/,
  /^pact-server-.+\.tar\.gz$/,
  /^pact-server-.+\.tar\.gz\.sha256$/,
  /^.*\.result\.json$/,
  /^.*\.docx$/,
  /^.*\.pdf$/,
  /^.*\.eml$/,
  /^.*\.mbox$/
];

const allowedRootNames = new Set([
  ".dockerignore",
  ".env.example",
  ".gemini",
  ".git",
  ".gitattributes",
  ".gitignore",
  ".github",
  ".kilo",
  ".pact-agent-history",
  ".vscode",
  "AGENT.md",
  "CHANGELOG.md",
  "CONTRIBUTING.md",
  "Dockerfile",
  "LICENSE",
  "README.md",
  "README.zh-CN.md",
  "SECURITY.md",
  "build",
  "client-cli",
  "client-gui",
  "docker-compose.yml",
  "docs",
  "mcp-connector",
  "modules",
  "node_modules",
  "reports",
  "scripts",
  "package-lock.json",
  "package.json",
  "server",
  "server-web",
  "pact-v1",
  "tests",
  "tsconfig.json",
  "vite.config.ts"
]);

const sourceRootsToScan = [
  "docs",
  "server",
  "server-web",
  "client-cli",
  "client-gui",
  "tests"
];

const nestedScanExcludedPaths = new Set([
  "client-cli/target",
  "client-gui/.dart_tool",
  "client-gui/build",
  "client-gui/linux/flutter/ephemeral",
  "client-gui/macos/Flutter/ephemeral",
  "client-gui/macos/Pods",
  "client-gui/windows/flutter/ephemeral",
  "tests/fixtures"
]);

const nestedGeneratedNames = new Set([".DS_Store", "__pycache__"]);
const nestedGeneratedPatterns = [/\.pyc$/u, /\.pyo$/u, /\.pyd$/u, /\.eml$/u, /\.mbox$/u];
const forbiddenNestedPaths = new Set([
  "server/communication",
  "client-cli/communication",
  "tests/email-corpus"
]);

function toPosix(relativePath) {
  return relativePath.split(path.sep).join("/");
}

function shouldSkipNestedScan(relativePath) {
  const normalized = toPosix(relativePath);
  for (const excludedPath of nestedScanExcludedPaths) {
    if (normalized === excludedPath || normalized.startsWith(`${excludedPath}/`)) {
      return true;
    }
  }
  return false;
}

async function scanNestedGeneratedArtifacts(directory, relativePath, generatedArtifacts) {
  let entriesForDirectory;
  try {
    entriesForDirectory = await fs.readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") {
      return;
    }
    throw error;
  }

  for (const entry of entriesForDirectory) {
    const childRelativePath = relativePath ? path.join(relativePath, entry.name) : entry.name;
    const normalizedChildPath = toPosix(childRelativePath);

    if (shouldSkipNestedScan(normalizedChildPath)) {
      continue;
    }

    if (forbiddenNestedPaths.has(normalizedChildPath)) {
      generatedArtifacts.add(normalizedChildPath);
      continue;
    }

    if (nestedGeneratedNames.has(entry.name)) {
      generatedArtifacts.add(normalizedChildPath);
      continue;
    }

    if (entry.isDirectory()) {
      await scanNestedGeneratedArtifacts(
        path.join(directory, entry.name),
        childRelativePath,
        generatedArtifacts
      );
      continue;
    }

    if (nestedGeneratedPatterns.some((pattern) => pattern.test(entry.name))) {
      generatedArtifacts.add(normalizedChildPath);
    }
  }
}

const entries = await fs.readdir(root, { withFileTypes: true });
const violations = [];
const unknown = [];
const generatedArtifacts = new Set();

for (const entry of entries) {
  const name = entry.name;
  if (forbiddenNames.has(name) || forbiddenPatterns.some((pattern) => pattern.test(name))) {
    violations.push(name);
    continue;
  }
  if (!allowedRootNames.has(name)) {
    unknown.push(name);
  }
}

for (const sourceRoot of sourceRootsToScan) {
  await scanNestedGeneratedArtifacts(path.join(root, sourceRoot), sourceRoot, generatedArtifacts);
}

if (violations.length > 0 || unknown.length > 0 || generatedArtifacts.size > 0) {
  const lines = [];
  if (violations.length > 0) {
    lines.push("Forbidden root entries:");
    for (const name of violations.sort()) {
      lines.push(`- ${name}`);
    }
  }
  if (unknown.length > 0) {
    lines.push("Unclassified root entries:");
    for (const name of unknown.sort()) {
      lines.push(`- ${name}`);
    }
  }
  if (generatedArtifacts.size > 0) {
    lines.push("Forbidden generated source-tree entries:");
    for (const name of [...generatedArtifacts].sort()) {
      lines.push(`- ${name}`);
    }
  }
  lines.push("");
  lines.push("Move generated output under build/, project docs under docs/, and repository-level fixtures under tests/.");
  lines.push("Keep protocol documents under the owning layer, for example server/protocols, client-cli/protocols, or server-web/protocols.");
  lines.push("Do not recreate server/communication or client-cli/communication; protocol execution adapters belong under the matching protocols tree.");
  lines.push("Remove OS and interpreter cache files from source, docs, and protocol directories.");
  process.stderr.write(`${lines.join("\n")}\n`);
  process.exit(1);
}

process.stdout.write("Root path hygiene passed.\n");
