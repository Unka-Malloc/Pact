# Architecture

本文件是项目当前整体架构的基线说明。后续只要运行时职责、挂载方式、存储结构、任务链路或接口分层发生变化，都必须同步更新本文件。

## 1. 总体结构

- `server`
  - `Node.js` 服务端
  - 内部按 `platform / services / application / protocols` 划分
  - `server/platform/common`：通用底座，包括核心、控制台、调度、存储、模块管理和 devops
  - `server/platform/interactive`：底座注册与服务调用的交互层
  - `server/platform/specialized`：知识库、智能体等专属底座
  - `server/platform/modules`：外置模块和本地运行时资源
  - `server/services`：客户端、智能体等服务条线
  - `server/protocols/client-cli`：服务端对客户端执行层暴露的上游协议
  - `server/protocols/checkpoint`：服务端侧 checkpoint / 断点续传对接协议
  - `server/protocols/server-web`：服务端对控制台暴露的上游 HTTP / JSON 协议
  - `server/protocols/storage`：服务端与持久化层之间的协议
  - `server/protocols/pubsub`：服务端向下游发布内容的统一发布-订阅协议
  - 负责 HTTP API、任务编排、上传会话、checkpoint、对象存储、SQLite 元数据、运维工具、挂载管理与格式路由
- `server-web`
  - `Vue` 服务端控制台
  - 只消费 `/api/*`，不依赖后端内部实现
  - `server-web/protocols/server`：控制台消费服务端接口时的下游协议
- `client-cli`
  - `Rust` 客户端命令行工具与本地 daemon
  - 是客户端侧实际执行层
  - 可独立于 Flutter 前端运行
  - 支持 macOS / Windows / Linux 等全平台编译目标
  - `client-cli/protocols/server`：客户端执行层消费服务端接口时的下游协议
  - `client-cli/protocols/checkpoint`：客户端侧 checkpoint / 断点续传对接协议
- `client-gui`
  - `Flutter` 跨端前端
  - 负责跨平台展示、交互、配置页面和拉起客户端命令行工具
  - 不直接执行系统特有任务，不直接实现上传、索引、Mail 导入、图片导入、导出或服务端业务调用
- `server/platform/modules/knowledge/`
  - 服务端本地运行时资产，包括 JRE、`tika-app.jar` 和可选 OCR runtime
  - 项目运行时依赖的 Java 环境只放在项目目录中，不依赖系统安装

## 2. 客户端架构

客户端由两层组成：

- `Flutter` 前端
- `Rust` 命令行工具 / 本地 daemon

两者不是同级执行体。客户端侧所有真实工作都落在 `Rust` 命令行工具中，`Flutter` 前端只负责展示和拉起。

### 2.1 Flutter 前端

`client-gui` 的定位是：**跨平台展示层 / 交互层 / 后端拉起层**。

它负责：

- 桌面窗口、导航、表单、状态展示和结果预览
- 用户选择文件、目录、配置和操作入口
- 展示任务、checkpoint、日志、索引状态、知识图谱和导出状态
- 展示服务端 `/api/interfaces` 注册表、能力切面、风险和权限信息
- 拉起或连接本机 `splitall-client` / `splitall-clientd`
- 通过客户端后端 API 调用 Rust 命令行工具

Flutter 前端不允许成为业务执行层：

- 不直接调用系统 Mail.app、Finder、Shell、注册表或平台 API
- 不直接实现上传 session、分块上传、任务提交、服务端 API 编排
- 不直接维护知识库索引写入逻辑
- 不直接执行 OCR、图片导入、文档解析或导出转换

Flutter 前端可以没有自己的业务能力，但不能脱离 Rust 命令行工具正常使用。没有 `splitall-client` / `splitall-clientd` 时，Flutter 只能显示离线、错误或恢复入口。

### 2.2 Rust 命令行工具

`client-cli` 的定位是：**客户端侧执行层 / 本地后端 / CLI sidecar**。

它负责：

- 命令行入口：`splitall-client`
- 本地 daemon：`splitall-clientd`
- 本地 workspace、配置、日志、recent runs、checkpoint、导出目录管理
- 文件收集、路径规范化、MIME / 扩展名识别、文件打开或定位
- 上传 session、manifest、分块上传、任务提交、任务轮询、结果拉取
- 服务端 HTTP / JSON-RPC 的统一代理和编排
- 服务端接口注册表同步和通用 `server.api` 调用
- 结果导出、知识词表拉取、知识索引热更新
- macOS Mail 导入、授权、暂停、恢复、取消、索引重建、搜索和证据打开
- 对 Flutter 暴露 command-file / RPC 风格的客户端后端 API

Rust 命令行工具必须可以独立运行。也就是说，同一个能力必须能通过 CLI 直接调用，而不是只能从 Flutter 界面触发。

客户端侧目录边界：

- `client-cli/protocols/*`
  - 记录客户端消费上游服务或对外暴露本地能力时使用的报文格式、字段语义、版本、兼容规则和协议状态机
- `client-cli/protocols/checkpoint`
  - 与 `server/protocols/checkpoint` 互相呼应，定义 checkpoint / 断点续传协议报文、offset 对齐和恢复状态机
- `client-cli/protocols/server`
  - 记录客户端消费服务端 API 和订阅上游 topic 时依赖的字段、错误语义、重试语义和降级策略

### 2.3 系统适配层

命令行工具与操作系统之间保留一层很薄的系统适配层。

这层只做平台差异封装：

- macOS：Mail.app Automation、Finder 打开 / 定位、本机权限探测
- Windows：路径、打开方式、系统 shell、后续 Windows 特有数据源
- Linux：xdg-open、路径、桌面集成、后续 Linux 特有数据源

系统适配层不承载业务状态，也不绕过 Rust CLI 的执行入口。系统特有任务必须从 Rust CLI 进入，再由适配层完成平台调用。

