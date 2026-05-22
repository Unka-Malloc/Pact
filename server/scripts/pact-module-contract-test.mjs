#!/usr/bin/env node
import {
  runModuleContractTest,
  validateCapabilityPackageScaffoldManifest
} from "../platform/common/module-manager/module-ecosystem/index.mjs";
import fs from "node:fs/promises";

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
    "  node server/scripts/pact-module-contract-test.mjs --module ./index.mjs --mount-name documentParser --sample ./sample.txt",
    "  node server/scripts/pact-module-contract-test.mjs --manifest ./capability-package.json",
    "",
    "Options:",
    "  --module PATH          Mount module entrypoint",
    "  --mount-name NAME      Mount name",
    "  --sample PATH          Optional sample file",
    "  --data-dir PATH        Optional contract-test data dir",
    "  --manifest PATH        Capability package manifest to validate"
  ].join("\n");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || (!args.module && !args.manifest)) {
    console.log(usage());
    process.exit(args.help ? 0 : 1);
  }

  const result = args.manifest
    ? validateCapabilityPackageScaffoldManifest({
        manifest: JSON.parse(await fs.readFile(String(args.manifest), "utf8"))
      })
    : await runModuleContractTest({
        modulePath: args.module,
        mountName: args["mount-name"] || args.mount,
        samplePath: args.sample,
        userDataPath: args["data-dir"]
      });
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) {
    process.exit(2);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
