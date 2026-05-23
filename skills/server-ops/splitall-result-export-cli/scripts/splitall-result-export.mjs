#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--")) {
      continue;
    }
    const key = item.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
    } else {
      args[key] = next;
      index += 1;
    }
  }
  return args;
}

function usage() {
  return [
    "Usage:",
    "  splitall-result-export.mjs --repo /path/to/splitall --result-json result.json --format json|md|docx [--mode summary|knowledge-package] --output out",
    "  splitall-result-export.mjs --server-url http://127.0.0.1:8787 --job-id JOB --format json|md|docx [--mode summary|knowledge-package] --output out"
  ].join("\n");
}

function normalizeBaseUrl(value) {
  return String(value || "").replace(/\/+$/, "");
}

async function fetchJson(url) {
  const response = await fetch(url, { headers: { accept: "application/json" } });
  if (!response.ok) {
    throw new Error(`GET ${url} failed: ${response.status} ${await response.text()}`);
  }
  return response.json();
}

async function exportViaServer({ serverUrl, jobId, format, mode }) {
  const baseUrl = normalizeBaseUrl(serverUrl);
  const result = await fetchJson(`${baseUrl}/api/jobs/${encodeURIComponent(jobId)}/result`);
  const response = await fetch(`${baseUrl}/api/export`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "*/*"
    },
    body: JSON.stringify({
      result,
      format,
      ...(mode ? { mode } : {})
    })
  });
  if (!response.ok) {
    throw new Error(`POST /api/export failed: ${response.status} ${await response.text()}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

async function exportLocally({ repo, resultJsonPath, format, mode }) {
  const raw = await fs.readFile(resultJsonPath, "utf8");
  const result = JSON.parse(raw);
  const exporterPath = path.join(repo, "new/server/exporters.mjs");
  const { buildResultArtifact } = await import(pathToFileURL(exporterPath).href);
  const artifact = await buildResultArtifact(result, format, { mode });
  return artifact.buffer;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }

  const format = String(args.format || "docx").toLowerCase();
  if (!["json", "md", "docx"].includes(format)) {
    throw new Error(`Unsupported format: ${format}`);
  }
  const mode = String(args.mode || "summary").toLowerCase();
  if (!["summary", "knowledge", "knowledge-package"].includes(mode)) {
    throw new Error(`Unsupported mode: ${mode}`);
  }
  if (!args.output) {
    throw new Error("--output is required");
  }

  let buffer;
  if (args["server-url"] && args["job-id"]) {
    buffer = await exportViaServer({
      serverUrl: String(args["server-url"]),
      jobId: String(args["job-id"]),
      format,
      mode
    });
  } else if (args["result-json"]) {
    const repo = path.resolve(String(args.repo || process.cwd()));
    buffer = await exportLocally({
      repo,
      resultJsonPath: path.resolve(String(args["result-json"])),
      format,
      mode
    });
  } else {
    console.log(usage());
    process.exit(1);
  }

  const outputPath = path.resolve(String(args.output));
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, buffer);
  console.log(outputPath);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
