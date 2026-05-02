import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import {
  loadBundledKnowledgeTaxonomy,
  taxonomyToExpertVocabularyEntries
} from "./domain/knowledge-taxonomy/default-taxonomy.mjs";
import {
  atomicWriteFile,
  atomicWriteJsonThroughState,
  mutateState
} from "./application/state-coordinator.mjs";

export const EXPERT_VOCABULARY_SCHEMA_VERSION = 1;
export const KNOWLEDGE_PACKAGE_SCHEMA_VERSION = 1;
export const DEFAULT_EXPERT_VOCABULARY_PACKAGE_ID = "mail-expert-vocabulary";

export const DEFAULT_EXPERT_VOCABULARY_ENTRIES = taxonomyToExpertVocabularyEntries(
  loadBundledKnowledgeTaxonomy()
);

const LIFECYCLE_STATES = new Set(["draft", "active", "retired"]);
const PACKAGE_STATES = new Set(["draft", "active", "retired"]);

function knowledgePackageStateKey(userDataPath) {
  return `knowledge-packages:${path.resolve(userDataPath)}`;
}

function getRulesDirectory(userDataPath) {
  return path.join(userDataPath, "rules");
}

export function getExpertVocabularyPath(userDataPath) {
  return path.join(getRulesDirectory(userDataPath), "expert-vocabulary.json");
}

function getExpertVocabularyHistoryDirectory(userDataPath) {
  return path.join(getRulesDirectory(userDataPath), "history", "expert-vocabulary");
}

export function getKnowledgePackagesDirectory(userDataPath) {
  return path.join(getRulesDirectory(userDataPath), "knowledge-packages");
}

export function getKnowledgePackageDirectory(userDataPath, packageId = DEFAULT_EXPERT_VOCABULARY_PACKAGE_ID) {
  return path.join(getKnowledgePackagesDirectory(userDataPath), normalizePackageId(packageId));
}

function getKnowledgePackageManifestPath(userDataPath, packageId = DEFAULT_EXPERT_VOCABULARY_PACKAGE_ID) {
  return path.join(getKnowledgePackageDirectory(userDataPath, packageId), "manifest.json");
}

function getKnowledgePackageVersionsDirectory(userDataPath, packageId = DEFAULT_EXPERT_VOCABULARY_PACKAGE_ID) {
  return path.join(getKnowledgePackageDirectory(userDataPath, packageId), "versions");
}

function getKnowledgePackageVersionPath(userDataPath, packageId, version) {
  return path.join(
    getKnowledgePackageVersionsDirectory(userDataPath, packageId),
    `v${Number(version || 1)}.json`
  );
}

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizePackageId(value) {
  const normalized = normalizeText(value || DEFAULT_EXPERT_VOCABULARY_PACKAGE_ID)
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || DEFAULT_EXPERT_VOCABULARY_PACKAGE_ID;
}

function asList(value) {
  if (Array.isArray(value)) {
    return value;
  }
  if (value === undefined || value === null || value === "") {
    return [];
  }
  return [value];
}

function normalizePathSegments(entry = {}) {
  const rawSegments = Array.isArray(entry.pathSegments)
    ? entry.pathSegments
    : normalizeText(entry.path || entry.categoryPath || entry.label).split("/");
  return rawSegments.map(normalizeText).filter(Boolean);
}

function uniqueStrings(values) {
  const seen = new Set();
  const output = [];
  for (const value of asList(values)) {
    const normalized = normalizeText(value);
    if (!normalized) {
      continue;
    }
    const key = normalized.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    output.push(normalized);
  }
  return output;
}

