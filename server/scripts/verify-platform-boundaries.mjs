#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));
const commonRoot = path.join(repoRoot, "server/platform/common");
const specializedRoot = path.join(repoRoot, "server/platform/specialized");
const boundaryCheckDate = process.env.PACT_BOUNDARY_CHECK_DATE || new Date().toISOString().slice(0, 10);
const commonToSpecializedMigrationExceptions = [];

function normalizePath(value) {
  return value.split(path.sep).join("/");
}

function keyOf(entry) {
  return `${entry.file}|${entry.specifier}`;
}

async function walk(directory) {
  const files = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(absolutePath)));
    } else if (entry.isFile() && entry.name.endsWith(".mjs")) {
      files.push(absolutePath);
    }
  }
  return files;
}

function lineOf(text, index) {
  return text.slice(0, index).split("\n").length;
}

function importSpecifiers(text) {
  const specifiers = [];
  const staticImportPattern = /^\s*(?:import|export)\s+(?:[\s\S]*?\s+from\s+)?["']([^"']+)["']/gm;
  const dynamicImportPattern = /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g;

  for (const match of text.matchAll(staticImportPattern)) {
    specifiers.push({
      specifier: match[1],
      line: lineOf(text, match.index || 0)
    });
  }

  for (const match of text.matchAll(dynamicImportPattern)) {
    specifiers.push({
      specifier: match[1],
      line: lineOf(text, match.index || 0)
    });
  }

  return specifiers;
}

function resolvesToSpecialized(file, specifier) {
  if (!specifier.startsWith(".")) {
    return false;
  }

  const targetPath = path.resolve(path.dirname(path.join(repoRoot, file)), specifier);
  return targetPath === specializedRoot || targetPath.startsWith(`${specializedRoot}${path.sep}`);
}

async function findCommonToSpecializedImports() {
  const files = await walk(commonRoot);
  const violations = [];

  for (const absolutePath of files) {
    const file = normalizePath(path.relative(repoRoot, absolutePath));
    const text = await fs.readFile(absolutePath, "utf8");
    for (const { specifier, line } of importSpecifiers(text)) {
      if (resolvesToSpecialized(file, specifier)) {
        violations.push({ file, specifier, line });
      }
    }
  }

  return violations.sort((left, right) => keyOf(left).localeCompare(keyOf(right)));
}

function assertMigrationExceptionShape() {
  const seen = new Set();

  for (const entry of commonToSpecializedMigrationExceptions) {
    for (const field of ["file", "specifier", "owner", "reason", "exitCondition", "expiresAt"]) {
      assert.equal(
        typeof entry[field],
        "string",
        `platform boundary migration exception must include ${field}: ${JSON.stringify(entry)}`
      );
      assert.notEqual(entry[field].trim(), "", `platform boundary migration exception has empty ${field}`);
    }

    assert.match(
      entry.expiresAt,
      /^\d{4}-\d{2}-\d{2}$/,
      `platform boundary migration exception expiry must be YYYY-MM-DD: ${keyOf(entry)}`
    );
    assert.ok(
      entry.expiresAt >= boundaryCheckDate,
      `platform boundary migration exception expired on ${entry.expiresAt}: ${keyOf(entry)}`
    );

    const key = keyOf(entry);
    assert.equal(seen.has(key), false, `duplicate platform boundary migration exception: ${key}`);
    seen.add(key);
  }
}

function assertViolationsAreTracked(violations) {
  const exceptionKeys = new Set(commonToSpecializedMigrationExceptions.map(keyOf));
  const violationKeys = new Set(violations.map(keyOf));
  const untracked = violations.filter((violation) => !exceptionKeys.has(keyOf(violation)));
  const stale = commonToSpecializedMigrationExceptions.filter((entry) => !violationKeys.has(keyOf(entry)));

  assert.deepEqual(
    untracked,
    [],
    "common platform must not directly import specialized platform without a migration exception"
  );
  assert.deepEqual(
    stale,
    [],
    "remove stale common-to-specialized migration exceptions after the boundary is fixed"
  );
}

const violations = await findCommonToSpecializedImports();
assertMigrationExceptionShape();
assertViolationsAreTracked(violations);

console.log(`[platform-boundaries] ok (${violations.length} tracked common-to-specialized migration imports)`);
