# Knowledge Architecture Governance

本文定义知识库模块的架构治理基线。目标不是把所有能力塞进一个类或一个页面，而是保证知识库作为一个整体对外稳定、内部可替换、调用可审计、前端可操作。

## 结论

当前知识库应被视为一个整体能力面：

- 对外入口是 `knowledgeBase` mount、`splitall.knowledge.v1` 协议、`SERVER_API_OPERATIONS` 注册表和 Tool Management v1 工具目录。
- 内部实现可以分层拆分为 `KnowledgeCore`、`EmbeddingRuntime`、`VectorStore`、`assetStore`、`retrieval`、维护/学习/总结/智能探索等运行时。
- 知识管理系统分为三层：`raw-corpus-construction`、`knowledge-index-construction`、`knowledge-distillation`。三层分别对应原始语料建构、权威索引建构和有损蒸馏背景，不能混成一个隐式知识对象。
- 前端通过 `/knowledge/:tab`、`/workspaces`、`/debug/:tab`、`/admin/tools`、`/admin/modules` 形成操作面，不允许只存在后端能力而没有控制台调用路径。
- 词云属于知识管理辅助视图，不是 canonical evidence 边界；它不能替代 `knowledge.search`、evidence pack、asset protocol 或分层索引。

## 三层知识管理基线

| 层级 | 目标 | 主要产物 | 上游使用方式 | 可信边界 |
| --- | --- | --- | --- | --- |
| 1. 原始语料建构层 / `raw-corpus-construction` | 接收邮件、文档、目录、聊天记录、本地镜像等原始材料，完成原始格式解析、结构保留、切分、时间线和事务链建构，并形成可导出的规范语料。 | `sources`、`chunks`、normalized DOCX manifest、message/thread/transaction DOCX、sourceRange、sectionId、timeline、lineage、raw object 引用。 | 外部知识库摄取、人工复核、重新切分、审计和可追溯导出。 | 尽可能保留原始结构和来源语义；不把摘要或推断写回原始材料；邮件等时序数据必须保留 capturedAt、thread、transaction 和 evidence locator。 |
| 2. 知识索引建构层 / `knowledge-index-construction` | 把第一层产物收纳进内置 `KnowledgeCore` 或外部知识库适配器，负责把规范语料继续解析、映射和索引为 collection/document/section/block/asset/evidence/embedding/relationship。 | `knowledge-core/knowledge.sqlite`、`knowledge-core/assets/`、外部知识库 document/collection id 映射、`knowledge.search`、evidence pack、hierarchy、citations、sourceTrace、assetId。 | HTTP/RPC/CLI、Tool Management、智能体 RAG、控制台检索、证据读取、Markdown 渲染和外部知识库查询适配。 | 这是 canonical evidence 和 RAG 权威查询面；上游可以直接引用，但必须通过 `splitall.knowledge.v1` 和 `knowledgeBase` mount。第二层可以对接外部知识库，但不得让上游绕过协议直接读 SQLite、外部库私有 API 或对象目录。 |
| 3. 知识蒸馏层 / `knowledge-distillation` | 基于第二层 evidence，通过确定性算法或显式启用的大模型/智能体提炼核心背景、规则候选、主题摘要和工作空间上下文。 | distilled summary、topic summary、governance card、rule/entity/relation candidates、workspace/context background、coverage report、distillation run/audit。 | ContextRuntime、AgentWorkspace、工作空间热切换、长任务背景、运行时提示压缩和候选审核。 | 这是有损知识背景，不是全量查询面，也不是 canonical evidence；所有输出必须保留 evidenceRefs/citations/sourceTrace，缺引用的内容只能补证或审核，不能替代 `knowledge.search`。 |

三层之间只能单向提升可信度：第一层保真，第二层索引和证据化，第三层压缩和背景化。第三层可以引用第二层，但不能反向覆盖第二层事实；第二层可以追溯第一层，但不能要求上游直接扫描第一层的 raw object 或 job 目录。

第二层可对接外部知识库是三层架构的核心约束。为保证内置 `KnowledgeCore` 和外部知识库都能获得同等质量的输入，原始文档解析责任必须分布在第一层和第二层：

- 第一层负责把原始文件字节、邮件 envelope、附件、目录、聊天记录和本地镜像解析成保真、可导出的规范语料，尽量不丢失原始结构。
- 第二层负责把这些规范语料再次解析成索引对象、证据定位、资产引用、向量/图谱/层级索引和外部知识库可接受的导入映射。外部知识库适配器可以有自己的索引或 ingestion API，但必须把查询和证据读取适配回 `splitall.knowledge.v1`。
- 第三层不承担原始文档解析；它只消费第二层 evidence，并把压缩后的背景交给上下文和工作空间运行时。

## 七大设计原则