### 2.4 客户端本地数据与知识索引

客户端可以保存知识库的部分本地索引，但它不是服务端全量知识库。

客户端本地数据包括：

- portable workspace 标识
- settings、recent runs、checkpoint、client logs
- Mail.app 导入下载区与本地邮件索引
- 专家词汇缓存和本地热更新状态
- 部分知识图谱 / 检索展示所需的轻量索引
- 导出缓存和用户选择的本地工作目录

原则：

- 客户端索引用于本机证据打开、离线预览、快速搜索、恢复和展示
- 服务端 SQLite / 对象存储仍是服务端任务和跨客户端数据的权威来源
- 客户端索引必须可重建，不能成为唯一不可恢复真相源

## 3. 服务端架构

服务端由 `Node.js` 服务端、`Vue` 控制台、`modules / application / skills` 三层、对象存储和 SQLite 元数据组成。

### 3.1 Node.js

`Node.js` 的正式定位是：**核心服务 / 分发层 / 编排层 / 存储协调层**。

它负责：

- HTTP 服务与前端 API
- 上传会话、checkpoint、断点续传、任务恢复
- worker 队列与任务生命周期
- 下游 skill 管理
- `server/platform/specialized/knowledge/preprocessing/file-processor` 文件处理模块加载、文档格式路由和归一化交付
- SQLite 元数据与检索索引
- 原始文件对象存储
- 事务、线程、人物、关联、lineage 等业务编排
- 服务发现、客户端迁移状态登记
- 运维工具：`doctor / locate / reconcile / rebuild`

作为核心服务，Node.js 同时对接多个横切切面：

- 接口切面：HTTP、JSON-RPC、CLI 注册表、参数映射、响应映射、错误映射
- 配置切面：settings、rules、mount modules、mount routing、discovery config
- 身份与客户端切面：bootstrap、client check-in、客户端注册、迁移状态、active / forward 模式
- 上传与恢复切面：upload session、checkpoint、分块上传、断点续传、任务恢复
- 任务生命周期切面：job 创建、队列、worker 调度、取消、删除、结果回放
- 存储切面：SQLite 元数据、raw object、job snapshot、normalized documents、FTS / retrieval index
- module / skill 切面：FileProcessor、documentParser、pdfProcessor、ocr、multimodalParser、analysis、knowledgeBase、vectorStore、graphStore
- 业务分析切面：邮件、线程、事务、人物、时间线、lineage、关联和知识召回
- 观测与事件切面：日志、runtime state、storage summary、client migration state、events
- 运维切面：doctor、locate、reconcile、metadata rebuild、runtime reload
- 导出切面：result export、normalized DOCX manifest、知识包交付

这些切面不能只靠约定散落在代码里。Node.js 核心服务与外部切面的稳定契约统一记录在协议体系中：

- `server/protocols/checkpoint`
  - 记录服务端侧 checkpoint / 断点续传协议
  - 与 `client-cli/protocols/checkpoint` 互相镜像
- `server/protocols/client-cli`
  - 记录服务端对客户端执行层暴露的上游协议
- `client-cli/protocols/server`
  - 记录客户端执行层消费服务端协议时的下游约束
- `client-cli/protocols/checkpoint`
  - 记录客户端侧 checkpoint / 断点续传协议
  - 与 `server/protocols/checkpoint` 互相镜像
- `server/protocols/server-web`
  - 记录 Node.js 服务端与 `server-web` 控制台之间的 HTTP / JSON 响应协议
  - 覆盖 console state、settings、mounts、jobs、storage summary、runtime state、discovery 等契约
- `server-web/protocols/server`
  - 记录 `server-web` 消费服务端接口时的下游约束
- `server/protocols/storage`
  - 记录 Node.js 服务端与 SQLite、raw object、job snapshot、normalized documents 之间的持久化协议
  - 覆盖 schema、对象路径、manifest、rebuild、reconcile 和兼容迁移规则
- `server/protocols/pubsub`
  - 记录服务端向下游发布内容的统一发布-订阅协议
  - 覆盖 topic、event envelope、cursor、retained snapshot 和长轮询订阅语义
- `server/protocols/knowledge`
  - 记录服务端应用层与可替换知识库模块之间的 `splitall.knowledge.v1` 协议
  - 覆盖 KnowledgeCore、EmbeddingRuntime、VectorStore、assetStore、retrieval 的内部方法边界、资产 URL policy、license policy 和可替换实现约束

原则：

- 协议文档放在所属层级，仓库根目录不保留顶层 `protocols`
- 上游用的协议放在服务提供方，例如 `server/protocols/*`
- 下游用的协议放在调用方，例如 `client-cli/protocols/*` 或 `server-web/protocols/*`
- 知识库是独立协议边界；application、HTTP、JSON-RPC、CLI 和控制台只能调用 `knowledgeBase` mount 方法，不能直接读取 KnowledgeCore SQLite、资产目录、embedding runtime 或 vector index
- 上游向下游发布的内容统一进入 pub-sub topic；下游通过 cursor 和 retained snapshot 订阅
- `protocols` 记录稳定契约、协议状态机和协议边界内执行适配
- 新增跨切面能力时，先明确协议归属，再落到 protocols / modules / application / skills
- 任何破坏兼容的协议变化都必须写明版本、迁移和回滚策略

服务端侧目录边界：

- `server/protocols/*`
  - 记录服务端与客户端、控制台、存储、外部切面对接的协议格式、协议状态机和协议边界内执行适配
- `server/protocols/checkpoint`
  - 管理服务端侧 checkpoint 接收、`.part` 落盘、offset 校验、sha256 校验和 session reconcile
- `server/protocols/pubsub`
  - 管理服务端向下游发布的事件日志、retained snapshot 和订阅 cursor
