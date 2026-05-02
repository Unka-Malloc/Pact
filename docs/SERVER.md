# SplitAll Server

`server` 是当前唯一受维护的服务端实现。本文档记录服务端的启动方式、配置文件、接口、存储结构、挂载机制与运维能力。

## 1. 启动

安装依赖：

```bash
npm install
```

拉取项目内 JRE 和 Tika：

```bash
npm run server:setup-runtime
```

这一步只会写入项目内 `vendor/` 和本地数据目录，不向系统安装软件。

### 常用命令

本机启动：

```bash
npm run server:start
```

一键构建控制台并启动：

```bash
npm run server:console
```

公网或局域网监听：

```bash
npm run server:start:public
```

最小构建档位：

```bash
npm run server:start:minimal
```

构建控制台静态资源：

```bash
npm run build:renderer
```

## 2. 服务端页面

如果启动时带 `--with-ui`，服务端同时提供 Vue 控制台页面：

- 控制台：`/`

如果不带 `--with-ui`，根路径只返回服务信息 JSON。

## 3. 启动参数

服务端入口：

```bash
node server/scripts/start-server.mjs
```

主要参数：

- `--host`
- `--port`
- `--data-dir`
- `--with-ui`
- `--profile default|minimal`
- `--server-id`
- `--server-label`
- `--bootstrap-url`
- `--advertised-base-url`
- `--active-service-url`
- `--forward-to-url`
- `--discovery-mode active|forward`
- `--config-version`
- `--refresh-interval-seconds`
- `--check-in-interval-seconds`
- `--offline-after-seconds`
- `--analysis-module`
- `--ocr-module`
- `--multimodal-parser-module`
- `--document-parser-module`
- `--knowledge-base-module`
- `--vector-store-module`
- `--graph-store-module`

这些参数也可以通过对应环境变量传入。

## 4. 配置文件

默认数据目录：`build/server-data/`

当前主要配置文件：

- `settings.json`
  - 服务端业务设置
  - 包括 OCR、Gemini、时间衰减、事务窗口、分析模块选择等
- `discovery.json`
  - 服务发现与迁移配置
- `rules/email-rules.json`
  - 周报/月报规则、同义词、部门映射、停用词、事务归并阈值
- `mount-modules.json`
  - 挂载名到模块路径的映射
- `mount-routing.json`
  - 扩展名 / 媒体类型 / kind 到挂载动作的映射
- `modules/FileProcessor/module.json`
  - FileProcessor 的组件、路由表、可选打包和只读运行时声明

兼容说明：

- 旧版本的 `mounts.json` 仍可被读取
- 保存新配置后会拆写为：
  - `mount-modules.json`
  - `mount-routing.json`
- 同时清理旧 `mounts.json`

## 5. 下游挂载机制

### 5.1 核心挂载

后端内置这些核心挂载名：

- `documentParser`
- `ocr`
- `multimodalParser`
- `pdfProcessor`
- `analysis`
- `knowledgeBase`
- `vectorStore`
- `graphStore`

`knowledgeBase` 默认由内置 `KnowledgeCore` 实现，协议版本为 `splitall.knowledge.v1`。应用层只调用知识库协议方法，不直接访问 KnowledgeCore 的 SQLite、资产目录、向量实现或 Markdown 渲染逻辑。外部知识库实现可以通过 `mount-modules.json` 替换 `knowledgeBase`，只要保持协议方法兼容。

### 5.2 自定义挂载

后端也支持任意命名挂载，例如：

- `sourceCodeAgent`
- `pdfAgent`
- `mailAgent`
- 任何未来新增的专用智能体或解析器

挂载模块由 `mount-modules.json` 配置，不要求后端代码预留固定槽位。

### 5.3 热能力

挂载支持：

- 热插拔
- 热切换
- 热重载

规则：

- 新任务读取最新挂载配置
- 运行中的任务继续使用创建时快照

### 5.4 KnowledgeCore

内置 KnowledgeCore 使用独立目录：

- `knowledge-core/knowledge.sqlite`
- `knowledge-core/assets/`

它把 source files、normalized DOCX manifest、事务和邮件消息归一成 collection / document / section / block / asset / evidence / embedding / relationship。检索结果返回 evidence pack，而不是裸 chunk；evidence pack 可继续渲染为 Markdown，并保留本地图片引用、OCR/说明和 JSON/YAML 机器可读元数据。

KnowledgeCore 是独立知识库协议实现，不是 HTTP 控制器或 application 层的内嵌数据库：

- `KnowledgeCore` 只通过 `splitall.knowledge.v1` 暴露能力。
- `EmbeddingRuntime` 只通过 `splitall.embedding.v1` 生成文本、图片或混合证据 embedding。
- `VectorStore` 只通过 `splitall.vector.v1` 做 upsert/search/delete。
- `assetStore` 只通过 `splitall.assetStore.v1` 管理二进制资产和 URL/path policy。
- `retrieval` 只通过 `splitall.retrieval.v1` 做融合召回、parent expansion、rerank 和 evidence shaping。

应用层、HTTP、JSON-RPC 和 CLI 不允许直接读取 `knowledge-core/knowledge.sqlite`，也不允许拼接 `knowledge-core/assets/` 文件路径。它们只能调用注册接口，再由接口分发器调用 `knowledgeBase` mount 方法。外部知识库实现可以是本地模块，也可以在模块内部再转 RPC；但对 SplitAll 应用层暴露的仍然必须是同一组 `knowledge.*` 方法。

资产 URL 也是协议的一部分：

- 公开资产入口固定为 `GET /api/knowledge/assets/:assetId`。
- evidence pack 与 Markdown 渲染结果只能引用这个入口或离线导出包内的相对资产路径。
- `assetId` 是不透明标识，不是文件系统路径；调用方不能据此推导真实落盘位置。
- 离线包内默认使用本地资产，不允许启动时隐式下载模型、图片或二进制扩展。

公开调用仍走接口注册制：

- HTTP：`/api/knowledge/capabilities`、`/api/knowledge/search`、`/api/knowledge/evidence/:evidenceId`、`/api/knowledge/assets/:assetId`、`/api/knowledge/render/markdown`、`/api/knowledge/health`、`/api/knowledge/maintenance`、`/api/knowledge/reindex`
- JSON-RPC：`knowledge.capabilities`、`knowledge.search`、`knowledge.get.evidence`、`knowledge.asset`、`knowledge.render.markdown`、`knowledge.health`、`knowledge.maintenance.get/set`、`knowledge.reindex`
- CLI：`knowledge capabilities`、`knowledge search --query ...`、`knowledge evidence --id ...`、`knowledge asset --id ... --output image.bin`、`knowledge render --evidence-id ...`、`knowledge maintenance ...`

### 5.5 多智能体知识总结

