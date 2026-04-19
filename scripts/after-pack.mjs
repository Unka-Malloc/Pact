import fs from "node:fs/promises";
import path from "node:path";

const ARCH_NAME_MAP = {
  1: "x64",
  3: "arm64"
};

async function addUserWriteBitRecursive(rootPath) {
  let entries;

  try {
    entries = await fs.readdir(rootPath, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const entryPath = path.join(rootPath, entry.name);
    const stats = await fs.lstat(entryPath);
    await fs.chmod(entryPath, stats.mode | 0o200);

    if (entry.isDirectory()) {
      await addUserWriteBitRecursive(entryPath);
    }
  }
}

async function removeIfExists(targetPath) {
  try {
    await fs.rm(targetPath, { recursive: true, force: true });
  } catch {
    // Ignore cleanup failures here; packaging can still proceed.
  }
}

export default async function afterPack(context) {
  if (context.electronPlatformName === "darwin") {
    const appName = `${context.packager.appInfo.productFilename}.app`;
    const resourcesRoot = path.join(
      context.appOutDir,
      appName,
      "Contents",
      "Resources"
    );

    await addUserWriteBitRecursive(path.join(resourcesRoot, "vendor", "jre"));
    await addUserWriteBitRecursive(path.join(resourcesRoot, "vendor", "ocr-runtime"));
    return;
  }

  if (context.electronPlatformName !== "linux") {
    return;
  }

  const targetArch = ARCH_NAME_MAP[context.arch];

  if (!targetArch) {
    return;
  }

  const resourcesRoot = path.join(context.appOutDir, "resources", "vendor");
  const linuxRuntimeDirs = ["linux-x64", "linux-arm64"];
  await Promise.all(
    linuxRuntimeDirs
      .filter((runtimeDir) => runtimeDir !== `linux-${targetArch}`)
      .flatMap((runtimeDir) => [
        removeIfExists(path.join(resourcesRoot, "jre", runtimeDir)),
        removeIfExists(path.join(resourcesRoot, "ocr-runtime", runtimeDir))
      ])
  );
}
