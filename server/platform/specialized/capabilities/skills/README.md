# Shared Skill Management

`capabilities/skills` is the shared boundary for skill management.

Skill definitions, metadata, routing, profiles, dependency declarations, and lifecycle policies live here. Agents, maintenance tasks, and console workflows can use these skills only when their profile or workspace context explicitly enables them.

External or workspace-contributed skills must enter through the shared capability package lifecycle before they are installed or activated. The package manifest uses `pact.skill-registry.v1` and is governed with the same signature, dependency, compatibility, sandbox, approval, rollback, and deprecation checks as external tools.

Tool execution stays under `capabilities/tools/tool-management-core`.
