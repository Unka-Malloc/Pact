import path from "node:path";
import { pathToFileURL } from "node:url";
import { extractTextWithPaddleOcr } from "../modules/FileProcessor/FileNormalizer/OCR/paddle-ocr.mjs";
import {
  extractDocumentWithTika,
  extractTextWithTika,
  isTikaBackedDocument
} from "../modules/FileProcessor/FileNormalizer/Tika/tika.mjs";
import { createPdfProcessorMount } from "../modules/FileProcessor/FileNormalizer/PDFProcessor/index.mjs";
import { createKnowledgeCoreMount } from "../modules/KnowledgeCore/index.mjs";
import {
  CORE_MOUNT_NAMES,
  loadMountConfig,
  mergeMountRouting,
  normalizeMountModules,
  normalizeMountRouting
} from "./mount-config.mjs";

function normalizeProfile(value) {
  return value === "minimal" ? "minimal" : "default";
}

export function normalizeRuntimeOptions(runtimeOptions = {}) {
  const testHooks =
    runtimeOptions.testHooks && typeof runtimeOptions.testHooks === "object"
      ? {
          jobDelayMs: Number(runtimeOptions.testHooks.jobDelayMs || 0)
        }
      : {};

  return {
    profile: normalizeProfile(runtimeOptions.profile),
    cwd: runtimeOptions.cwd || process.cwd(),
    mountModules: normalizeMountModules(runtimeOptions.mountModules),
    mountRouting: normalizeMountRouting(runtimeOptions.mountRouting),
    testHooks
  };
}

function createNoopMount(kind, reason = "disabled") {
  return {
    id: `core/noop/${kind}`,
    kind,
    enabled: false,
    reason,
    supports() {
      return false;
    },
    async extractDocument() {
      return {
        parserId: `core/noop/${kind}`,
        text: "",
        metadata: {},
        embeddedDocuments: []
      };
    },
    async extractText() {
      return "";
    },
    async onBatchCompleted() {},
    async close() {}
  };
}

function createBuiltinOcrMount() {
  return {
    id: "builtin/paddleocr",
    kind: "ocr",
    enabled: true,
    async extractText(input) {
      return extractTextWithPaddleOcr(input);
    },
    async close() {}
  };
}

function createBuiltinDocumentParserMount() {
  return {
    id: "builtin/tika",
    kind: "documentParser",
    enabled: true,
    supports({ extension = "", mediaTypeHint = "" }) {
      return isTikaBackedDocument({ extension, mediaTypeHint });
    },
    async extractDocument(input) {
      return extractDocumentWithTika(input);
    },
    async extractText(input) {
      return extractTextWithTika(input);
    },
    async close() {}
  };
}

function createNoopBatchMount(kind) {
  return {
    id: `core/noop/${kind}`,
    kind,
    enabled: false,
    async onBatchCompleted() {},
    async close() {}
  };
}

function createMountFactories(userDataPath) {
  return {
    analysis: {
      builtinFactory: () => createNoopBatchMount("analysis"),
      minimalFactory: () => createNoopBatchMount("analysis"),
      fallbackFactory: () => createNoopBatchMount("analysis")
    },
    multimodalParser: {
      builtinFactory: () => createNoopMount("multimodalParser"),
      minimalFactory: () => createNoopMount("multimodalParser", "minimal-profile"),
      fallbackFactory: () => createNoopMount("multimodalParser")
    },
    ocr: {
      builtinFactory: createBuiltinOcrMount,
      minimalFactory: () => createNoopMount("ocr", "minimal-profile"),
      fallbackFactory: () => createNoopMount("ocr")
    },
    documentParser: {
      builtinFactory: createBuiltinDocumentParserMount,
      minimalFactory: () => createNoopMount("documentParser", "minimal-profile"),
      fallbackFactory: () => createNoopMount("documentParser")
    },
    pdfProcessor: {
      builtinFactory: createPdfProcessorMount,
      minimalFactory: () => createNoopMount("pdfProcessor", "minimal-profile"),
      fallbackFactory: () => createNoopMount("pdfProcessor")
    },
    knowledgeBase: {
      builtinFactory: () => createKnowledgeCoreMount({ userDataPath }),
      minimalFactory: () => createKnowledgeCoreMount({ userDataPath }),
      fallbackFactory: () => createNoopBatchMount("knowledgeBase")
    },
    vectorStore: {
      builtinFactory: () => createNoopBatchMount("vectorStore"),
      minimalFactory: () => createNoopBatchMount("vectorStore"),
      fallbackFactory: () => createNoopBatchMount("vectorStore")
    },
    graphStore: {
      builtinFactory: () => createNoopBatchMount("graphStore"),
      minimalFactory: () => createNoopBatchMount("graphStore"),
      fallbackFactory: () => createNoopBatchMount("graphStore")
    }
  };
}

