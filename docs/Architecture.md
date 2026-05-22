# AgentStudio Architecture / Software Design Specification

审计日期：2026-05-21。本文是 AgentStudio 的总架构基线和软件设计说明书。

## 目录 / Table of Contents

- [设计文档边界](#设计文档边界)
- [软件设计说明书](#软件设计说明书)
  - [文档目标](#文档目标)
  - [设计范围](#设计范围)
  - [用户和执行者](#用户和执行者)
  - [功能需求](#功能需求)
  - [非功能需求](#非功能需求)
  - [运行上下文](#运行上下文)
  - [模块设计](#模块设计)
  - [核心数据模型](#核心数据模型)
  - [接口设计](#接口设计)
  - [关键流程设计](#关键流程设计)
  - [存储设计](#存储设计)
  - [权限与安全设计](#权限与安全设计)
  - [可观测性设计](#可观测性设计)
  - [错误处理和幂等设计](#错误处理和幂等设计)
  - [部署和配置设计](#部署和配置设计)
  - [验收设计](#验收设计)
- [核心原则](#核心原则)
  - [资产是主体](#资产是主体)
  - [不信任智能体](#不信任智能体)
  - [权限从源头治理](#权限从源头治理)
  - [公共工作空间优先](#公共工作空间优先)
  - [终端贡献是第二信息源](#终端贡献是第二信息源)
  - [OpenClaw 演示闭环](#openclaw-演示闭环)
  - [协议适配不是核心抽象](#协议适配不是核心抽象)
- [逻辑架构](#逻辑架构)
- [代码分层](#代码分层)
- [公共状态模型](#公共状态模型)
- [写入路径](#写入路径)
- [知识位置](#知识位置)
- [智能体接入边界](#智能体接入边界)
- [上游和后端定位](#上游和后端定位)
- [验证入口](#验证入口)
- [架构演进与长期提升规划 (Architecture Evolution)](#架构演进与长期提升规划-architecture-evolution)
  - [1. 架构可扩展性：控制面与数据面的深度解耦 (Control/Data Plane Separation)](#1-架构可扩展性控制面与数据面的深度解耦-controldata-plane-separation)
  - [2. 智能体协同范式：从"主动轮询"到"事件订阅" (Reactive Collaboration)](#2-智能体协同范式从主动轮询到事件订阅-reactive-collaboration)
  - [3. 审计存储优化：读请求的"逻辑入树"与时序聚合 (Read Node Aggregation)](#3-审计存储优化读请求的逻辑入树与时序聚合-read-node-aggregation)
  - [4. 冲突治理升级：引入"语义合并" (Semantic Merging)](#4-冲突治理升级引入语义合并-semantic-merging)
  - [5. 权限模型演进：动态上下文权限控制 (Context-Aware Dynamic Policies)](#5-权限模型演进动态上下文权限控制-context-aware-dynamic-policies)
- [核心工程原则与开发守则 (Core Engineering Principles)](#核心工程原则与开发守则-core-engineering-principles)
  - [1. 接口与契约先行，把实现藏起来 (Interface First)](#1-接口与契约先行把实现藏起来-interface-first)
  - [2. 构建状态存储的"防腐层" (Anti-Corruption Layer)](#2-构建状态存储的防腐层-anti-corruption-layer)
  - [3. 事件驱动的本地化 (Local Pub/Sub)](#3-事件驱动的本地化-local-pubsub)
  - [4. 容忍"半自动"，保留"降级口" (Graceful Degradation)](#4-容忍半自动保留降级口-graceful-degradation)

AgentStudio 的核心定位是：

> 面向多人、多终端、多本地智能体的 Team Workspace Asset Governance System。

核心卖点是专攻中间狭窄地带：

> 上游知识库太粗，AgentStudio 做权限精加工；下游本地智能体太细，AgentStudio 做共享工作空间。

产品框架可以压缩为一句话：

> 两个问题，一个能力，三个兼容。

两个问题：

1. 知识库缺少面向智能体的权限管控。传统知识库通常解决“存了什么、怎么检索”，但没有在 source / asset / evidence / export / context / memory 这些出口上治理“哪个智能体能看、能引用、能带走、能写回”。
2. 本地智能体相对独立，难以协同。OpenClaw、Codex、Claude Code、Cursor Agent、脚本和人工终端都可以很强，但它们各自拥有本地上下文和本地文件，缺少一个统一、可编辑、可审计、可恢复的公共工作空间。

一个能力：

- 工作空间管理。AgentStudio 管理公共工作空间的资产、权限、快照、Checkpoint Tree、Operation Ledger、审计和恢复。核心不是让智能体互相聊天，而是让所有智能体通过同一个受控工作空间读写资产，并且任何修改都可追踪、可回溯、可撤销。
- 资产贡献统计报表是工作空间管理的管理者视角输出。公共空间的价值必须能被管理者看见：谁贡献了资产、贡献了什么、被谁使用、复用了多少次、带来了多少跨 workspace 采用、产生过哪些授权请求、失败、回滚和维护动作。

三个兼容：

1. 智能体兼容：不关心底层是哪个大模型、哪个 agent framework、哪个机器人体系；只要通过 AgentStudio MCP service / Workspace API 接入，就按同一套权限、审计和工作空间协议操作。
2. 信息源兼容：不关心信息来自上游知识库、网站订阅、文件库、业务系统、人工整理，还是智能体上传的文档；进入 AgentStudio 后全部收纳为 workspace asset，统一切分、标注、授权、索引、审计和恢复。
3. 工作空间环境兼容：不关心工作空间运行在容器、虚拟机、本机还是云端，也不关心底层是 Linux、macOS 还是 Windows；只要安装 AgentStudio 管理软件，智能体访问工作空间就必须经过这层软件，由 AgentStudio 负责权限管控、路径适配、环境差异和审计。

这不是横向再造知识库，也不是横向再造智能体平台。AgentStudio 只猛攻两端之间最缺的中间层：

- 对上游：接入外部知识库、文件库、向量库、图谱库和业务资产源，把粗粒度资源重新切分、重新标注、重新授权、重新登记。
- 对下游：接入各类本地智能体、脚本和人工终端，让它们在公共工作空间里共享一部分资产、Skills、工具、脚本、专家意见和任务状态。
- 对中间：用 AgentLibrary、Workspace Asset Governance、Operation Ledger、Contribution Registry 和 Context Compiler 把“可看、可借、可贡献、可复用、可撤销”做成同一套治理机制。

AgentStudio 不做另一个智能体平台，不做完整 A2A Gateway，也不把自己包装成自治 Agent。系统只治理公共工作空间里的资产、知识、任务、产物、决策和审计状态。本地智能体可以接入、读取、提交和请求操作，但永远不能绕过工作空间协议直接改写 canonical state。

## 设计文档边界

核心设计文档只保留五份：

- `docs/Architecture.md`：总定位、系统分层、运行时边界。
- `docs/PROTOCOLS.md`：Workspace API、Operation、Tool Management、Knowledge、协议适配边界。
- `docs/WORKSPACE-ASSET-GOVERNANCE.md`：公共工作空间资产治理、快照、溯源、恢复、复制和安全原则。
- `docs/KNOWLEDGE-GOVERNANCE.md`：知识证据、三层知识模型、智能体可引用上下文和知识维护闭环。
- `docs/PRODUCTION-CAPABILITY-GAP.md`：生产能力差距、验收门禁和当前阻塞项。

其它文档只能作为运行说明、配置说明或测试说明存在，不能再承载新的长期架构决策。

## 软件设计说明书

### 文档目标

本文面向产品设计、工程实现、控制台开发、MCP adapter 开发、运行维护和后续验收。它回答六个问题：

1. AgentStudio 要解决什么问题。
2. 系统边界在哪里，哪些能力明确不做。
3. 核心模块如何分层，模块之间如何协作。
4. 公共工作空间、AgentLibrary、权限、贡献、审计和 Checkpoint Tree 的权威数据如何建模。
5. 智能体、控制台、CLI、外部知识库和本机管理软件通过什么接口进入系统。
6. 第一阶段到生产级演进分别用什么验收标准证明闭环。

本文不是实现任务清单。具体待拍板事项仍在 `docs/IMPLEMENTATION-DECISION-REGISTER.md` 中追踪；拍板后的长期结论必须回写本文、`docs/PROTOCOLS.md`、`docs/WORKSPACE-ASSET-GOVERNANCE.md`、`docs/KNOWLEDGE-GOVERNANCE.md` 和 `docs/PRODUCTION-CAPABILITY-GAP.md`。

### 设计范围

第一版设计范围：

- 面向本机、容器、虚拟机和云端工作空间的统一资产治理。
- 面向 OpenClaw、Hermes Agent、Codex、Claude Code、Cursor Agent、脚本和人工终端的 MCP / Workspace API 接入。
- 面向外部知识库、本地文件、智能体上传、人工整理和网站订阅的统一信息源收纳。
- 面向知识、文件、Skills、工具、脚本、黄金规则、专家意见和任务产物的 workspace asset model。
- 面向读、写、下载、导出、上下文注入、借阅、安装、执行和恢复的权限裁决。
- 面向访问请求、文件变动、知识贡献、技能调用、权限裁决、上下文暴露和恢复动作的统一 Checkpoint Tree。
- 面向管理者的资产贡献统计报表和贡献排行榜。

第一版非目标：

- 不做完整 A2A Gateway。
- 不做自治 Agent 平台。
- 不把 AgentStudio 暴露成一个需要其它 Agent 调度的 Agent。
- 不做外部知识库同型复制或裸代理。
- 不把 git 仓库本身暴露为产品恢复接口。
- 不承诺所有 SDK、CLI、OpenAPI 与 MCP 同级长期稳定；长期事实源是 Workspace API，智能体首选接入面是 MCP service。

### 用户和执行者

系统中的用户和执行者统一进入 `subject / operator / agentProfile / libraryCard` 四层模型：

| 名称 | 含义 | 典型来源 |
| --- | --- | --- |
| `subject` | 权限主体，可以是人、服务账号、团队身份或受控智能体身份。 | 管控台登录、MCP header、stdio proxy 参数、服务账号 token |
| `operatorId` | 实际执行入口，描述谁在操作系统或协议层发起请求。 | `orbstack:kate:openclaw`、`orbstack:serena:hermes-agent`、CLI、console |
| `agentProfile` | 风险、能力和上下文 profile，用于区分同一 subject 使用不同智能体时的权限。 | OpenClaw、本地编码 agent、通用任务 agent、脚本 runner |
| `libraryCard` | 进入 AgentLibrary 的可审计访问凭据。 | workspace 门禁卡、任务会话凭据、短期只读凭据 |

设计要求：

- 权限主体和执行入口必须分开。同一个人用高风险 agent 和低风险 agent 时，可以得到不同权限。
- 智能体不能因为拥有本地文件能力而绕过 Workspace API。
- 读请求也要带身份上下文，因为读请求会产生 receipt、loan record、usage event、上下文暴露记录和拒绝审计。

### 功能需求

#### FR-1 Workspace Asset Governance

系统必须提供受管公共工作空间。所有公共资产必须具备：

- 资产 ID、类型、来源、所属 workspace、版本和状态。
- 权限策略、敏感度、数据分类和保留策略。
- 快照引用、Operation Ledger 引用和审计引用。
- 可发现、可读取、可引用、可下载、可导出、可复制、可撤销和可恢复的状态。

文件树只是 workspace asset 的一种 projection，不是唯一权威状态。权威状态由 Ledger、permission、receipt、loan record、checkpoint metadata 和 storage metadata 共同构成。

#### FR-2 AgentLibrary / 图书馆

系统必须把传统知识库能力提升为 AgentLibrary：

- 支持上游知识库、文件库、人工整理和智能体上传进入 `derivedKnowledgeSpace`。
- 支持 source、document、section、block、field、table cell、image、attachment、evidence pack 和 asset rendition 级别授权。
- 支持 `deny`、`discoverOnly`、`metadataOnly`、`readInPlace`、`citeOnly`、`copyToContext`、`exportAllowed`、`checkoutAllowed`。
- 支持知识访问 receipt、loan record、denied request audit 和撤销策略。
- 支持知识搜索、证据回读、上下文编译、导出、蒸馏、memory write 和 tool call 出口共用同一权限裁决。

系统必须保证没有权限的知识不会进入 retrieval candidate、hidden context、rerank hint、distillation input、memory summary、artifact、trace 或 evaluation sample。

#### FR-3 上游知识库再授权

外部知识库进入 AgentStudio 后必须被重新切分和重新授权：

```text
upstream knowledge base
  -> connector / adapter
  -> upstreamKnowledgeRef
  -> information slicing
  -> derivedKnowledgeSpace
  -> authorizationOverlay
  -> downstream workspace / agent access
```

下游智能体不能持有上游 token、上游私有对象路径、collection id 或裸 source id。它们只能访问 AgentStudio 授权后的派生视图、脱敏内容、只读阅览会话或 evidence pack。

#### FR-4 终端贡献和贡献统计

系统必须允许本地智能体、脚本、人工终端向公共工作空间提交贡献资产：

- 贡献类型：`knowledge`、`skill`、`tool`、`script`、`file`、`goldenRule`、`expertOpinion`。
- 固定位置：`workspace/skills/`、`workspace/tools/`、`workspace/scripts/`、`workspace/files/`、`workspace/knowledge/`、`workspace/rules/`、`workspace/expert-opinions/`。
- 状态机：`submitted -> scanned -> reviewed -> published | rejected | needs_changes -> adopted -> deprecated | revoked`。
- 下载、安装、执行、复制到上下文、跨 workspace 使用都必须写 usage event、loan record 和 audit。

资产贡献统计报表是 P0 能力。第一版报表按 workspace、贡献者、资产类型、时间窗口、使用动作、授权流、风险和维护状态统计。排行榜从报表中派生，第一版主分数为：

```text
rankScoreV0 =
  usageCount * successRate
  + uniqueWorkspaceAdoptions
  - rollbackCount
```

#### FR-5 MCP Service 和 Workspace API

智能体首选通过 AgentStudio MCP service 接入。MCP service 是 adapter，Workspace API 是协议事实源。

第一版 MCP service 必须做成设备级 AgentStudio MCP Hub，而不是 OpenClaw 专用 adapter：

- HTTP 权威入口复用主服务：本机默认 `127.0.0.1:8787/mcp`，OrbStack 内使用 `host.orb.internal:8787/mcp`。
- 按 Stitch MCP 方案优先生成 HTTP MCP 客户端配置：Gemini CLI、Kilo Code、Copilot、OpenClaw、Hermes Agent 和 Antigravity 都直接指向 HTTP MCP endpoint 并带 agent-specific token header；Codex CLI 使用其标准 `--bearer-token-env-var` HTTP MCP 形态，服务端同时接受 bearer token 和 `X-AgentStudio-Api-Key`；stdio proxy 只作为不支持 HTTP MCP 或自定义 headers 的兼容入口。
- 设备级发现统一封装为 `agentstudio-mcp discover-local`，它只维护 canonical registry `~/.agentstudio/mcp/servers.json`，并由 `/.well-known/agentstudio/mcp.json` 和 `/api/mcp/discovery` 暴露当前 HTTP endpoint、VM endpoint、connector release 包和安装状态；不得通过写多个本机发现文件来兼容不同客户端。
- 客户端安装器必须通过 `agentstudio-mcp-connector` release 包发布；终端用户不得为了安装 MCP 拉取完整服务端仓库。release manifest 必须包含 package version、npm tarball sha256、portable zip sha256、portable tarball sha256、GitHub 一行安装命令、Hub 注册命令、本机发现命令、多选交互式安装命令、单客户端脚本化连接命令、卸载命令、doctor 命令和支持的 target 列表。没有 Node.js / npm / npx 的机器必须能通过自带 Node runtime 的 portable zip 包安装。
- 每个智能体使用独立 grant/token，不复用控制台 cookie / CSRF；grant 记录 `operatorId`、`subjectId`、`agentProfileId`、默认 workspace、toolset、scope 和审计时间。
- 最小 MCP JSON-RPC：`initialize`、`tools/list`、`tools/call`、标准错误、工具 schema；`tools/list` 对外只返回稳定工具 `agentstudio.call`。
- `agentstudio.call` 使用 `apiVersion`、`operation` 和 `input` 三段式参数，内部 operation 仍通过 Tool Management / Operation Registry 路由和审计；高风险 restore/delete/reindex、auth、settings、runtime mounts 和 grant 管理必须通过显式 grant 扩展，不能作为独立 MCP tool 展开。
- 版本升级推送：`initialize` 声明 `tools.listChanged=true`，服务端在 discovery / initialize / `agentstudio.mcp.version` 暴露 `interfaceVersion` 和 `toolsetVersion`，并在 `GET /mcp` SSE 上发送 `notifications/tools/list_changed`。
- 安装器必须覆盖 `codex`、`gemini-cli`、`kilo-code`、`copilot`、`openclaw --vm kate`、`hermes --vm serena` 和 `antigravity`：无 `--target` 的 `agentstudio-mcp install` 必须启动 TUI 菜单，扫描可用客户端和 OrbStack 中的 claw-compatible 衍生体；能调用标准 CLI 的目标必须调用标准 CLI；无非交互 CLI 的目标按官方配置格式结构化写入、先备份、只替换 `agentstudio` 条目，不覆盖其它 agent 配置。

MCP handler 不能直接改文件夹或数据库，必须落到 Workspace API、Policy Engine、Operation Ledger、Checkpoint Tree 和 storage metadata。

#### FR-6 统一 Checkpoint Tree

系统必须把所有进入公共空间边界的行为纳入统一 Checkpoint Tree：

- 访问请求：workspace info/list、catalog discover、metadata read、permission check、search、evidence read、asset list/read/download、skill list/download、receipt list、audit query、operation history、checkpoint tree list、restore preview、context bundle、export、checkout、memory write。
- 文件变动：create、update、move、delete、archive、restore。
- 知识贡献：submit、scan、review、publish、adopt、revoke。
- 技能调用：list、download、install、execute、usage report、revoke。
- 权限裁决：grant、deny、permission request、authorizationOverlay change。
- 恢复动作：restore preview、restore、revert operation scope、branch、merge。

恢复必须是 append-only restore operation。可以复用 git tree、diff、commit graph、临时 worktree 和 checkout-like restore 能力，但不能把裸 `git reset` 作为产品语义。

#### FR-7 管控台

管控台第一版必须覆盖完整闭环：

- Workspace asset browser。
- AgentLibrary 权限和上游再授权配置。
- 贡献资产、Skills、排行榜和资产贡献统计报表。
- 访问 receipt、loan record、denied request audit。
- Operation history 和 Checkpoint Tree。
- Restore preview 和恢复到此节点。
- 权限错误、不可见过滤、授权请求和撤销记录。

管控台只消费公开 API，不引用后端内部模块。

### 非功能需求

| 类型 | 要求 |
| --- | --- |
| 安全 | 权限从 source / asset 入库开始治理；所有出口共用裁决；secret value 不进入 trace、export、checkpoint node 或 context bundle。 |
| 可恢复 | 所有公共空间行为形成 Operation Ledger 和 Checkpoint Tree；恢复动作保留原历史。 |
| 可审计 | 所有访问、拒绝、借阅、导出、执行、授权和恢复都有 `auditId`。 |
| 可解释 | 检索、证据、权限过滤、上下文编译和恢复 preview 必须能解释原因和影响范围。 |
| 可移植 | 本机、容器、虚拟机、云端、Linux、macOS、Windows 通过管理软件和 adapter 适配。 |
| 可替换 | 外部知识库、向量库、图谱库、解析器、OCR、模型和 tool runtime 通过 mount / adapter 替换。 |
| 可验证 | 每个 P0 能力必须有本地 verify 脚本和可复现 demo。 |
| 可降级 | 外部知识库、模型、OCR 或 tool runtime 不可用时，系统必须返回可解释错误，并保留失败审计。 |

### 运行上下文

AgentStudio 运行在服务端进程、本地管理软件、CLI、GUI 和 Web 控制台之间：

```text
Local agents / humans / scripts
  -> MCP service / CLI / Console / Workspace API
  -> Policy Engine
  -> Operation Ledger
  -> Workspace Runtime
  -> Asset / Knowledge / Skill / Tool runtimes
  -> Storage, indexes, object files, external adapters
```

部署形态：

- 单机开发：Node.js 服务端、Vue 控制台、Rust CLI、Flutter GUI、本地 SQLite 和本地对象目录。
- OrbStack / VM demo：服务端在 Mac 或 VM 内运行，智能体通过 `host.orb.internal` 或 stdio proxy 访问 MCP。
- 容器和云端：服务端、控制台、管理软件和外部知识库 adapter 分离部署，权限和 checkpoint metadata 仍由 AgentStudio 持有。
- 企业生产：外部存储、外部向量库、审计归档、密钥服务、OTLP exporter 和备份恢复流程接入。

### 模块设计

#### Presentation Layer

`server-web` 是 Vue 管控台。职责：

- 展示 workspace、AgentLibrary、贡献、权限、审计、任务、checkpoint 和生产门禁。
- 调用公开 HTTP API。
- 不直接读取后端文件、SQLite、raw object 或内部模块。

前端组件复用规则必须从 `server-web/components/common.ts` 开始。新增界面控件时，能用通用组件就用通用组件；通用组件不能直接覆盖需求时，能继承就继承；确实需要新组件时，先扩展通用组件和 `commonComponentRegistry`，再在业务页面中使用。也就是说，页面级实现必须先扩展通用组件，而不是在每个 view 内复制 checkbox、option bar、status pill、browse button、fold card 或 history/session panel 的私有实现。

`client-gui` 是 Flutter 跨平台交互层。职责：

- 展示本机客户端状态、上传、导出、配置和用户操作。
- 不承载业务权威状态。

#### Protocol Adapter Layer

`server/platform/common/operation-dispatcher` 维护公开 operation registry，负责把 HTTP、RPC、CLI 等入口统一到 operation 定义。

新增或调整 MCP service 时必须遵守：

- MCP tool name 稳定。
- MCP 输入先归一化为 Workspace API request。
- MCP 输出必须包含 operation、audit、policy 和 checkpoint 相关引用。
- stdio proxy 不持有状态。

#### Application Layer

`server/platform/specialized` 承载应用能力：

- `knowledge`：三层知识模型、KnowledgeCore、外部知识库 adapter、document export、retrieval、preprocessing。
- `agent`：agent workspace、agent context、agent memory、agent gateway。
- `capabilities/tools`：Tool Management、catalog、grant、policy、execute 和 audit。
- `capabilities/skills`：SkillLibrary、skill registry、skill bundle 和 skill 使用事件。

这些模块可以拥有各自 runtime，但不能绕过 Workspace API 改写公共状态。

#### Governance Layer

治理层是 AgentStudio 的核心，逻辑上包含：

- `WorkspaceGateway`
- `PolicyEngine`
- `OperationLedger`
- `SnapshotManager`
- `CheckpointTree`
- `ArtifactRegistry`
- `ContributionRegistry`
- `AgentLibrary`
- `SkillLibrary`
- `LeaderboardRuntime`
- `ContextCompiler`
- `AuditStore`

其中 Ledger、permission、receipt、loan record、checkpoint metadata 是权威；文件树、索引和报表都是 projection。

#### Infrastructure Layer

`server/platform/common` 承载基建：

- `security`：认证、权限、CSRF、grant、secret ref、策略裁决。
- `storage`：SQLite、对象存储、batch repository、metadata。
- `observability`：trace、日志、metrics 和后续 OTLP 映射。
- `module-manager`：外部 mount、parser、knowledgeBase、vectorStore、graphStore 和 custom adapter。
- `devops`：进程状态、统一注册、监控告警和生产运行辅助。

`server/platform/modules` 存放外置模块和本地运行时资源，例如 Tika、OCR、document parser 和 runtime assets。

### 核心数据模型

#### Workspace

```text
Workspace {
  workspaceId
  name
  ownerSubjectId
  environmentRef
  policyRefs
  rootAssetRefs
  checkpointTreeRef
  createdAt
  updatedAt
}
```

Workspace 是公共空间边界。所有资产、知识、贡献、任务、上下文和恢复动作都必须归属 workspace 或明确跨 workspace 授权。

#### Asset

```text
Asset {
  assetId
  workspaceId
  assetType
  sourceRef
  storageRef
  metadata
  dataClass
  sensitivity
  policyRef
  currentVersionRef
  lifecycleState
  createdBy
  createdAt
}
```

`assetType` 至少覆盖 `rawAsset`、`derivedAsset`、`knowledge`、`file`、`skill`、`tool`、`script`、`goldenRule`、`expertOpinion`、`artifact`。

#### Knowledge Evidence

```text
EvidencePack {
  evidenceId
  assetId
  derivedViewRef
  sourceTrace
  citations
  contentRefs
  scoreReasons
  policyDecision
  allowedRefs
  withheldCounts
}
```

Evidence Pack 是权限裁决后的证据包，不是裸 chunk。

#### Permission Decision

```text
PermissionDecision {
  decisionId
  subject
  operatorId
  agentProfile
  workspaceId
  targetRefs
  requestedAction
  requestedEgress
  accessMode
  allowed
  reason
  redactionPolicy
  auditId
}
```

同一请求的 search、evidence、context、export、artifact、distillation、memory 和 tool call 必须复用同一类裁决结果。

#### Receipt and Loan Record

```text
KnowledgeAccessReceipt {
  receiptId
  subject
  agentProfile
  workspaceId
  taskId
  evidenceRefs
  accessMode
  egress
  auditId
  createdAt
}

LoanRecord {
  loanRecordId
  receiptId
  retainedRefs
  canRetain
  canShare
  expiresAt
  revocationPolicy
  downstreamWorkspaceRefs
}
```

Receipt 记录智能体知道了什么；LoanRecord 记录智能体能不能带走、保留、再分享和跨 workspace 使用。

#### Operation and Checkpoint Node

```text
Operation {
  operationId
  workspaceId
  subject
  operatorId
  agentProfile
  idempotencyKey
  operationKind
  targetRefs
  policyDecisionRef
  preSnapshotRef
  diffRef
  postStateRef
  auditId
  createdAt
}

CheckpointNode {
  checkpointNodeId
  parentNodeIds
  workspaceId
  subject
  operatorId
  agentProfile
  eventKind
  effectKind
  targetRefs
  policyDecision
  stateDelta
  receiptRefs
  auditId
  createdAt
}
```

读请求和拒绝请求也必须产生 node，因为它们改变治理状态。第一版不做“高价值读请求才入树”的例外：每个外部可见读请求都要生成 checkpoint node，包括 list、discover、metadata、permission check、receipt list、audit query、operation history 和 checkpoint tree list。为了避免递归膨胀，同一次外部请求内部读取 Ledger、AuditStore 或 CheckpointTree 所需的系统内部读，不再生成新的读节点。

#### Contribution

```text
Contribution {
  contributionId
  assetId
  contributorSubject
  contributorAgentProfile
  workspaceId
  contributionType
  lifecycleState
  scanResultRef
  reviewResultRef
  permissionPolicyRef
  usageStatsRef
  createdAt
}
```

Contribution lifecycle 不能被 Skill、file 或 knowledge 各自私有化；它是 workspace asset governance 的统一状态机。

### 接口设计

#### Workspace API

Workspace API 是协议事实源。第一版必须覆盖：

- workspace info、list、context、context bundle。
- asset upload、list、read、download、policy set、permission check。
- file read、write、patch、delete、restore。
- contribution submit、review、publish、adopt、revoke。
- checkpoint tree list、restore preview、restore。
- operation history 和 audit query。

#### Knowledge API

Knowledge API 公开能力：

- `knowledge.search`
- `knowledge.get.evidence`
- `knowledge.asset`
- `knowledge.document.structure`
- `knowledge.export.docx`
- `raw-corpus.format.convert`
- `knowledge.dossier.export`
- `knowledge.distillation.export`

所有入口必须接入 `agentstudio.knowledge-access.v1`，不能出现绕过权限的直读接口。

#### MCP Tool Surface

第一版 MCP tool surface 固定为：

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

公开 checkpoint tool 名称必须使用 `workspace.checkpoint.tree.list`、`workspace.checkpoint.restore.preview` 和 `workspace.checkpoint.restore`。

#### Tool Management API

Tool Management 负责外部工具和 Skill 执行授权：

- catalog 定义工具。
- toolset 聚合权限。
- grant 表达主体可用范围。
- policy evaluate / preview 表达执行前裁决。
- execute 只在授权通过后运行，并写 audit、usage event 和 checkpoint node。

Skill 可以被贡献和安装，但执行必须通过 Tool Management grant。

### 关键流程设计

#### 文件互通流程

```text
Agent A upload file
  -> MCP workspace.file.upload
  -> identity resolution
  -> policy evaluation
  -> Operation Ledger append
  -> asset object write
  -> checkpoint node
  -> audit event
  -> Agent B list/download through same policy path
```

验收要求：A 不需要知道 B，B 不直接访问 A 的本地文件系统；双方只通过公共 workspace asset 互通。

#### 知识再授权流程

```text
external KB sync
  -> upstreamKnowledgeRef
  -> slicing
  -> derivedKnowledgeSpace
  -> authorizationOverlay
  -> A allowed evidence/export
  -> B deny or invisible
```

验收要求：A 能获取授权内容并产生 receipt / loan record；B 不能通过 search、context bundle、export、distillation 或 memory write 旁路拿到。

#### Skill 贡献流程

```text
Agent A upload Skill
  -> contribution.submitted
  -> scan
  -> review / policy
  -> published
  -> Agent B list/download/use
  -> usage event
  -> leaderboard and report refresh
```

验收要求：贡献值随真实使用增长，失败、回滚和风险会降低质量分。

#### 共享文件修改流程

```text
Agent A patch shared file
  -> preSnapshot
  -> diff
  -> write
  -> checkpoint C1
Agent B patch same file
  -> preSnapshot
  -> diff
  -> write
  -> checkpoint C2
```

验收要求：最终文件包含两次授权修改；Operation history 能解释每次修改由谁发起、改了什么、属于哪个 checkpoint。

#### 安全恢复流程

```text
C0 -> C1(A change) -> C2(B change) -> R1(restore to C1) -> R2(restore to C0)
```

恢复不删除原历史。`R1` 和 `R2` 都是新的 restore operation，必须有 restore preview、diff、policy decision、audit event 和 checkpoint node。

### 存储设计

第一版本地默认存储：

- metadata SQLite：workspace、asset、operation、audit、policy、contribution、checkpoint metadata。
- knowledge SQLite：KnowledgeCore、evidence、document structure、retrieval metadata。
- raw object / asset directory：原始文件、派生文档、DOCX/YAML sidecar、导出物。
- git-backed workspace tree：文件树 projection、diff、commit graph、restore preview 的底层能力。
- config files：settings、mount config、feature profile、entity config。

存储原则：

- SQLite 和对象目录是本地默认实现，不是协议边界。
- 外部知识库、向量库、图谱库只能通过 adapter / mount 进入，不能成为智能体直连面。
- checkpoint metadata 和 Operation Ledger 是产品恢复事实源；git commit 是文件树 projection。
- 备份恢复必须覆盖 metadata DB、knowledge DB、raw objects、assets、jobs、settings、mount configs、model configs 和 auth DB。

### 权限与安全设计

权限模型按入口、对象、动作、出口四层裁决：

1. 入口：subject、operator、agentProfile、libraryCard、workspace。
2. 对象：source、asset、evidence、field、tool、skill、file、context、memory。
3. 动作：discover、read、cite、copyToContext、download、export、checkout、write、execute、share、restore。
4. 出口：searchResult、evidenceRead、contextBundle、artifactWrite、exportFile、distillationInput、distillationOutput、memoryWrite、toolCall、evaluationSample。

安全要求：

- 默认拒绝，显式授权。
- 高敏资产可以隐藏存在性。
- `readInPlace` 不等于可以下载或写 memory。
- 任何导出、下载、checkout、context injection 都必须产生 receipt / loan record。
- 权限拒绝必须进入 denied request audit。
- secret 只以 secret ref 存储和传递。
- 日志、trace、评估样本和导出必须执行 redaction policy。
- 直连受管工作空间文件系统视为未受管操作，不能进入 canonical workspace state。

### 可观测性设计

内部 Trace 是事实源，OpenTelemetry 是可选导出映射。第一版 trace schema 必须能关联：

- request、operation、checkpoint、audit、policy decision。
- upload、parse、normalize、ingest、search、evidence、distill。
- model route、token、cost、latency、error。
- tool grant、tool execution、skill usage。
- asset、evidence、context bundle、memory write 和 export。

管控台需要能从一个回答或一次操作展开看到证据、权限、模型、工具、成本、失败点和对应 checkpoint。

### 错误处理和幂等设计

所有写操作必须支持：

- `idempotencyKey`
- 输入 hash
- precondition
- dry-run / preview
- diff
- policy decision
- rollback or restore plan
- audit event

错误类型至少区分：

- `permission_denied`
- `not_found`
- `conflict`
- `quota_exceeded`
- `payload_too_large`
- `external_dependency_unavailable`
- `policy_required`
- `checkpoint_restore_blocked`
- `invalid_identity`
- `unsafe_tool_execution`

权限拒绝不是系统错误；它是受控治理结果，必须可审计、可解释、可统计。

### 部署和配置设计

本地开发默认：

- Node.js 服务端。
- Vue 控制台。
- Rust CLI。
- Flutter GUI。
- 本地 SQLite、对象目录和 runtime assets。

关键配置：

- 服务端 settings。
- feature profile。
- mount config。
- model routing。
- MCP endpoint。
- workspace root。
- external knowledge-base provider。
- secret ref provider。

配置原则：

- 人工可维护实体配置放在 `server/config/entity-config/`。
- runtime 二进制资源放在 `server/platform/modules/knowledge/`。
- 生产环境 secret value 不进入 settings JSON。
- adapter 配置可以追加，但不能破坏已有 agent 配置。

### 验收设计

基础架构变更必须运行：

```bash
npm run server:verify:architecture-patterns
npm run server:verify:knowledge-architecture-governance
npm run server:verify:platform-layout
npm run server:verify:tool-management
npm run server:verify:agent-workspace
```

五阶段 MCP demo 必须提供：

```bash
npm run server:mcp:discover
npm run server:mcp:doctor
npm run server:verify:mcp-release
npm run server:verify:mcp-http
npm run server:verify:mcp-workspace-demo
npm run server:verify:mcp-knowledge-demo
npm run server:verify:mcp-permission-demo
npm run server:verify:checkpoint-restore-demo
npm run server:verify:mcp-demo
```

每个 demo 输出必须包含：

- agent identity
- workspace path
- asset ids
- operation ids
- checkpoint node ids
- audit ids
- 成功样例
- 拒绝样例

生产级验收最终必须收敛为 `npm run server:verify:production-readiness`，并输出可汇报的 Markdown / JSON 报告。

## 核心原则

### 资产是主体

系统不关心智能体之间如何互相扮演、协商或聊天。系统关心的是公共工作空间资产本身：

- 可快照
- 可溯源
- 可恢复
- 可操作
- 可复制
- 可分支
- 可审计
- 可按权限暴露给外部执行者

智能体、CLI、控制台、脚本和人工操作者都是外部 operator。operator 只提交 intent、observation、artifact、proposal 或 trace；公共状态由 AgentStudio 的 Operation Ledger、Policy Engine 和 Snapshot Boundary 决定是否变化。

### 不信任智能体

智能体可以很强，但不能被当作可信状态源。AgentStudio 只信任可验证的资产状态、可回放的操作记录、可追溯的证据和经过确认的 decision。

错误智能体最多只能制造错误 proposal、错误 artifact 或失败 operation，不能直接污染 canonical workspace。

### 权限从源头治理

面向智能体开放的知识能力命名为 `AgentLibrary / 图书馆`。`knowledgeBase` / `agentstudio.knowledge.v1` 是当前兼容协议和内部 mount 名称，不能反过来限制产品定位。

图书馆权限必须在 source / asset 进入公共空间时就被治理，而不是等检索结果返回后再靠 prompt 约束智能体。每一份资产都必须携带 data class、sensitivity、workspace scope、source scope、可读范围、可引用范围、可导出范围和可写回范围。

未来智能体会越来越强，上下文窗口会越来越长，注意力和推理能力也会继续提升。在这个前提下，知识库不应该主要扮演“把有限信息挑出来喂给智能体”的角色，而应该更像一栋公共图书馆：

- 门禁卡决定能不能进入知识空间。
- 楼层权限决定能访问哪些 workspace / source group。
- 书架权限决定能浏览哪些目录和元数据。
- 图书权限决定能读取哪些 document / section / block / field / asset。
- 借阅权限决定能不能把内容带走、导出、写入 artifact 或放进长期 memory。

有些资料允许智能体读，但不允许取走。这里的“取走”包括下载原文、导出、复制进 artifact、写入长期 memory、进入非授权模型上下文或被带到其它 workspace。读权限、引用权限、上下文注入权限和导出权限必须分开。

从 AgentLibrary 带走的每一条信息都必须登记。登记范围不是只记录“调用了 search”，而是记录具体哪些 evidence、section、field、table cell、image、summary、derived view 或 redacted snippet 被交给了哪个 subject / agent / workspace / task。系统没有批准带走的内容，无论通过 search、evidence、context bundle、export、artifact、distillation、memory write 还是外部知识库 adapter 发请求，都必须拿不到。

外部知识库是上游资产源，不是下游智能体的直接暴露面。AgentStudio 的 workspace asset 不与外部知识库撞型：外部知识库可以提供原始文档、索引、向量、图谱或检索结果，但进入 AgentStudio 后必须被重新切分、重新标注、重新授权，形成 `derivedKnowledgeSpace`。下游某些人或智能体能看哪些内容，完全由 AgentStudio 的 `authorizationOverlay` 决定。

上游知识库的信息和资源权限再分配是 AgentLibrary 的核心功能。AgentStudio 必须能把同一份上游知识资源拆成多个下游视图：A workspace 能看全文，B workspace 只能看元数据，C agent 只能 readInPlace，D agent 可以 checkout，E agent 完全不可见。这个再分配结果必须独立于上游知识库原始权限模型，并由 AgentStudio 自己登记、审计和恢复。

因此，某些智能体即使能操作 AgentStudio，也永远访问不到最上游知识库。它们只能访问被 AgentStudio 授权后的派生视图、evidence pack、脱敏内容或只读阅览会话。上游知识库凭据、原始 API、原始对象路径和未授权 source id 不能泄漏给下游智能体。

上游知识库 A/B 权限再授权演示用于证明这条边界：AgentStudio 从上游知识库获取某个文件后，在本地生成 `derivedKnowledgeSpace` 和 `authorizationOverlay`。管理员在管控台配置 A 可以访问该文件，B 不可以访问该文件。随后进入对话页面，分别让 A 和 B 请求获取同一文件：A 应拿到授权范围内的文件或派生视图，并产生 `knowledgeAccessReceipt` / `loanRecord`；B 应收到权限错误，系统写入 denied request audit，且不能通过检索、上下文包、导出或其它接口旁路拿到内容。

### 公共工作空间优先

本地智能体有自己的本地上下文和本地能力是合理的，例如 OpenClaw、Codex、Claude Code、Cursor Agent、本地脚本型 agent 或人工客户端。它们可以各自擅长编码、浏览器、文件、桌面或通用任务。

AgentStudio 提供的是公共可编辑工作空间：

- 统一任务状态
- 统一资产状态
- 统一知识证据
- 统一上下文包
- 统一 artifact 与 proposal
- 统一 decision 与 audit

本地智能体想复用其它智能体之前留下的记忆，可以请求 AgentStudio 编译 context bundle。上下文短的智能体由 AgentStudio 做 context compression / Context Compiler，而不是要求所有智能体共享同一个运行时。

### 终端贡献是第二信息源

信息源不必然是上游知识库。很多高价值信息来自终端贡献：本地智能体、脚本、人工操作者或团队成员把已经过滤、验证、精加工的信息上传到公共工作空间。这些贡献可能是知识，也可能是 Skills、工具、脚本、文件、规则、专家意见或黄金规则。

终端贡献型资产治理是 Workspace Asset Governance 的核心功能。下游智能体在自己可访问的一个或多个 workspace 中提交资产；每个 workspace 都有固定位置存放 `skills`、`tools`、`scripts`、`files`、`knowledge`、`rules` 和 `expert-opinions`。贡献默认进入 review / permission / publish 流程，而不是直接成为公共事实或公共工具。

AgentStudio 必须提供贡献排行榜和统计面板：

- 贡献次数。
- 被审核通过次数。
- 被使用次数。
- 被其它 workspace 采用次数。
- 贡献的 Skills / 工具 / 脚本被调用次数。
- 被请求授权次数和授权通过次数。
- 贡献质量、回滚率、风险等级和维护状态。

资产贡献统计报表是管理者视角的核心输出，不只是排行榜。它必须按 workspace、贡献者、资产类型、时间窗口、使用路径、授权状态和风险状态汇总，回答“公共空间到底沉淀了多少可复用资产、谁在贡献、谁在使用、哪些资产产生了团队价值、哪些资产需要治理”。

贡献越多、贡献资产越常被使用、复用质量越高，贡献者在排行榜上越高。其它人或智能体可以请求贡献者或 workspace owner 授予权限，把贡献资产下载、复制或接入给其它智能体使用；所有授权、下载、使用和撤销都必须登记。

### OpenClaw 演示闭环

OpenClaw 文档互通演示用于证明 AgentStudio 的生态位：两个本地 OpenClaw 都安装 AgentStudio MCP service，但它们不是互相通信，也不是暴露成 Agent 互相调度，而是共同操作同一个公共工作空间。

流程：

1. OpenClaw A 通过 MCP 工具把本地文档提交到目标 workspace。
2. AgentStudio 把文档登记为 `knowledge` 或 `file` 类型贡献资产，落到 `workspace/knowledge/` 或 `workspace/files/`，生成 `contribution.submitted`、上传记录、资产快照和审计记录。
3. 经过权限、风险、许可和重复性检查后，资产进入 `contribution.published`，并按 workspace 权限决定谁能看、能引用、能复制到上下文、能导出或能 checkout。
4. OpenClaw B 通过同一个 AgentStudio MCP service 查询该 workspace 的资产。
5. 如果 B 的 subject / agent profile 有授权，AgentStudio 返回可下载或可借走的派生视图，并生成 `knowledgeAccessReceipt`、`loanRecord`、`asset.downloaded` 和 `auditId`。

这个场景实现的是文档通过公共工作空间互通，而不是 A 把文件直接发给 B。资产状态、权限状态、快照、借阅和撤销都由 AgentStudio 统一治理。

Skill 贡献排行榜演示用于证明终端贡献闭环：

1. OpenClaw A 上传一个 Skill 到 `workspace/skills/`，并设置默认公开权限，例如允许同 workspace 内主体 `read`、`install` 和 `use`。
2. AgentStudio 登记 `skill` 类型贡献，完成扫描和审核后发布到面板和 MCP skill list。
3. OpenClaw B 在面板上看到该 Skill，或通过 MCP 工具列出可用 Skills。
4. B 下载、安装或调用该 Skill 时，AgentStudio 记录使用事件、借阅记录和审计记录。
5. 初始贡献算法采用使用为主的质量加权口径：每次确认下载、安装或使用都会写 `usageEvent`，但排行榜主分数是 `rankScoreV0 = usageCount * successRate + uniqueWorkspaceAdoptions - rollbackCount`。`acceptedCount` 保留为报表维度，不作为排行榜主导项。

后续可以加入去重、风险降权、失败降权、维护新鲜度和跨 workspace 采用权重；但第一版只要求“被用多少次，贡献值就加多少”，让演示链路先闭环。

### 协议适配不是核心抽象

A2A、MCP、OpenAPI、OpenAI-compatible model endpoint、CLI SDK 都是协议适配层。AgentStudio 可以提供这些 adapter，但核心模型不依赖任何一种 agent 协议。

当前优先级：

1. AgentStudio MCP service，作为智能体的正式接入面。
2. Agent-neutral Workspace API，作为协议事实源。
3. Tool Management / Operation API
4. Knowledge Evidence API
5. Context Compiler API
6. 可选 A2A adapter / OpenAI-compatible model gateway

如果 OpenClaw 作为本地操作手接入，它只是 workspace operator。AgentStudio 可以作为它的服务端上游和后端控制面，但不复制 OpenClaw 的消息网关，也不复制外部实现代码。

## 逻辑架构

```text
Local Operators
  - OpenClaw / Codex / Claude Code / Cursor Agent / scripts / humans
  - browser, files, shell, desktop and coding execution

Protocol Adapters
  - MCP server
  - Workspace API
  - Tool Management API
  - Knowledge Evidence API
  - Context Compiler API
  - optional A2A / OpenAI-compatible adapters

AgentStudio Core
  - WorkspaceGateway
  - OperationLedger
  - PolicyEngine
  - SnapshotManager
  - ArtifactRegistry
  - ContributionRegistry
  - SkillLibrary
  - LeaderboardRuntime
  - ProposalLedger
  - EvidenceRuntime
  - ContextCompiler
  - AuditStore

Storage and Indexes
  - metadata/agentstudio.sqlite
  - knowledge-core/knowledge.sqlite
  - raw objects and assets
  - job snapshots
  - external knowledge-base adapters
```

## 代码分层

- `server/platform/common`
  - 基建层：security、operation-dispatcher、storage、module management、data structure、devops、console API 基础设施。
- `server/platform/interactive`
  - 服务层装配：composition root、provider registry、feature profile、runtime providers、public call surface。
- `server/platform/specialized`
  - 应用能力层：knowledge、agent workspace/context/memory、capabilities/tools、capabilities/skills。
- `server/platform/modules`
  - 外置模块和本地运行时资源，例如 Tika、OCR、document parser、可替换 mount runtime。
- `server/services`
  - 产品入口：HTTP server、client service、agent-facing service wiring。
- `server-web`
  - Vue 控制台，只消费公开 API，不引用后端内部实现。
- `client-cli`
  - Rust 本地执行层与 CLI sidecar，负责本机文件、上传、mirror、connector、checkpoint、导出和系统适配。
- `client-gui`
  - Flutter 展示层和跨平台交互层，不能成为业务执行层。

## 公共状态模型

Workspace state 由以下对象构成：

- `tasks`：任务、接力、状态机。
- `assets`：原始资产、派生产物、外部引用、版本。
- `evidence`：可引用证据包、来源、定位、置信度、权限范围。
- `artifacts`：智能体或人工操作产生的文件、报告、patch、导出物。
- `observations`：operator 声称观察到的事实，不自动成为 canonical fact。
- `proposals`：对公共状态的修改建议。
- `decisions`：经策略、人审或授权流程确认的团队事实。
- `memory`：运行时辅助记忆，可被加载和压缩，但不等于 evidence。
- `audit events`：接口调用、策略裁决、状态变更、模型调用和工具执行记录。

## 写入路径

公共状态变更必须走受控流程：

```text
operator intent
  -> policy check
  -> idempotency check
  -> dry-run / diff
  -> proposal or operation
  -> snapshot boundary
  -> apply
  -> audit event
  -> recoverable state
```

默认写操作是 append-only。任何会改变 canonical workspace 的操作都必须具备：

- `workspaceId`
- `subject`
- `agentId` 或 operator id
- `taskId` 或 operation scope
- `idempotencyKey`
- `policyDecision`
- `preSnapshot`
- `operationDiff`
- `postStateRef`
- `auditId`

Checkpoint Tree 必须升级为统一 Checkpoint Tree，而不是只服务任务、队列或文件删除。所有进入公共空间边界的行为都要成为 checkpoint node：

- 所有访问请求：workspace info/list、catalog discover、metadata read、permission check、search、evidence read、asset list/read/download、skill list/download、receipt list、audit query、operation history、checkpoint tree list、restore preview、context bundle、export、checkout、memory write。
- 所有文件变动：create、update、move、delete、archive、restore。
- 所有知识贡献：submit、scan、review、publish、adopt、revoke。
- 所有技能调用：list、download、install、execute、usage report、revoke。
- 所有权限裁决：grant、deny、permission request、authorizationOverlay change。
- 所有恢复动作：restore preview、restore、revert operation scope、branch、merge。

读请求看似不改变文件，但会改变公共空间的治理状态：它会产生 access receipt、loan record、usage event、denied request audit、贡献统计和模型上下文暴露记录。因此读请求也必须全量进入统一 Checkpoint Tree。第一版不允许把普通 list / discover / metadata / permission check 只放进接口日志；它们也要形成轻量 checkpoint node。否则系统只能恢复文件，不能回答“智能体到底看过什么目录、知道过什么、借走过什么、调用过什么、被拒绝过什么”。

全量入树只针对外部可见请求边界。同一次请求内部为了构造响应而读取 Ledger、AuditStore、CheckpointTree 或 projection 的系统内部读，不递归生成新的 checkpoint node。

统一 Checkpoint Tree 的节点必须至少携带：

- `checkpointNodeId`
- `parentNodeIds`
- `workspaceId`
- `subject`
- `operatorId`
- `agentProfile`
- `eventKind`
- `effectKind`：read、write、execute、permission、restore、deny、report。
- `targetRefs`
- `policyDecision`
- `stateDelta`
- `receiptRefs`
- `auditId`
- `createdAt`

只有这样，智能体即使在公共空间里乱删、乱读、乱试权限、乱调用技能，系统也能按树回放、定位、解释、回撤和恢复。

安全恢复演示必须证明：即使 A 把工作空间里的很多文件逐个删除，团队也不需要慌。A 的每次删除都只是一个带 `preSnapshot` / `postSnapshot` 的 workspace commit，所有 commit 形成 Checkpoint Tree。管理员在管控台打开 Checkpoint Tree 历史，下滑找到 A 操作之前的节点，点击“恢复到此节点”，系统创建一次新的 restore operation，把 workspace 回到该节点对应的状态，同时保留 A 的删除历史、恢复记录和审计链。

这个模型可以复用 git worktree 的思想和部分系统能力：tree object、diff、commit graph、checkout-like restore、临时 worktree 预览和 merge / branch 语义都很适合。但 AgentStudio 的权威状态不只是文件树，还包含权限、知识 evidence、贡献记录、借阅记录、operation ledger 和审计，因此恢复入口必须是 AgentStudio 的 Checkpoint Tree / Operation Ledger，而不是让智能体直接操作裸 git 仓库。

## 知识位置

知识不是独立资产仓库，而是公共工作空间可用状态的一部分。AgentStudio 的知识能力负责把资产型资料转成智能体可安全引用的 evidence runtime。

知识分三层：

1. `raw-corpus-construction`：原始语料建构和格式转换。
2. `knowledge-index-construction`：canonical evidence/index，权威检索和证据回读。
3. `knowledge-distillation`：有损蒸馏背景，只供上下文和交付使用，不能替代 evidence。

详见 `docs/KNOWLEDGE-GOVERNANCE.md`。

## 智能体接入边界

本地智能体可以：

- 读取 workspace context
- 领取或创建 task
- 搜索 evidence
- 读取受控 memory
- 上传 artifact
- 提交 observation
- 创建 proposal
- 请求 permission
- 回传 trace
- 请求 context compression

本地智能体不能：

- 直接覆盖 canonical evidence
- 直接改写 decision
- 绕过 policy 读取敏感 source
- 绕过 operation ledger 修改资产
- 把私有 memory 当作公共事实
- 用裸数据库路径替代公开 API

## 上游和后端定位

如果和 OpenClaw 配合，AgentStudio 是服务端上游：

- AgentStudio 下发任务、上下文、证据、权限和输出契约。
- OpenClaw 在本地执行浏览器、文件、桌面、shell 和通用任务。
- OpenClaw 回传 observation、artifact、trace 和 proposal。
- AgentStudio 验收结果、生成快照、维护 evidence 和 audit。

这个形态也适用于其它本地智能体。AgentStudio 不关心对方是什么 agent，只关心它是否遵守 Workspace API 和资产治理协议。

## 验证入口

架构相关变更至少运行：

```bash
npm run server:verify:architecture-patterns
npm run server:verify:knowledge-architecture-governance
npm run server:verify:platform-layout
npm run server:verify:tool-management
npm run server:verify:agent-workspace
```

## 架构演进与长期提升规划 (Architecture Evolution)

在当前“治理优先、安全审计闭环”的 P0/P1 基线之上，随着并发量、接入智能体数量以及数据规模的增长，架构在以下几个维度预留了演进空间，这些改进思想将在后续的迭代中逐步落地：

### 1. 架构可扩展性：控制面与数据面的深度解耦 (Control/Data Plane Separation)

- **当前状态：** Node.js 服务端兼顾了治理控制（鉴权、账本维护）与重型数据处理（文档解析、信息切分）。
- **演进方向：** 显式分离控制面与数据面。Node.js + SQLite 作为控制面（Control Plane），专注于极度轻量的状态机流转、鉴权与生成 Token/Ticket。将 CPU/内存密集型的任务（如 PDF/OCR 解析、大型文档的动态切分、大模型 Context 压缩）剥离为独立的可水平扩展的 Worker 集群（Data Plane）。

### 2. 智能体协同范式：从“主动轮询”到“事件订阅” (Reactive Collaboration)

- **当前状态：** 智能体通过 MCP 客户端主动请求（Pull）工作空间状态，多智能体协同存在信息延迟。
- **演进方向：** 强化 AgentStudio 作为“事件中心（Event Hub）”的角色。引入受权限控制的 Pub/Sub 机制。当公共空间的资产、权限或状态发生变更并产生新 Checkpoint 时，系统根据 `authorizationOverlay` 实时向有权限的智能体推送“状态失效”或“资产更新”信号，从而实现真正的响应式多智能体协同。

### 3. 审计存储优化：读请求的“逻辑入树”与时序聚合 (Read Node Aggregation)

- **当前状态：** 为了极致审计，所有读请求（Search, Read, Check Permission）均物理生成 Checkpoint Node。在高并发下可能导致 SQLite 写瓶颈及树结构噪声。
- **演进方向：** 保持 100% 审计的底线不变，但在存储结构上进行优化。在特定的任务会话（Task Session）内，将同主体的高频冗余读取在内存中进行时序聚合（Temporal Aggregation），并在任务节点提交时生成单一的“聚合读节点（Aggregated Read Node）”。底层存储可将读日志下沉至专门的高吞吐时序引擎，核心 SQLite 树仅保留索引指针。

### 4. 冲突治理升级：引入“语义合并” (Semantic Merging)

- **当前状态：** 冲突处理默认降级为 `merge proposal`，依赖人工或更高阶干预。
- **演进方向：** 减少协作阻塞。针对不同资产类型引入语义合并策略：对于结构化配置（JSON/Table）采用预定义的自动合并规则；对于知识性文本，可引入“合并评审大模型（Merge-Reviewer LLM）”进行后台静默合并，仅在置信度过低时才提升为需要人工干预的阻塞型 Proposal。

### 5. 权限模型演进：动态上下文权限控制 (Context-Aware Dynamic Policies)

- **当前状态：** 主要依赖基于身份和目标的静态策略（RBAC/ABAC）。
- **演进方向：** 引入更动态的降级与风控机制。例如“预算驱动降级”：当智能体 Token 预算吃紧时，系统自动将长文档的 `read` 权限临时降级为仅提供蒸馏摘要的 `metadataOnly`；或“风险传播冻结”：当监测到某智能体产出质量极差时，系统自动挂起其将内容转为公共贡献（Publish）的权限，直至人工复核。

## 核心工程原则与开发守则 (Core Engineering Principles)

AgentStudio 的目标是从少数几个智能体平滑过渡到企业级规模，但这并不意味着我们要在初期堆砌过度复杂的架构。为防止“过早优化（Premature Optimization）”带来沉重的运维负担（DevOps Tax），所有开发必须遵循 **“逻辑隔离先行，物理拆分延后”（Logical Separation over Physical Separation）** 即“模块化单体（Modular Monolith）”的原则。

### 1. 接口与契约先行，把实现藏起来 (Interface First)

虽然系统早期可能只是在一个 Node.js 进程里执行同步或简单的异步操作，但组件间的交互必须通过严格定义的领域接口，严禁直接引用内部实例细节或裸调数据库。
- **守则：** 即使是本地方法调用，也必须抽象为如 `TaskQueue.submit(type, payload)` 或 `AgentGateway.invoke()` 的形式。底层实现初期可以是简单的 `setTimeout` 或内存队列，以确保未来剥离为独立 Worker 服务或引入分布式消息队列时，业务调用方代码无需修改。

### 2. 构建状态存储的“防腐层” (Anti-Corruption Layer)

即使系统初期并发量很低，单节点 SQLite 就能满足所有请求，也绝不允许业务逻辑代码直接拼写 SQL 去操作核心的 Checkpoint Tree 或 Operation Ledger。
- **守则：** 所有的状态变更和读取记录必须通过统一的领域服务网关（如 `OperationLedger.append()` 或 `AuditLogger.recordAccess()`）进行。这层防腐隔离使得未来能在底层无缝插入内存 Buffer、批量合并（Batch Flush）或更换时序数据库，而不会污染业务控制流。

### 3. 事件驱动的本地化 (Local Pub/Sub)

系统架构旨在支持智能体的响应式协同，但在初期不要引入外部的消息中间件（如 RabbitMQ）或复杂的集群架构。
- **守则：** 采用进程内原生事件总线（如 Node.js 原生的 `EventEmitter`）来实现事件驱动。在核心业务路径上（如生成了新的 Checkpoint 或资产权限变更时）发布定义明确的事件 Topic（如 `workspace.asset.updated`）。订阅方在进程内存中监听，明确预留出未来切换为外部集中式 Pub/Sub 服务的“架构插槽”。

### 4. 容忍“半自动”，保留“降级口” (Graceful Degradation)

不要为小概率的并发冲突或极端的语义合并场景去设计庞大且脆弱的自动仲裁算法。
- **守则：** 在遇到资产并发修改冲突且难以自动解决时，系统应直接降级并抛出 `Merge Proposal` 让流程“挂起”，转交人工或指定的高权限 Agent 处理。保持主干写入流程的极简与安全闭环：`Diff -> 发现冲突 -> 产生 Proposal -> 挂起等待 -> 收到决策 -> Apply`。未来只需在挂起阶段旁路插入更智能的 Reviewer 算法进行静默仲裁，而无需重构系统的核心状态机。
