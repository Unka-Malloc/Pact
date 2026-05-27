# Implementation Decision Register

审计日期：2026-05-21。本文是实现前的设计决策登记表，用于接下来集中做设计和拍板。

本文不是第六份核心架构文档。它只记录“还需要决策什么、优先级是什么、决策完成后要回写到哪里”。任何被拍板的长期设计结论，必须同步回写到：

- `docs/Architecture.md`
- `docs/PROTOCOLS.md`
- `docs/WORKSPACE-ASSET-GOVERNANCE.md`
- `docs/KNOWLEDGE-GOVERNANCE.md`
- `docs/PRODUCTION-CAPABILITY-GAP.md`

## 决策原则

对外口径固定为：

> 两个问题，一个能力，三个兼容。

两个问题：

- 知识库缺少面向智能体的权限管控。
- 本地智能体相对独立，难以协同。

一个能力：

- 工作空间管理，覆盖权限控制、统一 Checkpoint Tree、Operation Ledger、回溯、恢复和审计。
- 管理者视角必须有资产贡献统计报表，用来证明公共空间沉淀了什么资产、谁贡献、谁使用、复用多少、风险在哪里。

三个兼容：

- 智能体兼容：不关心底层是什么大模型、agent framework 或机器人体系，统一通过 Pact MCP service / Workspace API 接入。
- 信息源兼容：不关心信息来自知识库、网站订阅、文件库、业务系统、人工整理或智能体上传文档，统一进入 workspace asset model。
- 工作空间环境兼容：不关心工作空间运行在容器、虚拟机、本机、云端、Linux、macOS 或 Windows；只要安装 Pact 管理软件，智能体访问工作空间必须经过 Pact。

优先级定义：

- P0：不拍板就不能开始正确实现，或会影响权限、安全、协议、数据模型和四个核心演示。
- P1：不拍板会影响首轮可用闭环、控制台体验、审计可解释性和试点验收。
- P2：不拍板会影响生产硬化、跨团队扩展、性能、成本和长期维护。
- P3：增强竞争力和生态体验，可以在主闭环稳定后再做。

状态定义：

- `待决策`：需要产品和工程一起拍板。
- `默认建议`：当前文档给出的推荐方向，不等于最终决议。
- `已决议`：已经完成产品决策；实现必须按该结论落地。
- `决议后回写`：拍板后必须更新的核心文档或协议面。

## 当前决议总表

截至本轮，P0/P1/P2/P3 条目均已完成决议。后续实现以本表和各小节 `已决议` 为准；小节中的“需要决策”保留原始问题，用于追溯当时为什么要拍板。

### P0 已决议

| 决策 | 结论 |
| --- | --- |
| `DEC-P0-01` 产品边界 | 锁定“两个问题，一个能力，三个兼容”。不做完整 A2A Gateway、不做自治 Agent 平台、不做外部知识库同型复制。 |
| `DEC-P0-02` 接入面 | 智能体默认通过 Pact MCP service 接入；Workspace API 是协议事实源；其它入口只是适配。 |
| `DEC-P0-03` 身份模型 | 采用四层模型：subject 是权限主体，operator 是执行入口，agentProfile 是风险/能力上下文，libraryCard 是可审计访问凭据。 |
| `DEC-P0-04` 资产模型 | 固定完整最小资产集：rawAssets、derivedAssets、contributedAssets、evidencePacks、artifacts、tasks、observations、proposals、decisions、memoryEntries、operationLedger、snapshots。 |
| `DEC-P0-05` 权限模式 | 采用内置标准模式 + workspace 自定义扩展。内置模式保证互操作，自定义 mode/action 用于业务扩展。 |
| `DEC-P0-06` 上游再授权 | 所有上游对象进入 Pact 后必须生成 upstreamKnowledgeRef、derivedViewRef、derivedKnowledgeSpace、authorizationOverlay。 |
| `DEC-P0-07` 出口裁决 | search、evidence、context、export、artifact、distillation、memory、tool call、eval 等所有出口强制复用同一权限裁决。 |
| `DEC-P0-08` 统一 Checkpoint Tree | 任务、队列、访问请求、文件变动、知识贡献、技能调用、权限裁决、上下文暴露和恢复动作全部进入统一 Checkpoint Tree。 |
| `DEC-P0-09` git worktree 边界 | 可以复用 git tree/diff/worktree 底层能力，但产品恢复必须是 append-only restore operation，采用更安全的模式替代裸 reset 语义以保护用户数据。 |
| `DEC-P0-10` 工作空间环境 | 受管工作空间必须安装 Pact 管理软件；智能体访问必须经过 adapter；直连文件系统视为未受管。 |
| `DEC-P0-11` 贡献状态机 | 固定 submitted -> preview -> scanned -> reviewed -> published/rejected/needs_changes -> adopted -> deprecated/revoked；内容到达服务器并完成最小留档后才是 preview，审核和权限确认后才是 published。 |
| `DEC-P0-12` Skill 贡献值 | 采用“使用为主”的质量加权公式：以 usageCount * successRate 为核心，叠加 uniqueWorkspaceAdoptions，扣减 rollbackCount。 |
| `DEC-P0-13` 贡献报表 | 资产贡献统计报表进入 P0，是管理者视角必备能力。 |
| `DEC-P0-14` 演示验收 | 四个演示全部作为 P0 验收：文档互通、Skill 贡献、A/B 权限、Checkpoint Tree 恢复。 |
| `DEC-P0-15` 控制台页面 | 第一版控制台做闭环全量：asset browser、AgentLibrary 权限、contribution/Skill、资产贡献统计报表、Checkpoint Tree、audit/receipt。 |
| `DEC-P0-16` 存储权威 | Ledger、permission、receipt、loan record、checkpoint metadata 是权威；文件树和索引是 projection。 |