function createDynamicMountFactories(mountName) {
  return {
    builtinFactory: () => createNoopMount(mountName),
    minimalFactory: () => createNoopMount(mountName, "minimal-profile"),
    fallbackFactory: () => createNoopMount(mountName)
  };
}

async function loadMountFromModule(modulePath, mountName, context, generation) {
  if (!modulePath) {
    return null;
  }

  const resolvedPath = path.isAbsolute(modulePath)
    ? modulePath
    : path.resolve(context.cwd || process.cwd(), modulePath);
  const moduleUrl = new URL(pathToFileURL(resolvedPath).href);
  moduleUrl.searchParams.set("mount_generation", String(generation));
  const loaded = await import(moduleUrl.href);
  const factory =
    loaded.createMount ||
    loaded.default ||
    loaded[`create${mountName.slice(0, 1).toUpperCase()}${mountName.slice(1)}Mount`];

  if (typeof factory === "function") {
    return factory({
      mountName,
      userDataPath: context.userDataPath,
      runtimeOptions: context.runtimeOptions
    });
  }

  if (loaded && typeof loaded === "object") {
    return loaded;
  }

  throw new Error(`挂载模块未导出可用工厂：${resolvedPath}`);
}

function normalizeMountedInstance(loaded, mountName) {
  return {
    enabled: loaded.enabled !== false,
    kind: mountName,
    supports: loaded.supports?.bind(loaded),
    extractDocument: loaded.extractDocument?.bind(loaded),
    extractText: loaded.extractText?.bind(loaded),
    onBatchCompleted: loaded.onBatchCompleted?.bind(loaded),
    reload: loaded.reload?.bind(loaded),
    close: loaded.close?.bind(loaded),
    ...loaded
  };
}

async function resolveMount({
  mountName,
  runtimeOptions,
  userDataPath,
  factories,
  generation
}) {
  const modulePath = runtimeOptions.mountModules[mountName];
  const loaded = await loadMountFromModule(modulePath, mountName, {
    userDataPath,
    runtimeOptions,
    cwd: runtimeOptions.cwd
  }, generation);

  if (loaded) {
    return normalizeMountedInstance(loaded, mountName);
  }

  if (runtimeOptions.profile === "minimal") {
    return (factories.minimalFactory || factories.fallbackFactory)();
  }

  return (factories.builtinFactory || factories.fallbackFactory)();
}

function listConfiguredMountNames(runtimeOptions = {}) {
  const configuredMounts = Object.keys(runtimeOptions.mountModules || {});
  const routedMounts = [
    ...Object.values(runtimeOptions.mountRouting?.kindRoutes || {}),
    ...Object.values(runtimeOptions.mountRouting?.extensionRoutes || {}),
    ...Object.values(runtimeOptions.mountRouting?.mediaTypeRoutes || {})
  ]
    .map((route) => String(route?.mountName || "").trim())
    .filter(Boolean);

  return [...new Set([...CORE_MOUNT_NAMES, ...configuredMounts, ...routedMounts])];
}

function buildPostCommitHooks(mounts) {
  return Object.entries(mounts || {})
    .filter(([, mount]) => typeof mount?.onBatchCompleted === "function")
    .map(([name, mount]) => ({
      name,
      execute: mount.onBatchCompleted.bind(mount)
    }));
}

async function closeMounts(mounts = {}) {
  await Promise.all(
    Object.values(mounts).map(async (mount) => {
      if (typeof mount?.close === "function") {
        await mount.close();
      }
    })
  );
}

