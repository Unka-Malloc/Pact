# Protocol Boundaries

协议属于哪个层级，就放在那个层级自己的 `protocols` 目录中；仓库根目录不再保留顶层 `protocols/`。上下游边界不再单独保留 `communication` 目录，协议报文、协议状态机和协议执行适配统一收敛到对应层级的 `protocols` 下。

协议层和业务层必须分开：

- `protocols`：对接报文格式、字段语义、版本、兼容策略、错误语义、协议状态机和协议边界内执行适配。
- `application / modules / skills`：业务编排、模块实现、能力组合和领域处理。

## 上游与下游

同一条边界可以有两个协议视角：

- 上游协议：由服务提供方维护，描述它对外承诺的请求、响应、事件、错误和兼容策略。
- 下游协议：由调用方维护，描述它消费上游能力时依赖的字段、降级策略、缓存、重试和本地约束。

如果只有一个实现归属方，就只保留该层级的协议文档；如果双方都有独立演进风险，就分别保留上游和下游视角。

## 当前目录

- `server/protocols/client-cli/`：服务端对客户端执行层暴露的上游协议。
- `client-cli/protocols/server/`：Rust 客户端执行层消费服务端协议时的下游约束。
- `server/protocols/checkpoint/`：服务端侧 checkpoint / 断点续传接收协议。
- `client-cli/protocols/checkpoint/`：客户端侧 checkpoint / 断点续传发送协议。
- `server/protocols/server-web/`：服务端对运维控制台暴露的上游 HTTP / JSON 协议。
- `server-web/protocols/server/`：Vue 控制台消费服务端接口时的下游约束。
- `server/protocols/storage/`：服务端与 SQLite、对象存储、任务快照、归一化文档之间的持久化协议。
- `server/protocols/pubsub/`：服务端上游向下游统一发布内容的发布-订阅协议。
- `server/protocols/knowledge/`：服务端应用层与可替换知识库模块之间的 `splitall.knowledge.v1` 协议，以及 vector / embedding / assetStore / retrieval 内部协议边界。

## 知识库协议边界

`server/protocols/knowledge/` 是独立协议，不属于 HTTP 控制器、SQLite repository 或具体 KnowledgeCore 实现的私有说明。它约束这些边界：

- 应用层只调用 `knowledgeBase` mount 的 `knowledge.*` 方法。
- HTTP、JSON-RPC 和 CLI 只做注册表映射、参数映射和错误映射。
- `KnowledgeCore`、`EmbeddingRuntime`、`VectorStore`、`assetStore`、`retrieval` 之间通过内部协议名通信，不通过文件路径或数据库表互相耦合。
- 资产只通过 `GET /api/knowledge/assets/:assetId` 或离线导出相对路径暴露，`assetId` 不承诺等于落盘路径。
- 外部知识库模块可以在模块内部调用 RPC 或其他服务，但必须把外部差异适配回 `splitall.knowledge.v1` 方法形状。
- 离线包 license gate 是知识库协议兼容性的一部分：生产依赖不能是 blocked/UNKNOWN，sqlite-vec 通过 npm 包和平台 optional dependency 许可校验后可声明为 bundled allowed，ONNX 模型在未审查前只能声明为 `not-bundled-license-gated`。

## 编写要求

协议文档应至少说明：

- 协议目标和边界
- 调用方和被调用方
- 请求、响应、事件或文件结构
- 版本号和兼容策略
- 失败语义、重试语义和恢复策略
- 安全、权限或本地路径约束

新增跨切面能力时，先明确协议归属和上下游关系，再落到对应组件的 `protocols` 目录。

## 发布-订阅要求

上游向下游发布的内容统一使用发布-订阅模型：

- 上游协议目录维护发布 topic、事件格式和 retained snapshot 语义。
- 下游协议目录维护订阅 topic、cursor、降级和本地缓存策略。
- 下游不应为同一内容再定义一套私有轮询协议；需要初始状态时使用 retained snapshot，需要增量时使用 cursor 订阅。
- 客户端执行层必须持久化服务端 `nextCursor`；服务端不可达时不清空本地缓存，恢复后从本地 cursor 接续，避免重复消费或漏消费。

## 客户端恢复要求

客户端上传和同步必须按 local-first 设计：