### P1 已决议

| 决策 | 结论 |
| --- | --- |
| `DEC-P1-01` Context Compiler | 权限优先压缩：只编译授权内容；短上下文拿压缩包，长上下文拿完整 evidence summary。 |
| `DEC-P1-02` receipt/loan | 细粒度记录到 section/block/field/info ref；loan record 记录保留范围、过期、撤销和跨 workspace 流转。 |
| `DEC-P1-03` connector 顺序 | 第一批信息源：本地文件、智能体上传、外部知识库。网站订阅延后。 |
| `DEC-P1-04` Skill 沙箱 | Skill 可带 manifest 和资源；执行必须通过 Tool Management grant；安装和使用都写事件。 |
| `DEC-P1-05` durable execution | 语义先行：定义 `pact.workflow.v1`，第一版自研轻量 runner 对齐 workflow/activity/retry/signal/timer/resume。 |
| `DEC-P1-06` 验收门禁 | 建立统一 production readiness 报告和门禁。 |
| `DEC-P1-07` 可观测性 | 内部 Trace 是事实源，但字段设计预留 OpenTelemetry 导出映射。 |
| `DEC-P1-08` 评估基准 | 建立最小真实样例集，覆盖 RAG、蒸馏、Agent、工具调用、权限拒绝、恢复演练。 |
| `DEC-P1-09` 贡献生态 | 贡献生态先走报表驱动，不单独做完整市场。 |
| `DEC-P1-10` 授权工作流 | 贡献资产、AgentLibrary 资产、外部知识库派生资产共用 permission request，审批人由资产类型和 workspace policy 决定。 |

### P2 已决议

| 决策 | 结论 |
| --- | --- |
| `DEC-P2-01` 多租户 | Workspace boundary 优先；完整 tenant/org/team 在 P2 再做。 |
| `DEC-P2-02` 密钥 | 系统内只暴露 secret ref；上下文、trace、export、checkpoint node 不出现 secret value。 |
| `DEC-P2-03` 外部检索引擎后端 | 首个真实底层检索引擎后端选 pgvector。 |
| `DEC-P2-04` 环境适配顺序 | 先做本机和容器；VM/云端复用 adapter contract。 |
| `DEC-P2-05` 会话合并 | 冲突治理走 merge proposal，不自动写 decision。 |
| `DEC-P2-06` 成本配额 | 建立按 workspace/subject/agentProfile 的 budget policy。 |
| `DEC-P2-07` SDK/CLI/OpenAPI | 正式面长期以 MCP service 为主；SDK/CLI/OpenAPI 不作为同级承诺。 |

### P3 已决议

| 决策 | 结论 |
| --- | --- |
| `DEC-P3-01` 贡献生态 | 长期以资产贡献统计报表演进为主，逐步增加贡献者主页和推荐。 |
| `DEC-P3-02` 管理驾驶舱 | 管理驾驶舱优先，第一版突出资产价值。 |
| `DEC-P3-03` A2A/模型网关 | A2A adapter 和 OpenAI-compatible model gateway 保持可选，不进入核心闭环。 |
| `DEC-P3-04` Agent Traffic Gateway | 智能体流量负载网关保持可选、可拆卸；拆除后 Pact direct mode 必须正常运行。 |
| `DEC-P3-05` 联邦工作空间 | 暂不做；等单实例 workspace governance 稳定后再评估。 |

## P0 决策

### DEC-P0-01 产品边界是否锁定为“两个问题，一个能力，三个兼容”

需要决策：

- 是否把“两个问题，一个能力，三个兼容”作为所有实现、演示、对外介绍和验收的最高口径。
- 是否明确不做完整 A2A Gateway、不做自治 Agent 平台、不做外部知识库同型复制。

默认建议：锁定。后续所有功能都必须能解释自己服务于知识权限管控、本地智能体协同、工作空间管理或三个兼容之一。

已决议：锁定。

决议后回写：`Architecture.md`、`PROTOCOLS.md`、`WORKSPACE-ASSET-GOVERNANCE.md`。

