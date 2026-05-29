# N-2-N-Interfaces

本文把 Pact 的外接面拆成两个边界、四个清单：

1. Pact 系统与外部服务的分界线。
2. 分界线内的 Pact 适配器。
3. 分界线外的外部服务。
4. Pact 系统与下游客户端的分界线，其中线内是 MCP 服务网关，线外是客户端支持列表。

状态口径：

- `运行路径`：仓库里已有本地、HTTP、CLI 或服务端运行路径。
- `contract-mode`：已有协议、配置、secretRef、ledger 或 verifier 合同，但不能在没有真实凭据和 live verifier 的情况下声明生产级接通。
- `scaffold/template`：已有 mount、模板或生态合同，供外部团队实现；不等同于内置 provider。

## 边界能力

边界能力是 Pact 在系统边界上提供的接口、adapter、网关和合同能力。它负责让客户端或外部服务能接入 Pact，但不替代安全裁决和数据事实源：

- 安全裁决归 `2-3-5-Security-Model.md`。
- 数据、资源、状态、证据和链路语义归 `U-1-Data.md`。
- 本文只定义跨边界接入、转换、发现、路由和合同能力。

| 边界能力 | 责任 | 适用边界 |
| --- | --- | --- |
| API / 协议入口 | 暴露 HTTP MCP、Workspace API、Tool Management API、upload session、discovery API 等入口。 | 下游客户端、外部服务 |
| Adapter / Port / Mount | 把外部 provider、parser、vectorStore、graphStore、knowledgeBase、cloud drive、repo/review 系统接入 Pact。 | 外部服务 |
| MCP 服务网关 | 处理 MCP initialize、tools/list、tools/call、SSE、stdio proxy 和分类 toolset。 | 下游客户端 |
| Discovery / Handshake | 发现 Pact endpoint、校验 server identity、返回 interfaceVersion 和 toolsetVersion。 | 下游客户端 |
| Connector / Installer | 为目标客户端写入 Pact MCP 配置、doctor、register、discover-local、server-config。 | 下游客户端 |
| Request Envelope Normalization | 将 MCP、HTTP、CLI、webhook 或 adapter 输入归一成 operation、subject、traceId、idempotencyKey、intent。 | 下游客户端、外部服务 |
| Operation Routing | 将归一化请求路由到 Workspace API、Tool Management、Knowledge、Codespace、Sharedspace、SkillHub 或 adapter。 | 下游客户端、外部服务 |
| Capability Visibility | 只暴露当前 grant 可见的工具、operation、provider capability 或 mount capability。 | 下游客户端、外部服务 |
| Payload Transport | 处理 inline 小文本、upload session、大文件传输、client runtime bootstrap、download URL 和 transport fallback。 | 下游客户端 |
| Callback / Event Bridge | 处理 SSE operation reply、webhook、provider event、tool result、sync completion 和 list changed 事件。 | 下游客户端、外部服务 |
| Response / Error Normalization | 把 provider response、adapter error、MCP error 和 operation result 转成稳定响应。 | 下游客户端、外部服务 |
| Contract Test / Readiness | 区分运行路径、contract-mode、scaffold/template、realE2EVerified 和 production ready。 | 外部服务 |
| Detachable Traffic Gateway | 允许 Caddy / Nginx 等边缘网关代理 MCP、HTTP API、upload 和 bootstrap，同时保持 direct mode 可用。 | 下游客户端 |

边界能力的输出必须能被安全领域和数据链路消费：每次调用都应产生 subject、operation、target、state、receipt/audit/checkpoint 或明确的 contract-mode 标记。

## Pact 与外部服务的分界线

边界层：`external-service-compatibility`。

线内属于 Pact：adapter、mount、port、connector governance、secretRef、policy、Operation Ledger、Checkpoint 和 audit。线外属于外部系统：模型服务、知识库、代码平台、云盘、邮箱、协作系统、向量库、图数据库和 operator-provided module。

