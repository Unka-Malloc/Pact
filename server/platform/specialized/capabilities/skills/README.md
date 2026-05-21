# Shared Skill Management

`capabilities/skills` is the shared boundary for skill management.

Skill definitions, metadata, routing, profiles, dependency declarations, and lifecycle policies live here. Agents, maintenance tasks, and console workflows can use these skills only when their profile or workspace context explicitly enables them.

Tool execution stays under `capabilities/tools/tool-management-core`.
