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
- 知识管理协议分三层：原始语料建构层通过 `splitall.normalized-documents` 包保留结构、切分、时间线、事务链和可导出 DOCX；知识索引建构层通过内置 `KnowledgeCore` 或外部知识库适配器解析规范语料，建立可查询索引，并通过 `knowledge.search`、evidence pack、asset protocol 和 `knowledge.export.docx` 提供可引用 RAG 证据；知识蒸馏层只消费第二层 evidence，产出有损背景、摘要和候选规则供 ContextRuntime / AgentWorkspace 使用。
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

## 外部知识库适配责任

第二层可对接外部知识库，因此第一层和第二层共同承担原始文档解析链路：

- 第一层 `raw-corpus-construction` 解析原始文件、邮件、附件、聊天记录和本地镜像，输出保真 `sources / chunks / normalized-documents`、时间线、事务链、sourceRange 和 raw object 引用。
- 第二层 `knowledge-index-construction` 不只接收“纯文本片段”；它必须能读取第一层规范语料、manifest、DOCX、source metadata 和资产引用，并把它们解析/映射成内置或外部知识库的 document、section、block、asset、embedding、relationship 和 evidence locator。
- 外部知识库适配器可以调用远端 ingestion、search、asset 或 graph API，但公开面必须仍是 `splitall.knowledge.v1`。查询返回必须带 `sourceTrace`、`citations`、opaque `assetId` 和可审计 evidence locator。
- 上游服务、智能体、控制台和 CLI 不能直接调用外部知识库私有 API；它们只能通过 `knowledgeBase` mount、operation registry 和 Tool Management 访问第二层能力。

外部知识库适配器的最小一致性面定义在 `server/protocols/knowledge/README.md` 的 `External Knowledge-Base Adapter Protocol`。生产适配器至少必须实现：

- `knowledge.capabilities` / `knowledge.health`：声明 backend、部署方式、功能开关、索引特性、license 状态、对象计数、最新 ingest/search 时间和 degraded 原因。
- `knowledge.ingest.batch` / `knowledge.upsert.documents`：读取第一层 normalized corpus，把 document / section / block / asset / embedding / relationship 映射到内置或外部知识库索引，并持久化 SplitAll id 到外部 id 的映射。
- `knowledge.search`：只返回 evidence pack，不返回裸 chunk；必须包含 hierarchy、citations、sourceTrace、scoreReasons 和可审计 backendTrace。
- `knowledge.get.evidence`：按 opaque `evidenceId` 重新读取已物化证据，不要求调用方知道外部库 id。
- `knowledge.asset`：按 opaque `assetId` 读取二进制资产或返回结构化 missing-asset 状态，不暴露外部库私有路径。
- `knowledge.export.docx`：从当前 `knowledgeBase` mount 导出标准 DOCX 语料，并保留 SplitAll id、evidence locator、citations、sourceTrace 和 asset reference。
- `knowledge.delete.batch` / `knowledge.reindex` / `knowledge.sync`：生产适配器必须支持删除或 tombstone、索引重建和 mirror cursor；不支持时只能作为只读实验适配器。

适配器一致性测试必须覆盖一个小型 normalized corpus：ingest -> search -> evidence read -> asset read -> export DOCX -> delete/tombstone -> search/sync 不再返回已删除对象。远端后端必须在检索前应用 tenant、workspace、source-scope 和权限过滤，不能先 topK 再做权限后过滤。

首批外部知识库检测只覆盖成熟开源后端：

- `PostgreSQL + pgvector`：作为基线后端，验证 SplitAll id、sourceTrace、权限范围、tombstone、DOCX export 状态和向量检索能在同一可审计数据库中闭环。
- `Qdrant`：验证向量检索、payload metadata filter、tenant/workspace/source-scope 预过滤，以及 evidence/asset sidecar 映射。
- `OpenSearch`：验证全文检索、向量检索、hybrid score fusion、生产级过滤和检索降级语义。
- `Weaviate`：作为可选对象型后端，只在需要验证 collection schema、object property 和 hybrid query 行为时启用。

RAGFlow、Dify、LlamaIndex、Haystack、GraphRAG、私有搜索服务和托管云服务暂不进入首批必测矩阵；它们可以作为后续产品集成对象，但不能替代成熟开源后端的一致性测试。