- `server/protocols/knowledge`
  - 管理知识库方法、内部 vector / embedding / assetStore / retrieval 协议、资产 URL 和 license gate 约束
- `server/platform/modules/knowledge/*`
  - 存放高耦合服务端模块，例如 `FileProcessor`、`VectorStore`
  - 模块内部可以再划分路由表、组件、运行时、适配器和打包清单
  - 模块使用时加载，不使用时卸载；打包时按模块和子组件选择

Node.js **不再承担本地文档解析实现**。它只做转发、调度、落盘和结果回收。

### 3.2 Vue 服务端控制台

`server-web` 的定位是：**服务端运维控制台**。

它负责：

- 展示服务端运行状态、挂载状态、任务状态、存储摘要和客户端迁移状态
- 修改服务端设置、发现配置、规则库和挂载配置
- 只消费 `/api/*`
- 不依赖服务端内部模块路径或实现细节

### 3.3 Java + Tika

`Java` 只承担一个角色：**文档解析引擎宿主**。

- 通过 `server/platform/modules/knowledge/runtime/jre` 内的 JRE 运行 `server/platform/modules/knowledge/tika/tika-app.jar`
- 由 Node.js 调起
- 负责常规文件型文档的文本、元数据与嵌入文档提取

默认情况下，以下格式走 `Java + Tika`：

- `.doc / .docx`
- `.ppt / .pptx`
- `.xls / .xlsx`
- `.eml / .msg`
- `.txt / .md / .csv / .json / .yaml / .xml / .html`
- 其他被路由到 `documentParser` 的结构化文件

PDF 不再直接归入通用 `documentParser`，默认先进入 `server/platform/modules/knowledge/file-processor/FileNormalizer/PDFProcessor`。`PDFProcessor` 内部可以调用 Tika，也可以在后续演进为先转 DOCX 再进入归一化流程。

### 3.4 能力挂载

后端通过 `mount manager` 管理下游能力。能力是服务端可替换的 mount 单元，挂载分两类：

- 核心挂载
  - `documentParser`
  - `ocr`
  - `multimodalParser`
  - `pdfProcessor`
  - `analysis`
  - `knowledgeBase`
  - `vectorStore`
  - `graphStore`
- 任意命名自定义挂载
  - 例如 `sourceCodeAgent`
  - 例如 `pdfAgent`
  - 例如 `mailAgent`
  - 例如未来新增的任意智能体、专用解析器或外部能力

skill 挂载支持：

- 热插拔
- 热切换
- 热重载
- 任务执行快照

规则是：

- 新任务读取最新 skill / mount 配置
- 运行中的任务保留创建任务时的挂载快照
- 热切换不会半路污染正在执行的任务

## 4. 文档接口分离与格式路由

### 4.1 路由原则

文档归一化与文件处理统一收敛到 `server/platform/specialized/knowledge/preprocessing/file-processor`。Node.js 主服务不直接解析文件，而是引入 FileProcessor 模块；FileProcessor 先按模块内路由表选择处理流程，再调用对应组件。

路由维度：

1. `extensionRoutes`
2. `mediaTypeRoutes`
3. `kindRoutes`
4. 默认路由

这意味着：

- `.png` 和 `.jpg` 可以分别走不同模块
- `.pdf` 可以走专用 PDF 模块，不必和 `.docx` 共用
- `.py`、`.foo` 这类格式可以通过配置直接接入新智能体模块
- 无需为新增扩展名再重写后端代码

FileProcessor 模块目录边界：

- `server/platform/specialized/knowledge/preprocessing/file-processor/file-routing-table`
  - 文件类型到处理流程的注册表
  - 例如 `.docx -> documentParser.extractDocument`
  - 例如 `.png -> ocr.extractText` 或 `.png -> ImageAgent.extractDocument`
  - 例如 `.pdf -> pdfProcessor.extractDocument`
- `server/platform/modules/knowledge/file-processor/FileNormalizer/Tika`
  - Tika 服务入口
  - 只读使用 Tika 运行时和 jar，不向 Tika 目录写运行文件
- `server/platform/modules/knowledge/file-processor/FileNormalizer/OCR`
  - OCR 服务入口
- `server/platform/modules/knowledge/file-processor/FileNormalizer/PDFProcessor`
  - PDF 专用流程入口，内部可调用 Tika
- `server/platform/specialized/knowledge/preprocessing/file-processor/FileNormalizer/NormalizedDocuments`
  - normalized DOCX 与 manifest 交付物生成

### 4.2 默认扩展名路由

默认扩展名路由已经按细粒度拆开：

- 图片：`.png .jpg .jpeg .webp .gif .bmp .tif .tiff`
- 邮件：`.eml .msg`
- 文档：`.pdf .doc .docx .ppt .pptx .xls .xlsx`
- 文本 / 标记 / 源码：`.txt .md .markdown .csv .json .yaml .yml .xml .html .htm .js .ts .tsx .jsx .py .java .c .cpp .h .hpp .ini .log`

默认行为：

- 图片 -> `ocr.extractText`
- PDF -> `pdfProcessor.extractDocument`
- 常规文档 -> `documentParser.extractDocument`

但这只是默认值，所有格式都可以被覆盖。
如果 `.png` 改走 `ImageAgent`，并且没有任何路由或模块引用 OCR，打包配置可以移除 OCR 子组件。

### 4.3 配置文件

挂载配置已拆成两份：

- `mount-modules.json`
  - 管理挂载名到模块路径的映射
- `mount-routing.json`
  - 管理扩展名、媒体类型、kind 到挂载动作的映射
- `server/platform/specialized/knowledge/preprocessing/file-processor/module.json`
  - 管理 FileProcessor 自身组件清单、默认加载策略、可选打包组件和只读运行时约束

配置策略：

- 启动时只读取这两份文件
- 旧 `mounts.json` 布局已移除；历史配置需要外部转换为 `mount-modules.json` 和 `mount-routing.json`

