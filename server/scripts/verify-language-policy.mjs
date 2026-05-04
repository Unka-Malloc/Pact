import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));
const serverRoot = path.join(projectRoot, "server");
const allowedExtensions = new Set([".mjs", ".json", ".md"]);
const ignoredDirectories = new Set(["node_modules", ".git"]);

async function walk(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (ignoredDirectories.has(entry.name)) {
      continue;
    }
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(absolutePath)));
      continue;
    }
    if (entry.isFile()) {
      files.push(absolutePath);
    }
  }
  return files;
}

const files = await walk(serverRoot);
const violations = files.filter((filePath) => !allowedExtensions.has(path.extname(filePath)));

if (violations.length > 0) {
  console.error("Server language policy violation: server/ must contain JavaScript implementation files only.");
  console.error("Allowed server file extensions: .mjs, .json, .md");
  for (const filePath of violations) {
    console.error(`- ${path.relative(projectRoot, filePath)}`);
  }
  process.exit(1);
}

console.log("Server language policy verification passed.");