当前实现入口是 `server/platform/specialized/knowledge/storage/external-knowledge-base/index.mjs`。该 mount 仍以 `KnowledgeCore` 保存 canonical evidence、asset 和 DOCX export，然后把第二层检索记录镜像到外部后端。首批已实现连接：

- `qdrant`：通过 HTTP API 建 collection、upsert points、payload filter search 和 batch delete。
- `opensearch`：通过 HTTP API 建 index、bulk upsert、全文 + knn hybrid search 和 delete-by-query。
- `pgvector`：通过 PostgreSQL + pgvector 表完成 upsert/search/delete；运行时需要部署环境提供 `pg` Node.js 驱动。

启动时可用 `SPLITALL_SERVER_KNOWLEDGE_BASE_MODULE=server/platform/specialized/knowledge/storage/external-knowledge-base/index.mjs` 切换到外部知识库 mount，并用 `SPLITALL_EXTERNAL_KB_PROVIDER`、`SPLITALL_EXTERNAL_KB_URL`、`SPLITALL_EXTERNAL_KB_COLLECTION` 或 `SPLITALL_EXTERNAL_KB_CONNECTION_STRING` 指定后端。

## 存储、Manifest 与检索关系

服务端存储协议固定分层：

- `metadata/splitall.sqlite` 是唯一服务端元数据真相源，也是普通检索、审计、raw object 定位的入口。
- `upload-sessions/<sessionId>/meta.json` 只保存上传和断点续传状态。
- `checkpointReceipt` 只保存创建 job 所需的服务端校验凭证。
- `jobs/<jobId>/result.json` 是任务结果快照，用于回放、排障和元数据库重建，不作为在线检索索引。
- `objects/<ClientUID>/<SourceType>/<OriginalFileName>__<ArchiveBatchId>.<ext>` 只保存客户端上传的原始文件字节，不保存服务端追加字段。

检索请求必须先进入 SQLite / 知识库协议索引。命中 raw object 后，才允许通过 `storage_rel_path` 读取对象存储。任何 HTTP、RPC、CLI、server-web、client-gui 或智能体工具都不能直接扫描 manifest 或 `objects/` 目录作为检索入口。

## 多源本地镜像与统一检索

跨应用检索采用 local mirror-first 架构：客户端连接 Gmail、Outlook、Google Drive、OneDrive、Slack、Teams、macOS Mail、本地目录等数据源，把授权、同步、本地缓存和本地查询都收敛到客户端 `DataConnector`，服务端只接收已镜像、已校验的归档批次和标准来源元数据。

客户端标准调用面：

- RPC / CLI：`connectors.list`、`connectors.install`、`connectors.enable`、`connectors.disable`、`connectors.uninstall`、`connectors.auth.start`、`connectors.auth.status`、`connectors.auth.revoke`、`connectors.sync`、`connectors.health`、`connectors.queryLocal`。
- 连接器 manifest 最小字段：`id`、`providerId`、`sourceType`、`displayName`、`version`、`runtime`、`entrypoint`、`capabilities`、`permissions`、`oauth`、`syncPolicy`、`uninstallPolicy`。
- 运行目录：`portable-data/connectors/modules`、`portable-data/connectors/state`、`portable-data/connectors/cache`、`portable-data/chat-index/chat.sqlite`。
- OAuth token 默认进入系统 Keychain / Credential Store；便携模式下只有显式启用加密本地凭据文件时才允许落盘。

外部连接器包按目录安装，目录内的 `connector.json` 定义 provider、sourceType、运行时和卸载策略。`runtime.kind = "process"` 的连接器由客户端复制到 `portable-data/connectors/modules/<providerId>` 后动态执行；`entrypoint` 必须是包内相对路径，不能指向绝对路径或包外文件。进程运行时协议为 `splitall.data-connector.process.v1`：客户端向标准输入写入 `{ operation, providerId, params, connector, paths, policy }`，连接器向标准输出返回 JSON。`sync` 返回 `items/results/hits/messages` 后写入本地 mirror 或 `chat.sqlite`；`localQuery` 返回统一 `SourceHit`；`health`、`auth.start/status/revoke`、`uninstall` 是可选 capability。`policy.remoteCallsAllowed=false` 是本地查询边界，连接器不得在搜索时实时访问远端 API。

