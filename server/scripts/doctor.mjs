import path from "node:path";
import process from "node:process";
import { runStorageDoctor } from "../platform/common/storage/ops-tools.mjs";
import { ServerConfig } from "../platform/common/config/ServerConfig.mjs";

function parseArgs(argv) {
  const args = {
    userDataPath: path.resolve(ServerConfig.getDataDir())
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
const report = await runStorageDoctor({
  userDataPath: args.userDataPath
});

console.log(JSON.stringify(report, null, 2));
