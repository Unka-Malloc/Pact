const COMMON_PLATFORMS = new Set([
  "core",
  "security",
  "module-management",
  "data-structure",
  "storage",
  "devops"
]);
const PLATFORM_LAYERS = Object.freeze({
  COMMON: "common"
});

function normalizeId(value, label) {
  const normalized = String(value || "").trim();
  if (!normalized) {
    throw new Error(`Platform registry ${label} is required.`);
  }
  return normalized;
}

export function createPlatformRegistry({ scope = "server" } = {}) {
  const entries = new Map();

  function layerForPlatform(platform) {
    if (COMMON_PLATFORMS.has(platform)) {
      return PLATFORM_LAYERS.COMMON;
    }
    throw new Error(`Platform interactive registry only accepts bottom platform interfaces: ${platform}`);
  }

  function register(entry = {}) {
    const platform = normalizeId(entry.platform, "platform");
    const id = normalizeId(entry.id, "id");
    const layer = entry.layer ? normalizeId(entry.layer, "layer") : layerForPlatform(platform);
    if (layer !== layerForPlatform(platform)) {
      throw new Error(`Platform interface ${id} has inconsistent layer ${layer} for platform ${platform}`);
    }
    if (entries.has(id)) {
      throw new Error(`Duplicate platform registration: ${id}`);
    }
    const record = Object.freeze({
      id,
      platform,
      layer,
      label: String(entry.label || id),
      kind: String(entry.kind || "service"),
      ownerFeatureId: String(entry.ownerFeatureId || `${platform}-platform`),
      public: entry.public !== false,
      value: entry.value,
      metadata: Object.freeze({ ...(entry.metadata || {}) })
    });
    entries.set(id, record);
    return record;
  }

  function get(id) {
    return entries.get(String(id || "").trim()) || null;
  }

  function requireInterface(id) {
    const record = get(id);
    if (!record) {
      throw new Error(`Missing platform registration: ${id}`);
    }
    return record;
  }

  async function callInterface(id, ...args) {
    const record = requireInterface(id);
    if (typeof record.value === "function") {
      return record.value(...args);
    }
    if (record.value && typeof record.value.handle === "function") {
      return record.value.handle(...args);
    }
    throw new Error(`Platform interface is not callable: ${id}`);
  }

  function list({ platform = "", layer = "" } = {}) {
    return [...entries.values()]
      .filter((entry) => !platform || entry.platform === platform)
      .filter((entry) => !layer || entry.layer === layer)
      .map((entry) => ({
        id: entry.id,
        platform: entry.platform,
        layer: entry.layer,
        label: entry.label,
        kind: entry.kind,
        ownerFeatureId: entry.ownerFeatureId,
        public: entry.public,
        metadata: entry.metadata
      }));
  }

  return Object.freeze({
    scope: String(scope || "server"),
    register,
    get,
    require: requireInterface,
    requireInterface,
    callInterface,
    list
  });
}

export function registerPlatformService(registry, entry) {
  if (!registry || typeof registry.register !== "function") {
    throw new Error("A PlatformRegistry instance is required.");
  }
  return registry.register(entry);
}

export function requirePlatformInterface(registry, id) {
  if (!registry || typeof registry.requireInterface !== "function") {
    throw new Error("A PlatformInteractiveRegistry instance is required.");
  }
  return registry.requireInterface(id);
}

export function callPlatformInterface(registry, id, ...args) {
  if (!registry || typeof registry.callInterface !== "function") {
    throw new Error("A PlatformInteractiveRegistry instance is required.");
  }
  return registry.callInterface(id, ...args);
}
