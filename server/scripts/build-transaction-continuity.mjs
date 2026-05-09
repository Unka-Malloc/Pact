#!/usr/bin/env node
import path from "node:path";
import {
  buildTransactionContinuityModel,
  transactionContinuityDefaults
} from "../platform/specialized/knowledge/domain/rules/transaction-continuity-model.mjs";

function parseArgs(argv) {
  const args = {
    root: []
  };
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--")) {
      args.root.push(item);
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
    if (key === "root" || key === "path") {
      args.root.push(String(value));
      continue;
    }
    if (key === "normalized-manifest") {
      if (!Array.isArray(args[key])) {
        args[key] = [];
      }
      args[key].push(String(value));
      continue;
    }
    args[key] = value;
  }
  return args;
}

function usage() {
  return [
    "Usage:",
    "  node server/scripts/build-transaction-continuity.mjs --root ./mail-dir --output build/artifacts/transaction-continuity",
    "",
    "Options:",
    "  --root PATH       EML folder root; repeatable. Positional paths are also accepted.",
    "  --output PATH     Defaults to build/artifacts/transaction-continuity.",
    "  --limit N         Optional maximum file count for a bounded run.",
    "  --max-docs N      Number of per-transaction DOCX files to generate; overview is always generated.",
    "  --normalized-manifest PATH  Optional normalized-documents manifest; repeatable for attachment feature backfill.",
    "  --review-every N  Run lineage review after N changed files; defaults to 500.",
    "  --force-review    Force local reclustering/review.",
    "  --no-review-daily Disable once-per-day review.",
    "  --rebuild         Rebuild the auxiliary index from scratch."
  ].join("\n");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args.h) {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  const roots = args.root.length > 0 ? args.root : [process.cwd()];
  const result = await buildTransactionContinuityModel({
    roots: roots.map((item) => path.resolve(item)),
    outputPath: path.resolve(String(args.output || transactionContinuityDefaults.outputPath)),
    limit: Math.max(0, Number(args.limit || 0)),
    rebuild: Boolean(args.rebuild),
    maxDocs: Math.max(0, Number(args["max-docs"] || transactionContinuityDefaults.maxDocs)),
    normalizedManifestPaths: (Array.isArray(args["normalized-manifest"]) ? args["normalized-manifest"] : [])
      .map((item) => path.resolve(item)),
    reviewEvery: Math.max(0, Number(args["review-every"] || transactionContinuityDefaults.reviewEvery)),
    reviewDaily: !args["no-review-daily"],
    forceReview: Boolean(args["force-review"])
  });
  process.stdout.write(
    `${JSON.stringify(
      {
        outputPath: result.outputPath,
        dbPath: result.dbPath,
        stats: result.manifest.stats,
        generatedDocCount: result.generatedDocCount
      },
      null,
      2
    )}\n`
  );
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack || error.message : String(error)}\n`);
  process.exitCode = 1;
});