- 服务端不可达时，客户端仍可完成本地文件收集、Mail 导入、本地知识检索和任务入队。
- 上传队列遇到连接拒绝、超时、DNS、临时 5xx/429 等网络型错误时进入 `waiting_server`，不是终态 `failed`。
- `waiting_server` 任务保存 checkpointId、manifestDigest、文件 hash、服务端 offset、upload session、job 引用和下一次重试时间。
- 后台 worker 使用指数退避自动重试；用户手动 `retry` / `resume` 可以立即接续，`pause` / `cancel` 可以阻止自动恢复。
- 服务端事件同步使用 `server.events.sync` 消费 `/api/events`，把服务端事件投影进客户端本地事件日志。

## 控制台认证协议

服务端控制台使用 `console-auth` 本地协议保护 `/api/*` 中声明了 `requiredScopes` 的注册接口。HTTP 与 JSON-RPC 都通过 operation registry 的 `requiredScopes` 字段进入同一鉴权逻辑。

认证协议约束：

- 未创建任何用户时，服务端启动阶段自动创建首个 `owner` 并生成初始密码。
- 初始密码只在服务端本地日志中显示一次，不写入配置文件；控制台 API 不返回密码或密码文件路径。
- 配置中只保存 salt + `crypto.scrypt` 不可逆密码哈希，不保存明文密码。
- 用户创建和密码修改只允许通过服务端命令行执行；HTTP/RPC 控制台接口不接受密码创建或重置。
- 交付包默认提供密码轮换命令：`npm run auth:rotate` 轮换 `owner`；`npm run auth:rotate -- --username alice` 轮换指定用户。
- 登录成功后返回 `session` 与 `csrfToken`，同时写入 `HttpOnly` 会话 cookie 和非 HttpOnly CSRF cookie。
- 所有受保护的非 GET 写操作必须带 `x-splitall-csrf`，否则返回 403。
- 审计日志记录用户、接口、scope、目标摘要、结果和错误，不记录 token、密钥、真实文件路径或大文本 payload。

控制台用户 RBAC 与智能体工具授权分离。智能体仍只通过 `/api/agent-tools/*` 和 Bearer token 访问受限工具入口；这些旧入口已经降级为兼容层，真实授权、策略、执行、审计和指标统一由 `splitall.tool-management.v1` 管理。

## 工具管理平台协议

`splitall.tool-management.v1` 是服务端唯一工具管理边界。它从 `SERVER_API_OPERATIONS` 生成公开工具目录，同时把 MaintenanceAgent、AgentExplorationRuntime 等内部 handler-backed 工具纳入同一个 catalog。工具按 toolset 组织，并用 grant、agent profile 和 policy decision 控制执行。所有工具调用都会生成 `traceId`、`toolExecutionId`、审计记录和指标事件。

公开接口：

- `GET /api/tool-management/v1/catalog`
- `GET /api/tool-management/v1/catalog/:toolId`
- `GET /api/tool-management/v1/toolsets`
- `POST /api/tool-management/v1/toolsets/resolve`
- `GET /api/tool-management/v1/profiles`
- `POST /api/tool-management/v1/policy/evaluate`
- `POST /api/tool-management/v1/policy/preview`
- `POST /api/tool-management/v1/execute`
- `POST /api/tool-management/v1/batch`
- `POST /api/tool-management/v1/dry-run`
- `GET /api/tool-management/v1/grants`
- `POST /api/tool-management/v1/grants`
- `POST /api/tool-management/v1/grants/:grantId`
- `POST /api/tool-management/v1/grants/:grantId/rotate`
- `POST /api/tool-management/v1/grants/:grantId/revoke`
- `GET /api/tool-management/v1/audit`
- `GET /api/tool-management/v1/audit/:toolExecutionId`
- `GET /api/tool-management/v1/metrics/summary`
- `GET /api/tool-management/v1/events`

标准执行请求：

```json
{
  "schemaVersion": 1,
  "toolId": "splitall.knowledge.search",
  "input": {},
  "context": {
    "agentId": "agent-id",
    "profileId": "profile-id",
    "workspaceId": "workspace-id"
  },
  "dryRun": false
}
```

标准执行响应：

```json
{
  "schemaVersion": 1,
  "toolExecutionId": "tool_exec_x",
  "traceId": "trace_x",
  "toolId": "splitall.knowledge.search",
  "status": "ok",
  "result": {},
  "grant": {},
  "policy": {
    "decisionId": "policy_x"
  }
}
```

存储边界：

