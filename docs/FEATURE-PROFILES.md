# Feature Profiles

Feature profiles are defined in `server/platform/interactive/features/feature-manifest.mjs`.

## Layout

| Boundary | Server directory |
| --- | --- |
| common/core | `server/platform/common/platform-core` |
| common/dispatcher | `server/platform/common/operation-dispatcher` |
| common/console | `server/platform/common/console` |
| common/data-structure | `server/platform/common/data-structure` |
| common/observability | `server/platform/common/observability` |
| common/storage | `server/platform/common/storage` |
| common/modules | `server/platform/common/module-manager` |
| common/devops | `server/platform/common/devops` |
| interactive | `server/platform/interactive` |
| service/agent | `server/services/agent` |
| service/client | `server/services/client` |
| specialized/agent | `server/platform/specialized/agent` |
| specialized/knowledge | `server/platform/specialized/knowledge` |
| specialized/knowledge/chunking | `server/platform/specialized/knowledge/chunking` |
| specialized/knowledge/domain | `server/platform/specialized/knowledge/domain` |
| modules/knowledge | `server/platform/modules/knowledge` |
| modules/agent | `server/platform/modules/agent` |

## Commands

```bash
npm run feature:plan -- --edition pro
npm run feature:verify -- --edition pro
npm run feature:diff -- --from community --to enterprise
npm run feature:build:server -- --edition enterprise --target linux-x64
npm run feature:build:client -- --edition enterprise --platform macos --dry-run
npm run feature:instantiate:minimal -- --output splitall-v1 --force --install
```
