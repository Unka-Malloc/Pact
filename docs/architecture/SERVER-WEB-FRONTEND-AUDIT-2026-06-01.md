# Server Web Frontend Architecture Audit (2026-06-01)

## Scope

This audit covers the current `server-web` Vue console implementation:

- `server-web/components`
- `server-web/composables`
- `server-web/views`
- `server-web/styles`
- `server-web/lib`
- `server-web/i18n`
- `server-web/router`
- `server-web/types`

The `CLIENT_*` documents describe the destructive desktop client refactor, not a direct replacement plan for the server console. For `server-web`, the active architectural boundary is `docs/Architecture.md`: the Vue console may enter the service layer only through `bridge`, `/api/*`, event subscriptions, and controlled download URLs; page-level UI should reuse shared components from `server-web/components/common.ts` before private per-view controls are added.

## Evidence Baseline

### Directory Risk Summary

| Directory | Files | Lines | Bridge Calls | `useConsole()` Calls | `v-html` | Browser DOM / Storage | `any` |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `server-web/composables` | 54 | 22664 | 119 | 8 | 0 | 72 | 25 |
| `server-web/styles` | 22 | 12348 | 0 | 0 | 0 | 0 | 0 |
| `server-web/views` | 21 | 8036 | 9 | 15 | 0 | 2 | 1 |
| `server-web/components` | 37 | 6932 | 18 | 0 | 1 | 10 | 2 |
| `server-web/lib` | 5 | 4428 | 2 | 0 | 0 | 7 | 0 |
| `server-web/i18n` | 1 | 1645 | 0 | 0 | 0 | 4 | 0 |

### Largest Files

| File | Lines | Notes |
| --- | ---: | --- |
| `server-web/composables/useConsole.ts` | 4485 | Global singleton, route/page state, bridge calls, DOM effects, auth, settings, jobs, knowledge, runtime, and admin actions are still concentrated here. |
| `server-web/lib/types.ts` | 2661 | Cross-domain frontend API type monolith. |
| `server-web/i18n/console.ts` | 1644 | All console copy plus DOM localization are coupled in one module. |
| `server-web/styles/features.css` | 1495 | Feature styling monolith. |
| `server-web/styles/components.css` | 1214 | Shared component styling monolith. |
| `server-web/lib/bridge.ts` | 1206 | One frontend API bridge for all domains. |
| `server-web/styles/views/debug-agent-explore.css` | 984 | View-specific stylesheet has grown into a feature module. |
| `server-web/composables/console-word-cloud-controller.ts` | 980 | Large domain controller with bridge effects and UI orchestration. |
| `server-web/composables/useWorkspacesConsole.ts` | 961 | Workspace page facade still depends on `useConsole()` and contains direct DOM feedback. |
| `server-web/views/admin/AgentPermissionsView.vue` | 913 | View mixes authorization governance bridge calls, form state, and presentation. |
| `server-web/views/KnowledgeView.vue` | 891 | View keeps document parsing/download bridge calls near template concerns. |
| `server-web/components/KnowledgeDistillationWorkbench.vue` | 860 | Component owns bridge calls, polling, model probing, confirmations, and presentation. |

### Direct Coupling Hotspots

Direct `useConsole()` callers:

- `server-web/views/DashboardView.vue`
- `server-web/views/FeedView.vue`
- `server-web/views/ApprovalFlowView.vue`
- `server-web/views/SourcesView.vue`
- `server-web/views/admin/AgentPermissionsView.vue`
- `server-web/views/admin/AgentConfigView.vue`
- `server-web/views/admin/JobsView.vue`
- `server-web/views/admin/LogsView.vue`
- `server-web/views/admin/StorageView.vue`
- `server-web/views/admin/ToolsView.vue`
- `server-web/views/admin/ModulesView.vue`
- `server-web/views/admin/OpsMonitorView.vue`
- `server-web/views/admin/ClientsView.vue`
- `server-web/views/admin/ContextManagementView.vue`
- `server-web/views/admin/MaintenanceAgentView.vue`
- `server-web/composables/useServerConsoleShell.ts`
- `server-web/composables/useKnowledgeViewConsole.ts`
- `server-web/composables/useDebugViewConsole.ts`
- `server-web/composables/useWorkspacesConsole.ts`

