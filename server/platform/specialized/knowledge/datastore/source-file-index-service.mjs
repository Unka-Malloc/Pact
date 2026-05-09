import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import Database from "better-sqlite3";
import { loadSourceSearchRules } from "../domain/rules/source-search-rules.mjs";
import { mapWithConcurrency } from "../../../common/platform-core/async-concurrency.mjs";
import {
  extractEmailHeaderValue,
  extractReadableEmailText,
  stripHtmlToReadableText
} from "../domain/rules/mail-readable-text.mjs";
import {
  checkpointTreeId,
  deleteCheckpointTree,
  finishCheckpointTree,
  startCheckpointTree,
  upsertCheckpointNode
} from "../../../common/data-structure/checkpoint-tree-store.mjs";

export const SOURCE_EVIDENCE_PREFIX = "source-evidence::";

function nowIso() {
  return new Date().toISOString();
}

const MAX_INDEX_READ_CONCURRENCY = 8;
const INDEX_WRITE_CHUNK_SIZE = 25;

function lower(value) {
  return String(value || "").toLowerCase();
}

function normalizeText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeExtension(value = "") {
  const trimmed = String(value || "").trim().toLowerCase();
  if (!trimmed) {
    return "";
  }
  return trimmed.startsWith(".") ? trimmed : `.${trimmed}`;
}

function normalizeStringArray(value) {
  return Array.isArray(value)
    ? value.map((item) => String(item || "").trim()).filter(Boolean)
    : [];
}

function hashText(value, length = 32) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex").slice(0, length);
}

function toPosixRelative(root, absolutePath) {
  return path.relative(root, absolutePath).split(path.sep).join("/");
}

export function sourceEvidenceIdForPath(userDataPath, absolutePath) {
  return `${SOURCE_EVIDENCE_PREFIX}${hashText(toPosixRelative(userDataPath, absolutePath), 32)}`;
}

function sourceFileIndexRoot(userDataPath) {
  return path.join(userDataPath, "source-file-index");
}

function sourceFileIndexPath(userDataPath) {
  return path.join(sourceFileIndexRoot(userDataPath), "source-files.sqlite");
}

async function ensureDirectory(filePath) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

function openIndexDatabase(userDataPath) {
  const db = new Database(sourceFileIndexPath(userDataPath));
  db.pragma("journal_mode = WAL");
  db.pragma("busy_timeout = 5000");
  db.exec(`
    CREATE TABLE IF NOT EXISTS source_file_index_files (
      file_id TEXT PRIMARY KEY,
      evidence_id TEXT UNIQUE NOT NULL,
      source_id TEXT NOT NULL,
      root_path TEXT NOT NULL,
      absolute_path TEXT NOT NULL,
      relative_path TEXT NOT NULL,
      extension TEXT NOT NULL,
      byte_size INTEGER NOT NULL DEFAULT 0,
      mtime_ms INTEGER NOT NULL DEFAULT 0,
      content_hash TEXT NOT NULL DEFAULT '',
      title TEXT NOT NULL DEFAULT '',
      from_header TEXT NOT NULL DEFAULT '',
      date_header TEXT NOT NULL DEFAULT '',
      readable_preview TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'indexed',
      error TEXT NOT NULL DEFAULT '',
      indexed_at TEXT NOT NULL DEFAULT ''
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_source_file_index_files_source_path
      ON source_file_index_files(source_id, relative_path);
    CREATE INDEX IF NOT EXISTS idx_source_file_index_files_source
      ON source_file_index_files(source_id);
    CREATE TABLE IF NOT EXISTS source_file_index_terms (
      term TEXT NOT NULL,
      file_id TEXT NOT NULL,
      source_id TEXT NOT NULL,
      field TEXT NOT NULL,
      count INTEGER NOT NULL DEFAULT 0,
      first_position INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY(term, file_id, field)
    );
    CREATE INDEX IF NOT EXISTS idx_source_file_index_terms_lookup
      ON source_file_index_terms(term, source_id);
    CREATE TABLE IF NOT EXISTS source_file_index_runs (
      source_id TEXT PRIMARY KEY,
      status TEXT NOT NULL DEFAULT 'idle',
      reason TEXT NOT NULL DEFAULT '',
      started_at TEXT NOT NULL DEFAULT '',
      finished_at TEXT NOT NULL DEFAULT '',
      file_count INTEGER NOT NULL DEFAULT 0,
      indexed_count INTEGER NOT NULL DEFAULT 0,
      skipped_count INTEGER NOT NULL DEFAULT 0,
      failed_count INTEGER NOT NULL DEFAULT 0,
      snapshot_hash TEXT NOT NULL DEFAULT '',
      error TEXT NOT NULL DEFAULT ''
    );
  `);
  return db;
}