服务端内置海量文档总结增强链路：

- `AgentWorkspace`：每个智能体有私有自治空间；共享空间只接收结构化 submission、issue、artifact 和 decision proposal。
- `ContextRuntime`：按模型窗口生成 `ContextPack`，可保存 `ContextProfile` 调整证据、历史和压缩预算。
- `MultiAgentCoordinator`：使用 LangGraph.js 固定状态图执行 `Plan -> Retrieve -> ExtractEvidence -> OrganizeTopics -> ParallelAnalysts -> Writer -> Reviewer -> Merger -> PublishArtifact`。
- `SummarizationRuntime`：输出 `EvidenceUnitSummary`、`TopicSummary`、`ExecutiveSummary`、`ReviewReport`，并计算 evidence coverage。

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
- `GET/POST /api/context/profiles`

同等受限能力也通过 `/api/agent-tools/*` 暴露给工具授权智能体。任何事实、实体、关系和分类法变更只允许生成审核项或建议，不允许由总结链路直接覆盖 canonical knowledge。

共享空间锁是短 TTL 协作锁，用来保护 artifact、submission、issue 等目标的处理权。锁不代表 canonical 权威事实，只是多智能体运行期间的调度约束；释放或过期后其他智能体才能继续处理同一目标。

默认运行不隐式调用模型，也不下载模型。创建总结 run 时可传 `useModel=true` / `modelEnabled=true`，并用 `modelAlias` 或 `modelAliases` 指定 AgentGateway alias；DeepSeek 角色默认使用 `deepseek` provider alias，Qwen/GLM/custom 模型通过自定义 alias 接入。模型不可用时任务进入 degraded，但仍保留确定性摘要和覆盖率报告。

### 5.6 知识智能体进化闭环

服务端内置五层准确率护栏和发布闭环：

- `EvidenceSufficiencyGate`：回答或发布前检查证据数量、来源多样性、层级命中、引用覆盖、未引用结论和冲突。
- `KnowledgeAgentSkillRuntime`：把“先规划、再分层检索、再证据门禁、最后回答/审核”的知识库技能做成可执行接口。
- `AgentEvaluationRuntime`：用固定 case 回放同一条 skill 路径，计算 Recall/MRR/nDCG/gate pass rate，作为是否发布检索或上下文策略的依据。
- `ModelDecisionRuntime`：集中定义模型参与角色、alias、预算和确定性 fallback。默认不隐式调用外部模型，显式 `modelEnabled=true` 后才通过 AgentGateway 代理调用。
- `KnowledgeEvolutionRuntime`：把真实用户反馈聚合为失败归因，生成候选 RetrievalProfile，经离线评估后发布 canary，并保留 promote/rollback 入口。

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

对应工具授权入口位于 `/api/agent-tools/knowledge/*`。评估运行只产出指标和建议，不默认写入真实反馈；进化运行必须使用真实反馈或人工提供 case，避免用系统自己生成的样本直接发布策略。

发布策略：

- 候选 profile 默认先进入 `canary`，搜索可按 `clientId` 稳定灰度路由，也可用 `profileKey` 显式回放。
- `promote` 才会把 profile 设为 active。
- `rollback` 会恢复部署记录中的 baseline profile。
- 分层索引审计只生成 `KnowledgeSuggestion`；分类拆分、合并、重归类仍需审核。

## 6. 文档格式路由

Node.js 不直接解析文件，而是先按路由把文件分发给挂载。

路由维度：

1. `extensionRoutes`
2. `mediaTypeRoutes`
3. `kindRoutes`
4. 默认路由

### 默认扩展名

图片：

- `.png`
- `.jpg`
- `.jpeg`
- `.webp`
- `.gif`
- `.bmp`
- `.tif`
- `.tiff`

邮件：

- `.eml`
- `.msg`

文档：

- `.pdf`
- `.doc`
- `.docx`
- `.ppt`
- `.pptx`
- `.xls`
- `.xlsx`

文本 / 标记 / 源码：

- `.txt`
- `.md`
- `.markdown`
- `.csv`
- `.json`
- `.yaml`
- `.yml`
- `.xml`
- `.html`
- `.htm`
- `.js`
- `.ts`
- `.tsx`
- `.jsx`
- `.py`
- `.java`
- `.c`
- `.cpp`
- `.h`
- `.hpp`
- `.ini`
- `.log`

### 默认行为

- 图片 -> `ocr.extractText`
- PDF -> `pdfProcessor.extractDocument`
- 常规文档 -> `documentParser.extractDocument`

### 可配置场景

例如：

- `.png` -> `multimodalParser.extractDocument`
- `.pdf` -> `pdfAgent.extractDocument`
- `.eml` -> `mailAgent.extractDocument`
- `.py` -> `sourceCodeAgent.extractDocument`
- `.foo` -> 任意自定义挂载

只要在：

- `mount-modules.json`
- `mount-routing.json`

里配置即可，不需要后端改代码。

## 7. Java / Tika 角色

Java 不参与服务编排，只承担文档解析引擎宿主角色。

- 通过 vendored JRE 运行 `tika-app.jar`
- 由 Node.js 调起
- 返回：
  - `text`
  - `metadata`
  - `embeddedDocuments`
  - `documentParserId`

Node.js 不再使用 `pdf-parse`、`mammoth` 这类本地解析 fallback。

## 8. 分析模块

文档解析与分析执行分离。

分析模块通过 `analysisModuleId` 选择。

当前支持：

- 内置模块：`builtin:heuristic-hybrid-v1`
- 外挂模块：由 `analysis` mount 提供

分析模块支持运行中热切换，新任务会立即使用新的分析模块。

## 9. 上传、checkpoint 与任务恢复

### 上传会话

上传会话接口：

- `POST /api/upload-sessions`
- `GET /api/upload-sessions/:id`
- `PUT /api/upload-sessions/:id/files/:index?offset=...`

特点：

- 分文件、分块上传
- 服务端校验 `sha256 / byteSize`
- 支持断点续传

### checkpoint

checkpoint 贯穿客户端与服务端：

- 文件确认
- 上传确认
- 服务端处理
- 结果回传
- 客户端确认

支持：

- 断网恢复
- 客户端重启后自动续传
- 手动停止分支
- 新链路确认后旧链路回收

### 服务端任务恢复

支持：

- queued/running 作业恢复
- 上传会话恢复
- 分块续传恢复

## 10. 任务输出

任务完成后，结果会拆成三层：

### 10.1 原始对象

- `objects/mail/<batchId>/<objectId>/<原始相对路径>`

特点：

- 保留原文件名
- 保留原内容
- 不篡改文件本体

### 10.2 任务快照

- `jobs/<jobId>/meta.json`
- `jobs/<jobId>/payload.json`
- `jobs/<jobId>/result.json`

