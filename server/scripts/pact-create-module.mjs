#!/usr/bin/env node
import {
  listModuleTemplates,
  planModuleScaffold,
  scaffoldModule
} from "../platform/common/module-manager/module-ecosystem/index.mjs";

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
    "  node server/scripts/pact-create-module.mjs --template documentParser --module-id acme.parser --target ./modules/acme-parser",
    "",
    "Options:",
    "  --list                 List available templates",
    "  --plan                 Print the scaffold plan without writing files",
    "  --template ID          documentParser|analysis|knowledgeBase|vectorStore|graphStore|customMount|toolPackage|skillPackage",
    "  --module-id ID         Stable module/package identifier",
    "  --target PATH          Output directory",
    "  --mount-name NAME      Override mount name for mount templates",
    "  --title TEXT           Human title",
    "  --owner TEXT           Owner/team",
    "  --version VERSION      Defaults to 0.0.1",
    "  --license ID           Defaults to UNLICENSED",
    "  --force                Overwrite existing scaffold files",
    "  --json                 Emit JSON only"
  ].join("\n");
}

function requestFromArgs(args = {}) {
  return {
    templateId: args.template || args.kind,
    moduleId: args["module-id"] || args.moduleId || args.name,
    targetDir: args.target || args.dir || args.output,
    mountName: args["mount-name"] || args.mount,
    title: args.title,
    owner: args.owner,
    version: args.version,
    license: args.license,
    packageName: args["package-name"],
    force: args.force === true,
    includeCi: args["no-ci"] ? false : true
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }
  if (args.list) {
    console.log(JSON.stringify(listModuleTemplates(), null, 2));
    return;
  }
  if (!args.template && !args.kind) {
    console.log(usage());
    process.exitCode = 1;
    return;
  }
  const request = requestFromArgs(args);
  const result = args.plan
    ? await planModuleScaffold(request)
    : await scaffoldModule(request);
  if (args.json || args.plan) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(`Module scaffold written: ${result.targetDir}`);
  for (const file of result.written || result.files || []) {
    console.log(`- ${file.action}: ${file.path}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  if (Array.isArray(error?.details) && error.details.length > 0) {
    console.error(JSON.stringify(error.details, null, 2));
  }
  process.exit(1);
});
