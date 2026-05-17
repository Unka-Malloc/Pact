# Agent capability audit

本文件记录知识库、工具链和上下文管理主线的外部项目对照、当前落地证据和继续治理边界。它不是产品宣传文档；它用于判断当前实现是否真的推进了“业界领先的知识库、工具链、上下文管理”目标。

审计日期：2026-05-17。

## 外部模式来源

仅参考公开源代码仓库、官方 README 或官方文档，不复制外部实现代码。

- OpenCode：模型无关、客户端/服务端架构、TUI/多客户端、可替换 provider、上下文/权限/会话 UI 与 MCP 生态。来源：<https://github.com/anomalyco/opencode>、<https://www.opencode.asia/>。
- LangChain Deep Agents：长任务默认 harness、可替换组件、子智能体隔离上下文、上下文压缩、持久记忆、工具审批、MCP 工具接入，以及生产侧 tracing/evaluation/monitoring。来源：<https://github.com/langchain-ai/deepagents>。
- OpenClaw：Gateway 控制面、可选 companion apps/nodes、workspace prompt files、skills registry、tools/automation、security/sandboxing 文档入口和开发热重载。来源：<https://github.com/openclaw/openclaw>。
- Hermes Agent：多模型切换、单 gateway 连接多消息平台、agent-curated memory、跨会话检索、skill 自改进、subagents、tool RPC、终端后端和 trajectory compression。来源：<https://github.com/NousResearch/hermes-agent>。

## Prompt-to-artifact checklist

| 目标要求 | 当前证据 | 验证 |
| --- | --- | --- |
| 优先实现上下文 + workspace 热切换 | `server/platform/specialized/agent/agent-workspace/index.mjs` 提供 `getWorkspaceContext`、`exportWorkspaceContextBundle`、`restoreWorkspaceContextBundle`、`hotSwapProfile`；`system-controller.mjs` 和 `operation-registry.mjs` 暴露 HTTP/RPC/Operation 入口。 | `npm run server:verify:agent-workspace`、`npm run server:verify:agent-gateway` |
| 同一大模型底座上切换工作状态 | `AgentGateway`、`AgentExplorationRuntime` 和 `SummarizationRuntime` 在 `workspaceId` 存在时解析 `workspaceContext`，继承 `modelAlias`、`contextProfileId`、`toolGrantId` 和 `knowledgeSourceIds`；优先级为调用方显式参数、已选 workspace 上下文、`ClientRuntimeAllocator` 默认值。 | `npm run server:verify:agent-gateway`、`npm run server:verify:agent-exploration`、`npm run server:verify:multi-agent-summarization`、`npm run server:verify:client-runtime-allocator` |
| workspace/context 统一打包、压缩和恢复 | `splitall.workspace-context-bundle.v1` 支持 `gzip+base64`、`bundleHash` 和 hash mismatch 无副作用恢复。 | `npm run server:verify:agent-workspace`、`npm run server:verify:agent-knowledge-tools` |
| 工具链受治理且可授权给智能体 | `tool-management-core` catalog/runtime/policy/store 暴露工具目录、grant、风险上限、确认头、审计和 execution path。 | `npm run server:verify:tool-management`、`npm run server:verify:agent-knowledge-tools`、`npm run server:verify:operation-policy` |
| runtime mount 可热插拔且不绕过核心审计 | `splitall.runtime.info`、`splitall.runtime.mounts`、`splitall.runtime.mounts.set`、`splitall.runtime.mounts.reload` 通过 Tool Management 调度统一 Operation，维护类要求 `knowledge:maintain`、`metadata.maxRisk=repair_write` 和 `confirm: true`；验证覆盖只读 grant 拒绝 set、维护 grant 缺 confirm 拒绝、确认后 set 持久化路由并提升 `mountGeneration`、reload 后配置仍保留。 | `npm run server:verify:tool-management`、`npm run server:verify:dispatcher-unified` |
| 先通过算法改进提升知识库召回和检索 | `knowledge-core/retrieval-scoring.mjs` 和 `knowledge-core/index.mjs` 支持 identifier/camelCase tokenization、token-like fallback candidate 和 scoped source filtering。 | `npm run server:verify:knowledge-retrieval-quality` |
| 核心能力不依赖外部高级模块 | 核心知识库、AgentWorkspace、ContextRuntime、AgentMemory、AgentGateway 和 Tool Management 都位于 `server/platform/specialized` 与 `server/platform/common`，不要求外部 provider 才能运行。 | `npm run server:verify` |
| 可通过外置模块扩展高级能力 | `module-manager`、mount routing、runtime reload、Provider Registry 和 feature profiles 保持可替换实现边界。 | `npm run server:verify:architecture-patterns`、`npm run server:verify:platform-layout`、`npm run server:verify:feature-profiles` |
| 不修改词云 | 本主线新增能力不在 word-cloud/wordcloud/word_bag 路径落地；预处理目录下仅保留已有 `word-cloud/preprocess.mjs` 边界。 | `git diff --name-only | rg -i 'word[-_ ]?cloud|wordcloud|word_bag|word-bag'` 应无输出 |