### 10.3 SQLite 元数据库

- `metadata/splitall.sqlite`

这是当前唯一元数据真相源。

主要承载：

- batches
- raw objects
- sources
- email messages
- threads
- transactions
- people
- timeline events
- transaction lineages
- retrieval documents / FTS
- discovery clients
- 删除协调状态

## 11. 服务发现与迁移

当前服务发现能力包括：

- `bootstrap`
- `discovery config`
- `client check-in`
- `client registry`
- `active / forward` 模式
- 客户端迁移观测

支持：

- 新服务切换
- 旧服务转发
- 客户端对当前活跃服务的自动发现
- 已创建任务的作业级粘滞

## 12. 运维工具

元数据库重建：

```bash
npm run server:rebuild-metadata
```

体检：

```bash
npm run server:doctor
```

定位：

```bash
npm run server:locate -- --job-id <id>
npm run server:locate -- --batch-id <id>
npm run server:locate -- --object-id <id>
```

对账修复：

```bash
npm run server:reconcile
npm run server:reconcile -- --apply
npm run server:reconcile -- --apply --prune-orphan-objects
```

## 13. HTTP 接口

### 系统与控制台

- `GET /api/healthz`
- `GET /api/console/state`
- `GET /api/runtime/info`
- `GET /api/runtime/mounts`
- `POST /api/runtime/mounts`
- `POST /api/runtime/mounts/reload`
- `GET /api/settings`
- `POST /api/settings`

### 服务发现

- `GET /api/bootstrap`
- `POST /api/discovery/check-in`
- `GET /api/discovery/clients`
- `GET /api/discovery/config`
- `POST /api/discovery/config`

### 规则与存储

- `GET /api/email-rules`
- `POST /api/email-rules`
- `GET /api/storage/summary`
- `GET /api/search`
- `GET /api/raw-objects/:id`

### 上传与任务

- `POST /api/upload-sessions`
- `GET /api/upload-sessions/:id`
- `PUT /api/upload-sessions/:id/files/:index`
- `POST /api/jobs`
- `GET /api/jobs`
- `GET /api/jobs/:id`
- `DELETE /api/jobs/:id`
- `GET /api/jobs/:id/result`
- `GET /api/jobs/:id/normalized-documents`
- `GET /api/jobs/:id/normalized-documents/:documentId`

任务完成后还会生成适配拆分 DOCX 包，落盘在 `<userDataPath>/jobs/<jobId>/normalized-documents/`。PPT/PDF/HTML 会同时输出允许入库的原始材料副本；EML/MSG 只输出 message/thread/transaction DOCX，原始邮件继续走 raw object 审计存储。

## 14. 注册式接口层

服务端现在按两层拆分：

- 功能层：控制器和服务只实现功能，并通过注册表暴露 `feature`、`target`、`http`、`rpc`、`cli` 元数据。注册表位置：[operation-registry.mjs](/Users/unka/DevSpace/Unka-Malloc/splitall/server/interfaces/api/operation-registry.mjs)。
- 接口层：HTTP、JSON-RPC 和 CLI 只按注册表做路由、参数映射和返回，不关心功能内部怎么实现。JSON-RPC 使用自己的 `rpc.params`、`rpc.query`、`rpc.body` 映射，不从 HTTP 路由反推参数。分发器位置：[operation-dispatcher.mjs](/Users/unka/DevSpace/Unka-Malloc/splitall/server/interfaces/api/operation-dispatcher.mjs)。

RPC 统一走：

```http
POST /api/rpc
Content-Type: application/json

{
  "jsonrpc": "2.0",
  "id": "request-id",
  "method": "jobs.list",
  "params": { "limit": 20 }
}
```

服务端 HTTP/RPC 能力统一暴露给 `splitall` CLI：

```bash
npm run cli -- health
npm run cli -- --file a.txt --wait
npm run cli -- --path ./local --wait
npm run cli -- jobs normalized-docs --id JOB_ID
npm run cli -- jobs normalized-doc --id JOB_ID --document-id DOC_ID --output out.docx
npm run cli -- rpc-call jobs.list --params '{"limit":20}'
npm run cli -- interfaces --format markdown
npm run cli -- rpc --method PUT --path /api/upload-sessions/id/files/0?offset=0 --raw-file chunk.bin --content-type application/octet-stream
```

`splitall --file` 和 `splitall --path` 是高阶上传工作流，内部按注册表顺序调用 `uploads.create_session`、`uploads.upload_chunk`、`jobs.create`、`jobs.get`、`jobs.result`，走与 Flutter 客户端相同的上传会话、checkpoint、分块上传和 `/api/jobs` 提交流程。`splitall rpc` 是原始 HTTP 调用入口；`splitall rpc-call` 是 JSON-RPC 调用入口。

## 15. 离线 Ubuntu 服务端包

封闭局域网部署不能依赖目标机执行 `apt update` / `apt install`。服务端提供离线包构建脚本，在构建机联网阶段准备所有运行时资产，并在 Ubuntu 容器内安装 Linux 原生生产依赖：

```bash
npm run server:pack:offline:linux:x64
```

产物默认写入：

```text
build/release/splitall-server-linux-x64.tar.gz
build/release/splitall-server-linux-x64.tar.gz.sha256
```

离线包包含：

- `runtime/node/`：Linux Node.js 运行时。
- `node_modules/`：在 Ubuntu 容器内安装的生产依赖，包括 `better-sqlite3` 原生模块。
- `vendor/jre/linux-x64/`：Linux JRE。
- `vendor/tika/tika-app-*.jar`：Tika 应用包。
- `build/dist/`：已构建的服务端控制台静态资源。
- `bin/start-server`、`bin/splitall`：不依赖宿主 Node/npm/Java 的启动脚本。
- `offline-manifest.json`：目标平台、运行时、模块和组件清单。
- `license-manifest.json`：离线知识库 license gate 结果。
- `OFFLINE-UBUNTU-RUNBOOK.md`：目标机部署和排障说明。

打包阶段会生成并校验 `license-manifest.json`。该 gate 覆盖包内生产依赖闭包、KnowledgeCore、EmbeddingRuntime、VectorStore、内置 embedding/vector fallback，以及可选 sqlite-vec / ONNX 模型状态：

- allowed licenses 明确写入 manifest，目前包括 `MIT`、`Apache-2.0`、`BSD-2-Clause`、`BSD-3-Clause`、`ISC`、`Zlib`、`BlueOak-1.0.0`、`0BSD`、`CC0-1.0`、`Unlicense`、`project-internal`，并允许已列明的兼容表达式，例如 `MIT OR Apache-2.0`。
- blocked classes 明确写入 manifest，包括 GPL/AGPL/LGPL/SSPL、MPL/EPL/CDDL、source-available/commercial、UNKNOWN/NOASSERTION、未知模型权重、非商业模型、cloud-only runtime、启动期隐式下载等类别。
- 任意生产依赖被判定为 `blocked` 或 `unknown` 时，离线打包失败。
- `sqlite-vec` 通过 npm 包和目标平台 optional native package 进入离线包；license gate 必须把主包和平台包都判定为 allowed，否则打包失败。
- ONNX runtime / ONNX embedding model 当前状态是 `not-bundled-license-gated`；模型文件必须由操作者显式提供并写入 manifest，不能在离线包启动时下载。

