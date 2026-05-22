#!/usr/bin/env node
/**
 * migrate-embeddings.mjs
 *
 * Re-embeds all content in the knowledge-core database using the currently
 * configured embedding model.  Run this whenever you change the embedding
 * model (e.g. switching from local BM25-only to an external model) so that
 * all stored vectors stay in sync with the active model.
 *
 * Usage:
 *   node server/scripts/migrate-embeddings.mjs [options]
 *
 * Options:
 *   --data-dir <path>   Path to server data directory  (default: ./.pact-server-data)
 *   --batch-size <n>    Documents to process per batch (default: 50)
 *   --dry-run           Print what would happen without touching the database
 *   --help              Show this help text
 */

import path from "node:path";
import process from "node:process";
import { createKnowledgeCoreMount } from "../platform/specialized/knowledge/storage/knowledge-core/index.mjs";

// ── CLI argument parsing ───────────────────────────────────────────────────

function parseArgs(argv) {
  const args = { dataDir: null, batchSize: 50, dryRun: false, help: false };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      args.help = true;
    } else if (arg === "--dry-run") {
      args.dryRun = true;
    } else if (arg === "--data-dir" && argv[i + 1]) {
      args.dataDir = argv[++i];
    } else if (arg === "--batch-size" && argv[i + 1]) {
      args.batchSize = parseInt(argv[++i], 10) || 50;
    }
  }
  return args;
}

function printHelp() {
  console.log(`
migrate-embeddings — re-index all knowledge-core embeddings with the active model

Usage:
  node server/scripts/migrate-embeddings.mjs [options]

Options:
  --data-dir <path>   Server data directory (default: ./.pact-server-data)
  --batch-size <n>    Rows per reindex batch (default: 50)
  --dry-run           Show what would be done without modifying the database
  --help              Show this help text

Notes:
  • The server must NOT be running while this script executes.
  • After migration, restart the server to pick up the new vectors.
  • The script uses the embedding model configured in knowledge-core settings.
`);
}

// ── Main ──────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs(process.argv);

  if (args.help) {
    printHelp();
    process.exit(0);
  }

  const projectRoot = path.resolve(new URL("../..", import.meta.url).pathname);
  const userDataPath = args.dataDir
    ? path.resolve(args.dataDir)
    : path.join(projectRoot, ".pact-server-data");

  console.log("migrate-embeddings");
  console.log("  data dir  :", userDataPath);
  console.log("  batch size:", args.batchSize);
  console.log("  dry run   :", args.dryRun);
  console.log("");

  if (args.dryRun) {
    console.log("[dry-run] Would open knowledge-core at:", userDataPath);
    console.log("[dry-run] Would call reindex({ batchSize:", args.batchSize, "})");
    console.log("[dry-run] No changes made.");
    process.exit(0);
  }

  console.log("Opening knowledge-core database…");
  let mount;
  try {
    mount = await createKnowledgeCoreMount({ userDataPath });
  } catch (err) {
    console.error("Failed to open knowledge-core:", err?.message || err);
    process.exit(1);
  }

  console.log("Starting reindex (this may take several minutes for large corpora)…");
  const startedAt = Date.now();
  try {
    const result = mount.reindex({ batchSize: args.batchSize });
    const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(1);
    console.log("Reindex complete in", elapsedSec + "s");
    if (result && typeof result === "object") {
      const { blocksIndexed = 0, assetsIndexed = 0 } = result;
      console.log("  blocks indexed:", blocksIndexed);
      console.log("  assets indexed:", assetsIndexed);
    }
  } catch (err) {
    console.error("Reindex failed:", err?.message || err);
    if (err?.stack) {
      console.error(err.stack);
    }
    process.exit(1);
  } finally {
    try {
      await mount.close();
    } catch {
      // Ignore close errors.
    }
  }

  console.log("Done. Restart the server to use the updated embeddings.");
}

main();
