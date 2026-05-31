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
| `server-web/composables` | 58 | 23012 | 121 | 5 | 0 | 108 | 25 |
| `server-web/styles` | 22 | 12326 | 0 | 0 | 0 | 100 | 0 |
| `server-web/views` | 21 | 6513 | 0 | 0 | 0 | 4 | 1 |
| `server-web/components` | 41 | 7821 | 1 | 0 | 1 | 21 | 2 |
| `server-web/lib` | 10 | 5081 | 25 | 0 | 0 | 12 | 0 |
| `server-web/i18n` | 1 | 1644 | 0 | 0 | 0 | 5 | 0 |

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
| `server-web/composables/useWorkspacesConsole.ts` | 961 | Workspace page facade now consumes shell context, but still contains direct DOM feedback and loose workspace payload typing. |
| `server-web/styles/views/word-cloud.css` | 922 | Word cloud view styling is a large feature stylesheet. |
| `server-web/styles/themes.css` | 876 | Theme and token ownership remain broad. |
| `server-web/composables/console-info-feed-utils.ts` | 852 | Feed utilities mix formatting, filtering, and presentation helpers. |
| `server-web/composables/useKnowledgeViewConsole.ts` | 817 | Knowledge page facade still aggregates maintenance, rules, library, ingest, and word cloud state. |
| `server-web/composables/console-model-library-controller.ts` | 812 | Model-library controller remains broad. |
| `server-web/composables/console-agent-explore-session-controller.ts` | 687 | Agent explore session controller still combines history/session orchestration. |
| `server-web/styles/views/knowledge-sources.css` | 685 | Knowledge source styling remains broad. |
| `server-web/components/UploadFileListCard.vue` | 685 | Upload component no longer owns file-entry normalization or progress derivation, but still combines upload/download rendering and scoped styles. |
| `server-web/components/KnowledgeDistillationWorkbench.vue` | 675 | Component no longer owns bridge calls, run normalization, or model probe plumbing, but still has a large template. |
| `server-web/views/KnowledgeView.vue` | 667 | Ingest has been split out, but source review, evidence, rules, library, and word cloud composition still share one route template. |
| `server-web/composables/console-info-feed-controller.ts` | 664 | Feed controller still owns execution, form state, history, and output coordination. |
| `server-web/styles/layout.css` | 659 | Shared layout selectors remain broad and can influence unrelated routes. |
| `server-web/styles/views/info-feed-flow.css` | 658 | Feed route styling is still a large feature stylesheet. |
| `server-web/styles/views/admin-runtime-tools.css` | 638 | Admin runtime/tool styling remains broad. |
| `server-web/views/admin/ProductionHealthView.vue` | 630 | Production health route still combines multiple report panels and release-readiness sections. |

### Direct Coupling Hotspots

Direct `useConsole()` callers:

- `server-web/composables/useServerConsoleShell.ts`

Leaf view direct `useConsole()` callers are now zero. Page facades and feature controllers consume `serverConsoleShellContext`, `knowledgeViewContext`, `workspacesViewContext`, or feature controllers. The only remaining external caller is the shell compatibility boundary, enforced by `npm run server:verify:frontend-architecture`.

Direct `bridge.*` calls from view/component files:

- `server-web/components/BridgeDownloadButton.vue` - 1 allowed component-level bridge boundary for controlled downloads.

`v-html` sites:

- `server-web/components/SafeHtmlBlock.vue`

Page-level HTML rendering now goes through `SafeHtmlBlock`, which requires callers to declare whether the content came from `markdownToSafeHtml` or `renderEvidenceReadableHtml`. The remaining `v-html` surface is therefore a single explicit rendering boundary instead of duplicated page-level trust assumptions.

## P0 Issues

### P0-1: `useConsole.ts` is still the cross-page frontend runtime

`useConsole.ts` remains the central state/effect container for unrelated pages and admin sections. It exposes route state, auth, jobs, settings, runtime mounts, knowledge management, maintenance, OAuth, browser effects, and admin actions from one 4485-line singleton. Leaf views and page facades no longer call it directly, but `useServerConsoleShell.ts` still spreads the full compatibility singleton into route context, so the public surface is still too broad.