服务端 ingestion 接收并持久化这些来源字段：`clientUid`、`sourceType`、`providerId`、`externalId`、`syncBatchId`、`originalFileName`、`contentHash`、`capturedAt`、`sourceMetadata`。原始文件仍按 `ClientUID -> SourceType -> FileName` 归档，文件名包含原始文件名和客户端/服务端一致的上传批次 ID；服务端检索字段、连接器字段、批次关系只进入 SQLite / Manifest，不写入源文件字节。

聊天记录使用专用本地 `chat.sqlite`，保留 `sources`、`workspaces`、`conversations`、`participants`、`messages`、`attachments`、`message_fts` 等会话关系。第二层知识索引实现（内置 `KnowledgeCore` 或外部知识库适配器）只消费统一 evidence 包和标准来源元数据，搜索结果必须标注来源应用、源对象、原始路径或消息定位、同步批次和可信时间。

知识蒸馏属于第三层有损背景生成，只消费已入库的统一 evidence，不直接依赖连接器、raw object、job 目录或远端 API。蒸馏候选必须携带 `sourceTrace`，并在 `distilledOutputs.summary`、`distilledOutputs.ruleCandidates[]`、`distilledOutputs.entityRelationCandidates[]` 上保留 `evidenceRefs`、`citations` 和来源链路；没有引用链路的摘要、规则或实体关系只能进入补证/审核，不能作为可发布知识资产。蒸馏结果只能供上下文、工作空间、长任务背景和候选治理流使用，不能替代 `knowledge.search`、evidence pack 或结构读取接口作为全量查询入口。

搜索默认不实时调用远端 Gmail / Drive / Slack / Teams API。统一检索先查服务端已入库索引，再可选合并客户端 `connectors.queryLocal` 返回的本地 mirror 命中；该预留接口用于覆盖尚未上传完成的数据，不承担远端 federated search。融合排序由 `knowledge.search` 接收 `localQuery.items` / `localHits` 后完成：服务端按 `providerId + externalId`、聊天定位、文件定位或内容 hash 去重，把已入库 evidence 与本地 mirror 命中合并排序；本地-only 命中会标记 `localMirror.openable=false`，UI 可以展示但不能当成服务端 evidence 打开。

长文档检索吸收 PageIndex 的局部能力，但仍属于 KnowledgeCore 的分层检索增强，不引入 PageIndex 依赖，也不改成全局 vectorless RAG。`DocumentOutlineRuntime` 从已入库 sections、Markdown 标题、归一化段落、页/块边界构建自然章节树；结构过粗的长文档会生成 synthetic outline nodes，写入 `kc_hierarchy_nodes`，metadata 只保存 `outlineOrigin`、`sourceRange`、`quality`、`textDigest`，不会改写源文件。`knowledge.search` 可显式传入 `hierarchyReasoning: true`，或由 RetrievalProfile 打开 `hierarchyReasoningEnabled`；开启后只把 compact tree `{nodeId,title,summary,sourceRange,children}` 交给 `hierarchy_tree_router` 做可选路由，模型必须由 `modelEnabled=true` 显式启用，失败时降级为确定性 hierarchy FTS。结构读取接口只返回目录树和定位，不返回全文：HTTP `GET /api/knowledge/documents/:documentId/structure`，RPC `knowledge.document.structure`，CLI `knowledge structure --document-id <id>`，工具 `splitall.knowledge.documentStructure`。

客户端运行时分配由 `ClientRuntimeAllocator` 提供，协议版本为 `splitall.client-runtime-allocator.v1`。它是应用层的 Strategy/Policy Resolver：只按标准字段 `clientUid + taskType` 选择运行时 profile，把模型别名、ContextProfile、RetrievalProfile、workspace/session 和工具授权绑定到同一个客户端维度；调用方显式传入的 `modelAlias/contextProfileId/retrievalProfileId/workspaceId/toolGrantId` 永远优先。调用方显式选择已有 `workspaceId` 时，工作空间热切换后的 `workspaceContext` 优先于 allocator 注入的模型、上下文、工具授权和检索源默认值；allocator 默认值只在没有显式参数且 workspace 没有对应值时作为 fallback。配置持久化在 `client-runtime/client-runtime-allocator.json`；使用热度持久化在 `client-runtime/client-runtime-usage.json`。公开接口为 HTTP `GET|POST /api/client-runtime/profiles`、`POST /api/client-runtime/resolve`、`GET /api/client-runtime/status`，RPC `client_runtime.profiles.get|set`、`client_runtime.resolve`、`client_runtime.status`，CLI `client-runtime profiles|profiles set|resolve|status`。`agent_gateway.call`、`context.preview/assemble`、`knowledge.search`、总结和智能探索运行时会把分配结果写入 `clientRuntimeAllocation`，用于 UI、审计和热切换解释。`coolingPolicy.strategy = lru-lfu-v1` 使用最近窗口桶、总调用量和最近访问时间计算热度；低频且最旧的客户端可被切到 `coldContextProfileId` 与冷工作空间策略，释放上下文预算给高频客户端。控制台“系统状态 / 运维监控”中的客户端热力图读取同一个状态接口，不维护另一套私有统计。`clientId` 不参与用户空间识别；它只属于检索灰度、服务发现等明确声明的其他协议。

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