不需要 Docker 的 license gate 校验：

```bash
node server/scripts/verify-knowledge-license-manifest.mjs
node server/scripts/verify-knowledge-license-manifest.mjs --check-allowlist
node server/scripts/verify-knowledge-license-manifest.mjs --manifest build/release/splitall-server-linux-x64/license-manifest.json
node server/scripts/verify-knowledge-license-manifest.mjs --temp-manifest
```

打包脚本会用干净的 `ubuntu:22.04` 容器验证：

- 不执行任何 `apt` 命令。
- 使用包内 Node 加载 `better-sqlite3`。
- 使用包内 JRE 执行 `java -version`。
- 使用包内启动脚本启动服务端。
- 请求 `/api/healthz`。

目标机部署：

```bash
tar -xzf splitall-server-linux-x64.tar.gz
cd splitall-server-linux-x64
./bin/start-server --host 0.0.0.0 --port 8787 --data-dir ./data
```

包内脚本默认开启控制台 UI，并默认使用包内 `vendor/jre` 和 `vendor/tika`。目标机仍需要 Linux 内核和兼容 glibc，这是原生 Linux 程序的系统边界；但不需要预装 Node.js、npm、Java、Tika、Python 或通过 apt 安装任何应用运行时。

`--no-verify-docker` 只跳过 Ubuntu 容器启动验证，不跳过 license manifest 生成和 gate 校验。

## 16. 事务接续辅助框架

针对持续增长的大批量 `.eml` 目录，服务端提供纯算法事务接续构建脚本：

```bash
node server/scripts/build-transaction-continuity.mjs \
  --root ./mail-dir \
  --output build/artifacts/transaction-continuity \
  --review-every 500
```

该框架不调用外部智能体，不按来源硬编码规则。它由业务实体抽取、事务指纹、多阶段接续评分、负样本约束和 lineage 复盘组成：先用合同号、工单号、订单号、发票号、项目编号等强实体命中；再用参与人图谱、项目名、系统、版本、地点、动作词和主题语义 token 做弱匹配；最后用时间窗口和节奏兜底。每处理 `--review-every` 封新邮件或每天一次会触发局部重聚类，允许拆分、合并、迁移历史邮件。

事务标题不直接沿用邮件主题，而是使用“人类注意力”模型生成：先从发件域、发件名、订阅平台、作者名和邮件行为中抽取 `sourceLabel`、`actorLabel`、`behaviorId`，再形成 `sourceBehaviorTitle` 和 `actorBehaviorTitle`。例如 `Steam 促销活动`、`Steam 账单`、`HSBC 银行账单`、`Monzo 促销活动`、`ElRelator 的 Patreon 订阅及发布通知`。这些 attention facet 会参与接续评分，也会写入 YAML 概览和 JSON payload，方便按来源维度或作者维度检索。

可选 `--normalized-manifest <path>` 可把归一化 DOCX/PDF/PPT 产物的标题、文件名、hash、粒度和相对路径回写到邮件附件特征，参与事务指纹和证据文档输出。

事务 DOCX 的正文按知识库召回目标组织：开头使用 `事务概览 YAML` 描述事务核心结构，随后写可支持的召回问题、关键业务事实、附件/归一化材料、事务时间线和邮件正文整理。模型接续依据、强弱特征、参与人图谱、消息列表等完整机器消费内容放入“附录 A：机器可读 JSON”。同名结构化 payload 也会落盘到 `transactions-json/*.json`，可直接作为 HTTP POST 给外部智能体或导入器。

输出包含：

- `continuity-index.sqlite`：增量索引，新文件自动接续到已有事务。
- `manifest.json`、`transactions.json`、`transactions.csv`：全部事务清单。
- `transaction-overview.docx`：事务总览。
- `transactions/*.docx`：高频连续事务的可读证据文档。
- `transactions-json/*.json`：与事务 DOCX 一一对应的机器可读 payload。

### 接口注册表

