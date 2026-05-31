import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  TOOL_SKILL_MANAGEMENT_PROTOCOL_VERSION,
  createToolSkillManagementProvider
} from "../platform/specialized/capabilities/skills/tool-skill-management-provider.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

async function read(relativePath) {
  return fs.readFile(path.join(repoRoot, relativePath), "utf8");
}

const mcpAdapter = await read("server/platform/common/mcp/http-mcp-adapter.mjs");
for (const forbidden of [
  "toolManagementPlatform",
  ".runtime.executeTool",
  ".registry.resolveToolset",
  ".store.createGrant",
  ".store.authorizeRequest"
]) {
  assert.equal(
    mcpAdapter.includes(forbidden),
    false,
    `MCP adapter must not depend on Tool Management internals: ${forbidden}`
  );
}
for (const required of [
  "toolSkillManagementProvider.authorizeRequest",
  ".listVisibleTools",
  "toolSkillManagementProvider.executeTool",
  "toolSkillManagementProvider.resolveMcpWorkspaceInput",
  "toolSkillManagementProvider.publicMcpToolPayload",
  "toolSkillManagementProvider.createLocalMcpGrant",
  "toolSkillManagementProvider.markLocalMcpGrantUninstalled"
]) {
  assert.equal(
    mcpAdapter.includes(required),
    true,
    `MCP adapter must call Tool/Skill provider boundary: ${required}`
  );
}

const grants = [];
const updatedGrants = [];
const fakePlatform = {
  securityPermissions: {
    decisions: [],
    appendDecision(decision) {
      this.decisions.push(decision);
    }
  },
  catalog() {
    return {
      tools: [
        {
          id: "pact.knowledge.health",
          status: "active",
          requiredScopes: ["knowledge:read"],
          toolsets: ["pact.knowledge.read"],
          risk: "read_only"
        },
        {
          id: "pact.admin",
          status: "active",
          requiredScopes: ["knowledge:admin"],
          toolsets: ["pact.admin"],
          risk: "repair_write"
        }
      ]
    };
  },
  registry: {
    resolveToolset(input = {}) {
      return {
        toolsets: Array.isArray(input.toolsets) ? input.toolsets : [],
        requiredScopes: ["knowledge:read"],
        maxRisk: "safe_write"
      };
    },
    listToolsets() {
      return [
        { id: "pact.knowledge.read", grantable: true },
        { id: "pact.knowledge.write", grantable: true },
        { id: "pact.storage.read", grantable: true },
        { id: "pact.storage.write", grantable: true },
        { id: "pact.agent.workspace.read", grantable: true },
        { id: "pact.agent.workspace", grantable: true },
        { id: "pact.document.parse", grantable: true },
        { id: "pact.result.export", grantable: true },
        { id: "pact.jobs.read", grantable: true },
        { id: "pact.runtime.read", grantable: true },
        { id: "pact.repo.read", grantable: true }
      ];
    }
  },
  store: {
    authorizeRequest({ request, requiredScopes = [] } = {}) {
      return {
        ok: true,
        requiredScopes,
        grant: {
          id: "grant_1",
          label: "Verify grant",
          scopes: ["knowledge:read"],
          toolsets: ["pact.knowledge.read"],
          toolDeny: [],
          metadata: { maxRisk: "read_only", targets: ["codex"] }
        },
        sawApiKeyAlias: request.headers["x-pact-tool-token"] === "sat_test"
      };
    },
    createGrant(input = {}) {
      const grant = {
        id: input.id || `grant_${grants.length + 1}`,
        label: input.label || "",
        type: input.type || "machine",
        toolsets: input.toolsets || [],
        scopes: input.scopes || [],
        metadata: input.metadata || {},
        tokenPrefix: "sat_test",
        enabled: input.enabled !== false,
        createdAt: "2026-05-25T00:00:00.000Z",
        updatedAt: "2026-05-25T00:00:00.000Z"
      };
      grants.push(grant);
      return { grant, token: "sat_test_token" };
    },
    listGrants() {
      return grants;
    },
    updateGrant(id, patch = {}) {
      const grant = grants.find((item) => item.id === id);
      if (!grant) {
        return null;
      }
      Object.assign(grant, patch);
      updatedGrants.push(grant);
      return grant;
    },
    createMcpAuthorizationRequest(input = {}) {
      return { requestId: "mcp_auth_1", status: "pending", ...input };
    },
    listMcpAuthorizationRequests() {
      return [{ requestId: "mcp_auth_1", status: "pending" }];
    },
    resolveMcpAuthorizationRequest() {
      return true;
    }
  },
  runtime: {
    async executeTool({ toolId }) {
      if (toolId === "pact.agentWorkspace.list") {
        return {
          ok: true,
          status: 200,
          payload: {
            result: {
              workspaces: [{ workspaceId: "workspace_a", title: "Alpha" }]
            }
          }
        };
      }
      return { ok: true, status: 200, payload: { result: { ok: true, toolId } } };
    }
  },
  router: {
    async handleToolManagementHttpRequest() {
      return true;
    }
  }
};