控制台用户 RBAC 与智能体工具授权分离。智能体只通过 `splitall.tool-management.v1` 的 grant 和 Bearer token 执行受限工具；授权、策略、执行、审计和指标统一由 Tool Management v1 管理。

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
- `GET /api/tool-management/v1/metrics/summary` 支持 `limit`、`since`、`until` 查询参数，返回按 status、tool、profile、grant、risk、denied reason 聚合的调用指标。

知识库智能体工具覆盖四层 scope：

- `knowledge:read`：能力、健康、控制台摘要、维护参数、同步、搜索、对象详情、证据、资产、Markdown 渲染、局部图谱、审核/建议列表、学习健康状态、上下文 profile、智能体共享工作空间和总结任务状态。
- `knowledge:write`：事务归类增强、结构化知识变更、检索/证据反馈、多智能体总结任务创建。
- `knowledge:maintain`：维护任务、reindex、审核项解决、自进化建议解决、学习任务、总结 artifact 确认。
- `knowledge:admin`：知识库维护参数、检索参数和上下文预算 profile 修改。

工具授权 token 不能直接访问控制台 `/api/knowledge/*`；同等能力通过 `/api/tool-management/v1/execute` 执行 `splitall.knowledge.*` 工具并返回标准工具执行响应。二进制资产读取必须走对应工具或控制台注册接口。危险维护任务保留 `confirm: true` 要求。

运行时热插拔也走同一工具治理面：`splitall.runtime.info`、`splitall.runtime.mounts` 只读查看当前挂载和 generation；`splitall.runtime.mounts.set`、`splitall.runtime.mounts.reload` 属于 `splitall.runtime.maintain`，要求 `knowledge:maintain` grant、`metadata.maxRisk=repair_write` 风险上限和 `confirm: true`。这些工具内部仍调度 `runtime.set_mounts` / `runtime.reload_mounts` 统一 Operation，不绕过审计、并发锁或 mount 路由校验。

知识索引建构层必须遵守分层索引原则：先在 collection/document/section 粗层判断候选分支，再进入 block/asset 细粒度证据召回。`/api/knowledge/search` 和 `splitall.knowledge.search` 工具都返回 `hierarchy` 字段；当 `hierarchy.enforced=true` 时，智能体必须把选中的文档/章节视为后续证据读取、图谱展开和回答的边界。

分层索引包含自然章节树增强：`rebuildHierarchyIndex` 按 section level / position 重建父子树，长文档 synthetic outline 节点也进入同一 `kc_hierarchy_nodes`。搜索结果的 `hierarchy` 会在原有 selected/candidates 基础上补充 `selected.outlines`、`outlineRoutes` 和 `reasoning`；outline 只提升或收窄候选，不能替代 FTS/BM25、vector、graph、feedback、localQuery 或 evidence gate。RetrievalProfile 可配置 `hierarchyReasoningEnabled`、`outlineMinDocumentBlocks`、`outlineMaxTreeNodes`，默认 `hierarchyReasoningEnabled=false`。

## 多智能体知识总结协议

多智能体总结使用 `splitall.summarization.v1`、`splitall.agent-workspace.v1`、`splitall.context.v1` 和 `splitall.multi-agent.v1` 四条边界：