- 主库：`<userDataPath>/tool-management/tool-management.sqlite`
- grant token 只保存 hash，原文只在创建或轮换响应中出现一次。
- grant 支持 `toolsets`、`toolAllow`、`toolDeny`、`scopes`、过期时间、最大使用次数、每分钟限流、来源 Origin 和 CIDR 边界。
- 审计表记录 redacted input、result summary、duration、status、policy decision，不记录 token、密钥、cookie 或认证头。
- `/api/tool-platform/*` 和 `/api/agent-tools/*` 保留协议兼容，但内部必须进入 ToolExecutionRuntime。
- `GET /api/tool-management/v1/metrics/summary` 支持 `limit`、`since`、`until` 查询参数，返回按 status、tool、profile、grant、risk、denied reason 聚合的调用指标。

知识库智能体工具覆盖四层 scope：

- `knowledge:read`：能力、健康、控制台摘要、维护参数、同步、搜索、对象详情、证据、资产、Markdown 渲染、局部图谱、审核/建议列表、学习健康状态、上下文 profile、智能体共享工作空间和总结任务状态。
- `knowledge:write`：事务归类增强、结构化知识变更、检索/证据反馈、多智能体总结任务创建。
- `knowledge:maintain`：维护任务、reindex、审核项解决、自进化建议解决、学习任务、总结 artifact 确认。
- `knowledge:admin`：知识库维护参数、检索参数和上下文预算 profile 修改。

工具授权 token 不能直接访问控制台 `/api/knowledge/*`；同等能力由 `/api/agent-tools/knowledge/*` 包装并返回 `{ grant, result }`。二进制资产读取仍返回原始内容，并通过响应头标记使用的 grant。危险维护任务保留 `confirm: true` 要求。

知识库检索必须遵守分层索引原则：先在 collection/document/section 粗层判断候选分支，再进入 block/asset 细粒度证据召回。`/api/knowledge/search`、`/api/agent-tools/knowledge/search` 和兼容入口 `/api/agent-tools/search` 都返回 `hierarchy` 字段；当 `hierarchy.enforced=true` 时，智能体必须把选中的文档/章节视为后续证据读取、图谱展开和回答的边界。

## 多智能体知识总结协议

多智能体总结使用 `splitall.summarization.v1`、`splitall.agent-workspace.v1`、`splitall.context.v1` 和 `splitall.multi-agent.v1` 四条边界：

- `AgentWorkspace` 保存 run、智能体私有状态、共享提交、issue、artifact 和决策提案。共享空间只接受结构化提交，canonical fact / entity / relation / taxonomy 变更必须进入审核，不允许智能体直接改权威知识。
- `ContextRuntime` 为无记忆智能体生成角色专属 `ContextPack`，包含任务简报、共享快照、私有摘要、检索证据、压缩历史、工具状态、citations 和预算报告。上下文 profile 可按模型窗口调整预算和压缩参数。
- `MultiAgentCoordinator` 使用固定 LangGraph.js StateGraph：`Plan -> Retrieve -> ExtractEvidence -> OrganizeTopics -> ParallelAnalysts -> Writer -> Reviewer -> Merger -> PublishArtifact`。V1 不让 LLM 自由决定执行流。
- `SummarizationRuntime` 面向海量文档总结，把分层检索结果变成 EvidenceCard，再生成 `EvidenceUnitSummary`、`TopicSummary`、`ExecutiveSummary` 和 `ReviewReport` artifact。

公开接口：

- `POST /api/knowledge/summarization/runs`
- `GET /api/knowledge/summarization/runs/:runId`
- `POST /api/knowledge/summarization/runs/:runId/approve`
- `GET /api/agent-workspaces`
- `GET /api/agent-workspaces/:workspaceId`
- `POST /api/agent-workspaces/:workspaceId/submissions/:submissionId/resolve`
- `POST /api/agent-workspaces/:workspaceId/issues/:issueId/resolve`
- `GET /api/agent-workspaces/:workspaceId/locks`
- `POST /api/agent-workspaces/:workspaceId/locks`
- `GET /api/context/profiles`
- `POST /api/context/profiles`

智能体工具入口提供同等受限包装：`/api/agent-tools/knowledge/summarization/*`、`/api/agent-tools/agent-workspaces/:workspaceId`、`/api/agent-tools/context/profiles`。工具 token 只能通过 scope 访问包装入口，不能绕过控制台认证。