### DEC-P0-02 首选接入面是否确定为 Pact MCP service / Workspace API

需要决策：

- OpenClaw、Codex、Claude Code、Cursor Agent、脚本型 agent 是否统一通过 Pact MCP service / Workspace API 接入。
- REST / OpenAPI / CLI / SDK 是不是只作为同一协议的其它 adapter。
- 第一版 MCP 工具集是否只覆盖 workspace、asset、knowledge、contribution、checkpoint、permission、audit。

默认建议：MCP service 是智能体首选接入面，Workspace API 是协议事实源，其它 adapter 只做兼容。

已决议：MCP service 是智能体首选接入面，Workspace API 是协议事实源。

决议后回写：`PROTOCOLS.md`、`Architecture.md`。

### DEC-P0-03 身份、主体、门禁卡和 agent profile 模型

需要决策：

- `subject`、`operatorId`、`agentProfile`、`workspaceId`、`libraryCardId` 的关系。
- 人、智能体、脚本、服务账号是否共用一套 subject model。
- agent profile 是否参与权限裁决，例如同一个人使用不同智能体时权限不同。
- library card 是绑定人、agent、workspace，还是绑定一次任务会话。

默认建议：subject 是权限主体，operator 是执行入口，agentProfile 是风险和能力上下文，libraryCard 是进入 AgentLibrary 的可审计凭据。

已决议：采用 subject / operator / agentProfile / libraryCard 四层模型。

决议后回写：`PROTOCOLS.md`、`KNOWLEDGE-GOVERNANCE.md`、`WORKSPACE-ASSET-GOVERNANCE.md`。

### DEC-P0-04 Workspace Asset Model 的最小资产类型

需要决策：

- 第一版是否固定 `rawAssets`、`derivedAssets`、`contributedAssets`、`evidencePacks`、`artifacts`、`tasks`、`observations`、`proposals`、`decisions`、`memoryEntries`、`operationLedger`、`snapshots`。
- `knowledge`、`file`、`skill`、`tool`、`script`、`goldenRule`、`expertOpinion` 是否都作为 workspace asset 类型，而不是散落在不同模块。
- 文件树路径、数据库对象、evidence id、asset id 如何互相引用。

默认建议：先固定最小资产类型和引用关系，再做 UI 和接口；文件树只是资产的一种视图，不是全部权威状态。

已决议：固定完整最小资产集。

决议后回写：`WORKSPACE-ASSET-GOVERNANCE.md`、`PROTOCOLS.md`。

### DEC-P0-05 AgentLibrary 权限颗粒度和 accessMode

需要决策：

- 是否固定 `deny`、`discoverOnly`、`metadataOnly`、`controlledView`、`citeOnly`、`copyToContext`、`exportAllowed`、`checkoutAllowed`。
- 是否把 `read`、`cite`、`copyToContext`、`export`、`checkout`、`writeMemory`、`share` 分成不同动作。
- 表格 cell、图片、附件、section、block、field 是否都要成为可授权颗粒度。

默认建议：固定 accessMode 和动作集合，宁可第一版实现少一点，也不要继续使用一个笼统的 `canAccess`。

已决议：采用内置标准模式 + workspace 自定义扩展。内置模式用于互操作，自定义 mode/action 用于业务策略扩展。

决议后回写：`KNOWLEDGE-GOVERNANCE.md`、`PROTOCOLS.md`。

### DEC-P0-06 上游知识库再授权模型

需要决策：

- 外部知识库进入 Pact 后是否必须生成 `upstreamKnowledgeRef`、`derivedViewRef`、`derivedKnowledgeSpace`、`authorizationOverlay`。
- 下游智能体是否永远不能持有上游 token、上游对象路径、collection id 或裸 source id。
- A/B 权限演示中，B 被拒绝时是显示明确权限错误，还是按策略隐藏存在性。

默认建议：必须生成派生视图和本地权限覆盖层；B 的对话页默认显示可解释权限错误，只有高敏感资产才隐藏存在性。

已决议：强制生成派生视图和本地权限覆盖层。

决议后回写：`KNOWLEDGE-GOVERNANCE.md`、`PROTOCOLS.md`、`PRODUCTION-CAPABILITY-GAP.md`。

### DEC-P0-07 所有出口是否强制复用同一权限裁决

需要决策：

- search、evidence read、context bundle、export、artifact write、distillation、memory write、tool call、evaluation sample 是否必须共享同一裁决结果。
- 权限拒绝是否必须进入 denied request audit。
- 未授权内容能否进入 rerank hint、hidden context、distillation input 或评估样本。

默认建议：所有出口共用同一裁决；未授权内容不能以任何形式进入算法后续链路。

已决议：所有出口强制共用同一权限裁决。

决议后回写：`PROTOCOLS.md`、`KNOWLEDGE-GOVERNANCE.md`。

### DEC-P0-08 Operation Ledger 和统一 Checkpoint Tree 的提交模型

需要决策：