### 4.4 一个典型配置

```json
{
  "mountModules": {
    "documentParser": "/abs/path/to/tika-parser.mjs",
    "multimodalParser": "/abs/path/to/mm-agent.mjs",
    "sourceCodeAgent": "/abs/path/to/code-agent.mjs"
  },
  "mountRouting": {
    "extensionRoutes": {
      ".png": { "mountName": "multimodalParser", "action": "extractDocument" },
      ".jpg": { "mountName": "multimodalParser", "action": "extractDocument" },
      ".py": { "mountName": "sourceCodeAgent", "action": "extractDocument" }
    }
  }
}
```

## 5. 分析模块

分析执行与文档解析分离。

- 文档解析负责“把文件变成可分析文本和元数据”
- 分析模块负责“把源文件、chunk、邮件关系、时间线和事务网络加工成业务结果”

分析模块切换通过 `analysisModuleId` 实现，支持：

- 内置模块：`builtin:heuristic-hybrid-v1`
- 外挂模块：通过 `analysis` mount 提供
- 热切换
- 配置生效后新任务立即走新模块

分析输出主结构：

- `emails`
- `threads`
- `transactions`
- `people`
- `timeline`
- `network`
- `associations`
- `retrieval`
- `lifecycle`
- `analysisRuntime`

## 6. 任务与数据流

### 6.1 任务链

一次标准任务链路是：

1. Flutter 前端把用户操作提交给 Rust CLI / daemon
2. Rust CLI 创建 upload session
3. Rust CLI 按文件分块上传
4. 服务端校验 `sha256 / byteSize`
5. Rust CLI 提交作业
6. Node.js 创建 job 并调度 worker
7. worker 读取任务创建时的 runtime snapshot
8. 按格式路由调用下游解析模块
9. 生成 sources / chunks
10. 运行云端文档智能与分析模块
11. 持久化结果、索引与对象
12. Rust CLI 拉取 job/result 并更新客户端本地状态
13. Flutter 前端展示最终状态与结果

### 6.2 文件归一化解析与处理工作流

当前文件归一化链路的目标是：把用户输入的文件、目录、压缩包或粘贴文本，转换为可分析的 `sources / chunks`，再生成面向外部知识库摄取的多颗粒度 DOCX 包。知识管理交付分三层：

- 第一层 `raw-corpus-construction`：原始语料建构，把文件、邮件、聊天、本地镜像等材料解析、切分、保留结构并形成可导出的规范语料。邮件等时序材料必须尽可能保留 message、thread、transaction、timeline、sourceRange 和 lineage。
- 第二层 `knowledge-index-construction`：知识索引建构，把第一层产物收纳为内置 `KnowledgeCore` 或外部知识库适配器的 document / section / block / asset / evidence / embedding / relationship。第二层必须继续承担规范语料到索引对象的解析和映射，并通过 `knowledge.search`、evidence pack、asset protocol 和 `knowledge.export.docx` 提供权威 RAG 查询面。
- 第三层 `knowledge-distillation`：知识蒸馏，从第二层 evidence 中提取摘要、规则候选、主题背景和工作空间上下文。该层是有损压缩，只能作为 ContextRuntime、AgentWorkspace 和长任务运行时背景，不能替代第二层全量查询。

完整流程：

1. 客户端准备输入
   - `client-cli` 收集文件、目录或粘贴文本。
   - 文件和目录走 upload session、manifest、checkpoint 和分块上传。
   - 服务端校验每个文件的 `sha256 / byteSize`。

2. 服务端创建 job
   - Node.js 接收 `/api/jobs` 请求。
   - job worker 读取任务创建时的 runtime snapshot。
   - 运行时快照固定本次任务使用的 settings、rules、mount modules、mount routing 和 skills。

3. 输入读取与展开
   - `readInputSources` 读取 `inputText`、本地 file paths、upload session staged files。
   - 目录会递归展开为支持的文件集合。
   - `.zip` 会展开一层，内部条目继续按普通文件解析。
   - 每个 source 附加 `sourceCreatedAt / sourceUpdatedAt / sourceCollectedAt`。

4. 格式识别与路由
   - `server/platform/specialized/knowledge/preprocessing/file-processor` 读取模块内 `file-routing-table`。
   - 文本、邮件、图片、PDF、DOCX、普通文档按扩展名、media type、kind 和默认规则分类。
   - 默认路由：
     - 图片 -> `ocr.extractText`
     - PDF -> `pdfProcessor.extractDocument`
     - 常规文档 -> `documentParser.extractDocument`
   - 配置路由可以把 `.png`、`.pdf`、`.eml`、`.py` 或未知扩展名切到任意 skill。

5. skill 解析
   - `documentParser` 默认由 `Java + Tika` 承担，返回 `text / metadata / embeddedDocuments / parserId`。
   - `pdfProcessor` 是 PDF 专用流程入口，当前内部调用 Tika，后续可演进为先转 DOCX 再进入处理。
   - 图片默认走 OCR skill，保留原图 data URL 和原始 buffer。
   - PDF 如果 Tika 没有提取到正文，会尝试 OCR 兜底。
   - EML / MSG 会额外写入 raw object 审计存储，保留原文件名和原始内容。
   - 解析失败不会静默吞掉，会进入 warnings；无可用内容的文件会被跳过或导致任务失败。

6. source 标准化
   - 每个成功解析的输入都会形成 source。
   - source 至少包含：`id`、`name`、`path`、`kind`、`text`、`mediaType`、时间元数据、parser 信息、embedded documents、原始 hash 和 byte size。
   - 邮件 source 还带 raw object 引用，供后续证据打开和审计。

7. chunk 生成
   - `createKnowledgePipeline` 对非图片 source 运行规则解析器和规则 chunker。
   - parser 生成 blocks。
   - chunker 生成 chunks，并保留 sourceId、标题路径和正文片段。
   - 图片 source 当前主要保留为原始证据和可选 OCR 文本，不进入普通文本 chunk 主线。