| 功能ID | 功能层 | 功能目标 | HTTP接口 | RPC方法 | 命令行参数 |
| --- | --- | --- | --- | --- | --- |
| system.health | system | system.handleHealthz | GET /api/healthz | system.health | health |
| system.bootstrap | system | system.handleBootstrap | GET /api/bootstrap | system.bootstrap | bootstrap |
| system.interfaces | system | system.handleListInterfaces | GET /api/interfaces | system.interfaces | interfaces [--format json\|markdown] |
| system.console_state | system | system.handleGetConsoleState | GET /api/console/state | system.console_state | console |
| discovery.check_in | discovery | system.handleDiscoveryCheckIn | POST /api/discovery/check-in | discovery.check_in | discovery check-in --body check-in.json |
| discovery.clients | discovery | system.handleListDiscoveryClients | GET /api/discovery/clients | discovery.clients | discovery clients |
| discovery.get_config | discovery | system.handleGetDiscoveryConfig | GET /api/discovery/config | discovery.get_config | discovery get<br>alias: discovery |
| discovery.set_config | discovery | system.handleSetDiscoveryConfig | POST /api/discovery/config | discovery.set_config | discovery set --body discovery.json |
| runtime.info | runtime | system.handleGetRuntimeInfo | GET /api/runtime/info | runtime.info | runtime |
| runtime.path_browse | runtime | system.handleBrowseServerPath | POST /api/runtime/path-browse | runtime.path_browse | runtime path-browse --body request.json |
| runtime.mounts | runtime | system.handleGetMounts | GET /api/runtime/mounts | runtime.mounts | runtime mounts<br>alias: mounts |
| runtime.set_mounts | runtime | system.handleSetMounts | POST /api/runtime/mounts | runtime.set_mounts | mounts set --body mounts.json |
| runtime.reload_mounts | runtime | system.handleReloadMounts | POST /api/runtime/mounts/reload | runtime.reload_mounts | mounts reload [--body settings.json] |
| settings.get | settings | system.handleGetSettings | GET /api/settings | settings.get | settings get<br>alias: settings |
| settings.set | settings | system.handleSetSettings | POST /api/settings | settings.set | settings set --body settings.json |
| oauth.codex_status | oauth | system.handleGetCodexOAuthStatus | GET /api/oauth/codex/status | oauth.codex_status | oauth status<br>alias: oauth |
| oauth.codex_login | oauth | system.handleStartCodexOAuthLogin | POST /api/oauth/codex/login | oauth.codex_login | oauth login |
| oauth.codex_return | oauth | system.handleCodexOAuthReturn | GET /api/oauth/codex/return | oauth.codex_return | oauth return |
| tool_platform.get | tool_platform | system.handleGetToolPlatform | GET /api/tool-platform | tool_platform.get | tool-platform |
| tool_platform.create_grant | tool_platform | system.handleCreateToolGrant | POST /api/tool-platform/grants | tool_platform.create_grant | tool-platform create-grant --body grant.json |
| tool_platform.update_grant | tool_platform | system.handleUpdateToolGrant | POST /api/tool-platform/grants/:grantId | tool_platform.update_grant | tool-platform update-grant --id GRANT_ID --body grant.json |
| tool_platform.delete_grant | tool_platform | system.handleDeleteToolGrant | DELETE /api/tool-platform/grants/:grantId | tool_platform.delete_grant | tool-platform delete-grant --id GRANT_ID |
| tool_platform.rotate_grant | tool_platform | system.handleRotateToolGrant | POST /api/tool-platform/grants/:grantId/rotate | tool_platform.rotate_grant | tool-platform rotate-grant --id GRANT_ID |
| tool_management.catalog | tool_management | ToolManagementPlatform.catalog | GET /api/tool-management/v1/catalog |  | tools catalog |
| tool_management.toolsets | tool_management | ToolManagementPlatform.toolsets | GET /api/tool-management/v1/toolsets |  | tools toolsets |
| tool_management.profiles | tool_management | ToolManagementPlatform.profiles | GET /api/tool-management/v1/profiles |  | tools profiles |
| tool_management.policy_preview | tool_management | ToolPolicyEngine.preview | POST /api/tool-management/v1/policy/preview |  | tools policy preview --body preview.json |
| tool_management.execute | tool_management | ToolExecutionRuntime.executeTool | POST /api/tool-management/v1/execute |  | tools execute --tool-id TOOL_ID --body input.json |
| tool_management.dry_run | tool_management | ToolExecutionRuntime.executeTool | POST /api/tool-management/v1/dry-run |  | tools dry-run --tool-id TOOL_ID --body input.json |
| tool_management.batch | tool_management | ToolExecutionRuntime.batch | POST /api/tool-management/v1/batch |  |  |
| tool_management.grants | tool_management | ToolManagementStore.grants | GET /api/tool-management/v1/grants |  | tools grants list |
| tool_management.create_grant | tool_management | ToolManagementStore.createGrant | POST /api/tool-management/v1/grants |  | tools grants create --body grant.json |
| tool_management.update_grant | tool_management | ToolManagementStore.updateGrant | POST /api/tool-management/v1/grants/:grantId |  |  |
| tool_management.rotate_grant | tool_management | ToolManagementStore.rotateGrantToken | POST /api/tool-management/v1/grants/:grantId/rotate |  | tools grants rotate --id GRANT_ID |
| tool_management.revoke_grant | tool_management | ToolManagementStore.revokeGrant | POST /api/tool-management/v1/grants/:grantId/revoke |  | tools grants revoke --id GRANT_ID |
| tool_management.audit | tool_management | ToolManagementStore.listAudit | GET /api/tool-management/v1/audit |  | tools audit |
| tool_management.metrics | tool_management | ToolManagementStore.metricsSummary | GET /api/tool-management/v1/metrics/summary |  | tools metrics |
| email_rules.get | email_rules | system.handleGetRules | GET /api/email-rules | email_rules.get | email-rules get<br>alias: email-rules |
| email_rules.set | email_rules | system.handleSetRules | POST /api/email-rules | email_rules.set | email-rules set --body rules.json |
| storage.summary | storage | system.handleGetStorageSummary | GET /api/storage/summary | storage.summary | storage |
| knowledge.affair_taxonomy | knowledge | system.handleEnhanceAffairTaxonomy | POST /api/knowledge/affair-taxonomy | knowledge.affair_taxonomy | knowledge --body taxonomy.json |
| agent_tools.search | agent_tools | system.handleAgentToolSearch | GET /api/agent-tools/search | agent_tools.search | agent-tools search --query QUERY [--header 'Authorization: Bearer ...'] |
| agent_tools.storage_summary | agent_tools | system.handleAgentToolStorageSummary | GET /api/agent-tools/storage/summary | agent_tools.storage_summary | agent-tools storage --header 'Authorization: Bearer ...' |
| agent_tools.jobs | agent_tools | system.handleAgentToolJobs | GET /api/agent-tools/jobs | agent_tools.jobs | agent-tools jobs [--limit 20] --header 'Authorization: Bearer ...' |
| agent_tools.job | agent_tools | system.handleAgentToolJob | GET /api/agent-tools/jobs/:jobId | agent_tools.job | agent-tools job --id JOB_ID --header 'Authorization: Bearer ...' |
| agent_tools.knowledge_affair_taxonomy | agent_tools | system.handleAgentToolEnhanceAffairTaxonomy | POST /api/agent-tools/knowledge/affair-taxonomy | agent_tools.knowledge_affair_taxonomy | agent-tools knowledge --body taxonomy.json --header 'Authorization: Bearer ...' |
| agent_tools.knowledge_console | agent_tools | system.handleAgentToolKnowledgeConsole | GET /api/agent-tools/knowledge/console | agent_tools.knowledge_console |  |
| agent_tools.knowledge_config_schema | agent_tools | system.handleAgentToolKnowledgeConfigSchema | GET /api/agent-tools/knowledge/config-schema | agent_tools.knowledge_config_schema |  |
| agent_tools.knowledge_capabilities | agent_tools | system.handleAgentToolKnowledgeCapabilities | GET /api/agent-tools/knowledge/capabilities | agent_tools.knowledge_capabilities |  |
| agent_tools.knowledge_health | agent_tools | system.handleAgentToolKnowledgeHealth | GET /api/agent-tools/knowledge/health | agent_tools.knowledge_health |  |
| agent_tools.knowledge_maintenance_get | agent_tools | system.handleAgentToolKnowledgeMaintenanceGet | GET /api/agent-tools/knowledge/maintenance | agent_tools.knowledge_maintenance_get |  |
| agent_tools.knowledge_maintenance_set | agent_tools | system.handleAgentToolKnowledgeMaintenanceSet | POST /api/agent-tools/knowledge/maintenance | agent_tools.knowledge_maintenance_set |  |
| agent_tools.knowledge_reindex | agent_tools | system.handleAgentToolKnowledgeReindex | POST /api/agent-tools/knowledge/reindex | agent_tools.knowledge_reindex |  |
| agent_tools.knowledge_maintenance_run | agent_tools | system.handleAgentToolKnowledgeMaintenanceRun | POST /api/agent-tools/knowledge/maintenance/run | agent_tools.knowledge_maintenance_run |  |
| agent_tools.knowledge_sync | agent_tools | system.handleAgentToolKnowledgeSync | GET /api/agent-tools/knowledge/sync | agent_tools.knowledge_sync |  |
| agent_tools.knowledge_changes | agent_tools | system.handleAgentToolKnowledgeChanges | POST /api/agent-tools/knowledge/changes | agent_tools.knowledge_changes |  |
| agent_tools.knowledge_review_items | agent_tools | system.handleAgentToolKnowledgeReviewItems | GET /api/agent-tools/knowledge/review-items | agent_tools.knowledge_review_items |  |
| agent_tools.knowledge_review_resolve | agent_tools | system.handleAgentToolResolveKnowledgeReviewItem | POST /api/agent-tools/knowledge/review-items/:reviewId/resolve | agent_tools.knowledge_review_resolve |  |
| agent_tools.knowledge_feedback | agent_tools | system.handleAgentToolKnowledgeFeedback | POST /api/agent-tools/knowledge/feedback | agent_tools.knowledge_feedback |  |
| agent_tools.knowledge_suggestions | agent_tools | system.handleAgentToolKnowledgeSuggestions | GET /api/agent-tools/knowledge/suggestions | agent_tools.knowledge_suggestions |  |
| agent_tools.knowledge_suggestion_resolve | agent_tools | system.handleAgentToolResolveKnowledgeSuggestion | POST /api/agent-tools/knowledge/suggestions/:suggestionId/resolve | agent_tools.knowledge_suggestion_resolve |  |
| agent_tools.knowledge_learning_jobs | agent_tools | system.handleAgentToolKnowledgeLearningJob | POST /api/agent-tools/knowledge/learning/jobs | agent_tools.knowledge_learning_jobs |  |
| agent_tools.knowledge_learning_health | agent_tools | system.handleAgentToolKnowledgeLearningHealth | GET /api/agent-tools/knowledge/learning/health | agent_tools.knowledge_learning_health |  |
| agent_tools.knowledge_search | agent_tools | system.handleAgentToolKnowledgeSearch | POST /api/agent-tools/knowledge/search | agent_tools.knowledge_search |  |
| agent_tools.knowledge_search_get | agent_tools | system.handleAgentToolKnowledgeSearch | GET /api/agent-tools/knowledge/search | agent_tools.knowledge_search_get |  |
| agent_tools.knowledge_item | agent_tools | system.handleAgentToolGetKnowledgeItem | GET /api/agent-tools/knowledge/items/:itemId | agent_tools.knowledge_item |  |
| agent_tools.knowledge_evidence | agent_tools | system.handleAgentToolGetKnowledgeEvidence | GET /api/agent-tools/knowledge/evidence/:evidenceId | agent_tools.knowledge_evidence |  |
| agent_tools.knowledge_asset | agent_tools | system.handleAgentToolGetKnowledgeAsset | GET /api/agent-tools/knowledge/assets/:assetId | agent_tools.knowledge_asset |  |
| agent_tools.knowledge_render_markdown | agent_tools | system.handleAgentToolRenderKnowledgeMarkdown | POST /api/agent-tools/knowledge/render/markdown | agent_tools.knowledge_render_markdown |  |
| agent_tools.knowledge_graph | agent_tools | system.handleAgentToolKnowledgeGraph | GET /api/agent-tools/knowledge/graph | agent_tools.knowledge_graph |  |
| search.query | search | system.handleSearch | GET /api/search | search.query | search --query QUERY [--limit 20] |
| uploads.create_session | uploads | jobs.handleCreateUploadSession | POST /api/upload-sessions | uploads.create_session | upload-session --body session.json |
| uploads.get_session | uploads | jobs.handleGetUploadSession | GET /api/upload-sessions/:sessionId | uploads.get_session | upload-session get --id SESSION_ID |
| uploads.upload_chunk | uploads | jobs.handleUploadChunk | PUT /api/upload-sessions/:sessionId/files/:fileIndex | uploads.upload_chunk | upload-session chunk --id SESSION_ID --file-index 0 --offset 0 --raw-file chunk.bin |
| jobs.create | jobs | jobs.handleCreateJob | POST /api/jobs | jobs.create | jobs create --body job.json |
| jobs.list | jobs | jobs.handleListJobs | GET /api/jobs | jobs.list | jobs list [--limit 50]<br>alias: jobs |
| jobs.get | jobs | jobs.handleGetJob | GET /api/jobs/:jobId | jobs.get | jobs get --id JOB_ID |
| jobs.delete | jobs | jobs.handleDeleteJob | DELETE /api/jobs/:jobId | jobs.delete | jobs delete --id JOB_ID |
| jobs.result | jobs | jobs.handleGetJobResult | GET /api/jobs/:jobId/result | jobs.result | jobs result --id JOB_ID |
| jobs.normalized_documents | jobs | jobs.handleListNormalizedDocuments | GET /api/jobs/:jobId/normalized-documents | jobs.normalized_documents | jobs normalized-docs --id JOB_ID |
| jobs.normalized_document.get | jobs | jobs.handleGetNormalizedDocument | GET /api/jobs/:jobId/normalized-documents/:documentId | jobs.normalized_document.get | jobs normalized-doc --id JOB_ID --document-id DOC_ID --output out.docx |
| raw_objects.get | raw_objects | jobs.handleGetRawObject | GET /api/raw-objects/:objectId | raw_objects.get | raw-object --id OBJECT_ID --output raw.eml |