| 原则 | 约束 | 作用 |
| --- | --- | --- |
| Single Responsibility / 单一职责 | HTTP、RPC、CLI 只做注册表映射、参数映射和错误映射；知识持久化、检索、资产、embedding、维护任务分别由协议实现层负责。 | 降低模块耦合，避免控制器、数据库、检索逻辑互相穿透。 |
| Open-Closed / 开闭原则 | 新知识能力优先增加协议方法、operation registry 项、前端 registry 项和验证用例；替换实现走 `knowledgeBase` mount。 | 新增能力不需要改写核心调用方，外部模块可持续扩展。 |
| Dependency Inversion / 依赖倒置 | 应用层依赖 `splitall.knowledge.v1` 和 mount contract，不依赖 `KnowledgeCore` 的 SQLite 表、资产目录或内部类。 | 保证内置知识库和外部知识库实现可互换。 |
| Interface Segregation / 接口隔离 | 检索、结构读取、证据读取、资产读取、维护、学习、总结、智能探索各自注册独立 operation 和 scope。 | 调用方只拿到需要的能力，权限和测试面更清晰。 |
| Explicit State / 显式状态 | 元数据真相源为 `metadata/splitall.sqlite`；KnowledgeCore 自身状态位于 `knowledge-core/knowledge.sqlite` 和 `knowledge-core/assets/`；蒸馏、长任务、审核、学习、总结必须有 run/state/audit 记录。 | 让恢复、排障、迁移和审计有稳定依据，避免隐式内存状态。 |
| Evidence-First / 证据优先 | 检索返回 evidence pack、hierarchy、citations 和 sourceTrace；蒸馏、总结、规则、实体关系、智能探索必须经过 evidence gate 或审核流。 | 防止无证据结论进入 canonical knowledge，提升回答和总结可信度。 |
| UX-Observable Governance / 前端可观测治理 | 知识、工作空间、调试、工具管理、模块挂载必须在前端 registry 中声明，并通过视觉检查确认页面可读、按钮不挤压、组件不冲突。 | 架构能力能被用户操作和核查，不停留在后端或文档层。 |

## 设计模式落点

| 模式 | 项目落点 | 作用 |
| --- | --- | --- |
| Composition Root | `server/platform/interactive/composition-root.mjs` | 集中装配运行时、鉴权、审计、事件总线和操作过滤。 |
| Provider Registry | `server/platform/interactive/server-runtime-providers.mjs` | 按 profile 和配置创建可选知识、工具、上下文运行时。 |
| Facade | `server/platform/interactive/product-api.mjs` | 产品层通过稳定门面访问平台能力。 |
| Adapter | `knowledgeBase`、external knowledge base adapter、`vectorStore`、`graphStore`、parser mounts | 把外部知识库、外部模块和解析器适配成 SplitAll 内部协议。 |
| Strategy | RetrievalProfile、ContextProfile、ClientRuntimeAllocator、feature profile | 运行时按任务和客户端选择检索、上下文、模型和工具策略。 |
| Policy | console scopes、Tool Management grant、evidence gate、operation safety | 将权限、风险、证据充分性和调用策略从业务流程中拆出。 |
| Observer | protocol event bus、运维状态订阅、工具/任务事件 | 让控制台和后台流程消费状态变化，而不是轮询私有对象。 |
| State Machine | jobs、checkpoint、connector sync、maintenance、summarization runs | 让长任务转换可恢复、可审计、可验证。 |

## 必须保持的治理链路

| 层级 | 必须存在的 artifact | 守护方式 |
| --- | --- | --- |
| 协议 | `server/protocols/knowledge/`、`splitall.knowledge.v1`、`knowledgeBase` mount | `docs/PROTOCOLS.md`、`docs/SERVER.md`、`server:verify:knowledge-architecture-governance` |
| 注册表 | `SERVER_API_OPERATIONS` 中的 `knowledge.*`、`runtime.mounts*`、`tool_management.*` | operation id、surface、scope 校验 |
| 工具链 | Tool Management v1 暴露 `splitall.knowledge.*` 和 runtime mount 工具 | tool catalog、grant、policy、audit、metrics 校验 |
| 前端 | `/knowledge/:tab`、`/workspaces`、`/debug/:tab`、`/admin/tools`、`/admin/modules` | `server/config/frontend-feature-registry.yaml` 和浏览器视觉检查 |
| 三层边界 | 原始语料建构、知识索引建构、知识蒸馏的输入、输出、用途和可信边界 | 本文、`docs/PROTOCOLS.md`、`docs/Architecture.md`、`docs/KNOWLEDGE-DISTILLATION.md` |
| 外部知识库适配器 | `server/protocols/knowledge/README.md` 中的 `External Knowledge-Base Adapter Protocol`、`knowledge.capabilities/health/ingest/search/get.evidence/asset/export/delete/reindex/sync` | adapter conformance fixture、权限过滤、id 映射和 evidence 回读校验 |
| 验证 | `npm run server:verify:knowledge-architecture-governance` | 文档、协议、注册表、前端覆盖一起回归 |