function sourceSearchExtensions(rules) {
  const configured = normalizeStringArray(rules.knowledgeSourceExtensions)
    .map(normalizeExtension)
    .filter(Boolean);
  if (configured.length) {
    return configured;
  }
  return Array.from(
    new Set(
      (rules.scanRoots || [])
        .flatMap((root) => root.extensions || [])
        .map(normalizeExtension)
        .filter(Boolean)
    )
  );
}

async function listIndexableSourceFiles(rootPath, {
  recursive = true,
  extensions = [],
  ignoredDirectories = [],
  maxFiles = 1000000
} = {}) {
  const root = path.resolve(rootPath);
  const extensionSet = new Set(extensions.map(normalizeExtension).filter(Boolean));
  const ignoredSet = new Set(ignoredDirectories.map((item) => lower(item)).filter(Boolean));
  const files = [];
  let totalBytes = 0;

  async function visit(directory) {
    if (files.length >= maxFiles) {
      return;
    }
    let entries = [];
    try {
      entries = await fs.readdir(directory, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (files.length >= maxFiles) {
        return;
      }
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (recursive && !ignoredSet.has(lower(entry.name))) {
          await visit(absolutePath);
        }
        continue;
      }
      if (!entry.isFile()) {
        continue;
      }
      const extension = normalizeExtension(path.extname(entry.name));
      if (!extensionSet.has(extension)) {
        continue;
      }
      try {
        const stats = await fs.stat(absolutePath);
        const relativePath = toPosixRelative(root, absolutePath);
        totalBytes += Number(stats.size || 0);
        files.push({
          absolutePath,
          relativePath,
          extension,
          byteSize: Number(stats.size || 0),
          mtimeMs: Math.floor(stats.mtimeMs)
        });
      } catch {
        // Ignore files that disappear during a live directory scan.
      }
    }
  }

  await visit(root);
  files.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
  return {
    root,
    files,
    fileCount: files.length,
    totalBytes,
    snapshotHash: crypto.createHash("sha256").update(JSON.stringify(files.map((file) => [
      file.relativePath,
      file.byteSize,
      file.mtimeMs
    ]))).digest("hex")
  };
}

function headerValue(raw, name) {
  return extractEmailHeaderValue(raw, name);
}

function readableTextForIndex(raw, extension) {
  if (extension === ".eml") {
    return extractReadableEmailText(raw, { includeHeaders: true, removeUrlNoise: true });
  }
  return stripHtmlToReadableText(raw);
}

function addIndexTerm(terms, term, field, firstPosition) {
  const normalized = lower(term).trim();
  if (normalized.length < 2 || normalized.length > 96) {
    return;
  }
  const key = `${field}\u0000${normalized}`;
  const current = terms.get(key);
  if (current) {
    current.count += 1;
    current.firstPosition = Math.min(current.firstPosition, firstPosition);
    return;
  }
  terms.set(key, {
    term: normalized,
    field,
    count: 1,
    firstPosition
  });
}