共享空间的提交审核、issue 解决和锁操作也暴露为工具入口。锁用于协调多个无记忆智能体对同一个 artifact、submission、issue 或其他目标的短时独占处理；获取失败返回 `lock_held`，调用方必须换目标或等待，不允许覆盖其他智能体的锁。

覆盖率报告至少包含 `totalEvidence`、`coveredEvidence`、`missingImportantEvidence`、`uncitedClaims`、`conflicts` 和 `score`。审核器发现遗漏、未引用结论或冲突时写入 workspace issue；Merger 可以补充 artifact，但仍不能直接写 canonical knowledge。

模型调用默认关闭，运行请求显式传入 `useModel=true` 或 `modelEnabled=true` 后才通过 `AgentGateway` 调用。可用 `modelAlias` 统一指定模型，也可用 `modelAliases` / `roleModelAliases` 按角色指定；DeepSeek 角色默认映射到 `deepseek` provider alias，Qwen/GLM/custom 模型通过自定义 AgentGateway alias 接入。模型失败时 run 标记 `degraded`，并回退确定性摘要。

## 知识智能体进化闭环协议

进化闭环新增五条可复用边界：

- `splitall.evidence-gate.v1`：回答、总结发布、实体/关系建议前的证据充分性门禁。它检查证据数量、来源多样性、层级命中、引用覆盖、未引用结论和冲突证据。
- `splitall.knowledge-agent-skill.v1`：无记忆智能体使用知识库的固定技能。智能体必须先规划意图、粗层候选、证据需求、query rewrite 和验证项，再执行分层检索，最后通过 evidence gate。
- `splitall.agent-evaluation.v1`：回放固定 case，计算 `Recall@k`、`MRR@k`、`nDCG@k`、`gatePassRate`、`unsupportedClaimRate` 和 `conflictRate`，作为检索 profile、上下文 profile 或 query rewrite 策略能否发布的门槛。
- `splitall.model-decision.v1`：统一管理模型参与角色。默认角色包括 `query_rewriter`、`failure_attributor`、`evidence_entailment_judge`、`conflict_explainer`、`profile_proposer`、`hierarchy_quality_reviewer`。每个角色都有 `modelAlias`、预算、确定性 fallback 和审计 hash；默认不隐式调用模型。
- `splitall.knowledge-evolution.v1`：把“真实反馈 -> 失败归因 -> 候选 RetrievalProfile -> 离线回放评估 -> canary 发布 -> promote/rollback”做成一条可重复运行的流水线。

公开接口：

- `POST /api/knowledge/evidence-gate/evaluate`
- `GET /api/knowledge/agent-skill`
- `POST /api/knowledge/agent-skill/plan`
- `POST /api/knowledge/agent-skill/run`
- `POST /api/knowledge/evaluation/runs`
- `GET /api/knowledge/evaluation/runs`
- `GET /api/knowledge/evaluation/runs/:runId`
- `GET /api/knowledge/model-roles`
- `POST /api/knowledge/model-roles/decide`
- `GET /api/knowledge/evolution`
- `POST /api/knowledge/evolution/runs`
- `GET /api/knowledge/evolution/runs`
- `GET /api/knowledge/evolution/runs/:runId`
- `POST /api/knowledge/hierarchy/audit`
- `GET /api/knowledge/evolution/deployments`
- `POST /api/knowledge/evolution/deployments/:deploymentId/promote`
- `POST /api/knowledge/evolution/deployments/:deploymentId/rollback`

同等能力也通过 `/api/agent-tools/knowledge/*` 提供受限包装。评估运行默认不把失败样本写入学习反馈，避免污染真实用户反馈；它只输出指标、case 级命中和发布建议。进化运行只允许把通过离线评估的候选 `RetrievalProfile` 发布为 canary；active 发布必须经过 promote，异常时可 rollback 到 baseline profile。

语义证据裁判默认采用确定性 token entailment fallback；请求显式 `modelEnabled=true` 且 AgentGateway alias 已配置时才会调用模型。模型输出只作为 `semanticJudgement`、失败归因或建议输入，不能直接改 canonical knowledge。

分层索引质量审计检查缺失层级节点、孤儿父节点、空粗层节点和过载分支。分类拆分、合并、重归类只生成 `KnowledgeSuggestion`，不自动改事实、关系或分类法。

## 知识库控制台协议

Vue 控制台消费 `server/protocols/server-web` 下游协议，只依赖这些聚合和操作接口：

