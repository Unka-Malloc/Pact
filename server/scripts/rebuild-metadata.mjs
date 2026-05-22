import path from "node:path";
import process from "node:process";
import { rebuildMetadataStore } from "../platform/common/storage/rebuild-metadata.mjs";

function parseArgs(argv) {
  const args = {
    userDataPath: path.resolve(process.cwd(), ".pact-server-data")
  };

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    const next = argv[index + 1];

    if (current === "--data-dir" && next) {
      args.userDataPath = path.resolve(process.cwd(), next);
      index += 1;
    }
  }

  return args;
}

const args = parseArgs(process.argv.slice(2));
const summary = await rebuildMetadataStore({
  userDataPath: args.userDataPath
});

console.log("Metadata rebuild completed.");
console.log(JSON.stringify(summary, null, 2));