Direct `bridge.*` calls from view/component files:

- `server-web/components/KnowledgeDistillationWorkbench.vue` - 13 calls.
- `server-web/components/KnowledgeImportCard.vue` - 4 calls.
- `server-web/views/admin/ProductionHealthView.vue` - 3 calls.
- `server-web/views/admin/AgentPermissionsView.vue` - 2 calls.
- `server-web/views/KnowledgeView.vue` - 2 calls.
- `server-web/views/admin/RuntimeDownloadsView.vue` - 2 calls.
- `server-web/components/BridgeDownloadButton.vue` - 1 allowed component-level bridge boundary for controlled downloads.

`v-html` sites:

- `server-web/components/SafeHtmlBlock.vue`

Page-level HTML rendering now goes through `SafeHtmlBlock`, which requires callers to declare whether the content came from `markdownToSafeHtml` or `renderEvidenceReadableHtml`. The remaining `v-html` surface is therefore a single explicit rendering boundary instead of duplicated page-level trust assumptions.

## P0 Issues

### P0-1: `useConsole.ts` is still the cross-page frontend runtime

`useConsole.ts` remains the central state/effect container for unrelated pages and admin sections. It exposes route state, auth, jobs, settings, runtime mounts, knowledge management, maintenance, OAuth, browser effects, and admin actions from one 4485-line singleton. This blocks low coupling because view-level changes can accidentally bind to unrelated console state.

Required direction:

- Keep `useConsole()` temporarily as a compatibility shell only.
- Move page/domain state into cohesive controllers or contexts: shell, auth, jobs, settings/model library, runtime modules/downloads, production health, knowledge management, knowledge distillation, workspaces, debug, and admin permissions.
- Leaf views should consume narrow route/domain contexts, not import `useConsole()` directly.
- New extraction should reduce public return size and remove one caller group at a time.

### P0-2: UI files call `bridge` directly instead of domain controllers

Several views/components hold service calls in presentation files, especially `KnowledgeDistillationWorkbench.vue`, `AgentPermissionsView.vue`, `ProductionHealthView.vue`, `RuntimeDownloadsView.vue`, `KnowledgeView.vue`, and `KnowledgeImportCard.vue`. This creates view-to-service coupling and makes loading/error/retry behavior inconsistent.

Required direction:

- Move direct bridge calls into domain composables or `server-web/lib/*` domain clients.
- Components should receive callbacks/state or use feature controllers.
- Keep `BridgeDownloadButton.vue` as the exception for the already-standardized controlled download bridge.

### P0-3: Large feature components mix rendering, workflow state, and side effects

`KnowledgeDistillationWorkbench.vue`, `AgentPermissionsView.vue`, `KnowledgeView.vue`, `WorkspacesView.vue`, `FeedView.vue`, and `UploadFileListCard.vue` are too large for stable iteration. They contain template complexity plus side effects, polling, form state, or workflow state.

Required direction:

- Split feature state and async operations into composables.
- Split repeated visual regions into focused child components only when the child has a clear domain responsibility.
- Keep UI components declarative: props, emits, and simple local visual state.

### P0-4: Styling is globally large and hard to reason about

The CSS layer has multiple monolithic files: `features.css`, `components.css`, `themes.css`, `layout.css`, and large view styles. This makes visual fixes risky because selectors can have hidden cross-page effects.

Required direction:

- Split styles by token/shared primitive/view module.
- Move repeated component primitives into shared component classes or component-local CSS.
- Keep view-specific selectors under clear route namespaces.
- Avoid broad restyling until ownership boundaries are split.

### P0-5: Frontend API and type contracts are monolithic

`server-web/lib/bridge.ts` and `server-web/lib/types.ts` span most domains. This makes it difficult to reason about which page owns which backend contract.

Required direction:

- Introduce domain bridge/type modules behind the existing `bridge` compatibility export.
- Start with domains already targeted by UI extractions: knowledge distillation, authorization governance, runtime downloads, production health, and document import/export.
- Keep external call signatures stable while moving implementation and types into cohesive files.

## P1 Issues

### P1-1: Safe HTML rendering boundary is now centralized