- `GET /api/knowledge/console`：首页健康状态、计数、协议模块、sqlite-vec/JSON fallback、最近维护和最近任务。
- `GET /api/knowledge/config-schema`：维护配置表单元数据，前端不硬编码字段范围。
- `POST /api/runtime/path-browse`：列出服务端本地目录，供控制台路径选择弹窗使用；只返回路径元数据，不返回文件内容。
- `GET /api/knowledge/sources`：服务端本地受管目录、监听状态、最近扫描和最近任务状态。
- `POST /api/knowledge/sources`：新增服务端本地受管目录，可选择立即整理或仅建立监听。
- `POST /api/knowledge/sources/:sourceId`：更新受管目录名称、启停、自动监听和递归策略。
- `DELETE /api/knowledge/sources/:sourceId`：删除受管目录监听关系，不删除原始本地文件。
- `POST /api/knowledge/sources/:sourceId/refresh`、`POST /api/knowledge/sources-refresh`：手动刷新单个或全部受管目录。
- `POST /api/knowledge/search`：检索 evidence pack。
- `GET /api/knowledge/evidence/:evidenceId`：证据详情。
- `GET /api/knowledge/assets/:assetId`：资产读取，只接受 opaque assetId。
- `POST /api/knowledge/render/markdown`：把 evidence pack 渲染成人类/智能体可读 Markdown。
- `POST /api/knowledge/maintenance`、`POST /api/knowledge/maintenance/run`、`POST /api/knowledge/reindex`：维护配置与任务。

协议边界要求：

- 前端不得拼接或读取服务器真实文件路径。
- 资产、归一化 DOCX 和 raw object 下载都必须通过注册接口。
- 受管目录路径只作为服务端本地输入配置保存和展示；文件变化通过服务端监听触发整理任务，任务进度必须回写到触发该操作的 UI 组件附近。
- 危险维护任务必须带 `confirm: true`。
- KnowledgeCore、EmbeddingRuntime、VectorStore、AssetStore、Retrieval 的内部实现可替换，但 `splitall.knowledge.v1` 对应用层保持稳定。

## 自定义 HTTP Adapter / 外部智能体协议

外部智能体网关已经合并到 `custom-http` HTTP Adapter。`AgentGateway` 只是该 Adapter 的
agent 报文实现组件；应用层只保存模型分配引用，不在业务代码中直接拼接外部 URL、token 或 SSE
解析逻辑。

- 配置来源：`<userDataPath>/model-agents/<agent_uid>.json` 是模型库智能体的权威配置文件；`settings.modelLibraryAgentIds[]` 只保存顺序索引。`settings.customHttpAdapter`、`settings.customHttpAdapters[]` 和 `settings.agentGateway` 只保留 custom-http 兼容字段，敏感 token 读取时脱敏。
- 模型分配：`provider=custom-http`，`model=<自定义代称>`。
- HTTP：`GET/POST /api/agent-gateway/config`、`POST /api/agent-gateway/call`、`GET /api/agents`、`POST /api/agents`、`POST /api/agents/:agentId`、`DELETE /api/agents/:agentId`。
- RPC：`agent_gateway.config.get`、`agent_gateway.config.set`、`agent_gateway.call`、`agents.list`、`agents.create`、`agents.update`、`agents.delete`。
- CLI：`agent-gateway config`、`agent-gateway config set --body config.json`、`agent-gateway call --question "..."`、`agents list`、`agents create --name NAME --model MODEL [--provider deepseek]`、`agents update --id AGENT_UID ...`、`agents delete --id AGENT_UID`。
- CLI/API 写入模型库后会改写对应的 `model-agents/<agent_uid>.json` 并发布 `settings.current`，前端“模型库”自动回显；敏感字段仍只在服务端保存，响应和事件中只返回 configured 状态。
- 出站 Header：`Content-Type: application/json` 加配置的 token header。
- 出站 Body：`agentName`、`pluginList`、`question`、`sessionId`、`userId`、`projectId`、`engine`、`parameters`。
- 入站 SSE：解析 `data:{...}`，优先拼接 `type=answer` 的 `data.content`，没有 answer 时回退到 `text` 或 `rawData.text`。
- 客户端注册表同步：`client-cli agents sync` 拉取服务端脱敏列表并缓存，`agents.list` 将本地自定义直连项与服务端代理项合并展示；同名 alias 优先使用本地直连配置。