function normalizeDomain(value) {
  return normalizeText(value)
    .replace(/^@+/, "")
    .replace(/^https?:\/\//i, "")
    .replace(/\/.*$/, "")
    .toLowerCase();
}

function uniqueDomains(values) {
  return uniqueStrings(asList(values).map(normalizeDomain)).filter(Boolean);
}

function stableEntryId(pathSegments, index) {
  const key = pathSegments.join("/").toLowerCase() || `entry-${index + 1}`;
  return `vocab-${createHash("sha256").update(key).digest("hex").slice(0, 12)}`;
}

function normalizeEntry(entry = {}, index = 0) {
  const pathSegments = normalizePathSegments(entry);
  const status = LIFECYCLE_STATES.has(entry.status) ? entry.status : "active";
  const id = normalizeText(entry.id) || stableEntryId(pathSegments, index);

  return {
    id,
    pathSegments,
    label: normalizeText(entry.label) || pathSegments.at(-1) || `词条 ${index + 1}`,
    keywords: uniqueStrings(entry.keywords || entry.terms || []),
    domains: uniqueDomains(entry.domains || entry.emailDomains || []),
    status,
    notes: normalizeText(entry.notes)
  };
}

function checksumVocabulary(value) {
  const canonical = JSON.stringify({
    schemaVersion: EXPERT_VOCABULARY_SCHEMA_VERSION,
    entries: value.entries.map((entry) => ({
      pathSegments: entry.pathSegments,
      label: entry.label,
      keywords: entry.keywords,
      domains: entry.domains,
      status: entry.status,
      notes: entry.notes
    }))
  });
  return createHash("sha256").update(canonical).digest("hex");
}

function checksumKnowledgePackage(value) {
  const canonical = JSON.stringify({
    schemaVersion: KNOWLEDGE_PACKAGE_SCHEMA_VERSION,
    packageId: value.packageId,
    version: value.version,
    status: value.status,
    scope: value.scope,
    layers: value.layers,
    entries: value.entries.map((entry) => ({
      pathSegments: entry.pathSegments,
      label: entry.label,
      keywords: entry.keywords,
      domains: entry.domains,
      status: entry.status,
      notes: entry.notes
    })),
    parentVersion: value.parentVersion || 0,
    rollbackOf: value.rollbackOf || 0
  });
  return createHash("sha256").update(canonical).digest("hex");
}

function normalizeExpertVocabulary(value = {}, context = {}) {
  const entries = (value.entries || DEFAULT_EXPERT_VOCABULARY_ENTRIES)
    .map(normalizeEntry)
    .filter((entry) => entry.pathSegments.length > 0);
  const normalized = {
    schemaVersion: EXPERT_VOCABULARY_SCHEMA_VERSION,
    version: Math.max(1, Number(value.version || context.version || 1)),
    updatedAt: normalizeText(value.updatedAt || context.updatedAt),
    publishedAt: normalizeText(value.publishedAt || context.publishedAt || value.updatedAt),
    source: normalizeText(value.source || "macos-mail-index-taxonomy"),
    entries
  };
  return {
    ...normalized,
    checksum: checksumVocabulary(normalized)
  };
}

function normalizeScope(value = {}) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return {
    sourceKinds: uniqueStrings(source.sourceKinds || source.sourceKind || ["email"]),
    platforms: uniqueStrings(source.platforms || source.platform || ["desktop"]),
    domains: uniqueStrings(source.domains || source.domain || ["mail-index"]),
    appliesTo: uniqueStrings(source.appliesTo || ["mail-index", "knowledge-index"])
  };
}

function normalizeLayers(value = []) {
  const layers = Array.isArray(value) ? value : [];
  if (layers.length === 0) {
    return [
      {
        id: "baseline",
        label: "Built-in baseline",
        order: 0,
        source: "bundled-taxonomy"
      },
      {
        id: "server",
        label: "Server expert knowledge",
        order: 100,
        source: "server"
      }
    ];
  }
  return layers.map((layer, index) => ({
    id: normalizeText(layer?.id) || `layer-${index + 1}`,
    label: normalizeText(layer?.label) || normalizeText(layer?.id) || `Layer ${index + 1}`,
    order: Number(layer?.order ?? index),
    source: normalizeText(layer?.source || "")
  }));
}

function normalizeKnowledgePackage(value = {}, context = {}) {
  const now = normalizeText(context.updatedAt || value.updatedAt) || new Date().toISOString();
  const packageId = normalizePackageId(value.packageId || context.packageId);
  const entries = (value.entries || DEFAULT_EXPERT_VOCABULARY_ENTRIES)
    .map(normalizeEntry)
    .filter((entry) => entry.pathSegments.length > 0);
  const normalized = {
    schemaVersion: KNOWLEDGE_PACKAGE_SCHEMA_VERSION,
    packageId,
    version: Math.max(1, Number(value.version || context.version || 1)),
    status: PACKAGE_STATES.has(value.status) ? value.status : context.status || "draft",
    scope: normalizeScope(value.scope),
    layers: normalizeLayers(value.layers),
    entries,
    parentVersion: Math.max(0, Number(value.parentVersion || context.parentVersion || 0)),
    rollbackOf: Math.max(0, Number(value.rollbackOf || context.rollbackOf || 0)),
    createdBy: normalizeText(value.createdBy || context.createdBy),
    updatedAt: now,
    publishedAt: normalizeText(value.publishedAt || context.publishedAt),
    auditId: normalizeText(value.auditId || context.auditId)
  };
  return {
    ...normalized,
    checksum: checksumKnowledgePackage(normalized)
  };
}