外部服务适配不能裸转发上游权限，也不能绕过 Tool Management、policy、Operation Ledger、Checkpoint Tree 和 audit。下游客户端也不直接调用这些外部服务；下游只通过 Pact 的 MCP / Workspace / Operation 入口访问受控能力。

### 线内适配器

| 线内 Pact 适配器 | 责任 | 状态 |
| --- | --- | --- |
| `knowledge-backend-port` | 连接外部知识库空间、检索、证据读取、导出请求和权限请求 | Dify、RAGFlow 为 `contract-mode`，真实接通取决于 secretRef 和 live verifier |
| `external-knowledge-base` mount | 将 KnowledgeCore 记录镜像到外部知识后端 | Qdrant、OpenSearch、pgvector 为 operator-configured optional mount |
| `vectorStore` mount | 将 chunk 同步到外部向量索引并执行相似度查询 | sqlite-vec / local fallback 有本地路径，LanceDB 为外部适配入口 |
| `graphStore` mount | 将实体和边同步到外部图索引 | 当前主要是 mount/template 能力，不应宣称已有完整内置 provider |
| Agent Gateway / Model Probe | 统一探测和调用模型 provider、企业代理或自定义 HTTP 模型端点 | 多 provider 运行路径，具体可用性取决于模型配置和凭据 |
| Codespace / repo operations / code review | 抽象仓库读写、diff、提交、push、review、merge、submit 等代码协作操作 | GitHub、Gerrit 为配置化 provider；GitLab 在 repo operation provider 集合中 |
| Cloud Drive Port | 管理云盘连接、列表、权限、下载、上传和同步计划 | iCloud 为本地路径；OneDrive、Google Drive、Dropbox 为 OAuth / contract-mode |
| Data Connector Governance | 规范外部数据源 connector 的 auth、sync、cursor、mirror、本地查询和卸载策略 | Gmail、Outlook、Google Drive、OneDrive、Slack、Teams、macOS Mail 等通过 feature/client module 暴露 |
| Module Ecosystem | 给外部团队生成 parser、analysis、knowledgeBase、vectorStore、graphStore、customMount、Tool Package、Skill Package 的模板和 contract test | scaffold/template |
| Agent Exploration Runtime | 通过 allowlist 约束的 HTTP request 和 local command 接入特定外部端点或本地命令 | 运行路径，受 allowlist 和权限控制 |
| Local Secret Store | 用 secretRef / endpointRef 连接 provider 凭据，不把原始 token 写入 manifest | GitHub、Gerrit、Dify、RAGFlow、OneDrive、Google Drive、Dropbox 等 provider |

### 线外外部服务

| 服务域 | 当前列入支持或适配范围的外部服务 |
| --- | --- |
| 模型服务 | DeepSeek、Google Gemini、OpenRouter、Copilot / enterprise proxy、OpenAI / ChatGPT Codex OAuth、OpenAI-compatible local model、custom HTTP model |
| 外部知识库 / RAG | Dify、RAGFlow、Qdrant、OpenSearch、pgvector |
| 向量 / 图存储 | LanceDB、外部 graph database；graph database 当前以 `graphStore` mount/template 预留 |
| 代码仓库 / 评审 | GitHub、Gerrit、GitLab、Git remote |
| 云盘 / 共享文件 | iCloud Drive、OneDrive、Google Drive、Dropbox |
| 邮箱 / 协作 / 数据源 | Gmail、Outlook Mail、Slack、Teams、macOS Mail、本地文件、knowledge mirror |
| 通用外部端点 | allowlisted HTTP service、allowlisted local command、operator-provided module |

## Pact 与下游客户端的分界线

边界层：`agent-client-mcp-compatibility`。

线内属于 Pact：MCP HTTP endpoint、stdio proxy、设备级 discovery、handshake、grant/token、MCP toolset、connector release、client runtime bootstrap 和可选 traffic gateway ingress。线外属于下游客户端：本机智能体 CLI、编辑器/IDE agent、脚本型 agent、人工 CLI 和其它 MCP client。