Required direction:

- Keep `useConsole()` temporarily as a compatibility shell only.
- Move page/domain state into cohesive controllers or contexts: shell, auth, jobs, settings/model library, runtime modules/downloads, production health, knowledge management, knowledge distillation, workspaces, debug, and admin permissions.
- Leaf views should continue consuming route/domain contexts, not import `useConsole()` directly.
- The next extraction wave should replace the broad `...consoleContext` shell spread with narrower admin/feed/approval/source contexts.

### P0-2: UI files call `bridge` directly instead of domain controllers

The remaining view/component bridge call is `BridgeDownloadButton.vue`, which is the controlled download exception. `KnowledgeDistillationWorkbench.vue`, `AgentPermissionsView.vue`, `RuntimeDownloadsView.vue`, `ProductionHealthView.vue`, `KnowledgeView.vue`, and `KnowledgeImportCard.vue` have been moved behind domain/helper modules, which should be the pattern for future direct callers.

Required direction:

- Move direct bridge calls into domain composables or `server-web/lib/*` domain clients.
- Components should receive callbacks/state or use feature controllers.
- Keep `BridgeDownloadButton.vue` as the exception for the already-standardized controlled download bridge.

### P0-3: Large feature components mix rendering, workflow state, and side effects

`KnowledgeDistillationWorkbench.vue`, `KnowledgeView.vue`, `FeedView.vue`, `UploadFileListCard.vue`, `ProductionHealthView.vue`, and `WorkspaceExpandedDetail.vue` are still large enough to make stable iteration hard. The debug page distillation workflow has been moved out of `useDebugViewConsole.ts`, KnowledgeView's ingest panel has been split into `KnowledgeIngestPanel.vue`, WorkspacesView's right-side action/detail panel has been split into `WorkspaceDetailPanel.vue`, FeedView's composer/advanced-options area has been split into `InfoFeedComposerPanel.vue`, UploadFileListCard's pure file/progress derivation has been moved to `upload-file-list.ts`, and AgentPermissionsView's unified governance card has been split into `AuthorizationGovernanceCard.vue`; the remaining large templates still need focused child components.

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

`serverConsoleShellContext.ts`, `knowledgeViewContext.ts`, `workspacesViewContext.ts`, `feedViewContext.ts`, and `agentPermissionsViewContext.ts` are present. Leaf views and page facades now use contexts instead of importing `useConsole()` directly, but the shell context still exposes a broad compatibility surface.

Required direction:

- Keep route-level providers as the default way to pass shell/page state.
- Add missing admin/debug contexts where the page has multiple child views.
- Narrow the shell return surface so route contexts stop inheriting the full singleton.

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

### P2-3: Frontend architecture verification now has a first boundary gate

Existing server architecture verifiers protect backend boundaries. A dedicated frontend gate now checks direct `bridge.*` use in views/components, unsafe `v-html` ownership, and remaining direct `useConsole()` compatibility callers.

Required direction:

- Keep `server:verify:frontend-architecture` in the aggregate server gate.
- Keep the explicit `useConsole()` allowlist at the shell-only boundary until the singleton is split.

## Execution Order

1. P0-1: Continue reducing `useConsole()` as the global frontend runtime. Leaf views and page facades are migrated; next target is the broad shell spread and then the singleton internals.
2. P0-2: Keep view/component `bridge.*` calls at the single `BridgeDownloadButton.vue` allowlisted boundary; the frontend architecture verifier now fails new direct callers.
3. P0-3: Split large feature components after their async operations move out.
4. P0-5: Split `bridge.ts` and `types.ts` by domains touched by the UI extractions.
5. P0-4: Split CSS ownership once component/domain boundaries are clearer.
6. P1: Make safe HTML, browser effects, route contexts, types, and i18n boundaries explicit.
7. P2: Add frontend architecture verifier and polish repeated UI primitives.