- 是否把任务、队列、访问请求、文件变动、知识贡献、技能调用、权限裁决、上下文暴露和恢复动作都纳入同一棵统一 Checkpoint Tree。
- 每个进入公共空间边界的行为是否都形成 `checkpointNode`。
- `checkpointNode` 最小字段是否固定为 `checkpointNodeId`、`parentNodeIds`、`workspaceId`、`subject`、`operatorId`、`agentProfile`、`eventKind`、`effectKind`、`targetRefs`、`policyDecision`、`stateDelta`、`receiptRefs`、`auditId`、`createdAt`。
- 读请求是否也必须入树，即使它不改变文件树。
- Checkpoint Tree 是只管理文件树，还是同时管理资产、权限、evidence、贡献、技能调用、receipt、loan record、usage event、denied request audit 和审计引用。

默认建议：所有公共空间行为都进入 Operation Ledger，并物化为统一 Checkpoint Tree。读请求也入树，因为它会产生 receipt、loan record、usage event、denied request audit 或上下文暴露记录。Checkpoint Tree 是 workspace governance graph，不只是文件树历史。

已决议：所有公共空间行为全量进入统一 Checkpoint Tree。第一版读请求也全量入树，包括 list、discover、metadata、permission check、receipt list、audit query、operation history 和 checkpoint tree list；不能只进普通接口日志。同一次外部请求内部读取 Ledger、AuditStore、CheckpointTree 或 projection 时，不递归生成新的 checkpoint node。

决议后回写：`WORKSPACE-ASSET-GOVERNANCE.md`、`PROTOCOLS.md`。

### DEC-P0-09 恢复语义和 git worktree 复用边界

需要决策：

- 是否复用 git worktree 的 tree、diff、commit graph、临时 worktree preview、checkout-like restore 能力。
- 是否采用更安全的方式保护数据以替代裸 `git reset --hard` 作为产品恢复语义。
- `restoreToCheckpoint` 和 `revertOperationScope` 是否都进入第一版。

默认建议：可以复用 git 底层能力，但产品恢复必须是 append-only restore operation；第一版同时支持按 checkpoint 恢复和按 operator/task scope 回撤。

已决议：复用 git 底层能力但必须封装；采用更安全的恢复模式替代裸 reset 语义以保护数据。

决议后回写：`PROTOCOLS.md`、`WORKSPACE-ASSET-GOVERNANCE.md`。

### DEC-P0-10 工作空间环境兼容和管理软件边界

需要决策：

- Pact 管理软件在本机、容器、虚拟机、云端分别承担哪些职责。
- Linux、macOS、Windows 的路径、权限、文件监听、shell、进程能力如何抽象。
- 智能体是否只能通过管理软件访问受管工作空间，是否允许直连文件系统。

默认建议：受管工作空间必须经由 Pact adapter 访问；本地文件系统直连只能作为未受管区域，不进入公共 workspace state。

已决议：受管工作空间强制经过 Pact 管理软件和 adapter。

决议后回写：`Architecture.md`、`PROTOCOLS.md`、`WORKSPACE-ASSET-GOVERNANCE.md`。

### DEC-P0-11 终端贡献的入库、审核和发布状态机

需要决策：

- 贡献资产类型是否固定为 `knowledge`、`skill`、`tool`、`script`、`file`、`goldenRule`、`expertOpinion`。
- 状态机是否固定为 `submitted -> preview -> scanned -> reviewed -> published | rejected | needs_changes -> adopted -> deprecated | revoked`。
- 哪些贡献必须人审，哪些可以策略自动发布。

默认建议：类型和状态机先固定；第一版默认高风险 Skill、tool、script 必须人审，knowledge/file 可按 workspace policy 自动发布或进入 review。

已决议：固定贡献状态机。内容到达服务器并完成最小留档后进入 `preview`；权限、风险、许可、重复性和审核策略确认后才进入 `published`。

决议后回写：`WORKSPACE-ASSET-GOVERNANCE.md`、`PROTOCOLS.md`。

### DEC-P0-12 Skill 共享权限和贡献值 v0 算法

需要决策：

- Skill 的默认公开权限是否允许配置为 workspace 内 `read`、`install`、`use`。
- `usageCount` 是按下载、安装、执行分别计数，还是统一计一次使用。
- 第一版是否仍使用简单的 accepted/usage 求和，还是改为使用为主的质量加权公式。

默认建议：使用为主的质量加权公式；下载、安装、执行都写 usage event，但排行榜默认按确认成功使用和跨 workspace 采用计分。

已决议：改为使用为主的质量加权公式，核心为 `usageCount * successRate + uniqueWorkspaceAdoptions - rollbackCount`；提交数量不作为主导项。

决议后回写：`WORKSPACE-ASSET-GOVERNANCE.md`、`PROTOCOLS.md`。

### DEC-P0-13 资产贡献统计报表

需要决策：