## 16. 回归

完整服务端回归：

```bash
npm run server:verify
```

分项回归：

```bash
npm run server:verify:headless
npm run server:verify:checkpoints
npm run server:verify:rebuild
npm run server:verify:knowledge-hierarchy
npm run server:verify:ops
npm run server:verify:agent-knowledge-tools
```

当前回归覆盖：

- 文档解析主链
- 动态挂载热切换
- 格式级路由
- 图片改路由到多模态模块
- `.py` 改路由到自定义智能体模块
- checkpoint 生命周期
- 删除协调
- 元数据库重建
- 运维工具
- 智能体知识库工具授权与 scope 分层
- 分层索引粗到细检索，以及 agent-tools 搜索入口统一遵守分层索引

## 17. 知识库控制台与 RBAC

服务端控制台现在通过独立认证边界访问知识库运维能力。认证状态不复用智能体工具授权，两者只共享 scope 命名语义。

- 本地账号数据库：`<userDataPath>/auth/console-auth.sqlite`
- 首次启动：如果没有用户，服务端自动创建 `owner` 并生成初始密码；初始密码只在服务端启动日志中显示一次，不写入配置文件
- 密码管理：用户创建和密码修改只允许通过服务端命令行执行，不通过网页或远程 HTTP 修改
- 密码存储：只保存 salt + `crypto.scrypt` 不可逆密码哈希，不保存明文密码
- 会话：`HttpOnly` / `SameSite=Strict` cookie
- CSRF：所有受保护的非 GET 写操作必须带 `x-splitall-csrf`
- OIDC：配置接口已预留，未配置时只启用本地账号