function packageToVocabulary(pkg) {
  const vocabulary = normalizeExpertVocabulary({
    schemaVersion: EXPERT_VOCABULARY_SCHEMA_VERSION,
    version: pkg.version,
    updatedAt: pkg.updatedAt,
    publishedAt: pkg.publishedAt || pkg.updatedAt,
    source: pkg.packageId,
    entries: pkg.entries
  });
  return {
    ...vocabulary,
    checksum: pkg.checksum
  };
}

async function readJsonFile(filePath, fallback = null) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

async function writeJsonFile(filePath, value) {
  await atomicWriteJsonThroughState(filePath, value, {
    kind: "knowledge_package.write_json"
  });
}

function summarizePackage(pkg) {
  return {
    packageId: pkg.packageId,
    version: pkg.version,
    status: pkg.status,
    scope: pkg.scope,
    checksum: pkg.checksum,
    entryCount: pkg.entries.length,
    activeEntryCount: pkg.entries.filter((entry) => entry.status === "active").length,
    parentVersion: pkg.parentVersion || 0,
    rollbackOf: pkg.rollbackOf || 0,
    updatedAt: pkg.updatedAt,
    publishedAt: pkg.publishedAt || "",
    auditId: pkg.auditId || ""
  };
}

async function loadPackageManifest(userDataPath, packageId = DEFAULT_EXPERT_VOCABULARY_PACKAGE_ID) {
  return readJsonFile(getKnowledgePackageManifestPath(userDataPath, packageId), null);
}

async function savePackageManifest(userDataPath, packageId, patch = {}) {
  const manifestPath = getKnowledgePackageManifestPath(userDataPath, packageId);
  const current = (await readJsonFile(manifestPath, null)) || {
    schemaVersion: KNOWLEDGE_PACKAGE_SCHEMA_VERSION,
    packageId: normalizePackageId(packageId),
    activeVersion: 0,
    latestVersion: 0,
    versions: []
  };
  const versions = [...(current.versions || []), ...(patch.versions || [])];
  const deduped = new Map();
  for (const version of versions) {
    deduped.set(Number(version.version || 0), version);
  }
  const cleanPatch = Object.fromEntries(
    Object.entries(patch).filter(([, value]) => value !== undefined)
  );
  const manifest = {
    ...current,
    ...cleanPatch,
    schemaVersion: KNOWLEDGE_PACKAGE_SCHEMA_VERSION,
    packageId: normalizePackageId(packageId),
    versions: [...deduped.values()].sort((left, right) => Number(left.version) - Number(right.version)),
    updatedAt: new Date().toISOString()
  };
  await writeJsonFile(manifestPath, manifest);
  return manifest;
}

async function saveKnowledgePackageVersion(userDataPath, pkg, { makeActive = false } = {}) {
  const normalized = normalizeKnowledgePackage(pkg, pkg);
  await writeJsonFile(
    getKnowledgePackageVersionPath(userDataPath, normalized.packageId, normalized.version),
    normalized
  );
  const manifest = await savePackageManifest(userDataPath, normalized.packageId, {
    latestVersion: Math.max(
      Number((await loadPackageManifest(userDataPath, normalized.packageId))?.latestVersion || 0),
      normalized.version
    ),
    activeVersion: makeActive
      ? normalized.version
      : Number((await loadPackageManifest(userDataPath, normalized.packageId))?.activeVersion || 0),
    status: makeActive ? "active" : normalized.status,
    checksum: makeActive ? normalized.checksum : undefined,
    publishedAt: makeActive ? normalized.publishedAt || normalized.updatedAt : undefined,
    versions: [summarizePackage(normalized)]
  });
  return { package: normalized, manifest };
}

async function loadKnowledgePackageVersion(userDataPath, packageId, version) {
  const normalizedPackageId = normalizePackageId(packageId);
  const manifest = await loadPackageManifest(userDataPath, normalizedPackageId);
  const selectedVersion = Number(version || manifest?.activeVersion || manifest?.latestVersion || 1);
  const value = await readJsonFile(
    getKnowledgePackageVersionPath(userDataPath, normalizedPackageId, selectedVersion),
    null
  );
  if (!value) {
    return null;
  }
  return normalizeKnowledgePackage(value, value);
}