- 资产贡献统计报表是否作为工作空间管理的管理者视角必备能力进入 P0。
- 第一版报表是否覆盖 workspace、贡献者、资产类型、时间窗口、使用动作、授权流、风险和维护状态。
- `assetContributionReportV0 = acceptedCount + usageCount + uniqueWorkspaceAdoptions + permissionGrantCount - rollbackCount` 是否作为第一版汇总口径。
- 报表和排行榜的关系：排行榜是否从报表派生，报表是否保留更完整的治理维度。

默认建议：资产贡献统计报表进入 P0；排行榜只是外显激励，报表才是管理者判断公共空间价值的核心入口。

已决议：资产贡献统计报表进入 P0。

决议后回写：`WORKSPACE-ASSET-GOVERNANCE.md`、`PROTOCOLS.md`、`PRODUCTION-CAPABILITY-GAP.md`。

### DEC-P0-14 四个演示场景的第一版验收口径

需要决策：

- OpenClaw 文档互通演示：A 上传本地文档，B 从 workspace 下载。
- Skill 贡献排行榜演示：A 上传默认公开 Skill，B 下载/使用，A 贡献值增加。
- 上游知识库 A/B 权限演示：A 能获取文件，B 返回权限错误。
- Checkpoint Tree 安全恢复演示：A 删除大量文件，管理员恢复到 A 操作前节点。

默认建议：四个演示都作为 P0 实现验收，需完整覆盖所有场景后方可宣称主线闭环。

已决议：四个演示全部作为 P0 验收。

决议后回写：`PRODUCTION-CAPABILITY-GAP.md`、`WORKSPACE-ASSET-GOVERNANCE.md`。

### DEC-P0-15 控制台第一版必须有哪些页面

需要决策：

- 是否至少需要 workspace asset browser、AgentLibrary 权限面板、contribution/Skill 面板、资产贡献统计报表、Checkpoint Tree、audit/receipt 页面。
- 对话页面是否必须支持切换 A/B 身份来验证权限。
- Checkpoint Tree 是否必须支持 restore preview。

默认建议：第一版控制台必须覆盖权限配置、贡献发现、资产贡献统计报表、Checkpoint Tree 恢复和审计查看；否则四个演示和管理者价值无法闭环。

已决议：控制台第一版按闭环全量建设。

决议后回写：`WORKSPACE-ASSET-GOVERNANCE.md`、`PRODUCTION-CAPABILITY-GAP.md`。

### DEC-P0-16 数据库和文件存储的权威边界

需要决策：

- 哪些状态在 SQLite / metadata DB，哪些在对象存储，哪些在 git-like tree，哪些可重建。
- evidence、loanRecord、knowledgeAccessReceipt、operationLedger、checkpoint 是否都需要稳定 id。
- workspace restore 后如何重建索引、evidence、贡献引用和权限 overlay。

默认建议：ledger、permission、receipt、loan record、checkpoint metadata 是权威状态；向量索引和派生检索结构必须可重建。

已决议：Ledger、permission、receipt、loan record、checkpoint metadata 是权威；文件树和索引是 projection。

决议后回写：`WORKSPACE-ASSET-GOVERNANCE.md`、`KNOWLEDGE-GOVERNANCE.md`、`PROTOCOLS.md`。

## P1 决策

### DEC-P1-01 Context Compiler 和短上下文智能体支持

需要决策：

- context bundle 能包含哪些 workspace state。
- 短上下文智能体是否默认拿压缩包，长上下文智能体是否拿完整 evidence summary。
- 权限拒绝内容是否允许进入摘要。

默认建议：Context Compiler 只能编译授权内容；压缩策略不能突破 AgentLibrary 权限裁决。

已决议：权限优先压缩；短上下文拿授权压缩包，长上下文拿完整 evidence summary。

决议后回写：`PROTOCOLS.md`、`KNOWLEDGE-GOVERNANCE.md`。

### DEC-P1-02 审计、receipt、loan record 的字段和保留周期

需要决策：

- `knowledgeAccessReceipt` 记录到 section/block/field 级别还是 asset 级别。
- `loanRecord` 是否记录过期、撤销、保留范围、跨 workspace 流转。
- denied request audit 保留多久，是否对用户可见。

默认建议：P1 固定字段，P0 可以先用最小 schema；denied request audit 必须管理员可见。

已决议：细粒度记录到 section/block/field/info ref，loan record 记录保留范围、过期、撤销和跨 workspace 流转。

决议后回写：`KNOWLEDGE-GOVERNANCE.md`、`PROTOCOLS.md`。

### DEC-P1-03 信息源兼容的第一批 connector 顺序

需要决策：

- 上游知识库、网站订阅、文件夹同步、人工上传、智能体上传，第一批先做哪些。
- 外部知识库后端优先 pgvector、qdrant、opensearch，还是先做本地 adapter。
- 网站订阅是 P1 还是 P2。

默认建议：第一批只做本地文件/智能体上传/外部知识库 mock 或单一真实后端；网站订阅延后。