export function extractIndexTerms(text, field = "readable", maxTerms = 20000) {
  const terms = new Map();
  const source = String(text || "");
  const pattern = /[\p{Script=Han}]{2,}|[A-Za-z0-9][A-Za-z0-9._-]*/gu;
  let match;
  while ((match = pattern.exec(source)) && terms.size < maxTerms) {
    const token = match[0];
    const index = match.index;
    if (/^[\p{Script=Han}]+$/u.test(token)) {
      if (token.length <= 16) {
        addIndexTerm(terms, token, field, index);
      }
      const maxNgram = Math.min(4, token.length);
      for (let size = 2; size <= maxNgram; size += 1) {
        for (let offset = 0; offset <= token.length - size; offset += 1) {
          addIndexTerm(terms, token.slice(offset, offset + size), field, index + offset);
          if (terms.size >= maxTerms) {
            break;
          }
        }
        if (terms.size >= maxTerms) {
          break;
        }
      }
      continue;
    }
    addIndexTerm(terms, token, field, index);
  }
  return [...terms.values()];
}

function queryTokensForGroup(group) {
  const tokens = new Set();
  for (const term of group.terms || []) {
    const normalized = lower(normalizeText(term));
    if (normalized.length >= 2) {
      tokens.add(normalized);
    }
    for (const entry of extractIndexTerms(term, "query", 200)) {
      tokens.add(entry.term);
    }
  }
  return [...tokens].slice(0, 256);
}

async function readFileForIndex(file, rules) {
  if (file.byteSize > rules.maxFileBytes) {
    return {
      ...file,
      status: "skipped_large",
      error: `文件超过原文索引上限 ${rules.maxFileBytes} bytes`
    };
  }
  try {
    const raw = await fs.readFile(file.absolutePath, "utf8");
    const contentHash = crypto.createHash("sha256").update(raw).digest("hex");
    const readableText = readableTextForIndex(raw, file.extension);
    return {
      ...file,
      status: "indexed",
      error: "",
      contentHash,
      title: headerValue(raw, "Subject") || path.basename(file.absolutePath),
      fromHeader: headerValue(raw, "From"),
      dateHeader: headerValue(raw, "Date"),
      readablePreview: readableText.slice(0, 1200),
      terms: [
        ...extractIndexTerms(raw, "raw", Number(rules.indexMaxTermsPerFile || 20000)),
        ...extractIndexTerms(readableText, "readable", Number(rules.indexMaxTermsPerFile || 20000))
      ]
    };
  } catch (error) {
    return {
      ...file,
      status: "failed",
      error: error instanceof Error ? error.message : "读取原始文件失败。"
    };
  }
}

function chunkArray(items, chunkSize) {
  const chunks = [];
  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }
  return chunks;
}