async function writeCompatibilityVocabulary(userDataPath, pkg) {
  const vocabulary = packageToVocabulary(pkg);
  await writeVocabularyFile(getExpertVocabularyPath(userDataPath), vocabulary);
  return vocabulary;
}

async function writeVocabularyFile(vocabularyPath, vocabulary) {
  await atomicWriteJsonThroughState(vocabularyPath, vocabulary, {
    kind: "knowledge_package.compat_vocabulary.write"
  });
}

async function ensureVocabularyFile(userDataPath) {
  const vocabularyPath = getExpertVocabularyPath(userDataPath);
  try {
    await fs.access(vocabularyPath);
  } catch {
    const now = new Date().toISOString();
    const seededVocabulary = normalizeExpertVocabulary(
      {
        entries: DEFAULT_EXPERT_VOCABULARY_ENTRIES,
        updatedAt: now,
        publishedAt: now
      },
      { version: 1 }
    );
    await writeVocabularyFile(vocabularyPath, seededVocabulary);
  }
  return vocabularyPath;
}

async function ensureDefaultKnowledgePackage(userDataPath) {
  const packageId = DEFAULT_EXPERT_VOCABULARY_PACKAGE_ID;
  const manifest = await loadPackageManifest(userDataPath, packageId);
  if (manifest?.activeVersion || manifest?.latestVersion) {
    return manifest;
  }

  const vocabularyPath = await ensureVocabularyFile(userDataPath);
  const rawVocabulary = await readJsonFile(vocabularyPath, null);
  const vocabulary = normalizeExpertVocabulary(rawVocabulary || {
    entries: DEFAULT_EXPERT_VOCABULARY_ENTRIES,
    updatedAt: new Date().toISOString(),
    publishedAt: new Date().toISOString()
  });
  const pkg = normalizeKnowledgePackage({
    packageId,
    version: vocabulary.version,
    status: "active",
    scope: {
      sourceKinds: ["email"],
      platforms: ["desktop"],
      domains: ["mail-index"],
      appliesTo: ["mail-index", "knowledge-index"]
    },
    layers: [
      { id: "baseline", label: "Built-in baseline", order: 0, source: "bundled-taxonomy" },
      { id: "server", label: "Server expert vocabulary", order: 100, source: "server" }
    ],
    entries: vocabulary.entries,
    updatedAt: vocabulary.updatedAt || new Date().toISOString(),
    publishedAt: vocabulary.publishedAt || vocabulary.updatedAt || new Date().toISOString()
  });
  await saveKnowledgePackageVersion(userDataPath, pkg, { makeActive: true });
  await writeCompatibilityVocabulary(userDataPath, pkg);
  return loadPackageManifest(userDataPath, packageId);
}

export async function loadExpertVocabulary(userDataPath) {
  await ensureDefaultKnowledgePackage(userDataPath);
  const pkg = await loadKnowledgePackageVersion(userDataPath, DEFAULT_EXPERT_VOCABULARY_PACKAGE_ID);
  if (pkg) {
    const vocabulary = packageToVocabulary(pkg);
    const vocabularyPath = await ensureVocabularyFile(userDataPath);
    const current = await readJsonFile(vocabularyPath, null);
    if (!current || current.checksum !== vocabulary.checksum) {
      await writeVocabularyFile(vocabularyPath, vocabulary);
    }
    return vocabulary;
  }

  const vocabularyPath = await ensureVocabularyFile(userDataPath);

  try {
    const content = await fs.readFile(vocabularyPath, "utf8");
    const parsed = JSON.parse(content);
    const normalized = normalizeExpertVocabulary(parsed);
    if (JSON.stringify(parsed) !== JSON.stringify(normalized)) {
      await writeVocabularyFile(vocabularyPath, normalized);
    }
    return normalized;
  } catch {
    const now = new Date().toISOString();
    const fallback = normalizeExpertVocabulary(
      {
        entries: DEFAULT_EXPERT_VOCABULARY_ENTRIES,
        updatedAt: now,
        publishedAt: now
      },
      { version: 1 }
    );
    await writeVocabularyFile(vocabularyPath, fallback);
    return fallback;
  }
}