已决议：第一批信息源为本地文件、智能体上传、外部知识库。

决议后回写：`PRODUCTION-CAPABILITY-GAP.md`、`PROTOCOLS.md`。

### DEC-P1-04 Tool / Skill 安装和沙箱模型

需要决策：

- Skill 是纯 prompt/workflow，还是允许携带脚本、文件、依赖和工具 schema。
- 安装到本地智能体后如何记录版本、来源、授权、撤销和使用。
- 脚本执行是否进入 Tool Management v1 风险分层。

默认建议：Skill 可携带 manifest 和资源，但执行必须通过 Tool Management grant；安装和使用都写 usage event。

已决议：采用 manifest + resource + Tool Management grant。

决议后回写：`PROTOCOLS.md`、`WORKSPACE-ASSET-GOVERNANCE.md`。

### DEC-P1-05 长任务 durable execution 语义

需要决策：

- 是否引入 Temporal 类语义，还是先自研 lightweight workflow runner。
- workflow、activity、retry、signal、timer、resume、compensation 的最小集合。
- 文档解析、外部知识库同步、批量恢复、批量导入是否都走 workflow。

默认建议：先定义 `pact.workflow.v1` 语义，第一版自研 runner 对齐接口，后续可替换。

已决议：语义先行，第一版自研轻量 runner 对齐。

决议后回写：`PRODUCTION-CAPABILITY-GAP.md`、`PROTOCOLS.md`。

### DEC-P1-06 生产验收门禁和报告格式

需要决策：

- 是否新增统一 `server:verify:production-readiness`。
- 报告是否覆盖四个演示、权限、安全、恢复、真实文档解析、外部知识库、RAG/Agent eval。
- P0 未通过时是否阻断发版。

默认建议：必须做统一门禁；P0 不通过不能宣称生产可用。

已决议：建立统一 production readiness 报告和门禁。

决议后回写：`PRODUCTION-CAPABILITY-GAP.md`。

### DEC-P1-07 可观测性和 trace schema

需要决策：

- 是否使用 OpenTelemetry 作为 trace/metrics/logs 标准。
- upload、parse、ingest、search、evidence、context compile、tool execution、checkpoint restore 是否都要串同一个 trace。
- 模型调用和权限裁决是否写入同一 trace。

默认建议：内部 Trace 作为事实源，字段设计预留 OpenTelemetry 导出映射；权限裁决必须可追踪。

已决议：内部 Trace 是事实源，字段设计预留 OpenTelemetry 导出映射。

决议后回写：`PRODUCTION-CAPABILITY-GAP.md`、`PROTOCOLS.md`。

### DEC-P1-08 评估体系和真实样例基准

需要决策：

- 是否建立 RAG、蒸馏、Agent、工具调用、权限拒绝、恢复演练的统一评估集。
- 外部 baseline 使用哪些：Dify、LlamaIndex、Haystack、Ragas、Phoenix、Repomix、Gitingest。
- eval 失败是否阻断发版。

默认建议：P1 先建立最小真实样例集和回归评估，P2 再扩大基准。

已决议：建立最小真实样例集，覆盖 RAG、蒸馏、Agent、工具调用、权限拒绝、恢复演练。

决议后回写：`PRODUCTION-CAPABILITY-GAP.md`、`KNOWLEDGE-GOVERNANCE.md`。

### DEC-P1-09 贡献排行榜 v1

需要决策：

- 是否在 v0 基础上加入质量、失败率、回滚率、维护新鲜度、跨 workspace 采用权重。
- 是否防刷榜，例如同一主体重复下载是否只算一次。
- 是否区分贡献者声誉和单资产热度。

默认建议：v0 先闭环；v1 加去重和质量降权；声誉和资产热度分开。

已决议：贡献生态先走报表驱动，不单独做完整市场。

决议后回写：`WORKSPACE-ASSET-GOVERNANCE.md`。

### DEC-P1-10 权限请求和授权工作流

需要决策：

- 贡献资产、AgentLibrary 资产、外部知识库派生资产是否共用一套 permission request。
- 请求方要填写用途、有效期、目标 workspace、目标动作和风险等级。
- 谁能审批：贡献者、workspace owner、asset owner、security admin。

默认建议：共用一套授权请求框架，但审批人由资产类型和 workspace policy 决定。

已决议：统一授权请求框架。

决议后回写：`PROTOCOLS.md`、`WORKSPACE-ASSET-GOVERNANCE.md`。

## P2 决策

### DEC-P2-01 多租户、组织和团队边界

需要决策：

- tenant、org、team、workspace 的层级关系。
- 跨 workspace 共享是否默认暂不开启。
- 审计是否按 tenant 独立存储和导出。

默认建议：P2 再做完整多租户；P0/P1 先让 workspace boundary 稳定。

