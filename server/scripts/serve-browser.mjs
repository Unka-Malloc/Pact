import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { startLocalHttpServer } from "../http-server.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "../..");
const distPath = path.join(projectRoot, "build", "dist");
const userDataPath = path.join(projectRoot, "build", "local-data");

const serverHandle = await startLocalHttpServer({
  userDataPath,
  distPath
});

console.log(`SplitAll local service is running at ${serverHandle.url}`);
console.log(`Settings are stored in ${userDataPath}`);

async function shutdown(code = 0) {
  try {
    await serverHandle.close();
  } catch {
    // Ignore shutdown errors.
  }

  process.exit(code);
}

process.on("SIGINT", () => {
  void shutdown(0);
});

process.on("SIGTERM", () => {
  void shutdown(0);
});