const provider = createToolSkillManagementProvider({ toolManagementPlatform: fakePlatform });
assert.equal(provider.describe().protocolVersion, TOOL_SKILL_MANAGEMENT_PROTOCOL_VERSION);

const request = {
  headers: { "x-pact-api-key": "sat_test" },
  socket: { remoteAddress: "127.0.0.1" },
  __pactRequestId: "verify-tool-skill"
};
const authorization = await provider.authorizeRequest({ request });
assert.equal(authorization.ok, true);
assert.equal(authorization.sawApiKeyAlias, true);
assert.deepEqual(provider.visibleGrantSummary({ authorization }).toolsets, ["pact.knowledge.read"]);
assert.deepEqual(
  provider.listVisibleTools({ authorization }).map((tool) => tool.id),
  ["pact.knowledge.health"]
);

const execution = await provider.executeTool({
  toolId: "pact.knowledge.health",
  input: {},
  request,
  context: {}
});
assert.equal(execution.ok, true);
assert.equal(execution.payload.result.toolId, "pact.knowledge.health");

const resolvedInput = await provider.resolveMcpWorkspaceInput({
  input: { workspaceRef: "workspace-1" },
  request,
  context: {}
});
assert.equal(resolvedInput.input.workspaceId, "workspace_a");

const publicPayload = await provider.publicMcpToolPayload({
  payload: {
    workspaces: [{ workspaceId: "workspace_a", title: "Alpha" }],
    selected: {
      workspaceId: "workspace_a",
      absolutePath: "/home/private-user/private.txt"
    },
    cacheReceipt: {
      cacheKey: "workspace:workspace_a:notes",
      indexRoots: {
        "workspace:workspace_a": "cid:sha256:abc"
      }
    },
    metadata: {
      defaultAdminUserId: "grant_internal_admin",
      adminUserIds: ["grant_internal_admin"]
    }
  },
  request,
  context: {}
});
assert.equal(publicPayload.selected.workspaceRef, "workspace-1");
assert.equal(Object.prototype.hasOwnProperty.call(publicPayload.selected, "absolutePath"), false);
assert.equal(publicPayload.cacheReceipt.cacheKey, "workspace:workspace-1:notes");
assert.equal(publicPayload.cacheReceipt.indexRoots["workspace:workspace-1"], "cid:sha256:abc");
assert.equal(Object.prototype.hasOwnProperty.call(publicPayload.metadata, "defaultAdminUserId"), false);
assert.equal(JSON.stringify(publicPayload).includes("workspace_a"), false);
assert.equal(JSON.stringify(publicPayload).includes("grant_internal_admin"), false);

const localGrant = await provider.createLocalMcpGrant({
  request,
  requestBody: Buffer.from(JSON.stringify({ target: "codex", label: "Verify Codex" })),
  discoveryState: { serverId: "server_1", mcpIdentity: { keyId: "key_1" } },
  url: new URL("http://127.0.0.1/api/mcp/local-grant")
});
assert.equal(localGrant.status, 201);
assert.equal(localGrant.body.targetMatch.matched, true);
assert.equal(localGrant.body.grant.metadata.agentProfileId, "pact.mcp.codex");

const uninstall = await provider.markLocalMcpGrantUninstalled({
  request,
  requestBody: Buffer.from(JSON.stringify({ target: "codex" }))
});
assert.equal(uninstall.status, 200);
assert.equal(uninstall.body.updatedCount, 1);
assert.equal(updatedGrants[0].metadata.currentDeviceVisible, false);

assert.equal(provider.listMcpClientConnections({ offlineAfterSeconds: 300 }).length, 0);

console.log("tool-skill-management verification passed");