已决议：Workspace boundary 优先。2026-05-26 起 v0.0.1 服务端增加 tenant/resource ABAC 基础层：console user、tool grant 和 policy input 可携带 `tenantId`、workspace allowlist、dataClass allowlist 和 egress allowlist；审计和 trace 支持按 tenant 查询/导出。完整 org/team 生命周期、跨租户共享审批和 SaaS 隔离仍按 P2 处理。

决议后回写：`PRODUCTION-CAPABILITY-GAP.md`、`PROTOCOLS.md`。

### DEC-P2-02 密钥、secret ref 和外部系统凭据

需要决策：

- 外部知识库、网站订阅、模型供应商、工具调用的密钥如何保存。
- secret ref 是否允许进入 context bundle、trace、export。
- 管理员如何轮换和撤销密钥。

默认建议：建议使用 secret ref，避免 secret value 直接进入任何智能体上下文、trace 或导出。

已决议：只暴露 secret ref。

决议后回写：`PRODUCTION-CAPABILITY-GAP.md`、`PROTOCOLS.md`。

### DEC-P2-03 外部检索引擎后端一致性

需要决策：

- pgvector、qdrant、opensearch 哪个作为首个真实后端（用于检索本工作空间资产）。
- 检索后端 adapter 的 conformance test 如何定义。
- 资产删除、权限变化、索引不一致时如何同步。

默认建议：先选一个真实底层检索引擎做硬基准；其它后端按同一 conformance suite 接入。

已决议：首个真实底层检索引擎后端选 pgvector。

决议后回写：`KNOWLEDGE-GOVERNANCE.md`、`PRODUCTION-CAPABILITY-GAP.md`。

### DEC-P2-04 工作空间环境适配实现顺序

需要决策：

- 本机 macOS、Linux、Windows、容器、虚拟机、云端哪个先做。
- 文件监听、权限探测、shell/process 能力、路径映射如何抽象。
- 无法安装管理软件的远端空间是否被视为未受管空间。

默认建议：先做本机和容器；虚拟机/云端复用 adapter contract；未安装管理软件的空间不纳入受管 workspace。

已决议：先做本机和容器。

决议后回写：`Architecture.md`、`PROTOCOLS.md`。

### DEC-P2-05 会话分叉、合并和冲突治理

需要决策：

- 本地智能体留下的 trace、summary、proposal 如何分叉。
- 两个智能体同时改同一资产时怎么 merge。
- 冲突是否进入 proposal review。

默认建议：所有冲突都先形成 merge proposal，不自动写 decision。

已决议：冲突治理走 merge proposal。

决议后回写：`WORKSPACE-ASSET-GOVERNANCE.md`、`PRODUCTION-CAPABILITY-GAP.md`。

### DEC-P2-06 性能、成本和配额

需要决策：

- 权限裁决、搜索、context compile、checkpoint diff、restore preview 的性能目标。
- 模型调用、蒸馏、embedding、外部知识库查询是否需要 budget。
- workspace、subject、agentProfile 是否有配额。

默认建议：P2 建立 budget policy；P0/P1 先保证正确性和审计。

已决议：建立按 workspace/subject/agentProfile 的 budget policy。

决议后回写：`PRODUCTION-CAPABILITY-GAP.md`。

### DEC-P2-07 SDK、CLI 和 OpenAPI 暴露范围

需要决策：

- MCP service 之外，是否提供 CLI、TypeScript SDK、OpenAPI。
- SDK 是否允许执行高风险操作，还是只能包一层确认和 dry-run。
- 外部团队如何接入贡献、权限请求和 checkpoint restore。

默认建议：P2 提供 SDK/CLI；高风险操作默认 dry-run + confirm。

已决议：正式面长期以 MCP service 为主；SDK/CLI/OpenAPI 不作为同级承诺。

决议后回写：`PROTOCOLS.md`。

## P3 决策

### DEC-P3-01 高级排行榜和贡献生态

需要决策：

- 是否做贡献者主页、贡献资产订阅、贡献请求、维护 SLA。
- 是否支持跨团队贡献市场。
- 是否允许公开推荐高复用 Skills。

默认建议：主闭环稳定后再做贡献生态。

已决议：长期以资产贡献统计报表演进为主。

### DEC-P3-02 可视化和管理驾驶舱

需要决策：

- 是否做 workspace graph、permission graph、checkpoint graph、asset lineage graph。
- 是否做管理层汇报面板。
- 是否做安全事件态势面板。

默认建议：先用列表和审计表格闭环，图谱可视化放到 P3。

已决议：管理驾驶舱优先，第一版突出资产价值。

### DEC-P3-03 A2A 和模型网关增强

需要决策：

- 是否需要可选 A2A adapter。
- 是否提供 OpenAI-compatible model gateway 做 workspace-aware routing。
- 是否把 context injection、redaction、audit 放进模型网关。

默认建议：A2A 和模型网关保持可选，不进入核心闭环。

已决议：A2A adapter 和 OpenAI-compatible model gateway 保持可选。

### DEC-P3-04 Agent Traffic Gateway

需要决策：