第一版角色：

- `owner`：全部权限
- `admin`：知识库配置、入库、维护、检索、资产
- `operator`：入库、检索、证据、普通维护
- `viewer`：只读检索、证据、资产和状态

新增控制台认证接口：

- `POST /api/auth/bootstrap`（兼容旧接口，始终返回 410）
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/session`
- `GET/POST /api/auth/users`
- `POST /api/auth/users/:userId`
- `POST /api/auth/roles/:roleId`
- `GET/POST /api/auth/oidc`
- `GET /api/auth/audit`
- `GET /api/auth/sessions`
- `POST /api/auth/sessions/:sessionId/revoke`

账号命令行：

```bash
npm run server:auth -- list-users
npm run server:auth -- create-user --username alice --role operator --generate-password
npm run server:auth -- set-password --username owner --generate-password
npm run auth:rotate
npm run auth:rotate -- --username alice
npm run server:auth:rotate-password
npm run server:auth:rotate-password -- --username alice
npm run server:auth -- set-role --username alice --role admin
npm run server:auth -- disable --username alice
```

`auth:rotate` 是常用密码轮换短命令；不传参数时轮换 `owner`，通过 `-- --username USER` 可以轮换指定本地控制台账号。`server:auth:rotate-password` 保留为兼容的长命令。
密码不会明文落入控制台配置；服务端只保存加盐 `scrypt` 哈希。

知识库控制台新增接口：

- `GET /api/knowledge/console`
- `GET /api/knowledge/config-schema`
- `GET /api/knowledge/sources`
- `POST /api/knowledge/sources`
- `POST /api/knowledge/sources/:sourceId`
- `DELETE /api/knowledge/sources/:sourceId`
- `POST /api/knowledge/sources/:sourceId/refresh`
- `POST /api/knowledge/sources-refresh`
- `POST /api/knowledge/maintenance`
- `POST /api/knowledge/maintenance/run`
- `POST /api/knowledge/reindex`
- `POST /api/knowledge/search`
- `GET /api/knowledge/evidence/:evidenceId`
- `GET /api/knowledge/assets/:assetId`
- `POST /api/knowledge/render/markdown`

控制台页面的知识库分区包括：检索概览、入库同步、知识库配置。检索结果的来源、正文、相关图片和 Markdown 导出在同一个检索概览工作台内展开；入库同步支持服务端本地受管目录，文件变化会自动触发整理任务，并把任务进度显示在对应目录卡片下方。页面只通过 `server-web/lib/bridge.ts` 调用注册接口，不读取真实 SQLite 路径、资产目录或模块内部对象。

新增回归：

```bash
npm run server:verify:console-auth
npm run server:verify:knowledge-console
```

## 18. 自定义 HTTP Adapter

外部智能体网关与原先的 HTTP Adapter 不再作为两套概念存在。它现在是 `custom-http`
模型提供方下面的一种 HTTP 出站报文形态：服务端通过同一个 Adapter 配置 URL、token、代称和
agent 请求字段，模块模型分配只保存 `provider=custom-http` 与自定义代称。

同一 `AgentGateway` 也提供 `deepseek` 智能体模型接入点。DeepSeek 使用服务端代理调用
OpenAI-compatible Chat Completions，不让页面或客户端直接持有 API Key：

- `settings.deepSeekApiKey`：DeepSeek API Key，读取设置时脱敏为 `deepSeekApiKeyConfigured`
- `settings.deepSeekBaseUrl`：默认 `https://api.deepseek.com`
- `settings.deepSeekModel`：默认 `deepseek-v4-pro`，也可配置 `deepseek-v4-flash`
- `settings.deepSeekTimeoutMs`：调用超时
- 模型分配：`provider=deepseek`，`model=<DeepSeek 模型 ID>`
- 智能体调用：`POST /api/agent-gateway/call`，传入 `alias=deepseek` 或 `provider=deepseek`

控制台“模型库”不再默认展示所有模型。页面使用 `settings.modelLibraryEntries[]`
保存用户显式添加过的 provider，并使用 `settings.modelLibraryAgentIds[]` 保存智能体顺序索引；
每个智能体的完整配置独立落盘到 `<userDataPath>/model-agents/<agent_uid>.json`。旧版
`settings.modelLibraryModels[]` 仍可读取作为迁移来源，但保存后不会继续写回主 `settings.json`。
新增卡片插入到列表顶部；没有任何条目时只显示新增入口。
每个模型卡片都有“探测”按钮，调用服务端只读接口：

- HTTP：`POST /api/settings/model-probe`
- RPC：`settings.model_probe`
- CLI：`settings probe-model --provider PROVIDER [--body settings.json]`

探测会将页面草稿配置与服务端已保存密钥合并后临时使用，不落盘、不回显 API Key。DeepSeek、
OpenRouter、Gemini 等 API Key 模型会发起最小化连通性请求；ChatGPT OAuth 会验证并尝试
一次轻量调用；自定义 HTTP Adapter、本地模型和企业代理按各自配置的 Endpoint 探测。

规范配置字段位于 `settings.customHttpAdapter`，`settings.agentGateway` 只作为旧接口兼容别名保留。多个可用智能体使用 `settings.customHttpAdapters[]` 保存，首个条目会与 `customHttpAdapter` 归一为默认 `custom-http` 模型：

- `alias`：模型分配时使用的自定义代称，例如 `kb-http`
- `url`：外部智能体请求 URL
- `tokenHeader`：token 所在 header，默认 `token`
- `tokenPrefix`：token 前缀，可为空
- `token`：访问 token，保存时作为服务端密钥处理，控制台读取时脱敏
- `agentName`、`pluginList`、`engine`、`parameters`：默认请求参数
- `timeoutMs`：调用超时时间

服务端会对客户端公开脱敏后的可用智能体注册表：

- `GET /api/agents`
- `POST /api/agents`：创建模型库智能体配置，支持同一 provider/model 多实例；服务端生成 `agent_<sha256-16>` UID
- `POST /api/agents/:agentId`：按 UID 更新智能体名称、模型 ID、系统提示词、调用参数、密钥等配置
- `DELETE /api/agents/:agentId`：按 UID 删除智能体配置，并清理 `<userDataPath>/model-agents/<agent_uid>.json`
- RPC：`agents.list`、`agents.create`、`agents.update`、`agents.delete`
- CLI：`agents list`、`agents create --name NAME --model MODEL [--provider deepseek] [--api-key KEY]`、`agents update --id AGENT_UID ...`、`agents delete --id AGENT_UID`