export async function saveExpertVocabulary(userDataPath, incomingVocabulary) {
  return mutateState({
    key: knowledgePackageStateKey(userDataPath),
    kind: "knowledge_package.expert_vocabulary.save",
    metadata: { userDataPath },
    task: async () => {
  const vocabularyPath = await ensureVocabularyFile(userDataPath);
  const current = await loadExpertVocabulary(userDataPath);
  const now = new Date().toISOString();
  const next = normalizeExpertVocabulary(
    {
      ...current,
      ...(incomingVocabulary || {}),
      entries:
        incomingVocabulary?.entries === undefined
          ? current.entries
          : incomingVocabulary.entries,
      version: current.version + 1,
      updatedAt: now,
      publishedAt: now
    },
    { version: current.version + 1, updatedAt: now, publishedAt: now }
  );

  try {
    const previousContent = await fs.readFile(vocabularyPath, "utf8");
    const historyPath = path.join(
      getExpertVocabularyHistoryDirectory(userDataPath),
      `expert-vocabulary.v${current.version}.${Date.now()}.json`
    );
    await fs.mkdir(path.dirname(historyPath), { recursive: true });
    await atomicWriteFile(historyPath, previousContent, "utf8");
  } catch {
    // The first save has no previous version to archive.
  }

  const pkg = normalizeKnowledgePackage({
    packageId: DEFAULT_EXPERT_VOCABULARY_PACKAGE_ID,
    version: next.version,
    status: "active",
    scope: incomingVocabulary?.scope,
    layers: incomingVocabulary?.layers,
    entries: next.entries,
    parentVersion: current.version,
    updatedAt: now,
    publishedAt: now
  });
  await saveKnowledgePackageVersion(userDataPath, pkg, { makeActive: true });
  return writeCompatibilityVocabulary(userDataPath, pkg);
    }
  });
}

export async function getExpertVocabularySummary(userDataPath) {
  const vocabulary = await loadExpertVocabulary(userDataPath);
  return {
    path: getExpertVocabularyPath(userDataPath),
    schemaVersion: vocabulary.schemaVersion,
    version: vocabulary.version,
    updatedAt: vocabulary.updatedAt,
    publishedAt: vocabulary.publishedAt,
    checksum: vocabulary.checksum,
    entryCount: vocabulary.entries.length,
    activeEntryCount: vocabulary.entries.filter((entry) => entry.status === "active").length
  };
}

export async function listExpertVocabularyVersions(userDataPath) {
  await ensureDefaultKnowledgePackage(userDataPath);
  const current = await getExpertVocabularySummary(userDataPath);
  const manifest = await loadPackageManifest(userDataPath, DEFAULT_EXPERT_VOCABULARY_PACKAGE_ID);
  let history = [];
  try {
    const historyDirectory = getExpertVocabularyHistoryDirectory(userDataPath);
    const names = await fs.readdir(historyDirectory);
    history = names
      .filter((name) => name.endsWith(".json"))
      .sort()
      .reverse()
      .slice(0, 50)
      .map((name) => {
        const match = name.match(/\.v(\d+)\.(\d+)\.json$/);
        return {
          version: match ? Number(match[1]) : 0,
          archivedAt: match ? new Date(Number(match[2])).toISOString() : "",
          path: path.join(historyDirectory, name)
        };
      });
  } catch {
    history = [];
  }
  return {
    current,
    package: manifest || null,
    history
  };
}

export async function listKnowledgePackages(userDataPath) {
  await ensureDefaultKnowledgePackage(userDataPath);
  let names = [];
  try {
    names = await fs.readdir(getKnowledgePackagesDirectory(userDataPath));
  } catch {
    names = [];
  }
  const items = [];
  for (const name of names) {
    const manifest = await loadPackageManifest(userDataPath, name);
    if (!manifest) {
      continue;
    }
    const active = await loadKnowledgePackageVersion(userDataPath, name, manifest.activeVersion);
    items.push({
      ...manifest,
      active: active ? summarizePackage(active) : null
    });
  }
  return { items };
}

export async function getKnowledgePackage(userDataPath, input = {}) {
  await ensureDefaultKnowledgePackage(userDataPath);
  const packageId = normalizePackageId(input.packageId || input.id || DEFAULT_EXPERT_VOCABULARY_PACKAGE_ID);
  const manifest = await loadPackageManifest(userDataPath, packageId);
  const pkg = await loadKnowledgePackageVersion(userDataPath, packageId, input.version);
  if (!pkg) {
    return null;
  }
  return {
    manifest,
    package: pkg,
    vocabulary: packageId === DEFAULT_EXPERT_VOCABULARY_PACKAGE_ID ? packageToVocabulary(pkg) : null
  };
}

