import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";
import { saveSettings } from "../platform/common/platform-core/settings.mjs";
import { TIKA_VERSION } from "../platform/modules/knowledge/file-processor/FileNormalizer/Tika/tika.mjs";

const projectRoot = path.resolve(new URL("../..", import.meta.url).pathname);
const moduleResourceRoot = path.join(projectRoot, "server", "modules");
const jreRoot = path.join(moduleResourceRoot, "jre");
const tikaRoot = path.join(moduleResourceRoot, "tika");
const platformKey = `${process.platform}-${process.arch}`;
const userDataPath = path.join(projectRoot, "build", "server-data");

const JRE_DOWNLOADS = {
  "darwin-arm64": {
    fileName: "OpenJDK21U-jre_aarch64_mac_hotspot_21.0.10_7.tar.gz",
    url: "https://github.com/adoptium/temurin21-binaries/releases/download/jdk-21.0.10%2B7/OpenJDK21U-jre_aarch64_mac_hotspot_21.0.10_7.tar.gz"
  }
};

const TIKA_DOWNLOAD = {
  fileName: `tika-app-${TIKA_VERSION}.jar`,
  url: `https://repo.maven.apache.org/maven2/org/apache/tika/tika-app/${TIKA_VERSION}/tika-app-${TIKA_VERSION}.jar`
};

async function ensureDirectory(targetPath) {
  await fs.mkdir(targetPath, { recursive: true });
}

async function fileExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function downloadFile(url, targetPath) {
  await ensureDirectory(path.dirname(targetPath));
  const tempPath = `${targetPath}.download`;

  await new Promise((resolve, reject) => {
    const curl = spawn(
      "curl",
      ["-L", "--fail", "--retry", "3", "--connect-timeout", "20", "-o", tempPath, url],
      {
        stdio: "inherit"
      }
    );

    curl.once("error", reject);
    curl.once("exit", (code) => {
      if (code !== 0) {
        reject(new Error(`下载失败：${url}，退出码 ${code}`));
        return;
      }

      resolve();
    });
  });

  await fs.rename(tempPath, targetPath);
}

async function listDirectoryEntries(targetPath) {
  const entries = await fs.readdir(targetPath, { withFileTypes: true });
  return entries.filter((entry) => !entry.name.startsWith("."));
}

async function flattenSingleTopLevelDirectory(targetPath) {
  const entries = await listDirectoryEntries(targetPath);
  if (entries.length !== 1 || !entries[0].isDirectory()) {
    return;
  }

  const nestedRoot = path.join(targetPath, entries[0].name);
  const nestedEntries = await fs.readdir(nestedRoot, { withFileTypes: true });
  for (const entry of nestedEntries) {
    await fs.rename(path.join(nestedRoot, entry.name), path.join(targetPath, entry.name));
  }
  await fs.rm(nestedRoot, { recursive: true, force: true });
}

async function extractTarGz(archivePath, targetPath) {
  await fs.rm(targetPath, { recursive: true, force: true });
  await ensureDirectory(targetPath);

  const tar = process.platform === "win32" ? "tar.exe" : "tar";
  await new Promise((resolve, reject) => {
    const child = spawn(tar, ["-xzf", archivePath, "-C", targetPath], {
      stdio: "inherit"
    });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code !== 0) {
        reject(new Error(`tar 解压失败，退出码 ${code}`));
        return;
      }
      resolve();
    });
  });

  await flattenSingleTopLevelDirectory(targetPath);
}

function getExpectedJavaPath(runtimeRoot) {
  const executable = process.platform === "win32" ? "java.exe" : "java";
  return process.platform === "darwin"
    ? path.join(runtimeRoot, "Contents", "Home", "bin", executable)
    : path.join(runtimeRoot, "bin", executable);
}

async function setupModuleJre() {
  const jreDownload = JRE_DOWNLOADS[platformKey];
  if (!jreDownload) {
    throw new Error(`当前平台 ${platformKey} 没有预设的本地 JRE 下载源。`);
  }

  const runtimeRoot = path.join(jreRoot, platformKey);
  const javaPath = getExpectedJavaPath(runtimeRoot);
  if (await fileExists(javaPath)) {
    return {
      runtimeRoot,
      javaPath,
      downloaded: false
    };
  }

  const archiveDir = path.join(jreRoot, "downloads");
  const archivePath = path.join(archiveDir, jreDownload.fileName);
  if (!(await fileExists(archivePath))) {
    console.log(`Downloading JRE: ${jreDownload.url}`);
    await downloadFile(jreDownload.url, archivePath);
  }

  console.log(`Extracting JRE to ${runtimeRoot}`);
  await extractTarGz(archivePath, runtimeRoot);

  if (!(await fileExists(javaPath))) {
    throw new Error(`JRE 已解压，但未找到 java 可执行文件：${javaPath}`);
  }

  return {
    runtimeRoot,
    javaPath,
    downloaded: true
  };
}

async function setupModuleTika() {
  const tikaJarPath = path.join(tikaRoot, TIKA_DOWNLOAD.fileName);
  if (!(await fileExists(tikaJarPath))) {
    console.log(`Downloading Tika: ${TIKA_DOWNLOAD.url}`);
    await downloadFile(TIKA_DOWNLOAD.url, tikaJarPath);
  }

  return {
    tikaJarPath,
    downloaded: true
  };
}

async function main() {
  const [jre, tika] = await Promise.all([setupModuleJre(), setupModuleTika()]);

  const saved = await saveSettings(userDataPath, {
    javaBinPath: jre.javaPath,
    tikaJarPath: tika.tikaJarPath
  }, {
    redactSecrets: true
  });

  console.log(
    JSON.stringify(
      {
        platform: platformKey,
        moduleResourceRoot,
        javaBinPath: saved.javaBinPath,
        tikaJarPath: saved.tikaJarPath
      },
      null,
      2
    )
  );
}

await main();