export async function indexKnowledgeSourceFiles({
  userDataPath,
  source,
  reason = "manual",
  force = false
} = {}) {
  const rules = await loadSourceSearchRules(userDataPath);
  const extensions = sourceSearchExtensions(rules);
  const sourceId = String(source?.sourceId || "").trim();
  if (!sourceId || !source?.directoryPath || source.enabled === false || !extensions.length) {
    return {
      skipped: true,
      reason: "not_indexable",
      sourceId,
      checkpointTreeId: sourceId ? checkpointTreeId("source-file-index", sourceId) : "",
      fileCount: 0,
      indexedCount: 0,
      skippedCount: 0,
      failedCount: 0,
      snapshotHash: ""
    };
  }

  const treeId = checkpointTreeId("source-file-index", sourceId);
  await startCheckpointTree({
    userDataPath,
    treeId,
    kind: "source_file_index",
    ownerId: sourceId,
    rootNodeId: "source-index",
    rootLabel: "原文倒排索引",
    metadata: {
      sourceId,
      reason,
      directoryPath: source.directoryPath
    },
    resumePolicy: {
      mode: "manifest-cursor",
      idempotencyKey: "sourceId+relativePath+mtime+size+contentHash",
      reusableState: "source_file_index_files/source_file_index_terms"
    },
    resetOnInputHashChange: false
  });
  await upsertCheckpointNode({
    userDataPath,
    treeId,
    nodeId: "scan-source-directory",
    parentId: "source-index",
    label: "扫描受管目录",
    status: "running",
    metadata: {
      recursive: source.recursive !== false,
      extensionCount: extensions.length
    }
  });

  await ensureDirectory(sourceFileIndexPath(userDataPath));
  const db = openIndexDatabase(userDataPath);
  const startedAt = nowIso();
  try {
    db.prepare(`
      INSERT INTO source_file_index_runs (
        source_id, status, reason, started_at, finished_at, file_count,
        indexed_count, skipped_count, failed_count, snapshot_hash, error
      ) VALUES (?, 'running', ?, ?, '', 0, 0, 0, 0, '', '')
      ON CONFLICT(source_id) DO UPDATE SET
        status = 'running',
        reason = excluded.reason,
        started_at = excluded.started_at,
        finished_at = '',
        error = ''
    `).run(sourceId, reason, startedAt);

    const scanned = await listIndexableSourceFiles(source.directoryPath, {
      recursive: source.recursive !== false,
      extensions,
      ignoredDirectories: rules.ignoredDirectories || [],
      maxFiles: rules.maxScanFiles
    });
    await startCheckpointTree({
      userDataPath,
      treeId,
      kind: "source_file_index",
      ownerId: sourceId,
      inputHash: scanned.snapshotHash,
      rootNodeId: "source-index",
      rootLabel: "原文倒排索引",
      metadata: {
        sourceId,
        reason,
        directoryPath: source.directoryPath,
        fileCount: scanned.fileCount,
        totalBytes: scanned.totalBytes
      },
      resumePolicy: {
        mode: "manifest-cursor",
        idempotencyKey: "sourceId+relativePath+mtime+size+contentHash",
        reusableState: "source_file_index_files/source_file_index_terms"
      },
      resetOnInputHashChange: true
    });
    await upsertCheckpointNode({
      userDataPath,
      treeId,
      nodeId: "scan-source-directory",
      parentId: "source-index",
      label: "扫描受管目录",
      status: "completed",
      totals: {
        fileCount: scanned.fileCount,
        totalBytes: scanned.totalBytes
      },
      cursor: {
        snapshotHash: scanned.snapshotHash
      }
    });
    const existingRun = db.prepare("SELECT snapshot_hash FROM source_file_index_runs WHERE source_id = ?").get(sourceId);
    if (!force && existingRun?.snapshot_hash && existingRun.snapshot_hash === scanned.snapshotHash) {
      const indexedCount = db.prepare("SELECT COUNT(*) AS count FROM source_file_index_files WHERE source_id = ?").get(sourceId)?.count || 0;
      const finishedAt = nowIso();
      db.prepare(`
        UPDATE source_file_index_runs
        SET status = 'indexed', finished_at = ?, file_count = ?, indexed_count = ?,
        skipped_count = 0, failed_count = 0, snapshot_hash = ?, error = ''
        WHERE source_id = ?
      `).run(finishedAt, scanned.fileCount, indexedCount, scanned.snapshotHash, sourceId);
      await upsertCheckpointNode({
        userDataPath,
        treeId,
        nodeId: "reuse-existing-index",
        parentId: "source-index",
        label: "复用已有倒排索引",
        status: "completed",
        totals: {
          indexedCount,
          fileCount: scanned.fileCount
        },
        cursor: {
          snapshotHash: scanned.snapshotHash
        }
      });
      await finishCheckpointTree({
        userDataPath,
        treeId,
        status: "completed",
        message: "Source file index reused unchanged checkpoint.",
        metadata: {
          indexedCount,
          fileCount: scanned.fileCount,
          snapshotHash: scanned.snapshotHash
        }
      });
      return {
        skipped: true,
        reason: "unchanged",
        sourceId,
        checkpointTreeId: treeId,
        fileCount: scanned.fileCount,
        indexedCount,
        skippedCount: 0,
        failedCount: 0,
        snapshotHash: scanned.snapshotHash,
        indexedAt: finishedAt
      };
    }

    const existingByPath = new Map(
      db.prepare(`
        SELECT file_id, relative_path, byte_size, mtime_ms, content_hash, status
        FROM source_file_index_files
        WHERE source_id = ?
      `).all(sourceId).map((row) => [row.relative_path, row])
    );
    const seenFileIds = new Set();
    const filesToRead = [];
    const upsertFile = db.prepare(`
      INSERT INTO source_file_index_files (
        file_id, evidence_id, source_id, root_path, absolute_path, relative_path,
        extension, byte_size, mtime_ms, content_hash, title, from_header,
        date_header, readable_preview, status, error, indexed_at
      ) VALUES (
        @fileId, @evidenceId, @sourceId, @rootPath, @absolutePath, @relativePath,
        @extension, @byteSize, @mtimeMs, @contentHash, @title, @fromHeader,
        @dateHeader, @readablePreview, @status, @error, @indexedAt
      )
      ON CONFLICT(file_id) DO UPDATE SET
        evidence_id = excluded.evidence_id,
        root_path = excluded.root_path,
        absolute_path = excluded.absolute_path,
        relative_path = excluded.relative_path,
        extension = excluded.extension,
        byte_size = excluded.byte_size,
        mtime_ms = excluded.mtime_ms,
        content_hash = excluded.content_hash,
        title = excluded.title,
        from_header = excluded.from_header,
        date_header = excluded.date_header,
        readable_preview = excluded.readable_preview,
        status = excluded.status,
        error = excluded.error,
        indexed_at = excluded.indexed_at
    `);
    const deleteTermsForFile = db.prepare("DELETE FROM source_file_index_terms WHERE file_id = ?");
    const insertTerm = db.prepare(`
      INSERT INTO source_file_index_terms (term, file_id, source_id, field, count, first_position)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(term, file_id, field) DO UPDATE SET
        count = excluded.count,
        first_position = excluded.first_position
    `);
    const updateTransaction = db.transaction((entries) => {
      for (const entry of entries) {
        upsertFile.run({
          fileId: entry.fileId,
          evidenceId: entry.evidenceId,
          sourceId,
          rootPath: scanned.root,
          absolutePath: entry.absolutePath,
          relativePath: entry.relativePath,
          extension: entry.extension,
          byteSize: entry.byteSize,
          mtimeMs: entry.mtimeMs,
          contentHash: entry.contentHash || "",
          title: entry.title || path.basename(entry.absolutePath),
          fromHeader: entry.fromHeader || "",
          dateHeader: entry.dateHeader || "",
          readablePreview: entry.readablePreview || "",
          status: entry.status,
          error: entry.error || "",
          indexedAt: entry.indexedAt
        });
        deleteTermsForFile.run(entry.fileId);
        for (const term of entry.terms || []) {
          insertTerm.run(term.term, entry.fileId, sourceId, term.field, term.count, term.firstPosition);
        }
      }
    });

    for (const file of scanned.files) {
      const fileId = `sfi_${hashText(`${sourceId}\n${file.relativePath}`, 40)}`;
      const evidenceId = sourceEvidenceIdForPath(userDataPath, file.absolutePath);
      seenFileIds.add(fileId);
      const existing = existingByPath.get(file.relativePath);
      if (
        existing &&
        existing.byte_size === file.byteSize &&
        existing.mtime_ms === file.mtimeMs &&
        existing.content_hash &&
        existing.status === "indexed"
      ) {
        continue;
      }
        filesToRead.push({
        ...file,
        fileId,
        evidenceId
      });
    }

    await upsertCheckpointNode({
      userDataPath,
      treeId,
      nodeId: "plan-index-work",
      parentId: "source-index",
      label: "规划索引增量",
      status: "completed",
      totals: {
        scannedFileCount: scanned.fileCount,
        reusableFileCount: scanned.fileCount - filesToRead.length,
        filesToRead: filesToRead.length
      },
      cursor: {
        snapshotHash: scanned.snapshotHash
      }
    });

    const indexedAt = nowIso();
    const effectiveIndexConcurrency = Math.max(
      1,
      Math.min(
        Number(rules.indexConcurrency || rules.readConcurrency || 1),
        MAX_INDEX_READ_CONCURRENCY
      )
    );
    let readCompleted = 0;
    let written = 0;
    if (filesToRead.length === 0) {
      await upsertCheckpointNode({
        userDataPath,
        treeId,
        nodeId: "read-source-files",
        parentId: "source-index",
        label: "读取并抽取索引文本",
        status: "skipped",
        totals: {
          total: 0,
          processed: 0
        }
      });
      await upsertCheckpointNode({
        userDataPath,
        treeId,
        nodeId: "write-inverted-index",
        parentId: "source-index",
        label: "写入倒排索引",
        status: "skipped",
        totals: {
          total: 0,
          written: 0
        }
      });
    } else {
      for (const readChunk of chunkArray(filesToRead, INDEX_WRITE_CHUNK_SIZE)) {
        const indexedChunk = await mapWithConcurrency(readChunk, effectiveIndexConcurrency, async (file) => {
          const result = await readFileForIndex(file, rules);
          readCompleted += 1;
          if (readCompleted === filesToRead.length || readCompleted % INDEX_WRITE_CHUNK_SIZE === 0) {
            await upsertCheckpointNode({
              userDataPath,
              treeId,
              nodeId: "read-source-files",
              parentId: "source-index",
              label: "读取并抽取索引文本",
              status: readCompleted === filesToRead.length ? "completed" : "running",
              totals: {
                total: filesToRead.length,
                processed: readCompleted
              },
              cursor: {
                processed: readCompleted,
                total: filesToRead.length,
                lastRelativePath: file.relativePath
              }
            });
          }
          return result;
        });
        updateTransaction(indexedChunk.map((file) => ({ ...file, indexedAt })));
        written += indexedChunk.length;
        await upsertCheckpointNode({
          userDataPath,
          treeId,
          nodeId: "write-inverted-index",
          parentId: "source-index",
          label: "写入倒排索引",
          status: written >= filesToRead.length ? "completed" : "running",
          totals: {
            total: filesToRead.length,
            written
          },
          cursor: {
            written,
            total: filesToRead.length
          }
        });
      }
    }

    const staleIds = db.prepare("SELECT file_id FROM source_file_index_files WHERE source_id = ?").all(sourceId)
      .map((row) => row.file_id)
      .filter((fileId) => !seenFileIds.has(fileId));
    const deleteFilesByIds = db.transaction((fileIds) => {
      for (const fileId of fileIds) {
        db.prepare("DELETE FROM source_file_index_terms WHERE file_id = ?").run(fileId);
        db.prepare("DELETE FROM source_file_index_files WHERE file_id = ?").run(fileId);
      }
    });
    let pruned = 0;
    for (const chunk of chunkArray(staleIds, 500)) {
      deleteFilesByIds(chunk);
      pruned += chunk.length;
      await upsertCheckpointNode({
        userDataPath,
        treeId,
        nodeId: "prune-stale-index",
        parentId: "source-index",
        label: "清理失效索引",
        status: pruned >= staleIds.length ? "completed" : "running",
        totals: {
          total: staleIds.length,
          pruned
        },
        cursor: {
          pruned,
          total: staleIds.length
        }
      });
    }
    if (staleIds.length === 0) {
      await upsertCheckpointNode({
        userDataPath,
        treeId,
        nodeId: "prune-stale-index",
        parentId: "source-index",
        label: "清理失效索引",
        status: "skipped",
        totals: {
          total: 0,
          pruned: 0
        }
      });
    }

    const indexedCount = db.prepare("SELECT COUNT(*) AS count FROM source_file_index_files WHERE source_id = ? AND status = 'indexed'").get(sourceId)?.count || 0;
    const failedCount = db.prepare("SELECT COUNT(*) AS count FROM source_file_index_files WHERE source_id = ? AND status = 'failed'").get(sourceId)?.count || 0;
    const skippedCount = db.prepare("SELECT COUNT(*) AS count FROM source_file_index_files WHERE source_id = ? AND status = 'skipped_large'").get(sourceId)?.count || 0;
    const finishedAt = nowIso();
    db.prepare(`
      UPDATE source_file_index_runs
      SET status = 'indexed', finished_at = ?, file_count = ?, indexed_count = ?,
          skipped_count = ?, failed_count = ?, snapshot_hash = ?, error = ''
      WHERE source_id = ?
    `).run(finishedAt, scanned.fileCount, indexedCount, skippedCount, failedCount, scanned.snapshotHash, sourceId);
    await finishCheckpointTree({
      userDataPath,
      treeId,
      status: "completed",
      message: "Source file inverted index completed.",
      metadata: {
        indexedCount,
        skippedCount,
        failedCount,
        fileCount: scanned.fileCount,
        snapshotHash: scanned.snapshotHash
      }
    });
    return {
      skipped: false,
      reason,
      sourceId,
      checkpointTreeId: treeId,
      fileCount: scanned.fileCount,
      indexedCount,
      skippedCount,
      failedCount,
      snapshotHash: scanned.snapshotHash,
      indexedAt: finishedAt
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "原文倒排索引失败。";
    await upsertCheckpointNode({
      userDataPath,
      treeId,
      nodeId: "source-index-error",
      parentId: "source-index",
      label: "原文倒排索引失败",
      status: "failed",
      error: message
    }).catch(() => null);
    await finishCheckpointTree({
      userDataPath,
      treeId,
      status: "failed",
      message,
      metadata: {
        error: message
      }
    }).catch(() => null);
    db.prepare(`
      INSERT INTO source_file_index_runs (
        source_id, status, reason, started_at, finished_at, file_count,
        indexed_count, skipped_count, failed_count, snapshot_hash, error
      ) VALUES (?, 'failed', ?, ?, ?, 0, 0, 0, 0, '', ?)
      ON CONFLICT(source_id) DO UPDATE SET
        status = 'failed',
        finished_at = excluded.finished_at,
        error = excluded.error
    `).run(sourceId, reason, startedAt, nowIso(), message);
    return {
      skipped: false,
      reason,
      sourceId,
      checkpointTreeId: treeId,
      fileCount: 0,
      indexedCount: 0,
      skippedCount: 0,
      failedCount: 1,
      snapshotHash: "",
      error: message,
      indexedAt: nowIso()
    };
  } finally {
    db.close();
  }
}

export async function deleteKnowledgeSourceFileIndex({ userDataPath, sourceId } = {}) {
  await ensureDirectory(sourceFileIndexPath(userDataPath));
  const db = openIndexDatabase(userDataPath);
  try {
    const fileIds = db.prepare("SELECT file_id FROM source_file_index_files WHERE source_id = ?").all(sourceId).map((row) => row.file_id);
    const remove = db.transaction((ids) => {
      for (const fileId of ids) {
        db.prepare("DELETE FROM source_file_index_terms WHERE file_id = ?").run(fileId);
      }
      db.prepare("DELETE FROM source_file_index_files WHERE source_id = ?").run(sourceId);
      db.prepare("DELETE FROM source_file_index_runs WHERE source_id = ?").run(sourceId);
    });
    remove(fileIds);
  } finally {
    db.close();
  }
  if (sourceId) {
    await deleteCheckpointTree({
      userDataPath,
      treeId: checkpointTreeId("source-file-index", sourceId)
    }).catch(() => null);
  }
}

export async function indexedCandidateFilesForRoot({
  userDataPath,
  root,
  groups
} = {}) {
  const sourceId = String(root?.id || "").trim();
  if (!sourceId) {
    return { available: false, files: [], candidateFileCount: 0, reason: "missing_source_id" };
  }
  try {
    await fs.access(sourceFileIndexPath(userDataPath));
  } catch {
    return { available: false, files: [], candidateFileCount: 0, reason: "index_missing" };
  }
  const db = openIndexDatabase(userDataPath);
  try {
    const indexedCount = db.prepare("SELECT COUNT(*) AS count FROM source_file_index_files WHERE source_id = ?").get(sourceId)?.count || 0;
    if (!indexedCount) {
      return { available: false, files: [], candidateFileCount: 0, reason: "source_not_indexed" };
    }
    const groupFileIdSets = [];
    const tokenCountByGroup = [];
    for (const group of groups || []) {
      const tokens = queryTokensForGroup(group);
      tokenCountByGroup.push(tokens.length);
      if (!tokens.length) {
        continue;
      }
      const placeholders = tokens.map(() => "?").join(", ");
      const rows = db.prepare(`
        SELECT DISTINCT file_id
        FROM source_file_index_terms
        WHERE source_id = ? AND term IN (${placeholders})
      `).all(sourceId, ...tokens);
      groupFileIdSets.push(new Set(rows.map((row) => row.file_id)));
    }
    let candidateIds;
    if (!groupFileIdSets.length) {
      candidateIds = new Set(db.prepare("SELECT file_id FROM source_file_index_files WHERE source_id = ?").all(sourceId).map((row) => row.file_id));
    } else {
      candidateIds = groupFileIdSets[0] || new Set();
      for (const nextSet of groupFileIdSets.slice(1)) {
        candidateIds = new Set([...candidateIds].filter((fileId) => nextSet.has(fileId)));
      }
    }
    if (!candidateIds.size) {
      return {
        available: true,
        files: [],
        candidateFileCount: 0,
        tokenCountByGroup,
        reason: "no_index_match"
      };
    }
    const rows = [];
    for (const chunk of chunkArray([...candidateIds], 500)) {
      const placeholders = chunk.map(() => "?").join(", ");
      rows.push(...db.prepare(`
        SELECT absolute_path, relative_path, extension, source_id
        FROM source_file_index_files
        WHERE file_id IN (${placeholders}) AND status = 'indexed'
      `).all(...chunk));
    }
    return {
      available: true,
      files: rows.map((row) => ({
        file: row.absolute_path,
        root
      })),
      candidateFileCount: candidateIds.size,
      tokenCountByGroup,
      reason: "indexed"
    };
  } finally {
    db.close();
  }
}

export async function getIndexedSourceFileByEvidenceId({ userDataPath, evidenceId } = {}) {
  try {
    await fs.access(sourceFileIndexPath(userDataPath));
  } catch {
    return null;
  }
  const db = openIndexDatabase(userDataPath);
  try {
    const row = db.prepare(`
      SELECT absolute_path, source_id, relative_path, extension
      FROM source_file_index_files
      WHERE evidence_id = ? AND status = 'indexed'
    `).get(String(evidenceId || ""));
    if (!row) {
      return null;
    }
    return {
      file: row.absolute_path,
      root: {
        id: row.source_id,
        label: row.source_id,
        absolutePath: path.dirname(row.absolute_path),
        sourceKind: "knowledge-source-index"
      }
    };
  } finally {
    db.close();
  }
}

export async function getSourceFileIndexRun({ userDataPath, sourceId } = {}) {
  try {
    await fs.access(sourceFileIndexPath(userDataPath));
  } catch {
    return null;
  }
  const db = openIndexDatabase(userDataPath);
  try {
    return db.prepare("SELECT * FROM source_file_index_runs WHERE source_id = ?").get(sourceId) || null;
  } finally {
    db.close();
  }
}
