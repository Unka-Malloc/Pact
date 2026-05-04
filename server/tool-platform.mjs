import path from "node:path";
import { SERVER_API_OPERATIONS } from "./interfaces/api/operation-registry.mjs";
import {
  TOOL_MANAGEMENT_SCOPES,
  createToolManagementPlatform,
  getToolManagementDatabasePath,
  legacyToolPlatformTools
} from "./tool-management/index.mjs";
import { createToolCatalogRegistry, scopesToToolsets } from "./tool-management/catalog.mjs";
import { createToolManagementStore } from "./tool-management/store.mjs";

const staticRegistry = createToolCatalogRegistry({ operations: SERVER_API_OPERATIONS });

export const TOOL_PLATFORM_SCOPES = TOOL_MANAGEMENT_SCOPES;
export const TOOL_PLATFORM_TOOLS = legacyToolPlatformTools(SERVER_API_OPERATIONS);

export function getToolPlatformPath(userDataPath) {
  return path.join(userDataPath, "tool-management", "tool-management.sqlite");
}

function stateFromStore(store, { includePath = "" } = {}) {
  const catalog = staticRegistry.getCatalog();
  return {
    ...(includePath ? { path: includePath } : {}),
    schemaVersion: 2,
    updatedAt: catalog.generatedAt,
    scopes: TOOL_MANAGEMENT_SCOPES,
    toolsets: staticRegistry.listToolsets(),
    profiles: staticRegistry.listProfiles(),
    tools: legacyToolPlatformTools(SERVER_API_OPERATIONS),
    grants: store.listGrants(),
    storage: {
      engine: "sqlite",
      path: includePath
    },
    catalogFingerprint: catalog.fingerprint
  };
}

export async function loadToolPlatform(userDataPath) {
  const store = createToolManagementStore({ userDataPath });
  try {
    return stateFromStore(store, { includePath: getToolManagementDatabasePath(userDataPath) });
  } finally {
    store.close();
  }
}

export async function createToolGrant(userDataPath, input = {}) {
  const store = createToolManagementStore({ userDataPath });
  try {
    const result = store.createGrant({
      ...input,
      toolsets: input.toolsets || scopesToToolsets(input.scopes || [])
    });
    return {
      state: stateFromStore(store, { includePath: getToolManagementDatabasePath(userDataPath) }),
      grant: result.grant,
      token: result.token
    };
  } finally {
    store.close();
  }
}

export async function updateToolGrant(userDataPath, grantId, patch = {}) {
  const store = createToolManagementStore({ userDataPath });
  try {
    const grant = store.updateGrant(grantId, {
      ...patch,
      toolsets: patch.toolsets || (patch.scopes ? scopesToToolsets(patch.scopes) : undefined)
    });
    if (!grant) {
      return null;
    }
    return stateFromStore(store, { includePath: getToolManagementDatabasePath(userDataPath) });
  } finally {
    store.close();
  }
}

export async function deleteToolGrant(userDataPath, grantId) {
  const store = createToolManagementStore({ userDataPath });
  try {
    const deleted = store.deleteGrant(grantId);
    if (!deleted) {
      return null;
    }
    return stateFromStore(store, { includePath: getToolManagementDatabasePath(userDataPath) });
  } finally {
    store.close();
  }
}

export async function rotateToolGrantToken(userDataPath, grantId) {
  const store = createToolManagementStore({ userDataPath });
  try {
    const result = store.rotateGrantToken(grantId);
    if (!result) {
      return null;
    }
    return {
      state: stateFromStore(store, { includePath: getToolManagementDatabasePath(userDataPath) }),
      grant: result.grant,
      token: result.token
    };
  } finally {
    store.close();
  }
}

export async function authorizeAgentToolRequest({
  userDataPath,
  request,
  requiredScopes = []
}) {
  if (request?.__splitallToolRuntimeAuthorization?.ok) {
    const authorization = request.__splitallToolRuntimeAuthorization;
    const scopes = Array.isArray(requiredScopes) ? requiredScopes : [];
    const missingScopes = scopes.filter((scope) => !authorization.grant?.scopes?.includes(scope));
    if (missingScopes.length > 0) {
      return {
        ok: false,
        status: 403,
        error: `工具权限不足：${missingScopes.join(", ")}。`,
        grant: authorization.grant
      };
    }
    return authorization;
  }

  const store = createToolManagementStore({ userDataPath });
  try {
    return store.authorizeRequest({ request, requiredScopes });
  } finally {
    store.close();
  }
}

export { createToolManagementPlatform };
