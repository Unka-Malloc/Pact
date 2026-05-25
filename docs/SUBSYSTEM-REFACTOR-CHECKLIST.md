# Pact 子系统协议化重构进度 Checklist

更新日期：2026-05-25

本文用于跟踪 Pact 各层、各子系统的低耦合高内聚重构进度。分层口径以 `docs/architecture/PACT-SYSTEM-ARCHITECTURE.html` 中的系统架构图为准：

```text
管理层
  -> 服务层：接口封装层
  -> 应用层：知识转化（含 AgentLibrary） + 智能体 + 共享空间 + 代码管理 + 策略管理 + 通用工具与技能
  -> 基建层：核心能力 + 安全权限 + 模块管理 + 算法和数据结构 + 存储 + 运维基础

侧边：启动装配 / Composition Root 向管理层、接口封装层、应用层和基建层注入依赖
```

应用层按架构图使用 2x3 可视分组：

| 左列 | 右列 |
| --- | --- |
| 知识转化 | 智能体 |
| 共享空间 | 代码管理 |
| 策略管理 | 通用工具与技能 |

架构图已用固定网格区域固化该分组：桌面端保持左列三个、右列三个；移动端退化为单列，但仍保留同一模块顺序和归属口径。

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

## 架构图节点进度

| 架构层 | 架构图节点 | 状态 | 完成度 | 当前情况 | 待完成事项 | 下一步验收 |
| --- | --- | --- | ---: | --- | --- | --- |
| 管理层 | 管理层 | `[~]` | 50% | 管理界面承载知识库、工作空间、调试和系统管理入口；重构目标是只调用服务层接口。 | 需要继续确认 UI/Console 不绕过服务层读取应用 runtime 或基建存储；管理层展示依赖的 console state 仍受 API Facade 聚合影响。 | 管理层只通过接口封装层访问能力；无直接应用层/基建层访问路径。 |
| 启动装配边界 | 启动装配 / Composition Root | `[x]` | 100% | `http-server` 中 runtime/provider 创建已迁到 `composition-root` 和 `server-runtime-providers`；启动快照通过 `dispatchInternalOperation` 发布；启动装配在架构图中已作为侧边 Composition Root 表达。 | 已完成。本子系统后续只允许维护性变更，不能让业务 runtime 装配回流到 `http-server` 或接口层。 | 已通过 `npm run server:verify:architecture-patterns`、`npm run server:verify:platform-boundaries`、`npm run server:verify:protocol-operations` 和全量 `npm run server:verify`。 |
| 服务层 | 接口封装层 | `[~]` | 55% | HTTP server 入口已变薄；System Controller 已拆成 handler family；Tool/Knowledge/Runtime summary 已从 `api-facade` 抽出。 | `api-facade` 仍聚合 settings、agent selector、jobs、storage、auth、client runtime、maintenance summary；`jobs-controller` 仍直接持有 jobManager/metadataStore/raw object 细节；MCP adapter 仍依赖 Tool Management runtime。 | 接口封装层只做 HTTP/RPC/CLI 适配、认证、权限、参数归一化和返回格式；业务摘要全部来自 provider/operation。 |
| 应用层 | 知识转化 | `[~]` | 55% | 架构图把知识蒸馏、知识索引、原始语料和 AgentLibrary 归为一个应用层模块；Knowledge console summary 已独立，`api-facade` 不再直接读 `runtime.mounts.knowledgeBase`。 | `knowledge-access` 协议操作注册和真实实现仍需补齐；distillation export、dossier、evidence、search/read/export 需要按 `registered/wired/implemented/verified` 分级。 | 知识转化入口通过 operation/provider 调用；AgentLibrary 能完成 search/read evidence/export 并有 verify 覆盖。 |
| 应用层 | 智能体 | `[~]` | 65% | agent context、agent memory、Agent Gateway、agent-configs 已从服务入口迁入 runtime provider 或 composition root；context preview/compaction/session memory 相关 handler 已拆分。 | handler context 仍有 runtime/store/service 直传；settings、agent selector、model routing 仍有部分聚合留在接口层。 | context/memory/gateway/config 均只通过 agent provider/operation 暴露，接口层不直接操作 runtime。 |
| 应用层 | 共享空间 | `[~]` | 45% | 架构图将 `agent-workspace` 提升为应用层一等子系统，定位为受控文件空间、StateCommit、issue/proposal、锁和继承治理；workspace handler 已拆分。 | `workspace-contribution` 协议仍缺真实 operation 实现；workspace file/runtime、issue/proposal、lock/inheritance 仍需继续协议化。 | workspace contribution 能完成注册、执行、审计和 verify；共享空间不再被视为单个智能体私有状态。 |
| 应用层 | 代码管理 / Codespace | `[~]` | 30% | 架构图新增 `pact.codespace` 和 `pact.code-review.v1` 应用能力；现有文档已明确代码贡献默认进入 Gerrit route，Workspace 只保存治理记录、引用、审计和 fallback。 | code review 仍接近“有协议、零实现”；Codespace repo/diff/changeSet/review target 需要补齐 operation registry、provider、真实后端和验收脚本。 | 代码变更能通过 Codespace 形成 changeSet，并通过 Code Review/Gerrit route 完成 upload、review 状态同步、审计和 fallback。 |
| 应用层 | 策略管理 | `[ ]` | 20% | 架构图新增策略管理应用模块，专门承载处理流程策略和智能体调用策略；现有相关规则仍散落在 model routing、tool grant、workspace governance、workflow config 等路径。 | 需要定义 workflow-policy / agent-policy 的协议入口、策略注册表、策略评估 provider 和审计输出；同时明确它与基建层安全权限的边界。 | 处理流程选择、模型路由、工具调用约束、人工确认门禁都通过策略管理 provider/operation 评估；安全授权仍只由安全权限层裁决。 |
| 应用层 | 通用工具与技能 | `[~]` | 55% | Tool Management 客户端连接投影已从 `api-facade` 迁入 specialized provider；runtime 创建已迁出 `http-server`；技能管理定位为 skill registry 和 profile 配置。 | MCP 授权、tool exposure、grant/policy 访问链仍未完全收口；skill registry、profile 配置、workspace skill 与 agent skill planning 需要统一协议化验收。 | Tool/Skill 能力注册、授权、profile 应用和调用均走 operation/provider，MCP adapter 不直接依赖 Tool Management platform。 |
| 基建层 | 核心能力 | `[~]` | 65% | 服务发现、状态协调、通用调度方向与 `dispatchInternalOperation`、system interfaces/discovery snapshots 一致。 | operation registry 完成度还需要按 `registered/wired/implemented/verified` 分级治理。 | system/discovery/operation registry 有一致注册表和 verify 输出。 |
| 基建层 | 安全权限 | `[~]` | 30% | 已拆出 auth handler，authorization engine 是正确主线。 | 权限体系尚未整体迁移到新设计；`api-facade` 仍直接读取 `consoleAuth` 摘要；接口层权限逻辑仍需收束。 | 所有鉴权、授权、访问控制、审计策略都只通过 authorization/policy provider 裁决。 |
| 基建层 | 模块管理 | `[~]` | 55% | mount 注册、能力声明方向明确；Runtime summary 已抽离；Tool Management 投影已隔离。 | MCP adapter 和模块暴露路径仍有 runtime/platform 直接依赖；热加载和能力声明需要独立 contract test。 | module-management 只识别 mount contract/module descriptor/provider interface，不了解业务实现。 |
| 基建层 | 算法和数据结构 | `[~]` | 40% | analysis/mount 摘要已抽离；架构图中的 Merkle Index、Prefix/Range Index、Checkpoint Projection 是基建能力边界。 | 算法模块注册、选择、调用和能力声明还没有统一协议入口；checkpoint projection 需要与 storage/jobs 解耦验收。 | 数据结构层保持无副作用工具/索引/projection，不引入 HTTP/UI/业务 runtime。 |
| 基建层 | 存储 | `[~]` | 45% | upload session 已通过 provider 边界隔离；启动期 storage summary 已走 internal operation。 | `jobs-controller` 仍直接处理 metadataStore、raw object、路径解析；`api-facade` 还有 storage summary 直接聚合。 | LSM ingest、CAS block、Merkle DAG、任务持久化只通过 storage provider/repository contract 暴露。 |
| 基建层 | 运维基础 | `[~]` | 60% | ops observation handler 已拆分；架构守卫脚本已覆盖多条边界。 | 运维动作与业务变更边界还需继续收口；最新改动需全量 verify。 | 运维层只做日志、健康状态、监控告警、诊断和 runbook 调度；业务变更必须走 operation。 |