- `AgentWorkspace` 保存 run、智能体私有状态、共享提交、issue、artifact 和决策提案。共享空间只接受结构化提交，canonical fact / entity / relation / taxonomy 变更必须进入审核，不允许智能体直接改权威知识。
- `ContextRuntime` 为无记忆智能体生成角色专属 `ContextPack`，包含任务简报、共享快照、私有摘要、检索证据、压缩历史、工具状态、citations 和预算报告。上下文 profile 可按模型窗口调整预算和压缩参数。
- `AgentMemory` 是 `splitall.agent-memory.v1` 会话记忆边界。ContextRuntime/ContextCompactionRuntime 只通过该模块读取、写入和清理压缩记忆；压缩记忆是辅助上下文，不是 canonical evidence。
- `MultiAgentCoordinator` 使用固定 LangGraph.js StateGraph：`Plan -> Retrieve -> ExtractEvidence -> OrganizeTopics -> ParallelAnalysts -> Writer -> Reviewer -> Merger -> PublishArtifact`。V1 不让 LLM 自由决定执行流。
- `SummarizationRuntime` 面向海量文档总结，把分层检索结果变成 EvidenceCard，再生成 `EvidenceUnitSummary`、`TopicSummary`、`ExecutiveSummary` 和 `ReviewReport` artifact。

公开接口：

- `POST /api/knowledge/summarization/runs`
- `GET /api/knowledge/summarization/runs/:runId`
- `POST /api/knowledge/summarization/runs/:runId/approve`
- `GET /api/agent-workspaces`
- `GET /api/agent-workspaces/:workspaceId`
- `GET /api/agent-workspaces/:workspaceId/context`
- `GET /api/agent-workspaces/:workspaceId/context-bundle`
- `POST /api/agent-workspaces/:workspaceId/context-bundle/restore`
- `POST /api/agent-workspaces/:workspaceId/profile`
- `POST /api/agent-workspaces/:workspaceId/submissions/:submissionId/resolve`
- `POST /api/agent-workspaces/:workspaceId/issues/:issueId/resolve`
- `GET /api/agent-workspaces/:workspaceId/locks`
- `POST /api/agent-workspaces/:workspaceId/locks`
- `GET /api/context/profiles`
- `POST /api/context/profiles`

智能体工具入口通过 Tool Management v1 提供同等受限能力：`splitall.knowledge.*`、`splitall.agent-workspace.*`、`splitall.context.*` 等工具只能在 grant scope 允许时执行，不能绕过控制台认证。

共享空间的提交审核、issue 解决和锁操作也暴露为工具入口。锁用于协调多个无记忆智能体对同一个 artifact、submission、issue 或其他目标的短时独占处理；获取失败返回 `lock_held`，调用方必须换目标或等待，不允许覆盖其他智能体的锁。

工作空间上下文热切换以 `workspaceId` 为入口。`GET /api/agent-workspaces/:workspaceId/context` 返回解析继承链后的 `contextProfileId`、`modelAlias`、`toolGrantId`、`knowledgeSourceIds`、`currentGeneration` 和 `contextFingerprint`。`GET /api/agent-workspaces/:workspaceId/context-bundle?format=compressed` 导出 `splitall.workspace-context-bundle.v1`，包含 `bundleHash` 和 `gzip+base64` 压缩载荷；`POST /api/agent-workspaces/:workspaceId/context-bundle/restore` 接受 `compressed`、`bundle` 或 `contextBundle`，可带 `bundleHash` 做完整性校验。恢复只写入调用方有权限访问的目标工作空间，hash 不匹配时返回 400 且不改变目标上下文；成功后会把 bundle 中的 profile、模型别名、工具授权和知识源集合热切换到目标工作空间，并写入一次 `context_bundle_restore` run 与 handoff artifact。

同等能力暴露为 Tool Management v1 工具：`splitall.agentWorkspace.context`、`splitall.agentWorkspace.contextBundle.export`、`splitall.agentWorkspace.contextBundle.restore`、`splitall.agentWorkspace.profile.hotswap`、`splitall.agentWorkspace.sources.set`、`splitall.agentWorkspace.share/unshare`。读取类工具只需 `knowledge:read`；恢复、profile 热切换、继承和共享变更需要 `knowledge:maintain`，不能被只读 grant 执行。

