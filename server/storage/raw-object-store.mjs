import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { hashClientString, resolveWithin, serverToken } from "../security/client-strings.mjs";

function normalizeRelativePath(value) {
  return String(value || "")
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .trim();
}

function validateRelativePath(value) {
  const normalized = normalizeRelativePath(value);
  if (!normalized) {
    throw new Error("原始邮件缺少可持久化的文件名。");
  }

  const segments = normalized.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) {
    throw new Error("原始邮件路径不安全，已拒绝写入。");
  }

  return normalized;
}

export function getRawMailObjectRoot(userDataPath) {
  return path.join(userDataPath, "objects", "mail");
}

export function resolveStoredObjectPath(userDataPath, storageRelativePath) {
  return resolveWithin(userDataPath, storageRelativePath);
}

export async function persistRawMailObject({
  userDataPath,
  batchId,
  buffer,
  originalRelativePath,
  originalSourcePath = "",
  sourceContainerPath = "",
  mediaType = "message/rfc822",
  ingestOrigin = "filesystem",
  sourceCreatedAt = "",
  sourceUpdatedAt = "",
  sourceCollectedAt = ""
}) {
  const safeRelativePath = validateRelativePath(originalRelativePath);
  const objectId = randomUUID();
  const sha256 = createHash("sha256").update(buffer).digest("hex");
  const byteSize = buffer.length;
  const safeExtension = path.posix.extname(safeRelativePath).toLowerCase();
  const objectFileName = `${serverToken("raw_mail", safeRelativePath, sha256)}${safeExtension}`;
  const objectDirectory = path.join(getRawMailObjectRoot(userDataPath), batchId, objectId);
  const targetPath = path.join(objectDirectory, objectFileName);

  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, buffer);

  const createdAt = new Date().toISOString();
  const storageRelativePath = path
    .relative(userDataPath, targetPath)
    .split(path.sep)
    .join("/");
  const sourceNameToken = `${serverToken("raw_mail_name", path.posix.basename(safeRelativePath), sha256)}${safeExtension}`;

  return {
    objectId,
    ingestOrigin,
    originalFileName: sourceNameToken,
    originalRelativePath: objectFileName,
    originalSourcePath: hashClientString(originalSourcePath || "", "raw_mail.source_path"),
    sourceContainerPath: hashClientString(sourceContainerPath || "", "raw_mail.container_path"),
    storageRelativePath,
    mediaType: String(mediaType || "message/rfc822"),
    sha256,
    byteSize,
    sourceCreatedAt: String(sourceCreatedAt || ""),
    sourceUpdatedAt: String(sourceUpdatedAt || ""),
    sourceCollectedAt: String(sourceCollectedAt || ""),
    createdAt
  };
}