## 横切治理清单

这些任务横跨多个架构节点，不再作为架构层单独统计，但必须作为后续重构顺序执行。

| 顺序 | 横切任务 | 关联架构节点 | 当前状态 | 验收口径 |
| --- | --- | --- | --- | --- |
| 1 | 跑最新全量验证：`npm run server:verify` | 全部，尤其启动装配边界 | `[x]` | 最新 runtime summary 迁移后已全量通过。 |
| 2 | 输出 operation registry 差距清单 | 核心能力、接口封装层、应用层各能力 | `[ ]` | 列出协议声明但未注册、已注册但未实现、已实现但未验证的接口。 |
| 3 | 补齐 P0 协议缺口 | 共享空间、AgentLibrary、代码管理 | `[ ]` | workspace contribution、knowledge access、code review 至少达到 `wired/implemented/verified` 可区分。 |
| 4 | 迁移安全 + 权限管理 | 接口封装层、安全权限、工具管理、共享空间、代码管理 | `[ ]` | console/auth/tool/workspace/codespace 权限统一进入 authorization engine / policy provider。 |
| 5 | 继续拆 `api-facade.mjs` | 接口封装层、智能体、知识转化、存储、运维基础 | `[ ]` | settings、agent selector、jobs、storage、auth、client runtime、maintenance summary 全部下沉。 |
| 6 | 继续拆 `jobs-controller.mjs` | 接口封装层、原始语料、存储 | `[ ]` | jobManager、metadataStore、raw object download、stored object path 不再留在 controller 内。 |
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
