# Shared Skill Management

`capabilities/skills` is the shared boundary for skill management and the
Tool/Skill provider.

Skill definitions, metadata, routing, profiles, dependency declarations, and lifecycle policies live here. Agents, maintenance tasks, and console workflows can use these skills only when their profile or workspace context explicitly enables them.

External or workspace-contributed skills must enter through the shared capability package lifecycle before they are installed or activated. The package manifest uses `pact.skill-registry.v1` and is governed with the same signature, dependency, compatibility, sandbox, approval, rollback, and deprecation checks as external tools.

`tool-skill-management-provider.mjs` exposes `pact.tool-skill-management.v1`.
MCP adapters and console workflows must use that provider for capability
discovery, grant authorization, local MCP grant issuance, workspace reference
projection, output sanitization, and tool execution instead of directly touching
Tool Management `registry`, `store`, `runtime`, or `router`.

Tool execution internals stay under `capabilities/tools/tool-management-core`.