8. 分析处理
   - application 调用当前配置的 analysis skill。
   - analysis 接收 `sources / chunks / settings / rules`。
   - 输出 emails、threads、transactions、people、timeline、network、associations、retrieval 等结构。
   - metadata store 会解析事务生命周期，回写 transaction 和 timeline 的 lineage / 恢复状态。

9. 归一化 DOCX 生成
   - `generateNormalizedDocuments` 在 `jobs/<jobId>/normalized-documents/` 下重建归一化包。
   - Mail adapter 先基于分析结果生成：
     - `message` DOCX
     - `thread` DOCX
     - `transaction` DOCX
   - 非邮件 source 再按适配器生成：
     - PPT / PPTX -> `deck`、`section`、`slide`
     - PDF -> `document`、`section`、`page-window`
     - HTML -> `page`、`section`、`block`
     - 其他格式 -> `source`
   - 每个 DOCX 都写入归一化元数据、证据定位、正文和解析风险，并保留 chunk id、`sectionId` 与 `sourceRange`。

10. 原始材料处理
    - PPT / PPTX / PDF / HTML 会复制允许入库的原始材料到 `normalized-documents/source-materials/`。
    - EML / MSG 不复制到知识库目录，原始邮件只保留在 raw object 审计存储中。
    - 普通 fallback 文档只生成 source-level DOCX，不复制额外 source material。

11. manifest 与结果回写
    - 服务端写入 `normalized-documents/manifest.json`。
    - manifest 包含 `schemaVersion`、`packageType`、`batchId`、`generatedAt`、`documents`、`sourceMaterials`、summary 和 warnings。
    - job result 中同时包含 `normalizedDocuments` 和 `sourceFiles`。
    - metadata store 持久化 sources、analysis、retrieval index 和 warnings。

12. 下载与外部摄取
    - 归一化清单通过 `GET /api/jobs/:jobId/normalized-documents` 读取。
    - 单个 DOCX 或允许输出的原始材料通过 `GET /api/jobs/:jobId/normalized-documents/:documentId` 下载。
    - 已收纳到 KnowledgeCore 的 canonical knowledge 通过 `GET /api/knowledge/export/docx`、RPC `knowledge.export.docx` 或 CLI `knowledge export-docx --output knowledge.docx` 导出标准 DOCX。
    - 外部知识库适配器从同一 normalized document package、manifest、source metadata 和 asset locator 建立自己的索引，但必须把查询、证据读取和资产读取适配回 `splitall.knowledge.v1`。
    - CLI、server-web 和 client-gui 都必须使用同一套服务端协议，不各自解析 job 目录。

13. 索引与蒸馏消费
    - RAG、智能体问答、证据打开和 Markdown 渲染必须通过第二层 `knowledge.search` / evidence pack / asset protocol。
    - `SummarizationRuntime`、`knowledge-distillation` runtime、`ContextRuntime` 和 `AgentWorkspace` 只能消费第二层 evidence 生成有损背景。
    - 蒸馏结果必须保留 `evidenceRefs / citations / sourceTrace / coverage`，缺引用链路的内容只能进入补证或审核，不能写回 canonical evidence。

14. 外部知识库适配器一致性
    - 适配器最小方法集是 `knowledge.capabilities`、`knowledge.health`、`knowledge.ingest.batch`、`knowledge.upsert.documents`、`knowledge.search`、`knowledge.get.evidence`、`knowledge.asset`、`knowledge.export.docx`、`knowledge.delete.batch`、`knowledge.reindex` 和 `knowledge.sync`。
    - conformance fixture 必须用同一份 normalized corpus 验证 ingest -> search -> evidence read -> asset read -> DOCX export -> delete/tombstone -> search/sync 隐藏已删除对象。
    - 远端后端必须在检索前应用 tenant、workspace、source-scope 和权限过滤，不能先 topK 再做权限后过滤。
    - 首批检测只纳入成熟开源后端：`PostgreSQL + pgvector`、`Qdrant`、`OpenSearch`，以及可选的 `Weaviate`。RAG 应用、编排框架、私有服务和实验性 graph/RAG 后端不作为首批必测对象。
    - 实现入口是 `server/platform/specialized/knowledge/storage/external-knowledge-base/index.mjs`，当前实现 `qdrant`、`opensearch` 和 `pgvector`。该 mount 以 `KnowledgeCore` 保存 canonical evidence / asset / DOCX export，并把第二层检索记录镜像到外部数据库。

关键边界：

- Node.js 负责路由、编排、落盘和结果回收，不在业务代码里硬编码每种格式的解析实现。
- 第一层文件解析由 FileProcessor 内的路由表分派到 mount 能力或子组件，归一化 DOCX 由 `FileNormalizer/NormalizedDocuments` 承担。
- 第二层索引解析由内置 `KnowledgeCore` 或外部知识库适配器承担，负责把 normalized package、manifest、source metadata、asset locator 和 chunk/section 边界转成可检索的 evidence。第二层不能假设第一层只给纯文本。
- 第二层适配器必须保留 SplitAll id 到外部 id 的映射；映射丢失会破坏 evidence 回读、资产读取、删除、sync 和 DOCX export，必须作为 health failure 暴露。
- 服务端 SQLite / raw object / job snapshot 是权威记录；客户端本地索引只做展示、恢复和证据打开加速。
- Markdown 和旧 knowledge-package 导出不再作为主线；知识管理交付主线是 normalized DOCX + manifest、`knowledge.export.docx` 的 canonical knowledge DOCX，以及只供上下文/工作空间运行时使用的有损蒸馏背景。

### 6.3 checkpoint

客户端 checkpoint 生命周期：