export async function createOrUpdateKnowledgePackage(userDataPath, input = {}, context = {}) {
  return mutateState({
    key: knowledgePackageStateKey(userDataPath),
    kind: "knowledge_package.create_or_update",
    metadata: { userDataPath },
    task: async () => {
  await ensureDefaultKnowledgePackage(userDataPath);
  const raw = input.package || input.value || input;
  const packageId = normalizePackageId(raw.packageId || input.packageId || input.id);
  const manifest = await loadPackageManifest(userDataPath, packageId);
  const latestVersion = Number(manifest?.latestVersion || 0);
  const now = new Date().toISOString();
  const pkg = normalizeKnowledgePackage(
    {
      ...raw,
      packageId,
      version: latestVersion + 1,
      status: raw.status || "draft",
      parentVersion: Number(manifest?.activeVersion || latestVersion || 0),
      updatedAt: now,
      createdBy: context.createdBy || raw.createdBy || "",
      auditId: context.auditId || raw.auditId || ""
    },
    { packageId, version: latestVersion + 1, updatedAt: now }
  );
  const saved = await saveKnowledgePackageVersion(userDataPath, pkg, { makeActive: pkg.status === "active" });
  if (pkg.status === "active" && packageId === DEFAULT_EXPERT_VOCABULARY_PACKAGE_ID) {
    await writeCompatibilityVocabulary(userDataPath, saved.package);
  }
  return {
    manifest: saved.manifest,
    package: saved.package
  };
    }
  });
}

export async function publishKnowledgePackage(userDataPath, input = {}, context = {}) {
  return mutateState({
    key: knowledgePackageStateKey(userDataPath),
    kind: "knowledge_package.publish",
    metadata: { userDataPath },
    task: async () => {
  await ensureDefaultKnowledgePackage(userDataPath);
  const packageId = normalizePackageId(input.packageId || input.id || DEFAULT_EXPERT_VOCABULARY_PACKAGE_ID);
  const current = await loadKnowledgePackageVersion(userDataPath, packageId, input.version);
  if (!current) {
    throw new Error(`知识包不存在：${packageId}`);
  }
  const now = new Date().toISOString();
  const pkg = normalizeKnowledgePackage(
    {
      ...current,
      status: "active",
      publishedAt: now,
      updatedAt: now,
      auditId: context.auditId || current.auditId || ""
    },
    current
  );
  const saved = await saveKnowledgePackageVersion(userDataPath, pkg, { makeActive: true });
  if (packageId === DEFAULT_EXPERT_VOCABULARY_PACKAGE_ID) {
    await writeCompatibilityVocabulary(userDataPath, saved.package);
  }
  return {
    manifest: saved.manifest,
    package: saved.package
  };
    }
  });
}

export async function rollbackKnowledgePackage(userDataPath, input = {}, context = {}) {
  return mutateState({
    key: knowledgePackageStateKey(userDataPath),
    kind: "knowledge_package.rollback",
    metadata: { userDataPath },
    task: async () => {
  await ensureDefaultKnowledgePackage(userDataPath);
  const packageId = normalizePackageId(input.packageId || input.id || DEFAULT_EXPERT_VOCABULARY_PACKAGE_ID);
  const manifest = await loadPackageManifest(userDataPath, packageId);
  const targetVersion = Number(input.version || input.targetVersion || 0);
  const target = await loadKnowledgePackageVersion(userDataPath, packageId, targetVersion);
  if (!target) {
    throw new Error(`知识包版本不存在：${packageId}@${targetVersion}`);
  }
  const nextVersion = Number(manifest?.latestVersion || target.version) + 1;
  const now = new Date().toISOString();
  const pkg = normalizeKnowledgePackage(
    {
      ...target,
      version: nextVersion,
      status: "active",
      parentVersion: Number(manifest?.activeVersion || 0),
      rollbackOf: target.version,
      updatedAt: now,
      publishedAt: now,
      auditId: context.auditId || target.auditId || ""
    },
    { packageId, version: nextVersion, updatedAt: now }
  );
  const saved = await saveKnowledgePackageVersion(userDataPath, pkg, { makeActive: true });
  if (packageId === DEFAULT_EXPERT_VOCABULARY_PACKAGE_ID) {
    await writeCompatibilityVocabulary(userDataPath, saved.package);
  }
  return {
    manifest: saved.manifest,
    package: saved.package
  };
    }
  });
}