## DeepSeek 智能体模型接入点

`AgentGateway` 另有内置 `deepseek` provider。它不复用自定义 HTTP Adapter 的
`agentName/pluginList/question` 出站报文，而是由服务端转换为 DeepSeek OpenAI-compatible
Chat Completions 请求。

- 配置来源：`settings.deepSeekApiKey`、`settings.deepSeekBaseUrl`、`settings.deepSeekModel`、`settings.deepSeekTimeoutMs`。
- 默认 Base URL：`https://api.deepseek.com`。
- 默认模型：`deepseek-v4-pro`，可切换为 `deepseek-v4-flash` 或兼容模型 ID。
- 模型分配：`provider=deepseek`，`model=<模型 ID>`。
- 注册表：`GET /api/agents` 返回 `alias=deepseek`，并只暴露 `tokenConfigured`，不返回 API Key。
- 调用：`POST /api/agent-gateway/call`，传入 `alias=deepseek` 或 `provider=deepseek`。
- 出站 Header：`Content-Type: application/json` 和 `Authorization: Bearer <API_KEY>`。
- 出站 Body：`model`、`messages`、`stream`，以及 allowlist 中的采样、工具和 reasoning 参数。
- 入站结果：服务端把 DeepSeek JSON 或 SSE 统一归一成 `answer/text/dialogId/events/chunks`。

## 模型库探测协议

控制台模型库使用显式注册列表 `settings.modelLibraryEntries[]` 和智能体顺序索引
`settings.modelLibraryAgentIds[]`；每个智能体配置是 `<userDataPath>/model-agents/<agent_uid>.json`
下的独立 JSON 文件。页面只展示用户添加过的模型卡片。新增模型时前端把 provider 插入列表顶部；
保存后服务端按独立智能体文件返回脱敏设置。旧版 `settings.modelLibraryModels[]` 仅作为迁移兼容读取。

探测接口：

- HTTP：`POST /api/settings/model-probe`
- RPC：`settings.model_probe`
- CLI：`settings probe-model --provider PROVIDER [--body settings.json]`
- Scope：`runtime:admin`

请求示例：

```json
{
  "provider": "deepseek",
  "settings": {
    "deepSeekBaseUrl": "https://api.deepseek.com",
    "deepSeekModel": "deepseek-v4-pro",
    "deepSeekApiKey": "本次探测用 API Key，可为空以复用已保存密钥"
  }
}
```

响应示例：

```json
{
  "ok": true,
  "configured": true,
  "provider": "deepseek",
  "model": "deepseek-v4-pro",
  "statusCode": 200,
  "latencyMs": 320,
  "checkedAt": "2026-04-29T00:00:00.000Z",
  "message": "连接成功。"
}
```

接口只返回连接结果和耗时，不返回 API Key、OAuth token 或完整上游错误密钥内容。

## 智能体到客户端同步协议

`agent-sync` 是外部智能体向客户端同步消息的服务端策略层。它复用 `server/protocols/pubsub` 的 cursor、topic、retained snapshot 和长轮询语义，但智能体不能直接决定哪些内容进入客户端。

- 配置文件：`<userDataPath>/agent-sync.json`。
- 策略字段：`enabled`、`defaultTopicEnabled`、`topics[]`，每个 topic 有 `enabled` 和 `retain`。
- 默认 topic：
  - `agent.sync.answer`：同步回答，默认启用并保留最新快照。
  - `agent.sync.status`：同步状态，默认启用并保留最新快照。
  - `agent.sync.progress`：同步进度，默认启用但不保留。
  - `agent.sync.risk`：风险提示，默认不同步。
  - `agent.sync.debug`：调试信息，默认不同步。
- 智能体发布接口：`POST /api/agent-sync/publish`，必须使用工具平台 Bearer token，并具备 `agent_sync:publish` scope。
- 客户端订阅接口：`GET /api/agent-sync/events?topic=answer&cursor=0&includeSnapshot=1`。
- 通用事件接口 `/api/events` 也会过滤已禁用的 `agent.sync.*` topic，避免客户端绕过策略读取禁用同步内容。
- RPC：`agent_sync.config.get`、`agent_sync.config.set`、`agent_sync.publish`、`agent_sync.subscribe`。
- CLI：`agent-sync config`、`agent-sync config set --body sync.json`、`agent-sync publish --body payload.json`、`agent-sync subscribe --topic answer`。