## Refactor Ledger

- `server-web/views/admin/AgentPermissionsView.vue`: authorization governance loading/saving, editor samples, page refresh handling, and `useConsole()` compatibility dependencies moved to `server-web/composables/console-agent-permissions-view-controller.ts`. The view no longer imports `useConsole()` or `bridge` directly.
- `server-web/views/admin/AgentPermissionsView.vue`: unified authorization governance rendering/editor moved to `server-web/components/admin/AuthorizationGovernanceCard.vue`; route state is provided through `server-web/composables/agentPermissionsViewContext.ts`.
- `server-web/components/KnowledgeDistillationWorkbench.vue`: workbench API calls, run normalization, model probe plumbing, status labels, and model option helpers moved to `server-web/lib/knowledge-distillation-workbench.ts`. The component no longer imports `bridge` directly.
- `server-web/views/admin/RuntimeDownloadsView.vue`: runtime dependency types, status helpers, source hints, trigger guards, and bridge calls moved to `server-web/lib/runtime-dependencies.ts`. The view no longer imports `bridge` directly.
- `server-web/views/admin/ProductionHealthView.vue`: production health/baseline loading, status labels, elapsed time formatting, and date formatting moved to `server-web/lib/production-health.ts`. The view no longer imports `bridge` directly.
- `server-web/views/KnowledgeView.vue` and `server-web/components/KnowledgeImportCard.vue`: knowledge export URL generation, normalized document links, and document preview parsing moved to `server-web/lib/knowledge-documents.ts`. Both files no longer import `bridge` directly.
- `server-web/views/KnowledgeView.vue`: knowledge ingest target selection, upload, parsing preview, and normalized document download table moved to `server-web/components/knowledge/KnowledgeIngestPanel.vue`; the view now consumes the dynamic parsing signature from `useKnowledgeViewConsole.ts` instead of duplicating the parsing contract inline.
- `server-web/views/WorkspacesView.vue`: right-side create/profile/parent/share/local-directory/codespace/detail panel moved to `server-web/components/workspaces/WorkspaceDetailPanel.vue`; the view now keeps session history, workspace list, and delete modal orchestration only.
- `server-web/views/FeedView.vue`: composer input, attachments, model selector, and advanced options modal moved to `server-web/components/feed/InfoFeedComposerPanel.vue`; route state is provided through `server-web/composables/feedViewContext.ts`.
- `server-web/components/UploadFileListCard.vue`: file-entry normalization, summary generation, icon constants, and ingest progress derivation moved to `server-web/lib/upload-file-list.ts`.
- `server-web/views/DashboardView.vue`: dashboard state now comes from `serverConsoleShellContext`; the view no longer imports `useConsole()` directly.
- `server-web/views/ApprovalFlowView.vue`, `server-web/views/FeedView.vue`, `server-web/views/SourcesView.vue`, and admin views under `server-web/views/admin`: shell-owned state now comes from `serverConsoleShellContext`; these views no longer import `useConsole()` directly.
- `server-web/composables/useDebugViewConsole.ts`, `server-web/composables/useKnowledgeViewConsole.ts`, `server-web/composables/useWorkspacesConsole.ts`, and `server-web/composables/console-agent-permissions-view-controller.ts`: compatibility dependencies now flow through `serverConsoleShellContext`, reducing direct `useConsole()` callers to the shell boundary.
- `server-web/composables/useDebugViewConsole.ts`: knowledge distillation upload, parse polling, run polling, and result file assembly moved to `server-web/composables/console-debug-distillation-controller.ts`. The debug facade is now a 155-line composition layer with no direct `bridge` calls.
- `server/scripts/verify-frontend-architecture.mjs`: enforces the current bridge, safe-html, and `useConsole()` compatibility boundaries. The script is wired into `server:verify` as `server:verify:frontend-architecture`.

## Verification Gates

For frontend-only refactors:

```bash
npm run server:verify:frontend-architecture
npm run server:verify:frontend-feature-registry
npm run server:verify:frontend-typecheck
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
