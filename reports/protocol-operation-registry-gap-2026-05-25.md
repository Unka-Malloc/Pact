# Protocol Operation Registry Gap Report

审计日期：2026-05-25

本报告跟踪 `pact.workspace-contribution.v1`、`pact.knowledge-access.v1`、`pact.code-review.v1` 以及相关 workspace/knowledge 协议操作的当前注册、接线和实现状态。统计口径来自：

- `server/platform/common/operation-dispatcher/protocol-operation-definitions.mjs`
- `server/platform/specialized/console/console-domain-operation-executor.mjs`
- `npm run server:verify:protocol-operations`
- `npm run server:verify:workspace-checkpoints`

## 总览

| 指标 | 当前值 | 说明 |
| --- | ---: | --- |
| 协议操作定义 | 52 | 全部追加进 `SERVER_API_OPERATIONS`。 |
| 已注册并可发现 | 52 | 已通过 HTTP/RPC/Tool Management/MCP 发现验证。 |
| 明确空后端 | 3 | 运行时返回 `not_implemented`，只能算 `contract_registered`。 |
| P0 旧“零实现”模块 | 0 | workspace contribution 与 knowledge access 已有执行器；code review 已有 Gerrit upload route，但仍有轻量占位操作。 |

## 按子系统统计

| 子系统 | 操作数 | 空后端数 | 当前判断 |
| --- | ---: | ---: | --- |
| authorization | 7 | 0 | 已统一进入 authorization engine/store。 |
| workspace-contribution | 8 | 0 | 已接入 contribution registry，支持 submit/list/leaderboard/stats/report/permission grant。 |
| knowledge-access | 4 | 0 | 已接入 `evaluateKnowledgeAccess` 和 authorization store receipt/loan/denied list。 |
| code-management | 5 | 0 | `workspace.code.change.upload` 已走 Gerrit upload；target/prepare/link/status 仍偏轻量占位，未形成完整 Codespace 持久化。 |
| workspace-file | 6 | 0 | upload/list/download/read/write/patch 已接入 agent workspace file backend。 |
| checkpoint | 7 | 0 | tree/node/diff/scope/restore preview/restore 已接入 checkpoint tree backend；operation revert scope 已接入 operation audit store。 |
| workspace-proposal | 2 | 0 | create/apply 已接入 agent workspace submission/decision 后端，proposal 必须先审核再形成 decision。 |
| knowledge-export/evidence | 3 | 2 | evidence get 已接线；dossier/export 与 distillation/export 仍缺后端。 |
| raw-corpus | 1 | 1 | format convert 仍缺 raw corpus converter。 |
| workspace-asset-policy | 2 | 0 | 已进入 authorization facade。 |
| workspace-audit | 2 | 0 | 已接入 operation audit store。 |
| workspace-skill | 4 | 0 | 已复用 contribution registry。 |

## 明确空后端清单

这些操作已经注册、可被发现、具备 scope/safety/HTTP/RPC/MCP 形态，但执行时仍由 `contractRegisteredNotImplemented()` 返回 `not_implemented`。

| 操作 ID | 所属模块 | 期望后端 | 优先级 |
| --- | --- | --- | --- |
| `raw-corpus.format.convert` | 知识转化 / 原始语料 | `rawCorpus.formatConverter` | P1 |
| `knowledge.dossier.export` | 知识转化 / Dossier | `knowledgeDossierExporter` | P1 |
| `knowledge.distillation.export` | 知识转化 / 蒸馏导出 | `knowledgeDistillationExporter` | P1 |

Checkpoint 注意事项：`workspace.checkpoint.restore` 仍由通用 checkpoint tree 负责 restore marker、`checkpoint.restored` event 和审计范围记录；当 checkpoint node 携带 `workspaceFileSnapshot` 时，文件树 dry-run 和实际恢复会委托给共享空间 `restoreWorkspaceFiles` provider。其他业务状态回滚仍必须由各自 owning protocol 提供。

## P0 旧结论复核

| 模块 | 旧结论 | 当前结论 | 剩余风险 |
| --- | --- | --- | --- |
| `pact.workspace-contribution.v1` | 有协议、零实现 | 已有 operation registry、system handler、console domain executor 和 contribution registry 后端 | 仍需更完整的资产持久化、权限生命周期验证和 workspace 视角 E2E。 |
| `pact.knowledge-access.v1` | 有协议、零实现 | 已有 evaluate/receipt/loan/denied request 操作，并写入 authorization store | 仍需把 evidence/export/context injection 全链路纳入同一源头权限裁决。 |
| `pact.code-review.v1` | 有协议、零实现 | Gerrit upload route 已是真实后端；target/prepare/link/status 仍是轻量协议 facade | 需要 Codespace 持久化、review target registry、状态同步后端和验收脚本。 |

## 下一步顺序

1. 代码管理继续：共享空间 checkpoint/proposal/file/contribution 已完成后端和验证闭环；下一步优先补 Codespace 持久化、review target registry、状态同步后端和验收脚本。
2. 知识转化其次：补 `raw-corpus.format.convert`、`knowledge.dossier.export`、`knowledge.distillation.export`，避免知识协议只完成检索/访问而缺少转换和导出闭环。
3. 代码管理第三：把 target/prepare/link/status 从轻量 facade 升级为 Codespace 持久化和 Gerrit 状态同步后端。
4. 每补一个子系统，必须同步更新 `docs/SUBSYSTEM-REFACTOR-CHECKLIST.md`，并增加或扩展 `server:verify:*` 覆盖。