- 确认文件
- 上传服务器
- 服务器处理
- 反馈客户端
- 客户端确认 checkpoint

支持：

- 断网续传
- 客户端重启后自动续传
- 分块上传恢复
- 服务端不可达时本地任务入队、`waiting_server` 状态和指数退避自动重试
- 服务端重启后 queued/running job 恢复
- 分支、手动停止、旧链路回收

分块上传是 checkpoint 中“上传服务器”阶段的断点续传实现，但不是 checkpoint 的全部。

管理边界：

- `client-cli/protocols/checkpoint` 与 `server/protocols/checkpoint` 管理断点续传对接协议
  - 只记录 HTTP / JSON / binary chunk 报文
  - 记录字段语义、版本、兼容策略、错误语义和恢复状态机
  - chunk size
  - 按服务端返回的 `receivedBytes` 继续上传
  - offset mismatch 后按服务端 `expectedOffset` 重新对齐
- Rust 源码负责本地文件枚举、文件 sha256 与 manifest digest、checkpointId 生成或复用
- Rust 上传队列用事件溯源保存任务状态；网络型错误只进入可恢复 `waiting_server`，不丢弃本地任务，也不要求用户重新选择文件。
- `server/protocols/checkpoint` 管理服务端接收协议适配与权威状态
  - `meta.json`
  - `.part` 分块落盘文件
  - `receivedBytes`
  - `status`
  - 文件大小与 sha256 校验
  - 服务端重启后的 session reconcile
- `server/protocols/pubsub` 管理上游向下游发布 upload session、job、settings、runtime 等 topic
  - 下游用 `GET /api/events` 订阅
  - 新订阅者可用 retained snapshot 获取当前状态
  - 客户端后台保存 `nextCursor`，服务端恢复后从上次游标继续同步并写入本地事件日志
- `server/services/client/work-queue-core` 在创建 job 时把 `uploadSessionId` 转成 checkpoint receipt
  - 同一个 checkpointId 已经创建过 job 时，返回已有 job
  - upload session 未完成时，不进入后续解析处理
- `client-gui` 只展示和拉起
  - 不直接读取本地文件分块
  - 不直接维护 upload session 状态
  - 不直接决定 offset、hash、checkpoint receipt

### 6.4 事务生命周期

邮件事务支持：

- 线程归并
- 事务归并
- lineage 匹配
- 历史事务恢复
- 时间线拉回

场景包括：

- 周报 / 月报延续
- 长事务续接
- 多来源同事务归并
- 持续中事务识别

## 7. 服务端分层

### `server/platform`

`server/platform` 是服务端底座层，分为通用底座、专属底座、交互层和外置模块层。

它负责：

- HTTP / JSON-RPC / CLI 接口注册与分发
- 路由、控制器、响应映射和错误映射
- 上传会话、checkpoint、文件对象、SQLite repository 等基础模块
- FileProcessor、VectorStore 等可选高耦合服务模块
- 服务发现、设置、规则库、运行时配置、运维工具
- mount manager、mount routing、任务执行快照
- 日志、事件、状态摘要、导出和观测接口
- 前后端分离边界

原则：

- `common` 提供稳定 API 和基础设施能力
- `interactive` 是底座对外注册和服务侧调用的唯一跨层入口
- 上层功能（`services`、HTTP 接口、worker、agent 功能）调用底座接口时，必须统一通过 `platform/interactive` 切面；禁止直接依赖 `platform/common`、`platform/specialized`、`platform/modules`
- 开发新功能前必须先查 `server/platform/interactive/interface-manifest.mjs`，优先复用已登记的 interactive 接口，再评估是否新增接口
- `specialized` 放知识库、智能体等专属底座，不能反向依赖服务条线
- `modules` 放外置模块和本地运行时资源
- 平台层不把具体业务流程写死在接口层

### `server/services`

`services` 是产品线服务层，当前分为 `agent` 和 `client`。

它负责：

- 客户端工作队列、checkpoint 闭环、任务创建、恢复、轮询和结果生成
- 客户端运行时分配、上下文与工作空间绑定
- 智能体巡检、runbook、审批和审计
- 按产品线调用 `platform/interactive` 暴露的底座能力

原则：

- `services/agent` 只放智能体服务线代码
- `services/client` 只放客户端服务线代码
- 跨底座能力必须通过 `platform/interactive` 或已注册接口调用
- 知识库专属规则、检索、入库和文件处理能力放入 `platform/specialized/knowledge`

### 可替换能力契约

核心 skill 类型包括：

- `documentParser`
- `ocr`
- `multimodalParser`
- `pdfProcessor`
- `analysis`
- `knowledgeBase`
- `vectorStore`
- `graphStore`

这些能力不再保留独立的 `server/skills` 顶层目录。能力契约由 `server/platform/common/module-manager` 管理，具体实现由 `server/platform/modules/knowledge` 或外部 mount 模块提供。

能力实现可以是：

- 内置实现
- 本地外部模块
- 云端服务适配器
- 未来新增的任意专用智能体或解析器

原则：

- 能力只暴露 mount 契约，不关心 HTTP / CLI / Flutter 如何触发
- 能力不拥有服务端全局状态；需要持久化时回到 `platform/common/storage` 或模块自己的协议存储
- 新能力应通过 mount 配置接入，不应要求改写 application 主流程
- 运行中的任务使用创建时的 mount 快照，新任务读取最新配置

## 8. 存储结构

默认数据目录：`build/server-data/`

### 8.1 元数据

- `metadata/splitall.sqlite`

这是当前唯一元数据真相源，负责：

- batch / source / raw object / message / thread / transaction / people
- lineage
- discovery clients
- retrieval index / FTS
- 删除协调状态

通用知识库不再继续扩展这组应用层表。新的多模态知识库由 `server/platform/specialized/knowledge/storage/knowledge-core` 独立维护，应用层通过 `splitall.knowledge.v1` 调用：

