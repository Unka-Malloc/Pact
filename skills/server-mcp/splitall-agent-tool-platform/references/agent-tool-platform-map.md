# Agent Tool Platform Map

Implementation:

- `server/platform/specialized/capabilities/tools/tool-management-core/catalog.mjs`
- `server/platform/specialized/capabilities/tools/tool-management-core/store.mjs`
- `server/platform/specialized/capabilities/tools/tool-management-core/policy.mjs`
- `server/platform/specialized/capabilities/tools/tool-management-core/runtime.mjs`
- `server/platform/specialized/capabilities/tools/tool-management-core/http.mjs`
- `server/config/entity-config/tools/{scopes,toolsets,profiles}/`
- `server/platform/specialized/capabilities/skills/README.md` is the sibling shared skill-management boundary.
- Legacy `/api/tool-platform/*` and `/api/agent-tools/*` are removed; verify scripts expect 404.

Scopes:

- `knowledge:read`
- `knowledge:write`
- `knowledge:maintain`
- `knowledge:admin`
- `storage:read`
- `jobs:read`
- `agent_sync:publish`

Primary APIs:

- `GET /api/tool-management/v1/catalog`
- `GET /api/tool-management/v1/catalog/:toolId`
- `GET /api/tool-management/v1/toolsets`
- `POST /api/tool-management/v1/toolsets/resolve`
- `GET /api/tool-management/v1/profiles`
- `POST /api/tool-management/v1/policy/evaluate`
- `POST /api/tool-management/v1/policy/preview`
- `POST /api/tool-management/v1/execute`
- `POST /api/tool-management/v1/dry-run`
- `POST /api/tool-management/v1/batch`
- `GET /api/tool-management/v1/grants`
- `POST /api/tool-management/v1/grants`
- `POST /api/tool-management/v1/grants/:grantId`
- `POST /api/tool-management/v1/grants/:grantId/rotate`
- `POST /api/tool-management/v1/grants/:grantId/revoke`
- `GET /api/tool-management/v1/audit`
- `GET /api/tool-management/v1/audit/:toolExecutionId`
- `GET /api/tool-management/v1/metrics/summary`
- `GET /api/tool-management/v1/events`

Toolsets:

- `splitall.knowledge.read`
- `splitall.knowledge.write`
- `splitall.knowledge.maintain`
- `splitall.knowledge.admin`
- `splitall.storage.read`
- `splitall.jobs.read`
- `splitall.document.parse`
- `splitall.document.convert`
- `splitall.mail.import`
- `splitall.result.export`
- `splitall.agent.workspace`
- `splitall.agent.sync.publish`
- `splitall.runtime.read`
- `splitall.runtime.maintain`
- `splitall.mount.dev`
- `splitall.admin`

Example tools:

- `splitall.storageSummary`
- `splitall.jobs.list`
- `splitall.jobs.get`
- `splitall.knowledge.affairTaxonomy`
- `splitall.knowledge.search`
- `splitall.knowledge.documentStructure`
- `splitall.knowledge.evidence`
- `splitall.knowledge.renderMarkdown`
- `splitall.knowledge.agentSkill`
- `splitall.knowledge.agentSkill.plan`
- `splitall.knowledge.agentSkill.run`
- `splitall.knowledge.skills.list`
- `splitall.knowledge.skills.get`
- `splitall.knowledge.skills.generate`
- `splitall.knowledge.skills.propose`
- `splitall.knowledge.skills.resolve`
- `splitall.knowledge.skillFramework`
- `splitall.knowledge.skills.evaluation.runs.create`
- `splitall.knowledge.skills.deployments.create`
- `splitall.knowledge.skills.deployments.rollback`
- `splitall.knowledge.health`
- `agent-exploration.keyword_search`
- `agent-exploration.knowledge_skill_search`
- `agent-exploration.knowledge_skill_propose`
- `maintenance-agent.storage.doctor`

Authentication:

- Console catalog/grant/audit/metrics routes use Console auth and RBAC.
- Use bearer token or `x-splitall-tool-token`.
- Grants are stored in `<userDataPath>/tool-management/tool-management.sqlite`.
- Token plaintext is returned only on create or rotate; store only hashes.
- Rotate or revoke tokens instead of editing token values manually.
- Grant changes require `x-splitall-safety-confirm: true` from console/CLI callers.
- Grant tokens execute tools through `/api/tool-management/v1/execute`, `/dry-run`, or `/batch`; they must not be used as direct Console API credentials.
