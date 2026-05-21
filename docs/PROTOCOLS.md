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
- [Workspace Contribution Protocol](#workspace-contribution-protocol)
  - [MCP Demo Flows](#mcp-demo-flows)
- [Knowledge Protocol](#knowledge-protocol)
- [Knowledge Access Protocol](#knowledge-access-protocol)
  - [Upstream Permission Demo Flow](#upstream-permission-demo-flow)
- [Context Bundle Protocol](#context-bundle-protocol)
- [Tool Management Protocol](#tool-management-protocol)
- [Agent Session Compatibility](#agent-session-compatibility)
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
| `agentstudio.knowledge-access.v1` | source-level knowledge permissions、accessMode、checkoutPolicy、readInPlace、export 和 context injection 裁决。 |
| `agentstudio.agent-library.v1` | AgentLibrary / 图书馆的 library card、loanRecord、knowledgeAccessReceipt、share、checkout 和 revoke 语义。 |
| `agentstudio.workspace-contribution.v1` | 终端贡献资产、Skills、工具、脚本、专家意见、黄金规则、排行榜、资产贡献统计报表和贡献授权。 |
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

### MCP Demo Flows

AgentStudio MCP service 是 Workspace API 的协议适配器，不是 agent-to-agent gateway。它可以给 OpenClaw、Codex、Claude Code、Cursor Agent 或脚本型 agent 暴露同一组 workspace 工具：

- `workspace.contribution.submit`
- `workspace.asset.list`
- `workspace.asset.download`
- `workspace.skill.list`
- `workspace.skill.download`
- `workspace.skill.usage.report`
- `workspace.audit.query`

第一版 MCP service 同时支持 HTTP 和 stdio：

- HTTP 是权威服务入口，面向 Hermes Agent 这类 `mcp_servers.<name>.url` 配置形态；本机默认监听 `127.0.0.1:8791/mcp`，OrbStack 内通过 `host.orb.internal:8791/mcp` 访问。
- stdio 是本地智能体兼容入口，面向 OpenClaw、Codex 或 Claude Code 这类 command/args 配置形态；stdio 进程只做 HTTP MCP 代理，不维护独立状态。
- 协议层第一版手写最小 MCP JSON-RPC，不引入官方 SDK；必须覆盖 `initialize`、`tools/list`、`tools/call`、标准错误返回和工具 schema。
- MCP handler 不能直接读写文件夹或知识库内部实现，所有工具调用必须落到 Workspace API、Operation Ledger、permission decision、Checkpoint Tree 和 storage metadata。

本机五阶段演示使用的最小工具面：

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

长期方向是把会话视为 workspace state 的一种 event stream：

- `trace`：执行轨迹
- `observation`：观察
- `summary`：压缩记忆
- `proposal`：建议
- `decision`：已确认事实

会话 memory 可以被其它智能体加载，但不能直接成为公共事实。

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
