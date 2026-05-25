import path from "node:path";
import process from "node:process";
import { rebuildMetadataStore } from "../platform/common/storage/rebuild-metadata.mjs";
import { ServerConfig } from "../platform/common/config/ServerConfig.mjs";
import { createKnowledgeMetadataStoreDomainServices } from "../platform/specialized/knowledge/storage/metadata-store-domain-services.mjs";

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
const domainServices = createKnowledgeMetadataStoreDomainServices();
const summary = await rebuildMetadataStore({
  userDataPath: args.userDataPath,
  domainServices,
  loadRules: domainServices.loadRules
});

console.log("Metadata rebuild completed.");
console.log(JSON.stringify(summary, null, 2));
