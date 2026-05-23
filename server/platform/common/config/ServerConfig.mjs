import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";

class ServerConfigManager {
  constructor() {
    this.configPath =
      process.env.PACT_CONFIG_FILE || path.join(os.homedir(), ".pact-server.json");
    this.config = this.loadConfig();
  }

  loadConfig() {
    try {
      if (fs.existsSync(this.configPath)) {
        const raw = fs.readFileSync(this.configPath, "utf8");
        return JSON.parse(raw);
      }
    } catch (err) {
      console.warn(`Failed to read config from ${this.configPath}:`, err);
    }
    return {};
  }

  getDataDir() {
    return process.env.PACT_SERVER_DATA_DIR || this.config.dataDir || path.join(os.homedir(), ".pact-server-data");
  }
}

export const ServerConfig = new ServerConfigManager();