Pact MCP service 是 Workspace API 的设备级协议适配器，不是 agent-to-agent gateway。客户端只能拿到经 grant、policy 和 tool boundary 约束后的 Pact 能力。

### 线内 MCP 服务网关

| 线内网关组件 | 责任 | 状态 |
| --- | --- | --- |
| HTTP MCP endpoint | 通过 `POST /mcp` 接收 MCP JSON-RPC；支持 `GET /mcp` SSE 时推送事件 | 权威服务入口 |
| MCP categorized tools | 暴露 `pact.discovery`、`pact.knowledge`、`pact.sharedspace`、`pact.codespace`、`pact.skillHub` | 稳定 toolset |
| stdio proxy | 兼容不支持 HTTP MCP 或自定义 header 的本地 agent，只转发到 HTTP MCP | 兼容入口，不维护业务状态 |
| Device discovery | 发布 `~/.pact/mcp/servers.json`、`/.well-known/pact/mcp.json`、`/api/mcp/discovery` | 设备级发现面 |
| MCP handshake | 通过 `/api/mcp/handshake` 返回 server identity、endpoint、interface version、toolset version 和签名 | connector 信任 discovery URL 前必须验证 |
| Grant / token auth | 支持 `X-Pact-Api-Key` 和 `Authorization: Bearer <PACT_MCP_TOKEN>` | 每 agent 独立权限和审计 |
| `pact-mcp-connector` | 作为独立 release 包提供 install、register、discover、doctor、server-config 等客户端侧操作 | 不包含服务端 runtime、SQLite、KnowledgeCore 或 UI |
| Client runtime bootstrap | 按客户端能力裁剪 local bridge、transport fallback、upload path 等运行计划 | 客户端兼容层 |
| Agent traffic gateway ingress | 可选放在 Caddy / Nginx 后，代理 MCP、HTTP API、upload session、client runtime bootstrap | 可拆卸入口；direct mode 必须可用 |

### 线外客户端支持列表

| 下游客户端 | 支持口径 |
| --- | --- |
| Codex | connector install target；Codex 使用 bearer token env var 路径 |
| Gemini CLI | connector install target |
| Kilo Code | connector install target |
| Copilot | connector install target |
| OpenClaw | connector supported target |
| Hermes | connector supported target |
| Antigravity | connector supported target |
| OpenCode | connector install target |
| Claude Code、Cursor Agent、脚本型 agent、人工 CLI | 架构文档列入 agent-client 兼容对象；是否等同 install target 需看 connector 目标实现 |

## Source anchors

- 兼容层定义：`docs/PROTOCOLS.md` 的 `Compatibility Strategy`。
- Device MCP Hub：`docs/PROTOCOLS.md` 的 `Device MCP Hub`。
- MCP toolset：`server/platform/common/mcp/http-mcp-adapter.mjs`。
- MCP connector targets：`mcp-connector/bin/pact-mcp.mjs`。
- mount 名称与模板：`server/platform/common/module-manager/mount-config.mjs`、`server/platform/common/module-manager/module-ecosystem/index.mjs`。
- 知识库适配：`server/platform/specialized/knowledge/storage/knowledge-backend-port/index.mjs`、`server/platform/specialized/knowledge/storage/external-knowledge-base/module.json`。
- 模型适配：`server/platform/specialized/agent/agent-gateway/model-probe/index.mjs`。
- 云盘适配：`server/platform/specialized/agent/cloud-drive-port/index.mjs`。
- 代码平台适配：`server/platform/specialized/capabilities/code-management/codespace/index.mjs`、`server/platform/specialized/capabilities/code-repository/repo-operations/index.mjs`。
- 数据连接器：`server/platform/specialized/knowledge/connectors/data-connector-governance/index.mjs`、`server/platform/interactive/features/feature-manifest.mjs`。
- secret provider：`server/platform/common/security/secrets/local-secret-store.mjs`。
- traffic gateway：`server/platform/specialized/capabilities/agent-ingress/traffic-gateway/module.json`。
