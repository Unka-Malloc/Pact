# Pact 子系统协议化重构进度 Checklist

更新日期：2026-05-25

本文用于跟踪 Pact 各层、各子系统的低耦合高内聚重构进度。分层口径以 `docs/architecture/PACT-SYSTEM-ARCHITECTURE.html` 中的系统架构图为准：

```text
管理层
  -> 服务层：接口封装层
  -> 应用层：左列（知识转化〔含 AgentLibrary〕 + 共享空间 + 策略管理） + 右列（智能体 + 代码管理 + 通用工具与技能）
  -> 基建层：核心能力 + 安全权限 + 模块管理 + 算法和数据结构 + 存储 + 运维基础

侧边：启动装配 / Composition Root 向管理层、接口封装层、应用层和基建层注入依赖
```

应用层按架构图使用显式左右列，每列三个模块：

| 列内顺序 | 左列 | 右列 |
| ---: | --- | --- |
| 1 | 知识转化 | 智能体 |
| 2 | 共享空间 | 代码管理 |
| 3 | 策略管理 | 通用工具与技能 |

架构图已用 `specialized-grid` 的 `grid-template-areas` 显式固化为 `2 x 3` 应用层矩阵：桌面端严格保持左列三个、右列三个，并让同一行的左右模块共享网格行约束；移动端退化为单列时先展示左列三个，再展示右列三个，但模块归属口径不变。

进度百分比表示“协议化/解耦完成度”，不是产品功能完成度，也不是生产可用性评分。启动装配是侧边组合边界，不属于服务层、应用层或基建层；协议注册表、权限迁移、API Facade 拆分、Jobs Controller 拆分、MCP Adapter 拆分属于横切治理任务，不能再作为独立架构层统计。

## 跟踪口径

| 状态 | 含义 |
| --- | --- |
| `[ ]` | 尚未开始或仍以直接调用为主 |
| `[~]` | 已有边界或 provider，但仍存在明显直接依赖 |
| `[x]` | 已完成协议化/解耦，并有验证或架构门禁保护 |

完成度评估同时看五件事：

1. 是否有清晰的协议、operation、provider 或 mount contract 边界。
2. 上层是否仍直接持有下层 runtime、store、service 或业务实现细节。
3. 子系统之间是否通过 operation/input/context/provider 交互，而不是跨层直接调用。
4. 文档口径是否与真实实现和架构图一致。
5. 是否有 `server:verify:*` 或架构守卫脚本保护边界不回退。

应用层架构图验收还额外检查：

1. HTML 结构中仍保留左列和右列语义分组，便于按模块归属维护。
2. CSS 使用 `grid-template-areas` 固定六个应用模块的位置，不能只依赖 DOM 顺序自然流式排列。
3. 移动端单列顺序必须是知识转化、共享空间、策略管理、智能体、代码管理、通用工具与技能。

## 架构图节点进度