export async function createMountManager({ userDataPath, runtimeOptions = {} }) {
  const normalizedRuntimeOptions = normalizeRuntimeOptions(runtimeOptions);
  const persistedMountConfig = await loadMountConfig(userDataPath);
  const initialRuntimeOptions = normalizeRuntimeOptions({
    ...normalizedRuntimeOptions,
    mountModules: {
      ...(persistedMountConfig.mountModules || {}),
      ...(normalizedRuntimeOptions.mountModules || {})
    },
    mountRouting: mergeMountRouting(
      persistedMountConfig.mountRouting || {},
      normalizedRuntimeOptions.mountRouting || {}
    )
  });

  const factories = createMountFactories(userDataPath);
  let currentRuntimeOptions = initialRuntimeOptions;
  let currentMounts = {};
  let generation = 0;
  let operationChain = Promise.resolve();

  function resolveDocumentRoute({ sourceKind = "", extension = "", mediaTypeHint = "" } = {}) {
    const normalizedExtension = String(extension || "").toLowerCase().trim();
    const normalizedMediaType = String(mediaTypeHint || "").toLowerCase().trim();
    const normalizedKind = String(sourceKind || "").trim();
    const routing = currentRuntimeOptions.mountRouting || {};
    const extensionRoute =
      normalizedExtension && routing.extensionRoutes?.[normalizedExtension]
        ? {
            ...routing.extensionRoutes[normalizedExtension],
            matchedBy: "extension"
          }
        : null;
    const mediaTypeRoute =
      normalizedMediaType && routing.mediaTypeRoutes?.[normalizedMediaType]
        ? {
            ...routing.mediaTypeRoutes[normalizedMediaType],
            matchedBy: "mediaType"
          }
        : null;
    const kindRoute = routing.kindRoutes?.[normalizedKind]
      ? {
          ...routing.kindRoutes[normalizedKind],
          matchedBy: "kind"
        }
      : null;

    return (
      extensionRoute ||
      mediaTypeRoute ||
      kindRoute ||
      {
        mountName: "documentParser",
        action: "extractDocument",
        matchedBy: "default"
      }
    );
  }

  function createExecutionView() {
    return {
      mounts: currentMounts,
      postCommitHooks: buildPostCommitHooks(currentMounts),
      runtimeOptions: currentRuntimeOptions,
      resolveDocumentRoute
    };
  }

  async function instantiateMounts(nextRuntimeOptions, settings) {
    const nextGeneration = generation + 1;
    const mountEntries = await Promise.all(
      listConfiguredMountNames(nextRuntimeOptions).map(async (mountName) => {
        const mountFactories = factories[mountName] || createDynamicMountFactories(mountName);
        const mount = await resolveMount({
          mountName,
          runtimeOptions: nextRuntimeOptions,
          userDataPath,
          factories: mountFactories,
          generation: nextGeneration
        });

        if (mount && typeof mount.reload === "function") {
          await mount.reload({
            settings,
            mountName,
            runtimeOptions: nextRuntimeOptions
          });
        }

        return [mountName, mount];
      })
    );

    return {
      generation: nextGeneration,
      mounts: Object.fromEntries(mountEntries)
    };
  }

  async function queueOperation(fn) {
    const run = async () => fn();
    operationChain = operationChain.then(run, run);
    return operationChain;
  }

  async function applyRuntimeOptions(nextRuntimeOptions, { settings } = {}) {
    return queueOperation(async () => {
      const normalizedNext = normalizeRuntimeOptions({
        ...currentRuntimeOptions,
        ...nextRuntimeOptions,
        mountModules: {
          ...(currentRuntimeOptions.mountModules || {}),
          ...((nextRuntimeOptions && nextRuntimeOptions.mountModules) || {})
        },
        mountRouting: mergeMountRouting(
          currentRuntimeOptions.mountRouting || {},
          (nextRuntimeOptions && nextRuntimeOptions.mountRouting) || {}
        )
      });

      const { generation: nextGeneration, mounts: nextMounts } = await instantiateMounts(
        normalizedNext,
        settings
      );
      const previousMounts = currentMounts;
      currentMounts = nextMounts;
      currentRuntimeOptions = normalizedNext;
      generation = nextGeneration;
      await closeMounts(previousMounts);
      return createExecutionView();
    });
  }

  async function refreshCurrentMounts({ settings } = {}) {
    return queueOperation(async () => {
      await Promise.all(
        Object.entries(currentMounts).map(async ([mountName, mount]) => {
          if (typeof mount?.reload === "function") {
            await mount.reload({
              settings,
              mountName,
              runtimeOptions: currentRuntimeOptions
            });
          }
        })
      );
      return createExecutionView();
    });
  }

  await applyRuntimeOptions(initialRuntimeOptions);

  return {
    get mounts() {
      return currentMounts;
    },
    get runtimeOptions() {
      return currentRuntimeOptions;
    },
    get generation() {
      return generation;
    },
    createExecutionView,
    async applyMountConfig({ mountModules = {}, mountRouting = {} } = {}, { settings } = {}) {
      return applyRuntimeOptions(
        {
          mountModules: normalizeMountModules(mountModules),
          mountRouting: normalizeMountRouting(mountRouting)
        },
        { settings }
      );
    },
    async reloadMounts({ settings } = {}) {
      return applyRuntimeOptions(
        {
          mountModules: {
            ...(currentRuntimeOptions.mountModules || {})
          }
        },
        { settings }
      );
    },
    async refreshMounts({ settings } = {}) {
      return refreshCurrentMounts({ settings });
    },
    async close() {
      await queueOperation(async () => {
        const mountsToClose = currentMounts;
        currentMounts = {};
        await closeMounts(mountsToClose);
      });
    }
  };
}
