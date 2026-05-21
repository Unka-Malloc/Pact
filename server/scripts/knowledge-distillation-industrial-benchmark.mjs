import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_INDUSTRIAL_DISTILLATION_MODEL,
  buildIndustrialDistillationBenchmark,
  evaluateIndustrialDistillationGap
} from "../platform/specialized/knowledge/invocation/knowledge-distillation-runtime/industrial-benchmark.mjs";

const repoRoot = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    projectRoot: "",
    emailRoot: "",
    output: "",
    modelAlias: DEFAULT_INDUSTRIAL_DISTILLATION_MODEL,
    baselineDocument: "",
    frameworkDocument: ""
  };
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    const next = argv[index + 1];
    if (item === "--project-dir" || item === "--project-root") {
      args.projectRoot = next || "";
      index += 1;
    } else if (item === "--email-dir" || item === "--email-root") {
      args.emailRoot = next || "";
      index += 1;
    } else if (item === "--output" || item === "-o") {
      args.output = next || "";
      index += 1;
    } else if (item === "--model-alias" || item === "--model") {
      args.modelAlias = next || DEFAULT_INDUSTRIAL_DISTILLATION_MODEL;
      index += 1;
    } else if (item === "--baseline-document") {
      args.baselineDocument = next || "";
      index += 1;
    } else if (item === "--framework-document") {
      args.frameworkDocument = next || "";
      index += 1;
    } else if (item === "--help" || item === "-h") {
      args.help = true;
    }
  }
  return args;
}

function helpText() {
  return `
Usage:
  node server/scripts/knowledge-distillation-industrial-benchmark.mjs \\
    --project-dir /path/to/project \\
    --email-dir /path/to/eml-folder \\
    --output /tmp/agentstudio-industrial-distillation.json

Options:
  --project-dir        Scan all Markdown files under this project directory.
  --email-dir          Scan all .eml files and build RFC 5322/RFC 5256-style threads.
  --model-alias        Framework model alias. Default: ${DEFAULT_INDUSTRIAL_DISTILLATION_MODEL}
  --baseline-document  Optional external skill baseline Markdown file.
  --framework-document Optional AgentStudio framework output Markdown file to score against baseline.
  --output, -o         Write benchmark JSON to this path. Defaults to stdout.
`.trim();
}

async function readOptionalText(filePath) {
  if (!filePath) {
    return "";
  }
  return fs.readFile(path.resolve(filePath), "utf8");
}

async function main() {
  const args = parseArgs();
  if (args.help) {
    console.log(helpText());
    return;
  }
  const benchmark = await buildIndustrialDistillationBenchmark({
    projectRoot: args.projectRoot ? path.resolve(args.projectRoot) : "",
    emailRoot: args.emailRoot ? path.resolve(args.emailRoot) : "",
    modelAlias: args.modelAlias
  });
  const baselineDocument = await readOptionalText(args.baselineDocument);
  const frameworkDocument = await readOptionalText(args.frameworkDocument);
  const evaluation = baselineDocument || frameworkDocument
    ? evaluateIndustrialDistillationGap({
        projectDigest: benchmark.projectDigest,
        emailDigest: benchmark.emailDigest,
        baselineDocument,
        frameworkDocument
      })
    : null;
  const output = {
    ...benchmark,
    generatedAt: new Date().toISOString(),
    repoRoot,
    evaluation
  };
  const json = `${JSON.stringify(output, null, 2)}\n`;
  if (args.output) {
    const outputPath = path.resolve(args.output);
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, json, "utf8");
    console.log(`industrial distillation benchmark written: ${outputPath}`);
  } else {
    process.stdout.write(json);
  }
}

await main();