Feed summaries, debug answers, and evidence previews now use `SafeHtmlBlock`. The component preserves existing sanitized and sandboxed renderer output while making the source contract explicit at each call site.

Remaining direction:

- Move from string props to typed render results if the renderer layer grows beyond the current `markdownToSafeHtml` and `renderEvidenceReadableHtml` sources.
- Move CSS class ownership into the component where possible after the evidence/feed styles are split.

### P1-2: Browser effects are scattered

`window`, `document`, local storage, timers, DOM query/highlight, clipboard, direct bubbles, and confirms are spread across controllers and views.

Required direction:

- Move common browser effects into small utilities: confirmation, toast/inline feedback, DOM highlight, clipboard/download, timers/polling.
- Keep per-feature controllers responsible for workflow decisions, not raw DOM manipulation.

### P1-3: Route contexts exist but are not consistently used

`serverConsoleShellContext.ts`, `knowledgeViewContext.ts`, and `workspacesViewContext.ts` are present, but many views still import `useConsole()` directly.

Required direction:

- Use route-level providers as the default way to pass shell/page state.
- Add missing admin/debug contexts where the page has multiple child views.
- Remove direct `useConsole()` imports from views as each domain facade is extracted.

### P1-4: Type looseness remains in shared utilities

`any` appears in `useWorkspacesConsole.ts`, word-cloud utilities, model utilities, table header drag events, and selected knowledge recall paths.

Required direction:

- Replace generic `any` with domain types from split type modules.
- Keep `DataTable.vue` generic only where the component boundary genuinely requires it.

### P1-5: `i18n/console.ts` mixes catalog data and DOM localization runtime

The file is 1644 lines and owns both text catalogs and DOM mutation/localization behavior.

Required direction:

- Split catalog files by shell, admin, knowledge, debug, workspaces, and common actions.
- Move DOM localization install/runtime into a separate module.

## P2 Issues

### P2-1: Shared component registry is underused as an enforcement point

The architecture document requires new UI controls to start from `server-web/components/common.ts`, but view files still accumulate private variants.

Required direction:

- Expand `commonComponentRegistry` as reusable controls are cleaned.
- Add documentation or a lightweight verifier for new duplicated controls after the initial refactor.

### P2-2: Repeated list/table/filter patterns need consolidation

Admin pages and knowledge/workspace pages repeat status rows, filter chips, empty states, and action bars.

Required direction:

- Standardize small UI primitives after P0 ownership splits.
- Do not prematurely abstract until the domain controllers are separated.

### P2-3: Frontend architecture verification is only indirect

Existing server architecture verifiers protect backend boundaries, but there is no dedicated frontend architecture check for direct `useConsole()` imports, direct `bridge` calls in views, or unsafe HTML boundaries.

Required direction:

- Add a frontend architecture verifier after the first wave of violations is reduced enough to make the rule meaningful.
- Initially allowlist remaining debt explicitly, then burn the allowlist down.

## Execution Order

1. P0-1: Start reducing `useConsole()` as the global frontend runtime. First target should be a page/domain with clear ownership and direct bridge leakage, so the extraction reduces both singleton size and UI/service coupling.
2. P0-2: Remove direct `bridge.*` calls from views/components, prioritizing `KnowledgeDistillationWorkbench.vue`, `AgentPermissionsView.vue`, `ProductionHealthView.vue`, `RuntimeDownloadsView.vue`, and `KnowledgeView.vue`.
3. P0-3: Split large feature components after their async operations move out.
4. P0-5: Split `bridge.ts` and `types.ts` by domains touched by the UI extractions.
5. P0-4: Split CSS ownership once component/domain boundaries are clearer.
6. P1: Make safe HTML, browser effects, route contexts, types, and i18n boundaries explicit.
7. P2: Add frontend architecture verifier and polish repeated UI primitives.

## Verification Gates

For frontend-only refactors:

```bash
npm run build:renderer
```

For architecture-affecting refactors:

```bash
npm run server:verify:architecture-patterns
npm run server:verify:knowledge-architecture-governance
npm run server:verify:platform-layout
npm run server:verify:tool-management
npm run server:verify:agent-workspace
```

For rendered UI changes, run a browser smoke on the affected route after the build/type gate passes.