注册表只返回 `alias`、`label`、`provider`、`callMode=server-proxy`、默认 `agentName/pluginList/engine`、能力标记和 token 是否已配置，不返回 URL 明文 secret 或 token。客户端连接服务端后通过 `client-cli agents sync` 拉取该列表并缓存到本地，同时仍保留本地自定义 `customHttpAdapter` 直连能力。

这些写操作与控制台“模型库”共用 `<userDataPath>/model-agents/*.json`，保存后会发布
`settings.current` 协议事件；因此通过 CLI 或 RPC 修改后，已打开的前端会自动回显最新的
智能体名称、模型 ID、系统提示词和调用参数。`settings.json` 只保留 `modelLibraryEntries[]`
和 `modelLibraryAgentIds[]` 这类索引字段，避免多个智能体配置混在同一个大 JSON 中。

请求体固定为 JSON：

```json
{
  "agentName": "kb-agent",
  "pluginList": ["search"],
  "question": "最近有哪些账单？",
  "sessionId": "session-1",
  "userId": "user-1",
  "projectId": "project-1",
  "engine": "default",
  "parameters": {}
}
```

接口：

- `GET /api/agent-gateway/config`
- `POST /api/agent-gateway/config`
- `POST /api/agent-gateway/call`
- `GET /api/agents`
- `POST /api/agents`
- `POST /api/agents/:agentId`
- `DELETE /api/agents/:agentId`
- RPC：`agent_gateway.config.get`、`agent_gateway.config.set`、`agent_gateway.call`、`agents.list`、`agents.create`、`agents.update`、`agents.delete`
- CLI：`agent-gateway config`、`agent-gateway config set --body config.json`、`agent-gateway call --question "..."`、`agents list`、`agents create/update/delete`.

模型分配示例：

```json
{
  "customModelAlias": "kb-http",
  "defaultModelProvider": "custom-http",
  "defaultModel": "kb-http",
  "moduleModelAssignments": {
    "agentTools": { "provider": "custom-http", "model": "kb-http" }
  }
}
```

外部智能体若返回 SSE，服务端会解析 `data:{...}` 报文，并优先拼接 `type=answer` 的 `data.content`；若没有 `answer`，则回退到 `text` 或 `rawData.text`。

新增回归：

```bash
npm run server:verify:agent-gateway
```

## 19. 智能体到客户端同步

服务端新增 `agent-sync` 策略层，用发布-订阅模型控制外部智能体向客户端同步哪些消息。智能体只负责发布候选事件，是否进入客户端订阅流由服务端策略决定。

策略文件：`<userDataPath>/agent-sync.json`

默认 topic：

- `agent.sync.answer`：回答同步，默认启用，保留最新快照
- `agent.sync.status`：状态同步，默认启用，保留最新快照
- `agent.sync.progress`：进度同步，默认启用，不保留
- `agent.sync.risk`：风险提示，默认禁用
- `agent.sync.debug`：调试信息，默认禁用

接口：

- `GET /api/agent-sync/config`
- `POST /api/agent-sync/config`
- `POST /api/agent-sync/publish`
- `GET /api/agent-sync/events`
- RPC：`agent_sync.config.get`、`agent_sync.config.set`、`agent_sync.publish`、`agent_sync.subscribe`
- CLI：`agent-sync config`、`agent-sync config set --body sync.json`、`agent-sync publish --body payload.json`、`agent-sync subscribe --topic answer`

安全边界：

- 智能体发布必须走工具平台 Bearer token。
- 工具授权需要 `agent_sync:publish` scope。
- `/api/agent-sync/events` 只返回策略启用的 topic。
- 通用 `/api/events` 同样过滤已禁用的 `agent.sync.*` topic，客户端不能绕过策略。

新增回归：

```bash
npm run server:verify:agent-sync
```

## 20. 工具管理平台

服务端新增 `splitall.tool-management.v1`，作为智能体工具、外部 token 工具、兼容 agent-tools 入口的统一管理平台。旧 `/api/tool-platform/*` 仍可用于兼容控制台和脚本，但授权数据已经迁移到 `<userDataPath>/tool-management/tool-management.sqlite`；旧 `/api/agent-tools/*` 只保留协议外形，内部统一进入 `ToolExecutionRuntime`。

核心能力：

- `ToolCatalogRegistry`：从 `SERVER_API_OPERATIONS` 生成公开工具目录，同时登记 MaintenanceAgent、AgentExplorationRuntime 的内部 handler-backed 工具，并输出 catalog fingerprint。
- `ToolsetRegistry`：内置 `splitall.knowledge.read/write/maintain/admin`、`splitall.storage.read`、`splitall.jobs.read`、`splitall.agent.sync.publish` 等企业授权单元。
- `ToolManagementStore`：保存 grant、token hash、policy decision、tool execution、metric event 和 catalog snapshot；grant 支持 toolset 白名单/黑名单、scope、限流、来源 Origin/CIDR、过期和撤销。
- `ToolPolicyEngine`：按 platform、grant、agent profile、session 和 runtime safety 计算 allow/deny/confirmation。
- `ToolExecutionRuntime`：统一执行、dry-run、batch、兼容 agent-tools、输入 schema 校验、timeout、结果大小限制、串行锁、审计和指标埋点。
- Console：`admin/tools` 使用 `/api/tool-management/v1/*` 展示 Catalog、Toolsets、Profiles、Policy Preview、Grants、Audit 和 Metrics；旧 `/api/tool-platform` 只用于兼容摘要。

CLI：

```bash
splitall tools catalog
splitall tools toolsets
splitall tools toolsets resolve --body '{"toolsets":["splitall.knowledge.read"]}'
splitall tools grants create --body grant.json
splitall tools execute --tool-id splitall.knowledge.health --body '{}'
splitall tools audit --limit 50
splitall tools metrics --since 2026-05-02T00:00:00.000Z
```

新增回归：

```bash
npm run server:verify:tool-management
```

## 21. 服务端语言策略

服务端核心源码强制使用 JavaScript。`server/` 目录只允许：

- `.mjs`：服务端实现、脚本、验证
- `.json`：模块描述和配置模板
- `.md`：文档

外部组件可以使用任意语言，但必须通过 JavaScript 调用边界接入，例如：

- JavaScript adapter
- HTTP / JSON-RPC 服务
- 明确包装的外部进程
- 独立部署的外部服务

外部组件不得把非 JavaScript 源码作为服务端核心模块放入 `server/`。OCR、Tika、外部向量库、外部学习/重排框架都必须保持在 JavaScript 调用边界之后。

新增回归：

```bash
npm run server:verify:language-policy
```