## 前端覆盖要求

前端不是可选外壳。知识库主线能力至少需要这些页面覆盖：

- `/knowledge/:tab`：知识管理、文档切分、冲突审核、维护、词云辅助管理。
- `/workspaces`：工作空间上下文、知识源作用域、上下文 bundle。
- `/debug/:tab`：知识召回对比、智能体检索轨迹、证据打开。
- `/admin/tools`：Tool Management catalog、policy preview、grant 和审计指标。
- `/admin/modules`：`knowledgeBase` mount、外部模块路径、热重载和运行代次。

页面实现必须避免组件冲突、文字挤压和不可读的横向溢出。涉及知识治理的变更完成后，应在桌面和移动宽度下检查关键页面截图与控制台错误。

## Markdown 文档切分基线

Markdown 进入知识库时必须使用结构化章节切分，而不是简单按字符数或空行切分。基线要求：

- 以标题树作为第一边界，默认按 H2 章节生成 section，保留 `sectionId`、`headingPath`、`titlePath` 和稳定 `sourceRange`。
- chunk 只允许在同一 section 内滑窗重叠，禁止把上一章尾部内容带入下一章。
- 代码块、表格、列表按结构块保存；超限时优先按行拆分，避免破坏 Markdown 表格和 fenced code。
- 入库结果必须把 `sectionId`、`sectionTitle`、`sourceStartLine`、`sourceEndLine` 和 `metadata.strategy=markdown-section-v1` 写入 preprocess result。
- 控制台 `/knowledge/chunking` 的标题优先预览必须复用同一套切分模块，不能维护一份只在前端生效的演示算法。

## 三层知识交付边界

知识管理主线必须同时覆盖规范语料、权威索引和蒸馏背景，不允许三者混成同一个隐式对象：

- `generateNormalizedDocuments` 是第一层入口，把上传、目录同步、PDF/PPT/HTML/邮件/普通文档等原始材料转换为 `splitall.normalized-documents` 包；包内每个 DOCX 都必须带 `external-knowledge-corpus`、`sectionId`、`sourceRange` 和 chunk 定位，便于外部知识库重新切分和追溯。
- `knowledge.search`、`knowledge.get.evidence`、`knowledge.render.markdown` 和 `knowledge.export.docx` 是第二层入口，导出或读取内置 `KnowledgeCore` 或外部知识库适配器中的 document、section、block、asset、embedding、relationship 和 evidence locator。RAG 与智能体直接引用只能使用这一层。
- DOCX 导出 HTTP 入口固定为 `GET /api/knowledge/export/docx`，CLI 入口固定为 `knowledge export-docx --output knowledge.docx`。
- `knowledge-distillation`、`SummarizationRuntime`、`ContextRuntime` 和 `AgentWorkspace` 是第三层消费方，只能从第二层 evidence 生成有损背景、摘要、规则候选和工作空间上下文；蒸馏结果不得作为全量查询入口，也不得替代 `knowledge.search` 的证据召回。
- 前端必须暴露 `knowledge.docx-export.download` 和 `knowledge.normalized-docx.download`，让用户能从控制台直接取走 DOCX 语料。
- 蒸馏背景必须在前端和 API 中标明来源 evidence、coverage、未引用结论和审核状态，避免用户把有损摘要当成权威知识库。
- 回归必须覆盖 `npm run server:verify:knowledge-docx-export`，并验证 `outputFormats` 包含 `docx`。

外部知识库适配器进入生产前必须通过一致性夹具：同一份 normalized corpus 在内置和外部第二层中都能完成 ingest、search、evidence read、asset read、DOCX export、delete/tombstone 和 sync，并返回等价的 SplitAll evidence locator、citations、sourceTrace、hierarchy 和权限过滤结果。实现入口是 `server/platform/specialized/knowledge/storage/external-knowledge-base/index.mjs`。首批检测范围只包含成熟开源后端：`PostgreSQL + pgvector`、`Qdrant`、`OpenSearch`，以及可选的 `Weaviate`；产品级 RAG 应用、编排框架、私有服务和实验性 graph/RAG 后端不作为首批必测对象。

## 本地验证

知识库架构相关变更至少运行：

```bash
npm run server:verify:knowledge-architecture-governance
npm run server:verify:knowledge-markdown-chunking
npm run server:verify:knowledge-docx-export
npm run server:verify:architecture-patterns
npm run server:verify:frontend-feature-registry
```

如果改动了前端页面，还必须启动控制台并完成浏览器视觉检查。
