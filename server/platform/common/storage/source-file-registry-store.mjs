import path from "node:path";
import Database from "better-sqlite3";
import { getMetadataDatabasePath } from "./schema-manager.mjs";

function nowIso() {
  return new Date().toISOString();
}

function buildFileFingerprint(file = {}) {
  return `${Number(file.byteSize || 0)}:${Number(file.mtimeMs || 0)}`;
}

function normalizeExtension(value = "") {
  const trimmed = String(value || "").trim().toLowerCase();
  if (!trimmed) {
    return "";
  }
  return trimmed.startsWith(".") ? trimmed : `.${trimmed}`;
}

export function createSourceFileRegistryStore({ userDataPath }) {
  const db = new Database(getMetadataDatabasePath(userDataPath));
  db.exec(`
    CREATE TABLE IF NOT EXISTS knowledge_source_file_fingerprints (
      source_id TEXT NOT NULL,
      relative_path TEXT NOT NULL,
      byte_size INTEGER NOT NULL DEFAULT 0,
      mtime_ms INTEGER NOT NULL DEFAULT 0,
      fingerprint TEXT NOT NULL DEFAULT '',
      last_scan_id TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT '',
      PRIMARY KEY(source_id, relative_path)
    );
    CREATE INDEX IF NOT EXISTS idx_ks_file_fingerprints_scan
      ON knowledge_source_file_fingerprints(source_id, last_scan_id);

    CREATE TABLE IF NOT EXISTS knowledge_source_path_aliases (
      source_id TEXT NOT NULL,
      alias_directory_path TEXT NOT NULL,
      canonical_directory_path TEXT NOT NULL,
      recorded_at TEXT NOT NULL,
      PRIMARY KEY(source_id, alias_directory_path)
    );

    CREATE TABLE IF NOT EXISTS knowledge_source_registry_sources (
      source_id TEXT PRIMARY KEY,
      label TEXT NOT NULL DEFAULT '',
      directory_path TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      auto_sync INTEGER NOT NULL DEFAULT 1,
      recursive INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS knowledge_source_registry_files (
      source_id TEXT NOT NULL,
      relative_path TEXT NOT NULL,
      absolute_path TEXT NOT NULL,
      extension TEXT NOT NULL DEFAULT '',
      byte_size INTEGER NOT NULL DEFAULT 0,
      mtime_ms INTEGER NOT NULL DEFAULT 0,
      fingerprint TEXT NOT NULL DEFAULT '',
      last_scan_id TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT '',
      PRIMARY KEY(source_id, relative_path)
    );

    CREATE INDEX IF NOT EXISTS idx_ks_registry_files_source
      ON knowledge_source_registry_files(source_id, updated_at DESC);

    CREATE INDEX IF NOT EXISTS idx_ks_registry_files_absolute_path
      ON knowledge_source_registry_files(absolute_path);
  `);

  const listStmt = db.prepare(`
    SELECT relative_path, byte_size, mtime_ms, fingerprint
    FROM knowledge_source_file_fingerprints
    WHERE source_id = ?
  `);
  const upsertStmt = db.prepare(`
    INSERT INTO knowledge_source_file_fingerprints (
      source_id, relative_path, byte_size, mtime_ms, fingerprint, last_scan_id, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(source_id, relative_path) DO UPDATE SET
      byte_size = excluded.byte_size,
      mtime_ms = excluded.mtime_ms,
      fingerprint = excluded.fingerprint,
      last_scan_id = excluded.last_scan_id,
      updated_at = excluded.updated_at
  `);
  const deleteStmt = db.prepare(`
    DELETE FROM knowledge_source_file_fingerprints
    WHERE source_id = ? AND relative_path = ?
  `);
  const aliasStmt = db.prepare(`
    INSERT INTO knowledge_source_path_aliases (
      source_id, alias_directory_path, canonical_directory_path, recorded_at
    ) VALUES (?, ?, ?, ?)
    ON CONFLICT(source_id, alias_directory_path) DO UPDATE SET
      canonical_directory_path = excluded.canonical_directory_path,
      recorded_at = excluded.recorded_at
  `);
  const upsertRegistrySourceStmt = db.prepare(`
    INSERT INTO knowledge_source_registry_sources (
      source_id, label, directory_path, enabled, auto_sync, recursive, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(source_id) DO UPDATE SET
      label = excluded.label,
      directory_path = excluded.directory_path,
      enabled = excluded.enabled,
      auto_sync = excluded.auto_sync,
      recursive = excluded.recursive,
      updated_at = excluded.updated_at
  `);
  const deleteRegistrySourceStmt = db.prepare(`
    DELETE FROM knowledge_source_registry_sources
    WHERE source_id = ?
  `);
  const upsertRegistryFileStmt = db.prepare(`
    INSERT INTO knowledge_source_registry_files (
      source_id, relative_path, absolute_path, extension, byte_size, mtime_ms,
      fingerprint, last_scan_id, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(source_id, relative_path) DO UPDATE SET
      absolute_path = excluded.absolute_path,
      extension = excluded.extension,
      byte_size = excluded.byte_size,
      mtime_ms = excluded.mtime_ms,
      fingerprint = excluded.fingerprint,
      last_scan_id = excluded.last_scan_id,
      updated_at = excluded.updated_at
  `);
  const deleteRegistryFileStmt = db.prepare(`
    DELETE FROM knowledge_source_registry_files
    WHERE source_id = ? AND relative_path = ?
  `);
  const deleteRegistryFilesBySourceStmt = db.prepare(`
    DELETE FROM knowledge_source_registry_files
    WHERE source_id = ?
  `);
  const countRegistryFilesBySourceStmt = db.prepare(`
    SELECT COUNT(*) AS count
    FROM knowledge_source_registry_files
    WHERE source_id = ?
  `);
  const listRegistryFilesBySourceStmt = db.prepare(`
    SELECT source_id, relative_path, absolute_path, extension, byte_size, mtime_ms, fingerprint, last_scan_id, updated_at
    FROM knowledge_source_registry_files
    WHERE source_id = ?
    ORDER BY relative_path ASC
    LIMIT ? OFFSET ?
  `);
  const deleteFingerprintBySourceStmt = db.prepare(`
    DELETE FROM knowledge_source_file_fingerprints
    WHERE source_id = ?
  `);
  const tableExistsStmt = db.prepare(`
    SELECT 1 AS present
    FROM sqlite_master
    WHERE type = 'table' AND name = ?
    LIMIT 1
  `);
  const hasTable = (tableName) => Boolean(tableExistsStmt.get(tableName)?.present);
  const prepareDeleteBySourceRef = (tableName) =>
    hasTable(tableName) ? db.prepare(`DELETE FROM ${tableName} WHERE source_ref = ?`) : null;

  const findSourceRefsInSourceFilesStmt = hasTable("source_files")
    ? db.prepare("SELECT source_ref AS sourceRef FROM source_files WHERE source_path = ?")
    : null;
  const findSourceRefsInRawMailObjectsStmt = hasTable("raw_mail_objects")
    ? db.prepare("SELECT source_ref AS sourceRef FROM raw_mail_objects WHERE original_source_path = ?")
    : null;

  const purgeSourceDocumentProfilesByRefStmt = prepareDeleteBySourceRef("source_document_profiles");
  const purgeSourceFilesByRefStmt = prepareDeleteBySourceRef("source_files");
  const purgeRawMailObjectsByRefStmt = prepareDeleteBySourceRef("raw_mail_objects");
  const purgeSourceBlocksByRefStmt = prepareDeleteBySourceRef("source_blocks");
  const purgeSourceChunksByRefStmt = prepareDeleteBySourceRef("source_chunks");
  const purgeEmailMessagesByRefStmt = prepareDeleteBySourceRef("email_messages");

  const upsertMany = db.transaction((sourceId, scanId, files, removedPaths, timestamp) => {
    for (const file of files || []) {
      upsertStmt.run(
        sourceId,
        file.relativePath,
        Number(file.byteSize || 0),
        Number(file.mtimeMs || 0),
        buildFileFingerprint(file),
        scanId,
        timestamp,
        timestamp
      );
    }
    for (const relativePath of removedPaths || []) {
      deleteStmt.run(sourceId, relativePath);
    }
  });

  const purgePersistedSourcePaths = db.transaction((absolutePaths) => {
    const refs = new Set();
    for (const absolutePath of absolutePaths || []) {
      if (findSourceRefsInSourceFilesStmt) {
        for (const row of findSourceRefsInSourceFilesStmt.all(absolutePath)) {
          refs.add(String(row.sourceRef || ""));
        }
      }
      if (findSourceRefsInRawMailObjectsStmt) {
        for (const row of findSourceRefsInRawMailObjectsStmt.all(absolutePath)) {
          refs.add(String(row.sourceRef || ""));
        }
      }
    }
    for (const sourceRef of refs) {
      if (!sourceRef) {
        continue;
      }
      purgeSourceBlocksByRefStmt?.run(sourceRef);
      purgeSourceChunksByRefStmt?.run(sourceRef);
      purgeEmailMessagesByRefStmt?.run(sourceRef);
      purgeSourceDocumentProfilesByRefStmt?.run(sourceRef);
      purgeSourceFilesByRefStmt?.run(sourceRef);
      purgeRawMailObjectsByRefStmt?.run(sourceRef);
    }
  });

  const syncRegistryFiles = db.transaction((source, scanId, files, removedPaths, timestamp) => {
    for (const file of files || []) {
      const absolutePath = path.join(source.directoryPath, file.relativePath);
      upsertRegistryFileStmt.run(
        source.sourceId,
        file.relativePath,
        absolutePath,
        normalizeExtension(path.extname(file.relativePath)),
        Number(file.byteSize || 0),
        Number(file.mtimeMs || 0),
        buildFileFingerprint(file),
        scanId,
        timestamp,
        timestamp
      );
    }
    for (const relativePath of removedPaths || []) {
      deleteRegistryFileStmt.run(source.sourceId, relativePath);
    }
  });

  return {
    listBySource(sourceId) {
      const map = new Map();
      for (const row of listStmt.all(sourceId)) {
        map.set(row.relative_path, {
          relativePath: row.relative_path,
          byteSize: Number(row.byte_size || 0),
          mtimeMs: Number(row.mtime_ms || 0),
          fingerprint: String(row.fingerprint || "")
        });
      }
      return map;
    },
    applyDelta({ sourceId, scanId, files, removedPaths }) {
      upsertMany(sourceId, scanId, files, removedPaths, nowIso());
    },
    recordPathAlias({ sourceId, aliasDirectoryPath, canonicalDirectoryPath }) {
      aliasStmt.run(sourceId, aliasDirectoryPath, canonicalDirectoryPath, nowIso());
    },
    upsertRegistrySource(source = {}) {
      const timestamp = nowIso();
      upsertRegistrySourceStmt.run(
        String(source.sourceId || "").trim(),
        String(source.label || "").trim(),
        String(source.directoryPath || "").trim(),
        source.enabled === false ? 0 : 1,
        source.autoSync === false ? 0 : 1,
        source.recursive === false ? 0 : 1,
        String(source.createdAt || timestamp),
        String(source.updatedAt || timestamp)
      );
    },
    syncRegistryFiles({ source, scanId, files, removedPaths = [] }) {
      syncRegistryFiles(source, scanId, files, removedPaths, nowIso());
    },
    clearSourceFiles(sourceId) {
      deleteFingerprintBySourceStmt.run(sourceId);
      deleteRegistryFilesBySourceStmt.run(sourceId);
    },
    removeRegistrySource(sourceId) {
      deleteRegistryFilesBySourceStmt.run(sourceId);
      deleteRegistrySourceStmt.run(sourceId);
    },
    countRegisteredFiles(sourceId) {
      return Number(countRegistryFilesBySourceStmt.get(sourceId)?.count || 0);
    },
    listRegisteredFiles(sourceId, { limit = 500, offset = 0 } = {}) {
      const safeLimit = Math.max(1, Math.min(Number(limit || 500), 5000));
      const safeOffset = Math.max(0, Number(offset || 0));
      return listRegistryFilesBySourceStmt.all(sourceId, safeLimit, safeOffset).map((row) => ({
        sourceId: row.source_id,
        relativePath: row.relative_path,
        absolutePath: row.absolute_path,
        extension: row.extension,
        byteSize: Number(row.byte_size || 0),
        mtimeMs: Number(row.mtime_ms || 0),
        fingerprint: row.fingerprint || "",
        lastScanId: row.last_scan_id || "",
        updatedAt: row.updated_at || ""
      }));
    },
    purgePersistedSourcePaths(absolutePaths = []) {
      purgePersistedSourcePaths(absolutePaths);
    },
    close() {
      db.close();
    }
  };
}