多智能体总结运行时同样消费工作空间上下文：传入已有 `workspaceId` 时不会重建覆盖该 workspace profile；调用方未显式指定 `modelAlias`、`contextProfileId`、`toolGrantId` 或 `sourceIds/scopeSourceIds` 时，运行时继承 workspace 的模型别名、上下文 profile、工具授权和知识源集合，并将它们传给 `ContextRuntime`、`AgentGateway` 和 KnowledgeCore 检索。若 `ClientRuntimeAllocator` 同时注入默认值，优先级为调用方显式参数、已选 workspace 的 `workspaceContext`、allocator 默认值。响应与 run input 保留 `workspaceContext`，用于审计长任务到底使用了哪一代上下文。

智能探索运行时也消费同一工作空间上下文：`workspaceId` 存在时，如果调用方没有显式传入 `modelAlias`、`contextProfileId`、`toolGrantId` 或 `sourceIds/scopeSourceIds`，运行时会使用工作空间的模型别名、上下文 profile、工具授权和知识源集合；这些值会传给 `ContextRuntime`、`AgentGateway`、`keyword_search` 和 `knowledge_aggregate`，并写入 run input、审计日志与响应的 `workspaceContext`。若 `ClientRuntimeAllocator` 同时注入默认值，优先级为调用方显式参数、已选 workspace 的 `workspaceContext`、allocator 默认值。

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

同等能力也通过 Tool Management v1 的 `splitall.knowledge.*` 工具提供受限调用。评估运行默认不把失败样本写入学习反馈，避免污染真实用户反馈；它只输出指标、case 级命中和发布建议。进化运行只允许把通过离线评估的候选 `RetrievalProfile` 发布为 canary；active 发布必须经过 promote，异常时可 rollback 到 baseline profile。

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
- `GET /api/knowledge/export/docx`：把已收纳知识导出为标准 DOCX 语料包，供外部知识库使用。
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

- 配置来源：`<userDataPath>/model-agents/<agent_uid>.json` 是模型库智能体的权威配置文件；`settings.modelLibraryAgentIds[]` 只保存顺序索引。`settings.customHttpAdapter` 和 `settings.customHttpAdapters[]` 保存 custom-http 配置，敏感 token 读取时脱敏。
- 模型分配：`provider=custom-http`，`model=<自定义代称>`。
- HTTP：`GET/POST /api/agent-gateway/config`、`POST /api/agent-gateway/call`、`GET /api/agents`、`POST /api/agents`、`POST /api/agents/:agentId`、`DELETE /api/agents/:agentId`。
- RPC：`agent_gateway.config.get`、`agent_gateway.config.set`、`agent_gateway.call`、`agents.list`、`agents.create`、`agents.update`、`agents.delete`。
- CLI：`agent-gateway config`、`agent-gateway config set --body config.json`、`agent-gateway call --question "..." [--workspace-id WORKSPACE_ID] [--tool-grant-id GRANT_ID]`、`agents list`、`agents create --name NAME --model MODEL [--provider deepseek]`、`agents update --id AGENT_UID ...`、`agents delete --id AGENT_UID`。
- CLI/API 写入模型库后会改写对应的 `model-agents/<agent_uid>.json` 并发布 `settings.current`，前端“模型库”自动回显；敏感字段仍只在服务端保存，响应和事件中只返回 configured 状态。
- 出站 Header：`Content-Type: application/json` 加配置的 token header。
- 出站 Body：`agentName`、`pluginList`、`question`、`sessionId`、`userId`、`projectId`、`engine`、`parameters`、`contextProfileId`、`toolGrantId/grantId`、`workspaceContext`。
- 入站 SSE：解析 `data:{...}`，优先拼接 `type=answer` 的 `data.content`，没有 answer 时回退到 `text` 或 `rawData.text`。
- 客户端注册表同步：`client-cli agents sync` 拉取服务端脱敏列表并缓存，`agents.list` 将本地自定义直连项与服务端代理项合并展示；同名 alias 优先使用本地直连配置。

`POST /api/agent-gateway/call` 传入 `workspaceId` 时，服务端会先解析工作空间运行上下文：调用方没有显式传入模型、上下文 profile、工具授权或检索源时，自动使用工作空间的 `modelAlias`、`contextProfileId`、`toolGrantId` 和 `knowledgeSourceIds`；响应返回 `workspaceContext` 便于 UI、审计和外部智能体确认本次热切换状态。该解析不需要重启服务，目标工作空间权限不满足时返回 404。

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
保存后服务端按独立智能体文件返回脱敏设置。

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