| 架构层 | 架构图节点 | 状态 | 完成度 | 当前情况 | 待完成事项 | 下一步验收 |
| --- | --- | --- | ---: | --- | --- | --- |
| 管理层 | 管理层 | `[~]` | 50% | 管理界面承载知识库、工作空间、调试和系统管理入口；重构目标是只调用服务层接口。 | 需要继续确认 UI/Console 不绕过服务层读取应用 runtime 或基建存储；管理层展示依赖的 console state 仍受 API Facade 聚合影响。 | 管理层只通过接口封装层访问能力；无直接应用层/基建层访问路径。 |
| 启动装配边界 | 启动装配 / Composition Root | `[x]` | 100% | `http-server` 中 runtime/provider 创建已迁到 `composition-root` 和 `server-runtime-providers`；启动快照通过 `dispatchInternalOperation` 发布；启动装配在架构图中已作为侧边 Composition Root 表达。 | 已完成。本子系统后续只允许维护性变更，不能让业务 runtime 装配回流到 `http-server` 或接口层。 | 已通过 `npm run server:verify:architecture-patterns`、`npm run server:verify:platform-boundaries`、`npm run server:verify:protocol-operations` 和全量 `npm run server:verify`。 |
| 服务层 | 接口封装层 | `[~]` | 62% | HTTP server 入口已变薄；System Controller 已拆成 handler family；Tool/Knowledge/Runtime summary 已从 `api-facade` 抽出；认证和授权摘要改由 `securityPermissions` provider 提供；storage summary、client registry 和 raw object 下载已改由 `storageProvider` 注入。 | `api-facade` 仍聚合 settings、agent selector、jobs、client runtime、maintenance summary；`jobs-controller` 仍直接持有 jobManager；MCP adapter 仍依赖 Tool Management runtime。 | 接口封装层只做 HTTP/RPC/CLI 适配、认证、权限、参数归一化和返回格式；业务摘要全部来自 provider/operation。 |
| 应用层 | 知识转化 | `[x]` | 100% | 架构图把知识蒸馏、知识索引、原始语料和 AgentLibrary 归为一个应用层模块；Knowledge console summary 已独立，`api-facade` 不再直接读 `runtime.mounts.knowledgeBase`；`knowledge-access` 已有 evaluate/receipt/loan/denied request 执行器；`raw-corpus.format.convert`、`knowledge.dossier.export`、`knowledge.distillation.export` 已接入 `KnowledgeTransformation` provider，并统一返回 portable export package 与 AgentLibrary access decision。 | 已完成。本子系统后续只允许维护性变更；更复杂的真实语料转换、Dossier 编排和蒸馏运行质量属于功能增强，不再是协议化/解耦缺口。 | 已通过 `npm run server:verify:knowledge-transformation`、`npm run server:verify:agent-library-access`、`npm run server:verify:knowledge-architecture-governance`、`npm run server:verify:protocol-operations` 和 `npm run server:verify:architecture-patterns`。 |
| 应用层 | 智能体 | `[~]` | 65% | agent context、agent memory、Agent Gateway、agent-configs 已从服务入口迁入 runtime provider 或 composition root；context preview/compaction/session memory 相关 handler 已拆分。 | handler context 仍有 runtime/store/service 直传；settings、agent selector、model routing 仍有部分聚合留在接口层。 | context/memory/gateway/config 均只通过 agent provider/operation 暴露，接口层不直接操作 runtime。 |
| 应用层 | 共享空间 | `[x]` | 100% | 架构图将 `agent-workspace` 提升为应用层一等子系统，定位为受控文件空间、StateCommit、issue/proposal、锁和继承治理；workspace handler 已拆分；`workspace-contribution`、workspace file upload/list/download/read/write/patch、checkpoint diff/scope/restore preview/restore、proposal create/apply 均已接入 operation/provider 后端；workspace runtime、issue resolve、lock、inheritance/share/profile/source 已通过 `agent_workspaces.*` registry 暴露；checkpoint restore 在通用 checkpoint tree 记录 marker/event/audit，同时把文件树 dry-run 和实际恢复委托给共享空间 `restoreWorkspaceFiles` provider。 | 已完成。本子系统后续只允许维护性变更；proposal apply 按设计只把审核后的 proposal 转为 decision，不直接改写任意 canonical state。 | 已通过 `npm run server:verify:workspace-checkpoints`、`npm run server:verify:workspace-proposals`、`npm run server:verify:workspace-governance`、`npm run server:verify:workspace-contribution-governance` 和 `npm run server:verify:agent-workspace`。 |
| 应用层 | 代码管理 / Codespace | `[x]` | 100% | 架构图新增 `pact.codespace` 和 `pact.code-review.v1` 应用能力；Codespace 已有持久化 registry，保存 target evaluation、CodeChange、changeSet、review target link、status sync、upload receipt 和 append-only event；`workspace.code.*` 已从轻量 facade 迁入 `createCodespaceRegistry` provider；Gerrit upload route 仍负责真实 code-review 外部系统确认。 | 已完成。本子系统后续只允许维护性变更；安全授权迁移仍作为横切任务处理，不计入代码管理子系统本身。 | 已通过 `npm run server:verify:codespace`、`npm run server:verify:gerrit-mcp`、`npm run server:verify:protocol-operations`、`npm run server:verify:architecture-patterns` 和 `npm run server:verify:platform-boundaries`。 |
| 应用层 | 策略管理 | `[ ]` | 20% | 架构图新增策略管理应用模块，专门承载处理流程策略和智能体调用策略；现有相关规则仍散落在 model routing、tool grant、workspace governance、workflow config 等路径。 | 需要定义 workflow-policy / agent-policy 的协议入口、策略注册表、策略评估 provider 和审计输出；同时明确它与基建层安全权限的边界。 | 处理流程选择、模型路由、工具调用约束、人工确认门禁都通过策略管理 provider/operation 评估；安全授权仍只由安全权限层裁决。 |
| 应用层 | 通用工具与技能 | `[~]` | 65% | Tool Management 客户端连接投影已从 `api-facade` 迁入 specialized provider；runtime 创建已迁出 `http-server`；Tool HTTP、Tool policy、Tool runtime denial audit 和 MCP local grant 授权已统一经 `securityPermissions` provider；技能管理定位为 skill registry 和 profile 配置。 | tool exposure 与 MCP adapter 语义入口仍需继续瘦身；skill registry、profile 配置、workspace skill 与 agent skill planning 需要统一协议化验收。 | Tool/Skill 能力注册、授权、profile 应用和调用均走 operation/provider，MCP adapter 不直接依赖 Tool Management platform。 |
| 基建层 | 核心能力 | `[~]` | 65% | 服务发现、状态协调、通用调度方向与 `dispatchInternalOperation`、system interfaces/discovery snapshots 一致。 | operation registry 完成度还需要按 `registered/wired/implemented/verified` 分级治理。 | system/discovery/operation registry 有一致注册表和 verify 输出。 |
| 基建层 | 安全权限 | `[x]` | 100% | 已落地 `pact.security-permissions.v1` provider，统一封装 console auth、operation authorization、authorization policy、authorization audit artifact、workspace asset policy、Tool policy/runtime denial audit 和 MCP local grant 授权；接口层、console executor、Tool Management 和 MCP adapter 不再直接调用 `consoleAuth.authorizeOperation`、裸 `authorizationEngine` 或裸 `authorizationStore` 做权限裁决。 | 已完成。本子系统后续只允许维护性变更；策略编排类能力继续归入应用层“策略管理”，不能回流到安全权限层硬编码业务流程。 | 已通过 `npm run server:verify:authorization-migration`、`npm run server:verify:console-auth`、`npm run server:verify:tool-management`、`npm run server:verify:architecture-patterns`，并通过直接调用扫描确认目标路径无权限直连。 |
| 基建层 | 模块管理 | `[x]` | 100% | 已落地 `pact.module-management.v1` provider，统一封装 runtime mount snapshot、mount config 持久化、热加载、runtime summary、模块模板、脚手架和 contract test；接口层、Console executor、Runtime summary 和模块生态 HTTP handler 不再直接读取 `runtime.runtimeOptions`、`runtime.mounts` 或 `mount-config` 文件。 | 已完成。本子系统后续只允许维护性变更；业务模块的具体 mount 实现和知识类 runtime 质量不计入模块管理边界。 | 已通过 `npm run server:verify:module-ecosystem`、`npm run server:verify:architecture-patterns` 和 `npm run server:verify:platform-layout`；架构守卫已禁止上层回退到 mount-config/module-ecosystem 直连。 |
| 基建层 | 算法和数据结构 | `[x]` | 100% | 已落地 `pact.data-structure.v1` provider，统一暴露 checkpoint tree projection 和 text-normalization 纯算法能力；`http-server` 不再直接导入 checkpoint tree store，而是由 Composition Root 注入 `dataStructures.checkpointTree`；provider 具备 capability 声明。 | 已完成。本子系统后续只允许维护性变更；业务层 checkpoint 使用场景和 workspace 文件恢复语义归各自应用模块，不回流到数据结构层。 | 已通过 `npm run server:verify:architecture-patterns`、`npm run server:verify:platform-layout`、`npm run server:verify:checkpoints`、`npm run server:verify:workspace-checkpoints`、`npm run server:verify:headless` 和 `npm run server:verify:state-coordination`。 |
| 基建层 | 存储 | `[x]` | 100% | 已落地 `pact.storage.v1` provider，统一封装 storage summary、raw object 读取、client registry、storage doctor、reconcile、backup/restore、source vocabulary 和 corpus search 端口；`api-facade`、`jobs-controller`、storage operation executor 和 discovery client 操作不再直接调用 `metadataStore.getStorageSummary()`、raw object 路径解析或 storage ops 工具。 | 已完成。本子系统后续只允许维护性变更；任务队列自身的 jobManager 协议化继续归入接口封装层/任务工作流拆分，不回流到存储层。 | 已通过 `npm run server:verify:architecture-patterns`、`npm run server:verify:platform-layout`、`npm run server:verify:protocol-operations`、`npm run server:verify:ops` 和 `npm run server:verify:backup-restore`。 |
| 基建层 | 运维基础 | `[~]` | 60% | ops observation handler 已拆分；架构守卫脚本已覆盖多条边界。 | 运维动作与业务变更边界还需继续收口；最新改动需全量 verify。 | 运维层只做日志、健康状态、监控告警、诊断和 runbook 调度；业务变更必须走 operation。 |

