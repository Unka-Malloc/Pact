# AgentStudio Protocol Boundaries

本文定义 AgentStudio 的协议边界。协议层只描述请求、响应、事件、版本、权限、错误语义和兼容策略；业务实现、算法实现和存储细节不写进协议层。

## 目录 / Table of Contents

- [核心原则](#核心原则)
- [协议分组](#协议分组)
- [Middle Layer Strategy](#middle-layer-strategy)
- [Compatibility Strategy](#compatibility-strategy)
- [Workspace API](#workspace-api)
- [Workspace Event](#workspace-event)
- [Operation Protocol](#operation-protocol)
  - [Unified Checkpoint Tree Protocol](#unified-checkpoint-tree-protocol)
- [Backup Restore Protocol](#backup-restore-protocol)
- [Workspace Contribution Protocol](#workspace-contribution-protocol)
  - [Device MCP Hub](#device-mcp-hub)
- [Workspace Governance Protocol](#workspace-governance-protocol)
- [Knowledge Protocol](#knowledge-protocol)
- [Asset Lineage Protocol](#asset-lineage-protocol)
- [Knowledge Access Protocol](#knowledge-access-protocol)
  - [Upstream Permission Demo Flow](#upstream-permission-demo-flow)
- [Context Bundle Protocol](#context-bundle-protocol)
- [Tool Management Protocol](#tool-management-protocol)
- [Agent Session Compatibility](#agent-session-compatibility)
- [Module Ecosystem Protocol](#module-ecosystem-protocol)
- [Executive Report Protocol](#executive-report-protocol)
- [Architecture Live Map Protocol](#architecture-live-map-protocol)
- [Sample Business Pack Protocol](#sample-business-pack-protocol)
- [Protocol Adapters](#protocol-adapters)
- [版本与兼容](#版本与兼容)

## 核心原则

- 协议口径固定为“两个问题，一个能力，三个兼容”。
- 核心协议面向 workspace state，不面向某个具体 Agent。
- 协议设计专攻中间狭窄地带：上游知识库太粗时做权限精加工，下游本地智能体太细时做共享工作空间。
- A2A、MCP、OpenAPI、OpenAI-compatible endpoint、CLI SDK 都是 adapter，不是核心抽象。
- 本地智能体、控制台、CLI、脚本和人工操作者都必须通过公开协议操作公共空间。
- 接口日志不等于业务状态；workspace event 和 operation ledger 才是可复用、可恢复、可审计的事实记录。

## 协议分组

| 协议 | 责任 |
| --- | --- |
| `agentstudio.workspace.v1` | 公共工作空间 context、tasks、observations、artifacts、proposals、decisions、audit events。 |
| `agentstudio.operation.v1` | idempotency、policy check、dry-run、diff、snapshot boundary、apply、rollback。 |
| `agentstudio.knowledge.v1` | `knowledgeBase` mount、evidence pack、asset、search、export、external knowledge adapter。 |
| `agentstudio.context-bundle.v1` | 面向本地智能体和短上下文模型的 context compiler / context compression。 |
| `agentstudio.tool-management.v1` | Tool Management v1 catalog、grant、policy preview、execute、audit、metrics。 |
| `agentstudio.security.v1` | subject、workspace、scope、grant、data class、secret ref、redaction、audit policy。 |
| `agentstudio.workflow.v1` | 长任务、activity、checkpoint、retry、signal、timer、恢复和补偿语义。 |
| `agentstudio.backup-restore.v1` | 服务端数据目录备份、manifest、restore preview、确认恢复和恢复报告。 |
| `agentstudio.data-connector-governance.v1` | 服务端数据连接器合同、OAuth refresh 策略、增量 cursor、mirror 冲突/清理、localQuery 禁远程和卸载验收。 |
| `agentstudio.performance-capacity.v1` | 容量目标、benchmark runner、ingest/search/sync/distillation/cost 指标、失败注入和阈值门禁。 |
| `agentstudio.knowledge-distillation-optimization.v1` | 知识蒸馏持续优化报告，覆盖 prompt/baseline/dataset 版本、错误归因、趋势、人工审核和 canary/promote/rollback。 |
| `agentstudio.executive-report.v1` | 管理层报告，聚合生产门禁、资产价值、评估、容量成本、trace 安全和风险决策。 |
| `agentstudio.architecture-live-map.v1` | 架构活文档，链接核心架构节点、设计文档、服务端实现路径和生产门禁状态。 |
| `agentstudio.sample-business-pack.v1` | 服务端样例业务包，物化邮件、PDF、PPT、Markdown 项目和外部知识库 compose 示例。 |
| `agentstudio.module-ecosystem.v1` | 服务端模块模板、脚手架计划、生成、合同测试、CI 模板和 Tool/Skill 包 manifest 验收。 |
| `agentstudio.asset-lineage.v1` | 多模态资产 raw object、page/slide、bbox、parser/model/OCR 版本、派生链和重解析计划。 |
| `agentstudio.knowledge-access.v1` | source-level knowledge permissions、accessMode、checkoutPolicy、readInPlace、export 和 context injection 裁决。 |
| `agentstudio.agent-library.v1` | AgentLibrary / 图书馆的 library card、loanRecord、knowledgeAccessReceipt、share、checkout 和 revoke 语义。 |
| `agentstudio.workspace-contribution.v1` | 终端贡献资产、Skills、工具、脚本、专家意见、黄金规则、排行榜、资产贡献统计报表和贡献授权。 |
| `agentstudio.workspace-governance.v1` | organization/project/dataClass/retention/legalHold、外部协作者、跨空间复制、共享授权和审计。 |
| `agentstudio.checkpoint-tree.v1` | 统一 Checkpoint Tree：访问请求、文件变动、知识贡献、技能调用、权限裁决、diff、restore preview、restore commit 和按 operation scope 回撤。 |

## Middle Layer Strategy

AgentStudio 的协议不追求覆盖所有智能体协作场景，也不替代上游知识库。协议只把中间层两个问题做深：

1. `agentstudio.knowledge-access.v1` / `agentstudio.agent-library.v1`
   - 解决上游知识库太粗的问题。
   - 把上游资源加工成可发现、可读、可引用、可上下文注入、可导出、可借走或不可见的细颗粒度授权视图。
2. `agentstudio.workspace-contribution.v1` / `agentstudio.workspace.v1`
   - 解决下游本地智能体太细的问题。
   - 把终端贡献沉淀到公共工作空间，让知识、Skills、工具、脚本、文件、黄金规则和专家意见可以被发现、排行、授权、复用和撤销。

这两个方向共同构成框架的核心卖点：上游资源经过 AgentStudio 后变细、变可控；下游本地智能体经过 AgentStudio 后能共享部分资产和能力。

## Compatibility Strategy

三个兼容不是“支持很多插件”，而是协议层的稳定承诺：

1. 智能体兼容
   - 大模型、agent framework、机器人体系和本地操作手都不是核心模型。
   - OpenClaw、Codex、Claude Code、Cursor Agent、脚本型 agent 或人工 CLI 都通过 AgentStudio MCP service / Workspace API 接入。
   - AgentStudio 不暴露成必须被其它 agent 调度的自治 Agent；它暴露的是 workspace、asset、knowledge、checkpoint、permission 和 audit 能力。
2. 信息源兼容
   - 上游知识库、网站订阅、文件库、业务系统、人工整理、终端上传和智能体提交文档都统一进入 workspace asset model。
   - 外部信息进入后必须被重新切分、标注、授权、索引、审计和快照，而不是按原系统权限裸转发。
3. 工作空间环境兼容
   - 容器、虚拟机、本机、云端、Linux、macOS、Windows 都只是 workspace runtime 的承载环境。
   - 只要安装 AgentStudio 管理软件，智能体访问该工作空间就必须经过 AgentStudio adapter，由 AgentStudio 处理路径差异、权限控制、快照、恢复、审计和环境能力发现。
   - 智能体不需要关心 workspace 是什么环境，也不允许绕过管理软件直接改写公共状态。

## Workspace API

Workspace API 是本地智能体接入 AgentStudio 的首选方式。OpenClaw、Codex、Claude Code、Cursor Agent、脚本型 agent 或人工工具都只需要遵守这个协议。

建议公开面：

```text
GET  /api/workspaces/:workspaceId/context
POST /api/workspaces/:workspaceId/context/compile
POST /api/workspaces/:workspaceId/tasks
POST /api/workspaces/:workspaceId/tasks/:taskId/claim
POST /api/workspaces/:workspaceId/tasks/:taskId/events
POST /api/workspaces/:workspaceId/observations
POST /api/workspaces/:workspaceId/artifacts
POST /api/workspaces/:workspaceId/proposals
POST /api/workspaces/:workspaceId/contributions
GET  /api/workspaces/:workspaceId/contributions/leaderboard
GET  /api/workspaces/:workspaceId/contributions/stats
GET  /api/workspaces/:workspaceId/contributions/report
POST /api/workspaces/:workspaceId/contributions/:contributionId/permission-requests
POST /api/workspaces/:workspaceId/contributions/:contributionId/grants
POST /api/workspaces/:workspaceId/permissions/request
GET  /api/workspaces/:workspaceId/audit
```

写入请求必须带：

- `workspaceId`
- `subject`
- `operatorId` 或 `agentId`
- `taskId`
- `traceId`
- `idempotencyKey`
- `intent`
- `inputRefs`
- `visibilityPolicy`
- `requestedScopes`
- `knowledgeAccessCard`

响应必须返回：

- `accepted`
- `operationId`
- `auditId`
- `policyDecision`
- `resultRef`
- `snapshotRef`
- `nextRequiredAction`

## Workspace Event

公共空间里的业务事实用 event 表达，而不是只依赖接口日志。

核心 event type：

- `task.created`
- `task.claimed`
- `task.updated`
- `observation.appended`
- `artifact.uploaded`
- `proposal.created`
- `proposal.reviewed`
- `decision.recorded`
- `evidence.attached`
- `permission.requested`
- `contribution.submitted`
- `contribution.reviewed`
- `contribution.published`
- `contribution.used`
- `contribution.permission.requested`
- `contribution.permission.granted`
- `contribution.rank.updated`
- `context.bundle.generated`
- `access.requested`
- `access.granted`
- `access.denied`
- `file.changed`
- `skill.invoked`
- `operation.applied`
- `operation.reverted`
- `checkpoint.created`
- `checkpoint.restored`

event 必须 append-only。撤销、归档、合并和恢复都用新事件表达，不删除历史事件。

## Operation Protocol

所有进入公共空间边界的行为都必须走 `agentstudio.operation.v1` 或对应领域协议，并最终落到同一套 Operation Ledger。这里不只包括改变 canonical workspace state 的写操作，也包括访问请求、权限拒绝、文件读出、列表、发现、权限检查、receipt 查询、审计查询、历史查询、checkpoint tree 查询、技能调用和上下文暴露，因为它们会改变审计、receipt、loan record、usage event、贡献统计或风险状态。

```text
intent
  -> validate
  -> policy preview
  -> dry-run / diff
  -> snapshot
  -> apply
  -> audit
  -> recovery metadata
```

操作必须支持：

- 幂等：`idempotencyKey`
- 可预览：`dryRun=true`
- 可解释：`policyDecision.reason`
- 可恢复：`preSnapshot`、`postSnapshot`
- 可复制：`exportableOperationBundle`
- 可审计：`auditId`、`traceId`

智能体提交的写入默认只能成为 `observation`、`artifact` 或 `proposal`。只有经过策略、人审或授权 agent 审核后，才允许形成 `decision` 或 canonical state。

### Unified Checkpoint Tree Protocol

`agentstudio.checkpoint-tree.v1` 管理统一 Checkpoint Tree。它不是单独的任务队列树，也不是单纯的文件树，而是公共空间所有可治理影响的状态图。

最小能力：

- `workspace.checkpoint.tree.list`
- `workspace.checkpoint.diff`
- `workspace.checkpoint.restore.preview`
- `workspace.checkpoint.restore`
- `workspace.operation.revert.scope`
- `workspace.checkpoint.node.get`
- `workspace.checkpoint.scope.query`

进入统一 Checkpoint Tree 的事件至少包括：

- 所有访问请求：workspace info/list、catalog discover、metadata read、permission check、search、evidence read、asset list/read/download、skill list/download、receipt list、audit query、operation history、checkpoint tree list、restore preview、context bundle、export、checkout。
- 所有文件变动：create、update、move、delete、archive、restore。
- 所有知识贡献：submit、scan、review、publish、adopt、revoke。
- 所有技能调用：list、download、install、execute、usage report、revoke。
- 所有权限裁决：grant、deny、permission request、authorizationOverlay change。
- 所有上下文暴露：context compile、memory write、distillation input、tool call input。
- 所有恢复动作：restore preview、restore、revert operation scope、branch、merge。

`checkpointNode` 最小字段：

- `checkpointNodeId`
- `parentNodeIds`
- `workspaceId`
- `subject`
- `operatorId`
- `agentProfile`
- `eventKind`
- `effectKind`
- `targetRefs`
- `policyDecision`
- `stateDelta`
- `receiptRefs`
- `auditId`
- `createdAt`

`effectKind` 至少包含：

- `read`
- `write`
- `execute`
- `permission`
- `restore`
- `deny`
- `report`

读请求也必须形成 checkpoint node。它可能不改变文件树，但会产生 `knowledgeAccessReceipt`、`loanRecord`、`asset.downloaded`、`skill.used`、`denied request audit`、贡献统计或模型上下文暴露记录。这些都是公共空间安全状态的一部分。第一版读请求全量入树，不能把 list、discover、metadata、permission check、receipt list、audit query、operation history 或 checkpoint tree list 降级为普通接口日志。

全量入树的边界是外部可见请求。为了避免查询 Checkpoint Tree 自身时递归生成无限节点，同一次请求内部读取 Ledger、AuditStore、CheckpointTree 或 projection 的系统内部读不再生成新的 checkpoint node。

Checkpoint Tree 安全恢复演示：

1. A 逐个删除工作空间中的多个文件。
2. 每次删除都形成 `operation.applied` 和 `checkpoint.created`，记录 `preSnapshotRef`、`postSnapshotRef`、operation diff、operator、policy decision 和 `auditId`。
3. 管控台调用 `workspace.checkpoint.tree.list` 展示 Checkpoint Tree 历史。
4. 管理员选择 A 操作之前的 checkpoint，调用 `workspace.checkpoint.restore.preview` 查看 dry-run diff。
5. 管理员确认后调用 `workspace.checkpoint.restore`。
6. 系统创建新的 restore operation 和 `checkpoint.restored` 事件，把 workspace 恢复到目标节点对应状态，但保留 A 的删除 commit 和恢复 commit。

恢复协议必须支持两种粒度：

- `restoreToCheckpoint`：恢复到某个 checkpoint 节点。
- `revertOperationScope`：按 operator / task / operation batch 回撤 A 本次所有操作。

实现可以复用 git worktree 能力，例如 tree object、diff、commit graph、checkout-like restore、临时 worktree 预览和 branch / merge；但协议层不能暴露裸 git reset 作为恢复语义。AgentStudio 必须把文件状态恢复、数据库元数据、权限 overlay、knowledge evidence、loan record、contribution 引用和 audit record 作为一次完整 workspace restore 处理。

## Backup Restore Protocol

`agentstudio.backup-restore.v1` 管理服务端数据目录的备份、恢复预览和确认恢复。第一版恢复不删除备份中不存在的当前文件，只恢复 manifest 中声明的权威文件，避免误删运行期新增状态。

备份 manifest 必须包含：

- `backupId`、`createdAt`、`sourceRoot`、`backupPath`
- `summary.fileCount/bytes/byCategory`
- `files[].relativePath/category/bytes/sha256/mtimeMs`

公开操作：

- `storage.backups.list`：列出已生成备份。
- `storage.backups.create`：生成 `backup-manifest.json` 并复制服务端数据文件。
- `storage.backups.restore_preview`：比较当前数据目录和备份 manifest，输出 create/replace/noop/blocked。
- `storage.backups.restore`：需要确认后执行恢复，并写出 restore report。

## Workspace Contribution Protocol

`agentstudio.workspace-contribution.v1` 管理终端贡献型资产。它把本地智能体、脚本、人工操作者和下游 workspace 产生的高价值信息沉淀为可治理资产。

贡献资产类型：

- `knowledge`
- `skill`
- `tool`
- `script`
- `file`
- `goldenRule`
- `expertOpinion`

每个 workspace 必须暴露固定存放位置：

- `skills/`
- `tools/`
- `scripts/`
- `files/`
- `knowledge/`
- `rules/`
- `expert-opinions/`

提交请求必须带：

- `contributionId`
- `contributorId`
- `contributorKind`
- `sourceWorkspaceIds`
- `targetWorkspaceIds`
- `contributionType`
- `payloadRefs`
- `skillManifestRef`
- `toolSchemaRef`
- `scriptRefs`
- `fileRefs`
- `knowledgeRefs`
- `goldenRuleRefs`
- `expertOpinionRefs`
- `license`
- `risk`
- `requestedVisibility`
- `requestedActions`
- `reviewPolicy`

贡献状态机：

```text
submitted
  -> scanned
  -> reviewed
  -> published | rejected | needs_changes
  -> adopted
  -> deprecated | revoked
```

排行榜统计字段：

- `contributionCount`
- `acceptedCount`
- `usageCount`
- `uniqueWorkspaceAdoptions`
- `skillExecutionCount`
- `permissionRequestCount`
- `permissionGrantCount`
- `reuseSuccessRate`
- `rollbackCount`
- `maintenanceFreshness`
- `rankScore`

资产贡献统计报表字段：

- `reportId`
- `workspaceId`
- `timeRange`
- `assetTypeBreakdown`
- `contributorBreakdown`
- `workspaceAdoptionBreakdown`
- `permissionFlowBreakdown`
- `usageActionBreakdown`
- `riskBreakdown`
- `maintenanceBreakdown`
- `topReusableAssets`
- `underMaintainedAssets`
- `highDemandRestrictedAssets`
- `rollbackHotspots`
- `assetContributionReportV0`

`assetContributionReportV0` 的默认汇总口径：

```text
assetContributionReportV0 =
  acceptedCount
  + usageCount
  + uniqueWorkspaceAdoptions
  + permissionGrantCount
  - rollbackCount
```

排行榜可以从报表派生，但报表是管理者视角的一等能力。它回答公共空间是否在沉淀可复用资产、哪些贡献真正被使用、哪些资产需要授权治理、哪些资产正在制造风险。

贡献授权请求必须返回 `contributionGrant`、`loanRecord`、`auditId` 和可撤销策略。贡献资产被其它智能体下载、安装、执行、复制到上下文或带到其它 workspace 时，必须记录使用事件和借阅记录。

初始排行榜算法：

```text
rankScoreV0 =
  usageCount * successRate
  + uniqueWorkspaceAdoptions
  - rollbackCount
```

`usageCount` 统计被授权主体确认下载、安装、执行、复制到上下文或跨 workspace 采用的次数，`successRate = successfulUseCount / max(usageCount, 1)`，`uniqueWorkspaceAdoptions` 是去重后的 workspace 采用数，`rollbackCount` 是该资产导致的恢复、撤销或禁用次数。`acceptedCount` 保留为资产贡献统计报表字段，不作为排行榜主导项。

### Device MCP Hub

历史文档里的 MCP Demo Flows 现在收敛为本节的设备级 MCP Hub，并按 Stitch MCP 的 HTTP 接入方案落地。

AgentStudio MCP service 是 Workspace API 的设备级协议适配器，不是 agent-to-agent gateway。它必须让同一台设备上的 Codex、Gemini CLI、Kilo Code、Copilot、OpenClaw（OrbStack Kate）、Hermes Agent（OrbStack Serena）和 Antigravity 都能通过同一套发现、授权和工具边界访问 AgentStudio，而不是为某一个 agent 单独硬编码。

设备级 MCP Hub 由五部分组成：

1. **HTTP MCP endpoint**：服务端权威入口，复用主服务进程。
2. **stdio proxy**：本地 agent 兼容入口，只把 stdio MCP 消息转发到 HTTP MCP。
3. **设备级发现清单**：让 installer、doctor 和本机 agent adapter 发现 AgentStudio MCP 服务。
4. **每 agent 独立 grant/token**：每个 agent 有自己的权限、身份和审计轨迹。
5. **release discovery publisher**：以独立 connector release 包发布共享 Hub 发现清单；只有用户明确选择某个客户端时才写入该客户端配置。

AgentStudio MCP 必须完全按 Stitch MCP 的接入方案实现：客户端配置直接指向一个 HTTP MCP endpoint，认证作为客户端侧 metadata / headers 独立声明。Stitch 的 API key 变体使用 `X-Goog-Api-Key`；AgentStudio 对应优先使用 `X-AgentStudio-Api-Key`，值为 Tool Management grant token。Codex CLI 的标准 HTTP MCP 安装命令只支持 bearer token env var，因此 Codex 使用 `--bearer-token-env-var AGENTSTUDIO_MCP_TOKEN`，服务端同时接受 `Authorization: Bearer <token>` 和 `X-AgentStudio-Api-Key`。只有目标客户端不支持 HTTP MCP 或自定义 headers 时才落到 stdio proxy，stdio 不作为默认方案。

终端用户不拉取完整 AgentStudio 服务端仓库。服务端只发布 MCP HTTP endpoint、发现清单和 grant token；客户端侧统一通过 `agentstudio-mcp-connector` release 包安装或升级。

#### Transport endpoints

HTTP MCP 是权威服务入口：

```text
<discovered-agentstudio-base-url>/mcp
<discovered-orbstack-host-url>/mcp
```

connector 不把 `127.0.0.1:8787` 作为默认事实写入客户端。安装开始时必须扫描本机 AgentStudio 候选服务、读取本机 registry，并通过 `/api/mcp/handshake` 校验服务端 Ed25519 签名；只有签名握手通过后，才把 discovery 返回的 HTTP MCP URL 写入目标客户端。OrbStack VM 内访问宿主机的 URL 也来自 discovery 的 advertised endpoint。

HTTP endpoint 必须遵守 MCP Streamable HTTP 的最小要求：

- `POST /mcp` 接收 MCP JSON-RPC request / notification / response。
- `GET /mcp` 在支持事件流时返回 `text/event-stream`，否则返回 `405 Method Not Allowed` 并带 `Allow: POST`。
- 绑定本机默认只允许 localhost；对来自浏览器或远端 HTTP 的请求校验 `Origin`，防止 DNS rebinding。
- 未授权时返回 `401`，并提供 MCP authorization discovery 所需的 protected resource metadata 位置。
- 不把大文件直接塞入 MCP JSON-RPC 响应；大 payload 返回 `assetId`、`downloadUrl`、`jobId` 或 evidence reference。

stdio proxy 只保留为未来本地兼容入口；当前 release 安装路径默认不启用 stdio。

stdio proxy 不维护独立业务状态，不直接读写 workspace、文件、SQLite、KnowledgeCore 或 Tool Management 数据。它只负责：

- 从 stdin 读取 MCP JSON-RPC。
- 给 HTTP MCP 注入对应 agent grant/token。
- 把 HTTP MCP 响应写回 stdout。
- 日志只写 stderr，stdout 只能出现合法 MCP message。

#### Device discovery

AgentStudio 必须写入设备级发现清单：

```text
~/.agentstudio/mcp/servers.json
```

清单最小结构：

```json
{
  "version": 1,
  "servers": {
    "agentstudio": {
      "name": "AgentStudio",
      "httpUrl": "<signed-discovered-base-url>/mcp",
      "vmHttpUrl": "<signed-discovered-vm-url>/mcp",
      "connector": {
        "packageName": "agentstudio-mcp-connector",
        "packageVersion": "0.2.3",
        "discoverCommand": "npx agentstudio-mcp-connector@latest discover-local",
        "installCommand": "npx agentstudio-mcp-connector@latest install --target <client>"
      },
      "discoveryUrl": "<signed-discovered-base-url>/.well-known/agentstudio/mcp.json"
    }
  }
}
```

服务端同时暴露：

```text
GET /.well-known/agentstudio/mcp.json
GET /api/mcp/discovery
POST /api/mcp/handshake
```

`.well-known/agentstudio/mcp.json` 是 AgentStudio 的设备发现约定，不声明为 MCP 官方标准。它用于让本机 installer、doctor、CLI 和 adapter 发现同一个服务端、VM endpoint 和已安装 target 状态。

`/api/mcp/handshake` 接收客户端 nonce，返回包含 nonce、server identity、endpoint、interface version 和 toolset version 的稳定 JSON payload，并用服务端本机 Ed25519 identity 签名。connector 必须先验证签名，再信任 discovery URL。

本机发现必须收敛到统一入口封装：`agentstudio-mcp discover-local`。它是所有 agent 可复用的本机查询命令，内部只维护一个 canonical registry 文件 `~/.agentstudio/mcp/servers.json`，并按需兜底访问服务端 HTTP discovery；不得通过写多个本机发现文件来制造兼容性。

Codex 在本机定位 AgentStudio MCP 的实际路径应被产品化为所有 agent 都能复用的查找顺序：

1. 调用 `agentstudio-mcp discover-local`。
2. `discover-local` 内部先读 `AGENTSTUDIO_MCP_URL`、`AGENTSTUDIO_MCP_DISCOVERY_URL`、`AGENTSTUDIO_MCP_DISCOVERY_FILE`。
3. 读取唯一 registry：`~/.agentstudio/mcp/servers.json`。
4. 扫描本机候选端口。
5. 对候选 URL 读取 `/api/mcp/discovery` 并执行 `/api/mcp/handshake` 签名校验。
6. 对验证通过的 `httpUrl` 执行 MCP `initialize`。

`agentstudio-mcp register` 只写入这一个 registry，并可通过 launchctl 发布同一组环境变量；它不修改任何客户端配置。扫不到签名有效的 AgentStudio 服务时，TTY 安装流程必须明确提示用户配置服务端 URL，并提供 `skip, manually configure later` 选项，不能静默落到硬编码地址。

本机服务端地址配置由 connector 管理，命令形态固定为：

```bash
agentstudio-mcp server-config --set --url http://<host>:<port> --name local
agentstudio-mcp server-config --switch local
agentstudio-mcp server-config --refresh
agentstudio-mcp server-config --reset
agentstudio-mcp server-config --list
```

`--set`、`--switch`、`--refresh` 都必须验证签名握手。`--reset` 清空本机 connector 对服务端地址的配置，使下一次安装重新扫描或让用户手动配置。

#### Connector release channel

`agentstudio-mcp-connector` 是独立客户端发布包，只包含 MCP 客户端安装器、doctor 和各智能体配置写入逻辑，不包含服务端 runtime、SQLite、KnowledgeCore、UI 或任何服务端源代码。

发布通道必须同时提供两种客户端形态：

- npm 包：适合已有 Node.js / npx 的开发机。
- portable 包：适合没有 Node.js、npm、npx 或包管理器的机器；包内自带当前平台 Node runtime，并提供 `agentstudio-mcp` 命令和 macOS 可双击的 `install.command`。

服务端 release 构建命令：

```bash
npm run server:mcp:release
npm run server:verify:mcp-release
```

release 产物写入 `build/release/mcp/`，包含：

- `agentstudio-mcp-connector-<version>.tgz`
- `agentstudio-mcp-connector-<version>-<platform>.zip`
- `agentstudio-mcp-connector-<version>-<platform>.tar.gz`
- `agentstudio-mcp-install.sh`
- `agentstudio-mcp-release.json`
- `latest.json`

发布通道使用 npm / GitHub Release 上传上述产物；`agentstudio-mcp-release.json` 记录 npm tarball sha256、portable zip sha256、portable tarball sha256、GitHub 一行安装命令、版本、支持的 target、Hub 注册命令、本机发现命令、多选交互式安装命令、单客户端脚本化连接命令和 `npm publish` 命令。终端用户首选 GitHub 一行命令或 zip 包入口，不需要完整服务端 checkout。一行安装脚本必须优先检测本机 Node.js 20+，命中时只下载小体积 source tarball；只有本机没有可用 Node.js 时才下载内置 runtime 的 portable zip。

具备 npm registry 权限时可以直接发布：

```bash
npm run server:mcp:release -- --publish
```

用户安装分成两层。第一层只注册共享本机 MCP Hub，不写入任何具体智能体客户端：

```bash
npx agentstudio-mcp-connector@latest register
```

第二层按需连接一个或多个客户端：

```bash
npx agentstudio-mcp-connector@latest install
```

无 `--target` 且运行在 TTY 中时，`install` 必须启动多选交互式菜单，扫描 Codex、Gemini CLI、Kilo Code、Copilot、Antigravity、OpenClaw、Hermes Agent 和 OrbStack 中的 claw-compatible 衍生体，允许用户用上下键移动、Space 多选、`a` 切换所有已检测客户端。菜单只在用户确认选择后写入对应客户端配置。

GitHub Release 必须额外提供一条命令入口；它校验 SHA256、安装到 `~/.agentstudio/mcp/connector`，并立即启动同一个多选 TUI。脚本默认优先下载 npm/source tarball，只有没有可用 Node.js 时才 fallback 到 portable zip：

```bash
/bin/sh -c "$(curl -fsSL https://github.com/Unka-Malloc/AgentStudio/releases/latest/download/agentstudio-mcp-install.sh)"
```

脚本化安装仍使用显式 target；默认由 connector 在本机向已验证签名的 AgentStudio 服务申请 Tool Management grant token：

```bash
npx agentstudio-mcp-connector@latest install --target codex
```

只有使用预先签发的自定义 grant 时才传入 token：

```bash
printf '%s\n' '<issued-token>' | npx agentstudio-mcp-connector@latest install \
  --target codex \
  --token-stdin
```

没有 Node.js / npx 的用户使用 portable zip 包：

```bash
unzip agentstudio-mcp-connector-<version>-<platform>.zip
cd agentstudio-mcp-connector-<version>-<platform>
./agentstudio-mcp install
```

portable zip 包同样保留脚本化安装：

```bash
./agentstudio-mcp install --target codex
```

macOS 上也可以双击 portable 包里的 `install.command`，由 connector 自动扫描并校验签名，然后选择连接一个或多个客户端。

用户验证命令形态固定为；无 token 时只验证发现和握手，有 token 时额外验证 `tools/list` / `tools/call`：

```bash
AGENTSTUDIO_MCP_TOKEN='<issued-token>' npx agentstudio-mcp-connector@latest doctor
```

用户卸载单个客户端命令形态固定为：

```bash
npx agentstudio-mcp-connector@latest uninstall --target codex
```

`npm run server:mcp:install` 只保留为服务端开发者和本机调试入口，不作为终端用户安装通道。默认用户路径是 `register` 和 `discover-local`；客户端接入是每个 agent 明确 opt-in 的动作。

#### Agent identity and grants

MCP 不复用控制台 cookie / CSRF。每个 agent 使用独立 grant/token：

正常安装不要求用户手动复制 token。connector 在扫描到本机 AgentStudio 并完成 `/api/mcp/handshake` 签名验证后，调用本机限定的 `/api/mcp/local-grant` 申请默认 agent grant。该 grant 使用 Tool Management 默认 agent toolsets，默认不授予 admin/repair 权限。`AGENTSTUDIO_MCP_TOKEN` 只是 Codex 等只支持 bearer-token-env-var 客户端需要引用的环境变量名，变量值由 connector 写入；不是要求用户手工配置的前置条件。

```text
agentstudio.mcp.codex
agentstudio.mcp.gemini-cli
agentstudio.mcp.kilo-code
agentstudio.mcp.copilot
agentstudio.mcp.openclaw.kate
agentstudio.mcp.hermes.serena
agentstudio.mcp.antigravity
```

每个 grant 必须记录：

| 字段 | 用途 |
| --- | --- |
| `operatorId` | 区分真实调用方，例如 `codex:local`、`orbstack:kate:openclaw`。 |
| `subjectId` | 归属用户、团队或 demo subject。 |
| `agentProfileId` | 绑定 agent 默认上下文、预算、工具授权和审计标签。 |
| `defaultWorkspaceId` | 省略 `workspaceId` 时使用的 workspace。 |
| `allowedToolsets` | 可用 MCP toolset 白名单。 |
| `allowedScopes` | Tool Management / Operation Registry 的 scope 白名单。 |
| `createdAt` / `lastUsedAt` | 安装和调用审计。 |

grant 只授予 curated MCP toolset。不得把完整 Operation Registry 默认暴露给任意 agent。

#### Target install matrix

| Target | 推荐接入 | endpoint |
| --- | --- | --- |
| Codex | `codex plugin marketplace add` + `codex plugin add` + `codex mcp add --url --bearer-token-env-var` | signed discovery `httpUrl` |
| Gemini CLI | `gemini mcp add --transport http --header X-AgentStudio-Api-Key`；同时生成并校验 Stitch 形态 extension manifest | signed discovery `httpUrl` |
| Kilo Code | 按 Kilo CLI 标准 `~/.config/kilo/kilo.json` 的 `mcp.<name>.type=remote` 写入 HTTP server | signed discovery `httpUrl` |
| Copilot | `copilot mcp add --transport http --header X-AgentStudio-Api-Key` | signed discovery `httpUrl` |
| OpenClaw / OrbStack Kate | VM 内 `openclaw mcp set agentstudio <json>`，HTTP endpoint 指向宿主机 | signed discovery `vmHttpUrl` |
| Hermes Agent / OrbStack Serena | VM 内 `hermes mcp add --url --auth header`，并用 Hermes config helper 启用后 `hermes mcp test` | signed discovery `vmHttpUrl` |
| Antigravity | 按官方 `~/.gemini/antigravity/mcp_config.json` 的 `serverUrl` + `headers` 写入 HTTP server | signed discovery `httpUrl` |

installer 只追加或替换 `agentstudio` 这一项，必须先备份会被结构化写入的目标配置。不得覆盖、清空或重排用户已有 MCP server、API key、bot token 或 agent 配置。能用客户端标准 CLI 的目标必须调用标准 CLI；没有可脚本化标准 CLI 的目标由 `server:mcp:install` 按目标官方配置格式做结构化写入和备份。

Codex 标准 CLI 配置形态：

```toml
[mcp_servers.agentstudio]
url = "<signed-discovered-http-url>/mcp"
bearer_token_env_var = "AGENTSTUDIO_MCP_TOKEN"
```

Gemini CLI 标准 MCP 配置形态：

```json
{
  "mcpServers": {
    "agentstudio": {
      "url": "<signed-discovered-http-url>/mcp",
      "type": "http",
      "headers": {
        "X-AgentStudio-Api-Key": "<agent-specific grant token>"
      },
      "timeout": 300000,
      "trust": true
    }
  }
}
```

安装器还会生成并校验 Stitch extension 同构 manifest，供未来 extension 分发复用：

```json
{
  "mcpServers": {
    "agentstudio": {
      "httpUrl": "<signed-discovered-http-url>/mcp",
      "headers": {
        "X-AgentStudio-Api-Key": "<agent-specific grant token>"
      },
      "timeout": 300000
    }
  }
}
```

#### Stable MCP tool

对外 MCP 工具面必须收敛为一个稳定工具：

```text
agentstudio.call
```

`agentstudio.call` 的入参固定为：

```json
{
  "apiVersion": "agentstudio.mcp.v1",
  "operation": "system.health",
  "input": {}
}
```

`operation` 是 AgentStudio 内部 Operation Registry / Tool Management 的操作 id。外部智能体不直接看到 100+ 个内部 operation；需要发现内部能力时，调用：

```text
agentstudio.call({ "operation": "agentstudio.capabilities.list" })
agentstudio.call({ "operation": "agentstudio.mcp.version" })
```

高风险内部 operation 只能通过显式 grant 扩展，并且必须保留 Tool Management policy preview、approval 和 audit。MCP `tools/list` 不得把内部 operation 展开成多个 MCP tools。

#### Version upgrade push

MCP interface version 固定从 `agentstudio.mcp.v1` 开始。服务端必须在三个位置暴露版本：

- `initialize.result.serverInfo.version`
- `initialize.result._meta.interfaceVersion` / `toolsetVersion`
- `GET /.well-known/agentstudio/mcp.json` 和 `GET /api/mcp/discovery`

服务端声明 `capabilities.tools.listChanged = true`。当工具 schema、interface version 或 toolset version 变化时，支持 Streamable HTTP 的客户端可通过 `GET /mcp` 的 SSE 事件收到 JSON-RPC notification：

```json
{
  "jsonrpc": "2.0",
  "method": "notifications/tools/list_changed",
  "params": {
    "interfaceVersion": "agentstudio.mcp.v1",
    "toolsetVersion": "2026-05-22.1",
    "stableToolName": "agentstudio.call"
  }
}
```

不支持持续 SSE 的客户端通过下一次 `initialize`、`tools/list` 或 `agentstudio.call({ "operation": "agentstudio.mcp.version" })` 获取版本变化。只有 endpoint、auth 或客户端插件 manifest 变更时才需要重新运行 `agentstudio-mcp register` 或按单客户端重新连接。

#### Installation and doctor commands

设备级 Hub 注册入口：

```bash
npm run server:mcp:register
npm run server:mcp:discover-local
```

单目标安装入口：

```bash
npm run server:mcp:install -- --target codex
npm run server:mcp:install -- --target gemini-cli
npm run server:mcp:install -- --target kilo-code
npm run server:mcp:install -- --target copilot
npm run server:mcp:install -- --target openclaw --vm kate
npm run server:mcp:install -- --target hermes --vm serena
npm run server:mcp:install -- --target antigravity
```

诊断入口：

```bash
npm run server:mcp:discover
npm run server:mcp:doctor
npm run server:verify:mcp-http
```

`server:mcp:doctor` 必须验证：

1. 是否能发现签名有效的 AgentStudio MCP 服务。
2. `POST /mcp initialize` 是否成功。
3. `tools/list` 是否只返回 `agentstudio.call`。
4. `tools/call agentstudio.call` 调用 `operation=system.health` 是否成功。
5. 统一 registry `~/.agentstudio/mcp/servers.json` 是否存在并指向已签名验证的当前服务。
6. 每个显式 opt-in 的 target 配置是否包含 AgentStudio MCP。
7. OrbStack VM 是否能访问 discovery 返回的 `vmHttpUrl`。

#### Implementation boundary

MCP handler 不能直接读写文件夹或知识库内部实现。所有 `tools/call agentstudio.call` 必须落到现有 Operation Registry、Tool Management、Workspace API、Policy Engine、Operation Ledger、Checkpoint Tree 和 storage metadata。MCP adapter 只做协议转换、身份注入、版本协商、错误规范化和 streaming / stdio transport 兼容。

本机五阶段演示使用的扩展工具面：

```text
workspace.info
workspace.file.upload
workspace.file.list
workspace.file.download
workspace.file.read
workspace.file.write
workspace.file.patch
knowledge.contribution.submit
knowledge.search
knowledge.evidence.get
knowledge.access.receipt.list
workspace.skill.upload
workspace.skill.list
workspace.skill.download
workspace.skill.usage.report
workspace.asset.policy.set
workspace.asset.permission.check
workspace.audit.query
workspace.operation.history
workspace.checkpoint.tree.list
workspace.checkpoint.restore.preview
workspace.checkpoint.restore
```

工具命名要对智能体稳定。内部可以把 `workspace.file.upload` 映射为 `workspace.contribution.submit(type=file)`，把 `workspace.file.list/download` 映射为 `workspace.asset.list/download`，但 MCP 工具名不能在演示过程中漂移。

Checkpoint 工具使用现有协议正名：`workspace.checkpoint.tree.list`、`workspace.checkpoint.restore.preview`、`workspace.checkpoint.restore`。实施讨论里的 `workspace.checkpoint.list/preview/restore` 只作为简称，不作为公开 MCP 工具名。

OpenClaw 文档互通演示：

1. OpenClaw A 调用 `workspace.contribution.submit`，把本地文档提交为 `knowledge` 或 `file` 资产。
2. AgentStudio 生成 `contribution.submitted`、`asset.created`、`snapshot.created` 和 `auditId`。
3. 资产通过策略后进入 `contribution.published`。
4. OpenClaw B 调用 `workspace.asset.list` 或 `knowledge.search` 查找目标 workspace 中可见的文档。
5. B 调用 `workspace.asset.download`；策略通过后返回下载句柄、`loanRecord`、`knowledgeAccessReceipt` 和 `asset.downloaded`。

Skill 贡献排行榜演示：

1. OpenClaw A 调用 `workspace.contribution.submit`，上传 `skill` 类型资产，并设置默认公开权限。
2. AgentStudio 发布 Skill 到 `workspace/skills/`、SkillLibrary、贡献面板和 MCP skill list。
3. OpenClaw B 通过面板或 `workspace.skill.list` 看到该 Skill。
4. B 调用 `workspace.skill.download` 或安装后上报 `workspace.skill.usage.report`。
5. AgentStudio 记录 `skill.downloaded`、`skill.installed` 或 `skill.used`，并执行 `usageCount += 1`；成功使用会提高 `successRate`，跨 workspace 采用会提高 `uniqueWorkspaceAdoptions`，随后刷新 `rankScoreV0`。

## Workspace Governance Protocol

`agentstudio.workspace-governance.v1` 是组织级工作空间共享治理协议。它不替代 contribution lifecycle，而是在 contribution、workspace share、asset copy/export/checkout、retention dispose 之前提供统一裁决。

工作空间策略必须至少包含：

- `organizationId`、`projectId`、`departmentId`
- `dataClass` 与主体 `clearance`
- `ownerSubjectIds`、`allowedSubjectIds`、`externalCollaboratorIds`
- `allowedActions`、`copyPolicy`、`exportAllowed`、`checkoutAllowed`
- `retention.policyId`、`retention.ttlDays`、`retention.retainUntil`、`retention.disposalAction`
- `legalHold.enabled`、`legalHold.holdIds`、`legalHold.reason`

公开操作：

- `workspace_governance.describe`：读取策略、共享授权和审计事件。
- `workspace_governance.policy.set`：写入或更新 workspace governance policy。
- `workspace_governance.evaluate`：对 subject/action/targetWorkspace 做组织、项目、密级、外部协作者、retention 和 legal hold 裁决。
- `workspace_governance.share_grant`：在评估通过后创建带 dataClass、retention 和 legalHold 继承信息的 share grant。

Legal hold 必须阻断 delete/purge/expire/retention.dispose 等破坏性动作。跨 workspace copy/share 必须遵守 `copyPolicy`：`deny` 全拒绝，`sameProject` 只允许同项目，`withApproval` 必须带审批号，`allow` 仍要满足主体、组织和 dataClass 裁决。

## Knowledge Protocol

知识协议公开面是 `knowledgeBase` mount 和 `agentstudio.knowledge.v1`。调用方不能直接扫描 SQLite、raw object、manifest 或外部知识库私有 API。

主要能力：

- `knowledge.search`
- `knowledge.get.evidence`
- `knowledge.asset`
- `knowledge.document.structure`
- `knowledge.export.docx`，HTTP 入口固定为 `GET /api/knowledge/export/docx`
- `raw-corpus.format.convert`，使用 `targetFormat`
- `knowledge.dossier.export`，输出同一事项的 unified dossier，使用 `outputFormat`
- `knowledge.distillation.export`，使用 `outputFormat`

知识分三层：

1. `raw-corpus-construction`：原始语料、format-conversion-only、normalized documents、sourceRange、DOCX/YAML sidecar；所有受支持原始输入格式都必须能以 DOCX 作为目标格式导出。
2. `knowledge-index-construction`：canonical evidence/index，`KnowledgeCore` 或 external knowledge-base adapter。
3. `knowledge-distillation`：从原始语料全文生成自包含知识文档，只作为背景和交付物，不替代 evidence；第二层 evidence 只负责校验、引用、补证。

工业级蒸馏验收使用 `agentstudio.knowledge-distillation-industrial.v1`。项目资料先形成 `markdown-project-digest`，邮件资料先形成 `email-thread-digest`；外部 baseline 可参考 Repomix、Gitingest、DeepEval、G-Eval 的组织和评价方式。默认模型别名为 `deepseek-v4-flash`，差距评估函数为 `evaluateIndustrialDistillationGap`，并检查 `Message-ID`、`In-Reply-To`、`References` 等邮件线程字段。

蒸馏持续优化使用 `agentstudio.knowledge-distillation-optimization.v1`。每次 `knowledgeSkillSet` evolution run 必须记录 `promptVersion`、baseline skill/model/framework、candidate skill IDs、evaluation dataset version/case IDs、error attribution、metric trend、human review 状态和 canary deployment；失败评估进入人工审核队列，通过评估后才能发布 canary，后续仍必须保留 promote/rollback 审计链。

蒸馏 portable 输出使用 `portable.knowledge-distillation.v1`，正文由稳定有序的 `contentBlocks` 组成。

搜索和证据读取必须支持预算：

- `contextBudget.knowledgeTokens`
- `payloadBudget.maxResponseBytes`
- `payloadBudget.maxEvidenceBytes`
- `continuationToken`
- `payload.nextContinuationToken`

超长结构必须保留 `structureArtifacts`，并按需派生 `granularityFragments`。预算不足时返回截断状态和 continuation，不能把完整 evidence 硬塞给调用方。

动态参数文档解析策略保留在 `dynamic-parameter-document-parsing-policy`：

- `dispatchDynamicDocumentParsingAlgorithm(input)`
- `bindDynamicDocumentParsingInvocation(request, runtimeState)`
- `granularity.secondaryParse.enabled`
- `completeOriginalAvailable`

外部知识库适配器必须仍返回 AgentStudio 形状的 evidence pack，包含 `sourceTrace`、`citations`、`assetId`、`scoreReasons`、`backendTrace` 和权限过滤结果。当前实现入口是 `server/platform/specialized/knowledge/storage/external-knowledge-base/index.mjs`，首批后端为 `pgvector`、`qdrant`、`opensearch`，通过 `AGENTSTUDIO_EXTERNAL_KB_PROVIDER` 等配置启用。

数据连接器治理保留在服务端协议层，不要求本轮实现客户端连接器。`agentstudio.data-connector-governance.v1` 校验 `agentstudio.data-connector.v1` manifest，并用 `agentstudio.local-mirror.v1` 验收 OAuth refresh 策略、增量 cursor、冲突处理、hash collision quarantine、rate limit、mirror cleanup、localQuery 禁远程和 uninstall policy。当前实现入口是 `server/platform/specialized/knowledge/connectors/data-connector-governance/index.mjs`。

性能容量基准使用 `agentstudio.performance-capacity.v1`。该协议定义 `smoke`、`pilot`、`production` 容量目标，并用合成 corpus 实际经过 `KnowledgeCore` ingest/search，同时记录外部 mirror sync、蒸馏吞吐、估算成本和失败注入结果。当前实现入口是 `server/platform/specialized/knowledge/performance/capacity-benchmark/index.mjs`。

## Asset Lineage Protocol

`agentstudio.asset-lineage.v1` 是多模态资产治理协议。图片、表格、OCR 文本、PDF/PPT 视觉元素和图文穿插蒸馏材料都必须能回溯到原始对象、页面或幻灯片、坐标锚点、解析器版本和视觉模型版本。

lineage record 必须包含：

- `assetId`、`assetType`、`mediaType`
- `rawObject.objectId`、`rawObject.uri`、`rawObject.contentHash`、`rawObject.mediaType`
- `sourceAnchor.documentId`、`sourceAnchor.page`、`sourceAnchor.slideIndex`、`sourceAnchor.bbox`、`sourceAnchor.coordinateSystem`、`sourceAnchor.sourceRange`
- `parser.id`、`parser.version`
- `visualModel.id`、`visualModel.version`、`visualModel.promptVersion`
- `ocr.id`、`ocr.version`
- `derivedFromAssetIds`
- `producedBy.operationId/jobId/batchId/mountName/parserRoute`
- `reparsePolicy.whenParserChanges/whenModelChanges/whenSourceHashChanges`

公开操作：

- `asset_lineage.describe`：读取 lineage registry。
- `asset_lineage.record`：记录或更新 asset lineage。
- `asset_lineage.trace`：按 `assetId` 或 `lineageId` 回溯派生链和 root raw object。
- `asset_lineage.reparse_plan`：当 parser、视觉模型、prompt 或 raw object hash 改变时输出重解析候选。

## Knowledge Access Protocol

`agentstudio.knowledge-access.v1` 是智能体访问 AgentLibrary 资产的源头权限协议。它不是检索算法的后处理，而是在 source、document、section、block、field、asset、evidence、export、context bundle、memory write 之前统一裁决。

`agentstudio.agent-library.v1` 是同一能力的产品语义层：它把知识访问表达为 library card、reading room、share、checkout、loan record 和 revoke。底层可继续由 `knowledgeBase` / `agentstudio.knowledge.v1` mount 实现。

上游知识库的信息和资源权限再分配是该协议的核心功能。协议必须支持把同一份 `upstreamKnowledgeRef` 映射为多个 `derivedViewRef`，并为每个 subject / workspace / agent profile 分配不同 `authorizationOverlay`、`accessMode`、`checkoutPolicy` 和 `requestedEgress` 裁决。

每个知识资产入库时必须带：

- `upstreamKnowledgeRef`
- `upstreamPolicyRef`
- `derivedKnowledgeSpace`
- `authorizationOverlay`
- `dataClass`
- `sensitivity`
- `workspaceScope`
- `sourceScope`
- `owner`
- `retention`
- `allowedSubjects`
- `allowedAgentProfiles`
- `allowedActions`
- `checkoutPolicy`

每次知识访问请求必须带：

- `libraryCardId`
- `subject`
- `operatorId`
- `agentProfile`
- `workspaceId`
- `taskId`
- `requestedAction`
- `requestedAccessMode`
- `requestedEgress`
- `targetRefs`
- `contextTarget`
- `modelRoute`

裁决结果必须返回：

- `accessMode`
- `knowledgeAccessReceipt`
- `loanRecord`
- `derivedViewRef`
- `upstreamAccessDenied`
- `allowedRefs`
- `withheldRefs`
- `withheldCounts`
- `filteredReason`
- `redactionPolicy`
- `checkoutPolicy`
- `canCite`
- `canCopyToContext`
- `canExport`
- `canWriteMemory`
- `canRetain`
- `canShare`
- `expiresAt`
- `revocationPolicy`
- `auditId`

`accessMode` 至少包含：

- `deny`
- `discoverOnly`
- `metadataOnly`
- `readInPlace`
- `citeOnly`
- `copyToContext`
- `exportAllowed`
- `checkoutAllowed`

这些是内置标准模式，用于保证 Workspace API、MCP service、控制台和审计系统能解释同一套权限。Workspace 可以通过 policy 增加自定义 `accessMode` 或 custom action，但必须映射回内置 `requestedEgress` / action，不能绕开统一裁决、receipt、loan record 或 denied request audit。

`readInPlace` 表示智能体可在受控会话内读取，但不能下载、导出、复制进 artifact、写入长期 memory、带到其它 workspace 或送入未授权模型上下文。`checkoutAllowed` 才表示内容可以被本地智能体长期持有、下载或迁移。

知识检索必须先做权限预过滤，再做召回和排序。没有权限的内容不能作为 hidden context、rerank hint、摘要材料、蒸馏输入或评估样本参与后续算法。

外部知识库接入必须使用再授权模型。上游对象只能以 `upstreamKnowledgeRef` 进入 AgentStudio，不能把上游 API token、对象路径、collection id 或裸检索结果暴露给下游智能体。AgentStudio 对上游材料执行 information slicing 后，生成 `derivedKnowledgeSpace` 和 `authorizationOverlay`；下游访问只能命中派生视图。上游存在但下游无权访问的内容必须返回 `upstreamAccessDenied=true` 或按策略完全隐藏存在性。

### Upstream Permission Demo Flow

上游知识库 A/B 权限再授权演示验证 `agentstudio.knowledge-access.v1` 是否真的在源头治理权限：

1. `externalKnowledge.sync` 或等价 adapter 从上游知识库获取文件，生成 `upstreamKnowledgeRef`、`derivedViewRef`、`derivedKnowledgeSpace` 和 AgentStudio asset id。
2. 管控台调用权限配置 API 更新 `authorizationOverlay`：A 被授予目标文件的 `read` / `export` / `checkout`，B 被设置为 `deny`。
3. 对话页面以 A 的 `libraryCardId`、subject、agent profile、workspace、task 和 `requestedEgress=exportFile` 请求同一文件。
4. 策略通过时，协议返回 `accessMode=checkoutAllowed` 或 `exportAllowed`、`allowedRefs`、`derivedViewRef`、`knowledgeAccessReceipt`、`loanRecord` 和 `auditId`。
5. 对话页面再以 B 的身份请求同一文件。
6. 策略拒绝时，协议返回权限错误，包含 `upstreamAccessDenied=true`、`withheldRefs` 或 `withheldCounts`、`filteredReason` 和 `auditId`，并写入 denied request audit。

验收要求：A 成功和 B 失败必须来自同一套 `authorizationOverlay` 裁决；B 的失败不能被表现为上游知识库不可用，也不能被 search、context bundle、export、artifact、distillation、memory write 或 tool call 旁路绕过。

所有出口必须复用同一裁决结果。`requestedEgress` 至少覆盖 `searchResult`、`evidenceRead`、`contextBundle`、`artifactWrite`、`exportFile`、`distillationInput`、`distillationOutput`、`memoryWrite`、`toolCall`、`evaluationSample`。如果裁决没有授予对应出口，系统必须返回拒绝并写入 denied request audit，不能用其它接口绕过。

`knowledgeAccessReceipt` 必须记录实际出馆的信息引用，而不是只记录调用名。最小字段包括：

- `receiptId`
- `libraryCardId`
- `subject`
- `agentProfile`
- `workspaceId`
- `taskId`
- `egress`
- `accessMode`
- `infoRefs`
- `redactionPolicy`
- `loanRecordId`
- `auditId`

`loanRecord` 表示内容被借走或可在会话外保留。只有 `checkoutAllowed`、`exportAllowed` 或明确授权的 `copyToContext` 才能生成可保留内容；否则只能生成 `readInPlace` 阅览记录。

## Context Bundle Protocol

Context Compiler 负责把 workspace state 编译成本地智能体可用的上下文包。

输入：

- `workspaceId`
- `taskId`
- `operatorProfile`
- `contextBudget`
- `knowledgeScopes`
- `memoryScopes`
- `outputContract`

输出：

- `goals`
- `constraints`
- `allowedActions`
- `forbiddenActions`
- `evidenceRefs`
- `memoryEntries`
- `recentEvents`
- `artifactRefs`
- `openQuestions`
- `compressionTrace`

短上下文智能体拿到的是压缩上下文；长上下文智能体可以拿到更多 evidence 摘要和轨迹。无论上下文多长，canonical fact 仍然以 evidence 和 decision 为准。

## Tool Management Protocol

Tool Management v1 管理公共能力，不管理智能体人格。

能力：

- catalog
- grant
- policy preview
- execute
- audit
- metrics

危险操作必须由策略层裁决，不能依赖提示词自律。工具执行必须带 `toolGrantId`、`risk`、`confirm`、`requiredScopes` 和 `auditId`。

## Agent Session Compatibility

现有 `agent_sessions.list/get/context/events.append/fork` 保留为兼容面，用于加载历史会话和构造 context bundle。

会话线程治理补齐 `agent_sessions.compare`、`agent_sessions.merge_proposal` 和 `agent_sessions.archive`。compare 是只读 diff；merge proposal 只追加 `session_merge_proposal` 事件且 `autoMergeApplied=false`；archive 追加 `session_archived` 事件并标记状态，不删除历史。

长期方向是把会话视为 workspace state 的一种 event stream：

- `trace`：执行轨迹
- `observation`：观察
- `summary`：压缩记忆
- `proposal`：建议
- `decision`：已确认事实

会话 memory 可以被其它智能体加载，但不能直接成为公共事实。

## Module Ecosystem Protocol

`agentstudio.module-ecosystem.v1` 是服务端模块生态协议，不要求实现客户端。它把外部团队接入 parser、analysis、knowledgeBase、vectorStore、graphStore、Tool Package 和 Skill Package 的动作收敛为四类服务端能力：

- `module_ecosystem.templates`：列出官方模板、mountName、capability、默认示例和 CI 要求。
- `module_ecosystem.plan`：生成脚手架写入计划，明确将创建或覆盖的文件。
- `module_ecosystem.scaffold`：写入 module manifest、示例实现、sample、contract test 脚本和 GitHub Actions 模板；写入操作必须经过 `runtime:admin` 或等价授权。
- `module_ecosystem.contract_test`：导入外部 mount factory，验证 `createMount`、`supports`、`extractDocument/extractText`、`onBatchCompleted`、`reload`、`close` 等合同；对 Tool/Skill 包则验证 capability package manifest。

生成的 mount module manifest 使用 `agentstudio.mount-module.v1`，必须声明 `moduleId`、`templateId`、`mountName`、`entrypoint`、`capabilities`、`contract.factoryExports` 和 `contract.contractTest`。生成的 Tool/Skill 包必须继续服从 `agentstudio.tool-package.v1` / `agentstudio.skill-registry.v1` 生命周期治理。

## Executive Report Protocol

`agentstudio.executive-report.v1` 是服务端管理层报告协议，不依赖前端驾驶舱。它把生产门禁、资产贡献统计、容量成本、评估质量和 trace 安全摘要合并成可持久化、可审计、可给阶段评审使用的报告。

报告必须包含：

- `executiveSummary.keyFindings` 和 `recommendedDecisions`
- `productionReadiness.status/latestRunId/blockedP0/failedGates/missingCoverage`
- `assetValue.acceptedCount/usageCount/uniqueWorkspaceAdoptions/permissionRequestCount/permissionGrantCount/rollbackCount`
- `assetValue.topReusableAssets/highDemandRestrictedAssets/rollbackHotspots/underMaintainedAssets`
- `qualityAndEvaluation.ragScore/distillationScore/agentTaskSuccessRate/unsupportedClaimCount/regressions`
- `capacityAndCost.capacityProfile/searchP95Ms/qps/estimatedCostUsd/failures`
- `traceAndSecurity.redactionFailures/deniedRequests/highRiskToolCalls/costUsd`
- `risks`，按 production gate、restricted asset、rollback hotspot 等来源生成

公开操作：

- `executive_report.list`：读取已生成报告。
- `executive_report.preview`：基于输入和最新 production health 生成预览，不持久化。
- `executive_report.generate`：生成并持久化报告。

## Architecture Live Map Protocol

`agentstudio.architecture-live-map.v1` 是服务端架构活文档协议。它不要求实现客户端，而是把核心架构节点连接到设计文档、服务端实现路径和 production readiness gate，让阶段评审可以直接看到“设计是否落地、落地是否仍在运行门禁中通过”。

每个架构节点必须包含：

- `nodeId`、`label` 和节点级 `status`
- `docRefs[].path/exists`，指向对应设计文档
- `implementationPaths[].path/exists`，指向服务端实现入口
- `gates[].gateId/status/title/nextStep`，指向生产就绪门禁
- `missingDocs` 和 `missingImplementations`，明确活文档断链

公开操作：

- `architecture.live_map`：读取当前架构节点到文档、实现路径和生产门禁状态的映射。

## Sample Business Pack Protocol

`agentstudio.sample-business-pack.v1` 是服务端样例业务包协议，不依赖客户端。它把新成员和业务方最常见的验收材料打包成可物化目录：邮件线程、PDF、PPT、Markdown 项目文档和外部知识库 docker compose。

样例业务包必须包含：

- `packId`、`title`、`businessDomain`、`tags`
- `assets[].relativePath/category/mediaType/parserRoute/evidenceRole/sha256`
- `ingestPlan[].stepId/source/route/expectedSignals`
- `externalServices[].serviceId/role/composePath/defaultEndpoint`
- 物化结果中的 `targetRoot`、`manifestPath` 和 `writtenFiles`

公开操作：

- `sample_business_pack.list`：列出内置样例业务包。
- `sample_business_pack.get`：读取指定样例业务包 manifest。
- `sample_business_pack.materialize`：在服务端数据目录下生成样例文件和 manifest。

## Protocol Adapters

AgentStudio 可以提供协议适配，但适配层不得污染核心模型：

- MCP server：把 workspace/evidence/artifact/proposal 能力暴露成工具，是智能体长期正式接入面。
- A2A adapter：只做兼容 agent card 和任务入口，不内嵌完整 A2A Gateway。
- OpenAI-compatible model gateway：可选，用于 workspace-aware model routing、context injection、audit 和 redaction。
- OpenAPI/REST：服务端、控制台和调试兼容面，不作为智能体同级正式面。
- CLI/SDK：辅助自动化和运维入口，不作为长期同级承诺。

## 版本与兼容

协议版本采用 `agentstudio.<domain>.vN`。破坏性字段变更必须升级版本；新增字段必须向后兼容；删除字段必须先进入 deprecated 状态并保留迁移期。

所有协议变更必须同步：

- `SERVER_API_OPERATIONS`
- Tool Management catalog
- 控制台 bridge/types
- 相关验证脚本
- `docs/PRODUCTION-CAPABILITY-GAP.md` 中的差距项