- `knowledge-core/knowledge.sqlite`：collection / document / section / block / asset / evidence / embedding / relationship。
- `knowledge-core/assets/`：按 SHA-256 存放图片等二进制资产。
- `knowledgeBase` mount：对应用层暴露 search、evidence、Markdown render、maintenance、health、reindex 等协议方法。

知识库内部继续分成独立协议组件：

- `KnowledgeCore`：`splitall.knowledge.v1` 方法入口和对象模型归一。
- `EmbeddingRuntime`：`splitall.embedding.v1`，当前内置 deterministic text/image fallback，不下载模型。
- `VectorStore`：`splitall.vector.v1`，当前内置 `sqlite-vec` 本地向量索引，并保留 SQLite JSON vector fallback；外部 LanceDB 或 Qdrant 只能通过协议适配。
- `assetStore`：`splitall.assetStore.v1`，负责资产落盘、hash 校验、URL/path policy。
- `retrieval`：`splitall.retrieval.v1`，负责混合召回、parent expansion、rerank 和 evidence shaping。
- `DocumentOutlineRuntime`：`splitall.document-outline.v1`，把 PageIndex-style 自然章节树作为长文档局部增强写入 `kc_hierarchy_nodes`，仅保存 outline metadata、sourceRange 和 quality，不复制 PageIndex 代码、不修改源文件、不替代 FTS/vector/graph/localQuery 主检索路径。

在三层知识管理模型中，`metadata/splitall.sqlite`、raw object、job snapshot 和 normalized DOCX 属于第一层语料建构记录；`knowledge-core/knowledge.sqlite`、`knowledge-core/assets/`、外部知识库索引映射、evidence pack 和 hierarchy index 属于第二层权威索引；`SummarizationRuntime`、`knowledge-distillation` runtime、ContextRuntime 和 AgentWorkspace 产物属于第三层有损背景。第二层是外部知识库对接点，必须承担规范语料到索引/evidence 的解析和协议适配；第三层可以引用第二层 evidence，但不能覆盖第二层事实，也不能作为全量查询入口。

`ClientRuntimeAllocator` 位于应用层，不属于具体模型 provider 或知识库实现。它用 Strategy + Policy Resolver 模式把 `clientUid + taskType` 路由到一个运行时 profile，再把模型 alias、ContextProfile、RetrievalProfile、workspace/session 和工具 grant 作为切面注入 AgentGateway、AgentMemory、ContextRuntime、KnowledgeSearch、SummarizationRuntime 和 AgentExplorationRuntime。它同时维护 `lru-lfu-v1` 冷却策略：每次标准调用记录到 usage store，热度由最近时间桶、总调用量和最近访问时间计算；低频且最旧的客户端可以降到冷上下文 profile 与冷 workspace 策略，高频客户端继续获得热路径资源。这个抽象保留 HTTP/RPC/CLI 标准调用面，同时允许同一服务端按客户端热切换上下文和工作空间；显式调用参数优先，避免分配器覆盖人工指定的模型或 workspace。`GET /api/client-runtime/status`、`client_runtime.status` 和 `client-runtime status` 输出同一份热力图数据，控制台系统状态直接消费该协议状态。`clientId` 不参与用户空间识别，避免与 KnowledgeCore canary 路由和服务发现客户端 ID 混用。

多源连接器属于客户端侧架构：`DataConnector` 负责 OAuth、同步、本地 mirror、`localQuery` 和卸载；服务端只接收 `clientUid/sourceType/providerId/externalId/syncBatchId/contentHash/capturedAt/sourceMetadata` 等标准来源字段，并把它们归一成第二层 evidence。外部连接器以配置包安装到 `portable-data/connectors/modules/<providerId>`，进程型运行时通过 `splitall.data-connector.process.v1` 标准输入/输出协议动态调用 `sync/localQuery/health/auth/uninstall` capability，卸载策略控制本地 mirror cache 和模块目录清理。聊天记录在客户端 `chat-index/chat.sqlite` 保留 workspace、conversation、participant、message、attachment 和 FTS 关系；服务端搜索结果只消费统一 evidence，不反向依赖具体连接器。`knowledge.search` 可以接收客户端附带的 `localQuery.items` 或 `localHits`，按统一 `SourceHit` 结构与第二层 evidence 做去重、加权融合和最终排序；本地-only 结果只作为 `localMirror` 补充项返回，不能被当作服务端 evidence 读取。知识蒸馏也只基于统一 evidence 运行，输出摘要、规则候选和实体关系候选时必须随对象保留 `evidenceRefs/citations/sourceTrace`，不能把连接器字段混入源文件或蒸馏结论正文；这些蒸馏输出只供上下文和工作空间运行时使用，不能替代 `knowledge.search`。

资产对外只通过 `GET /api/knowledge/assets/:assetId` 或离线导出包内相对路径暴露。`assetId` 是不透明标识，不是文件路径；控制器、客户端和 Markdown 渲染器不能绕过协议读取 `knowledge-core/assets/`。

现有 `knowledge_items / knowledge_chunks / knowledge_evidence` 继续作为邮件分析兼容投影，不作为通用级知识库的算法或存储绑定点。

### 8.2 原始对象

- `objects/<ClientUID>/<SourceType>/<OriginalFileName>__<ArchiveBatchId>.<ext>`

特点：

- 保留原标题
- 保留原始内容
- 不篡改文件名
- 不篡改文件内容
- 不写入服务端分析、检索或审计补充字段

### 8.3 任务快照

- `jobs/<jobId>/meta.json`
- `jobs/<jobId>/payload.json`
- `jobs/<jobId>/result.json`

这些文件用于：

- 任务状态恢复
- 结果回放
- 元数据库重建
- 运维排障

### 8.4 Upload Session Manifest

- `upload-sessions/<sessionId>/meta.json`