## 横切治理清单

这些任务横跨多个架构节点，不再作为架构层单独统计，但必须作为后续重构顺序执行。

| 顺序 | 横切任务 | 关联架构节点 | 当前状态 | 验收口径 |
| --- | --- | --- | --- | --- |
| 1 | 跑最新全量验证：`npm run server:verify` | 全部，尤其启动装配边界 | `[x]` | 最新 runtime summary 迁移后已全量通过。 |
| 2 | 输出 operation registry 差距清单 | 核心能力、接口封装层、应用层各能力 | `[x]` | 已落地 `reports/protocol-operation-registry-gap-2026-05-25.md`；当前 52 个协议操作全部注册，明确空后端为 0。 |
| 3 | 补齐 P0 协议缺口 | AgentLibrary、知识转化 | `[x]` | 共享空间、代码管理、knowledge access 和知识转化协议均已完成 operation/provider/verify 闭环；原 3 个知识/原始语料空后端已清零。 |
| 4 | 迁移安全 + 权限管理 | 接口封装层、安全权限、工具管理、共享空间、代码管理 | `[x]` | 已统一进入 `pact.security-permissions.v1` provider；console/auth/tool/MCP/workspace asset/knowledge access artifact 不再由接口层或应用 executor 直接持有裸 `consoleAuth`、`authorizationEngine` 或 `authorizationStore` 裁决。 |
| 5 | 继续拆 `api-facade.mjs` | 接口封装层、智能体、运维基础 | `[~]` | storage summary 和 client registry 已下沉到 `storageProvider`；settings、agent selector、jobs、client runtime、maintenance summary 仍需继续下沉。 |
| 6 | 继续拆 `jobs-controller.mjs` | 接口封装层、原始语料、任务工作流 | `[~]` | metadataStore、raw object download、stored object path 已迁入 `storageProvider`；jobManager 仍需拆为任务工作流 provider/operation。 |
| 7 | 继续拆 MCP adapter | 接口封装层、工具管理、模块管理、安全权限 | `[ ]` | MCP adapter 只面对五个语义入口和 Tool Management 协议 facade。 |
| 8 | 清理 `PROTOCOLS.md` | 全部 | `[ ]` | 旧 `/api/workspaces/` 前缀、旧 operation id、旧 MCP 扁平工具名口径清除。 |
| 9 | 清理 `PRODUCTION-CAPABILITY-GAP.md` | 全部 | `[ ]` | 已实现缺口移出 unresolved，并改用四级完成度。 |
| 10 | 补架构门禁 | 全部 | `[ ]` | 新增 architecture-patterns / protocol-operations / platform-boundaries 验证规则。 |

## 更新规则

1. 每完成一个子系统迁移，必须同步更新本文件的状态、完成度、当前情况、待完成事项和下一步验收。
2. 每次把 `[~]` 调整为 `[x]`，必须写明对应验证命令或守卫脚本。
3. 不允许只因为文档存在就把能力标为完成；`contract_registered` 只能计为注册完成，不能计为实现完成。
4. 新增接口或模块时，必须先映射到架构图节点，再补到本 checklist。
5. 横切治理任务不能替代架构层统计；它们只能说明为什么某个架构节点尚未完成。
6. 长期架构口径仍以 `docs/Architecture.md`、`docs/PROTOCOLS.md`、`docs/WORKSPACE-ASSET-GOVERNANCE.md`、`docs/KNOWLEDGE-GOVERNANCE.md` 和 `docs/PRODUCTION-CAPABILITY-GAP.md` 为准。