## External pattern mapping

| 外部模式 | SplitAll 当前对应 | 治理判断 |
| --- | --- | --- |
| OpenCode 的 provider-agnostic client/server agent | `AgentGateway` alias/provider 配置、custom-http、DeepSeek provider、client runtime allocation、workspace hot switch。 | 已落地；继续增强时只能走 AgentGateway 和 runtime profile，不在业务代码里直连模型。 |
| OpenCode 的上下文/权限/session 可观测面 | `workspaceContext`、`clientRuntimeAllocation`、run input、audit log、context fingerprint。 | 已落地；新的 agent runtime 必须回传实际 context。 |
| Deep Agents 的 planning/context/delegation harness | `MultiAgentCoordinator`、`AgentExplorationRuntime`、`ContextRuntime`、`ContextCompactionRuntime`、AgentWorkspace locks/issues/artifacts。 | 已落地；新长任务链路必须有固定状态或明确 step audit，不让模型自由改执行流。 |
| Deep Agents 的 tool sandbox boundary | Tool Management grant、risk、confirm、operation policy 和 allowlisted command/http 工具。 | 已落地；危险工具必须由策略层裁决，不能依赖提示词自律。 |
| OpenClaw 的 gateway 控制面与 optional apps/nodes | `AgentGateway`、server console、client CLI sidecar、feature profiles。 | 部分落地；SplitAll 不是消息平台 agent，保留服务端控制台和客户端 sidecar 边界，不复制 OpenClaw 消息网关。 |
| OpenClaw 的 workspace prompt files/skills registry | AgentWorkspace context bundle、knowledge skill runtimes、Tool Management catalog。 | 已按 SplitAll 知识库语义重构；canonical knowledge 仍需要审核，不让 skill 直接覆盖权威事实。 |
| Hermes Agent 的 persistent memory and self-improving skills | `AgentMemory`、KnowledgeEvolutionRuntime、knowledge skillization、golden distillation、retrieval-quality replay。 | 已落地核心路径；memory 是辅助上下文，不是 canonical evidence。 |
| Hermes Agent 的 model switching and subagents | `modelAlias`/`contextProfileId` hot swap、MultiAgentCoordinator、Agent Exploration tool loop。 | 已落地；外部模型切换必须通过 alias/profile，而不是每个模块私有配置。 |

## Completion audit status

当前主线已经具备可验证的核心闭环：检索质量回放、workspace context hot swap、上下文包压缩恢复、AgentGateway 模型切换、Tool Management 授权执行、runtime mount 热插拔和 AgentMemory 边界。

仍不能把目标简单判定为永久完成，原因是“业界领先”属于持续基准，而不是一次性脚本可证明的静态状态。停止开发前至少需要重新运行并检查：

- `npm run server:verify`
- `npm run test:fast`
- `git diff --check`
- 词云路径无改动检查
- 本文件的 prompt-to-artifact checklist 是否仍覆盖所有用户目标