这些文件只用于上传会话恢复、分块 offset 对齐和 sha256/byteSize 校验。它们不是在线检索索引。

### 8.5 检索权威关系

检索入口只能是 `metadata/splitall.sqlite` 或 `splitall.knowledge.v1` 暴露的知识库索引。命中 raw object 后，才按 SQLite 中的 `storage_rel_path` 读取对象存储。`job result.json`、upload session manifest 和 `objects/` 目录都不能作为直接检索入口。

### 8.6 运行时临时文件

- `tmp/`
  - Tika 临时文件
  - OCR 临时文件
  - 其他运行时中间文件

## 9. 服务发现与迁移

服务发现是当前主链的一部分。

能力包括：

- `bootstrap` 引导地址
- discovery config
- client check-in
- client registry
- active / forward 模式
- 迁移状态观测
- 旧服务转发到新服务

原则：

- 客户端优先通过 bootstrap 获取当前正式服务
- 新任务走新服务
- 已创建任务保持作业级粘滞

## 10. 运维能力

后端内置以下运维工具：

- `server:doctor`
  - 检查数据库缺失、对象缺失、孤儿对象、FTS 不一致、删除残留
- `server:locate`
  - 按 `jobId / batchId / objectId` 反查实际落盘和数据库记录
- `server:reconcile`
  - 修复 FTS、同步计数、清理失效删除操作，支持 dry-run / apply
- `server:rebuild-metadata`
  - 从 jobs 与对象存储重建 SQLite 元数据库

## 11. 当前关键约束

- 服务端控制台与服务端内部实现严格分离
- Flutter 前端与客户端执行层严格分离
- Flutter 前端只能拉起或调用 Rust CLI / daemon，不能绕过 CLI 直接执行系统特有任务
- Rust CLI 必须能独立于 Flutter 前端运行，并覆盖所有客户端执行能力
- Rust CLI 与系统之间只能通过薄系统适配层访问平台特有能力
- 客户端可以保存部分本地知识索引，但这些索引必须可重建，不能取代服务端权威存储
- `SQLite` 是唯一元数据真相源
- Node.js 只做编排、模块加载、调度、持久化与 API，不再把本地文档解析 fallback 散落在主服务代码中
- 文件型文档默认经 `server/platform/specialized/knowledge/preprocessing/file-processor` 路由到 Tika、OCR、PDFProcessor 或自定义智能体
- 任意命名挂载和未知扩展名都必须支持通过配置接入
- 默认打包不应强制加载所有模块；FileProcessor、OCR、VectorStore 等应作为可选模块或可选子组件进入包
- 离线 Ubuntu 包必须在构建机阶段完成 Node/JRE/Tika/native node_modules 准备，目标机运行期不能依赖 `apt`、宿主 Node/npm/Java 或隐式模型下载
- 知识库离线包必须携带 `license-manifest.json`；包内生产依赖、KnowledgeCore、EmbeddingRuntime、VectorStore、sqlite-vec 状态和 ONNX 模型状态都必须经过 license gate
- 任意生产依赖 license 被判定为 `blocked` 或 `unknown` 时，打包必须失败；`sqlite-vec` 在通过 npm 包和平台 optional dependency 许可校验后可打包，ONNX 模型在未审查前只能保持 `not-bundled-license-gated`
- 架构变化后，必须同步更新本文件

## 12. 知识库管控台切面

服务端新增知识库管控台切面，但它不改变应用层与知识库模块之间的边界。

后端分层：

- `server/platform/common/platform-core/auth/console-auth.mjs`：本地用户、角色、会话、CSRF、OIDC 配置占位和审计日志。
- `server/platform/common/operation-dispatcher/operation-registry.mjs`：所有 HTTP/RPC/CLI 接口声明 `requiredScopes`。
- `server/platform/common/console/http/controllers/system-controller.mjs`：只做请求解析、权限后处理和协议调用。
- `server/platform/specialized/knowledge/storage/knowledge-core`：继续作为 `knowledgeBase` mount，对外暴露 `splitall.knowledge.v1`。

前端分层：

- `server-web/lib/types.ts`：控制台协议类型。
- `server-web/lib/bridge.ts`：唯一数据访问层，负责 CSRF、二进制资产 URL、DOCX 下载 URL 和认证接口。
- `ServerConsoleApp.vue`：只渲染状态、表单、检索、证据、入库和维护任务，不读取 SQLite、对象目录或模块路径。

前端功能登记与门禁：

- 所有 `server-web` 前端功能必须先登记到 `server/config/frontend-feature-registry.yaml`，再允许开发和合并。
- 登记模型必须为三级：`routePath/tabId -> featureId -> actionId`。
- 未登记的前端路由页面或系统配置 Tab 功能视为违规，不允许通过门禁。
- 门禁脚本为 `server/scripts/verify-frontend-feature-registry.mjs`，要求路由、系统配置 Tab 和登记表双向一致。

控制台知识库页面：

- 概览：KnowledgeCore、协议模块、计数、最近任务。
- 检索：query、topK、batchId、模态过滤。
- 证据/资产：evidence pack、图片资产、OCR/caption、Markdown 渲染。
- 入库/归一化：浏览器文件/目录上传，经 upload-session/checkpoint/chunk 创建 job。
- 蒸馏/上下文背景：展示摘要、coverage、evidenceRefs、未引用结论、审核状态和工作空间引用关系。
- 同步目录：位于系统配置抽屉的“同步目录”Tab。
- 维护/配置：由服务端 `config-schema` 渲染表单，可执行 reindex、validate、repair 等维护任务。

安全边界：

- 本地账号离线可用，OIDC 不作为启动依赖。
- 受保护写操作必须通过 CSRF。
- 控制台用户 RBAC 与智能体工具 token 分离。
- 前端只处理 opaque id，不暴露真实资产路径、数据库路径或密钥。
