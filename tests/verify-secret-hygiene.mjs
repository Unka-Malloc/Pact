#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();

const scanRoots = [
  "server",
  "server-web",
  "client-cli",
  "client-gui",
  "docs",
  "tests"
];

const excludedPathPrefixes = [
  "build/",
  "node_modules/",
  "client-cli/target/",
  "client-gui/.dart_tool/",
  "client-gui/build/",
  "client-gui/linux/flutter/ephemeral/",
  "client-gui/macos/Flutter/ephemeral/",
  "client-gui/macos/Pods/",
  "client-gui/windows/flutter/ephemeral/",
  "tests/fixtures/"
];

const scannedExtensions = new Set([
  ".js",
  ".mjs",
  ".cjs",
  ".ts",
  ".tsx",
  ".vue",
  ".dart",
  ".rs",
  ".md",
  ".json",
  ".yaml",
  ".yml",
  ".toml",
  ".sh"
]);

const secretPatterns = [
  {
    id: "private-key",
    pattern: /-----BEGIN (?:RSA |DSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/u
  },
  {
    id: "aws-access-key-id",
    pattern: /\bAKIA[0-9A-Z]{16}\b/u
  },
  {
    id: "github-token",
    pattern: /\bgh[pousr]_[A-Za-z0-9_]{36,}\b/u
  },
  {
    id: "openai-api-key",
    pattern: /\bsk-[A-Za-z0-9]{20,}\b/u
  },
  {
    id: "slack-token",
    pattern: /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/u
  },
  {
    id: "google-api-key",
    pattern: /\bAIza[0-9A-Za-z_-]{35}\b/u
  }
];

function toPosix(value) {
  return value.split(path.sep).join("/");
}

function shouldSkip(relativePath) {
  const normalized = toPosix(relativePath);
  return excludedPathPrefixes.some((prefix) => normalized.startsWith(prefix));
}

function shouldScanFile(relativePath) {
  return scannedExtensions.has(path.extname(relativePath));
}

async function collectFiles(directory, relativePath = "") {
  if (shouldSkip(relativePath)) {
    return [];
  }

  let entries;
  try {
    entries = await fs.readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") {
      return [];
    }
    throw error;
  }

  const files = [];
  for (const entry of entries) {
    const childRelativePath = relativePath
      ? path.join(relativePath, entry.name)
      : entry.name;
    if (shouldSkip(childRelativePath)) {
      continue;
    }
    const childPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectFiles(childPath, childRelativePath));
      continue;
    }
    if (entry.isFile() && shouldScanFile(childRelativePath)) {
      files.push(childRelativePath);
    }
  }
  return files;
}

function lineNumberForOffset(text, offset) {
  let line = 1;
  for (let index = 0; index < offset; index += 1) {
    if (text.charCodeAt(index) === 10) {
      line += 1;
    }
  }
  return line;
}

const violations = [];

for (const scanRoot of scanRoots) {
  const files = await collectFiles(path.join(root, scanRoot), scanRoot);
  for (const relativePath of files) {
    const absolutePath = path.join(root, relativePath);
    const text = await fs.readFile(absolutePath, "utf8").catch(() => "");
    for (const { id, pattern } of secretPatterns) {
      const match = pattern.exec(text);
      if (match) {
        violations.push({
          id,
          path: toPosix(relativePath),
          line: lineNumberForOffset(text, match.index)
        });
      }
    }
  }
}

if (violations.length > 0) {
  const lines = ["Secret hygiene failed:"];
  for (const violation of violations) {
    lines.push(`- ${violation.id}: ${violation.path}:${violation.line}`);
  }
  lines.push("");
  lines.push("Move real credentials to local environment files or secret managers. Keep only placeholders in source.");
  process.stderr.write(`${lines.join("\n")}\n`);
  process.exit(1);
}

process.stdout.write("Secret hygiene passed.\n");