- 是否提供真正的智能体流量负载网关。
- 网关是否可以成为 Pact 启动、发现、授权、MCP、上传或工作空间操作的硬依赖。
- 网关是否可以替代 Pact grant、workspace policy、Tool Management 或 Operation Ledger。

默认建议：提供可选 agent traffic/load gateway 作为边缘数据面，只负责 TLS/mTLS、负载均衡、限流、SSE/WebSocket 透传、上传流量保护、request id 和边缘观测。第一版直接落 Caddy 与 Nginx 两套适配，并预留异构网关 adapter registry；网关配置和可选运行时统一解析到本机 `.cache`，不进入 Pact canonical data dir。Pact direct mode 必须始终完整可用，网关拆除后不影响启动、MCP、HTTP API、client runtime bootstrap、upload session、Tool Management、workspace 操作和控制台。

已决议：Agent Traffic Gateway 保持可选、可拆卸。网关只能增强入口和负载能力，不能成为 Pact canonical state、授权、审计或 operation 执行的事实源。

### DEC-P3-05 离线同步和联邦工作空间

需要决策：

- 是否支持多个 Pact 实例之间同步 workspace asset。
- 离线工作空间如何合并和冲突治理。
- loan record 和 permission overlay 如何跨实例复制。

默认建议：先不做；等单实例 workspace governance 稳定后再评估。

已决议：暂不做联邦工作空间。

### DEC-P0-17 MCP 新五类入口和外部智能体回信闭环

已决议：

- MCP `tools/list` 在 v0.0.1 硬切为 `pact.discovery`、`pact.knowledge`、`pact.sharedspace`、`pact.codespace`、`pact.skillHub`，旧入口 `pact.workspace`、`pact.list`、`pact.skill`、`pact.help` 不保留 alias。
- MCP 调用全面采用 Intent Operation envelope。外部请求缺省字段可由 adapter 从 grant、目标匹配和请求上下文补齐，但进入 Operation Registry、Tool Management、Workspace API、Audit 和 Checkpoint 前必须形成完整 envelope。
- `pact.capabilities.list` 只返回当前 grant 权限范围内可见的全部 operation，不返回未授权或被 deny 的 operation。
- 本机 local grant 必须按目标匹配：无匹配时默认只读；匹配支持目标后自动授予预定义 safe-write agent toolset，并记录 `targetMatch`、`matchedTargets` 和 `agentProfileId`。
- `GET /mcp` SSE 必须承担 MCP Event Hub；operation 完成或失败后向同一 grant 主动推送 `notifications/pact/operation_reply`。
- 所有上传和写入链路必须返回目标回执，明确 `targetKind`、`targetProvider`、`targetRef` 以及 workspace、repository、branch、change、reviewUrl 或 provider durable id。

拒绝选项：

- 不接受旧 outlet alias 过渡期，因为会继续污染智能体工具心智模型并让验证脚本长期背兼容包袱。
- 不接受 `capabilities.list` 返回全量目录再让智能体自行猜权限；权限事实必须由 Pact 返回。
- 不接受上传完成后只在同步 HTTP 响应里给结果；长链路必须有主动回信，避免外部智能体轮询或误判。

## 原建议决策顺序

以下顺序已经完成，用于保留决策过程；新增决策应继续按 P0 到 P3 登记。

第一轮已拍板：

1. `DEC-P0-01` 产品边界。
2. `DEC-P0-02` MCP service / Workspace API 接入面。
3. `DEC-P0-03` 身份和 library card 模型。
4. `DEC-P0-04` Workspace Asset Model。
5. `DEC-P0-05` AgentLibrary 权限颗粒度。
6. `DEC-P0-08` Operation Ledger 和统一 Checkpoint Tree。
7. `DEC-P0-13` 资产贡献统计报表。
8. `DEC-P0-14` 四个演示场景验收口径。

第二轮已拍板：

1. `DEC-P0-06` 上游知识库再授权。
2. `DEC-P0-07` 所有出口共用权限裁决。
3. `DEC-P0-09` git worktree 复用边界。
4. `DEC-P0-10` 工作空间环境兼容。
5. `DEC-P0-11` 终端贡献状态机。
6. `DEC-P0-12` Skill 共享和贡献值算法。
7. `DEC-P0-15` 控制台第一版页面。
8. `DEC-P0-16` 数据库和文件存储权威边界。

第三轮 P1 已拍板：

1. Context Compiler。
2. receipt / loan record 细节。
3. connector 顺序。
4. Tool / Skill 沙箱。
5. durable workflow。
6. production readiness gate。
7. observability 和 eval。

## 决策完成标准

每个决策完成时必须同时满足：

- 有明确选项和最终选择。
- 有拒绝其它选项的理由。
- 有协议字段、数据模型或 UI 行为变化。
- 有最小验收场景。
- 有要更新的核心设计文档。
- 如果影响安全、权限、恢复或智能体接入，必须补验证脚本或测试计划。
