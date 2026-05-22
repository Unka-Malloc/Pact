# Feature Profiles

Feature profiles are defined in `server/platform/interactive/features/feature-manifest.mjs`.

## Layout

| Boundary | Server directory |
| --- | --- |
| foundation/core | `server/platform/common/platform-core` |
| foundation/security | `server/platform/common/security` |
| foundation/module-management | `server/platform/common/module-manager` |
| foundation/data-structure | `server/platform/common/data-structure` |
| foundation/storage | `server/platform/common/storage` |
| foundation/devops | `server/platform/common/devops` |
| service/interface-wrapper | `server/platform/common/operation-dispatcher` |
| service/console-api | `server/platform/common/console` |
| service/runtime-assembly | `server/platform/interactive` |
| service/agent | `server/services/agent` |
| service/client | `server/services/client` |
| specialized/agent | `server/platform/specialized/agent` |
| specialized/capabilities/tools | `server/platform/specialized/capabilities/tools` |
| specialized/capabilities/skills | `server/platform/specialized/capabilities/skills` |
| specialized/knowledge | `server/platform/specialized/knowledge` |
| specialized/knowledge/preprocessing/chunking | `server/platform/specialized/knowledge/preprocessing/chunking` |
| specialized/knowledge/preprocessing/domain | `server/platform/specialized/knowledge/preprocessing/domain` |
| modules/knowledge | `server/platform/modules/knowledge` |
| modules/agent | `server/platform/modules/agent` |

## Commands

```bash
npm run feature:plan -- --edition pro
npm run feature:verify -- --edition pro
npm run feature:diff -- --from community --to enterprise
npm run feature:build:server -- --edition enterprise --target linux-x64
npm run feature:build:client -- --edition enterprise --platform macos --dry-run
npm run feature:instantiate:minimal -- --output pact-v1 --force --install
```
