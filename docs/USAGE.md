# SplitAll 使用说明

当前交付形态只有两部分：

- 服务端：`server`
- 薄客户端：`client-gui`

浏览器页面只保留服务端控制台，不再提供旧版桌面工作台。

## 1. 服务端控制台

先启动服务端：

```bash
npm install
npm run server:console
```

默认地址：

```text
http://127.0.0.1:8787/
```

控制台可以直接操作这些内容：

- 基础设置
- 服务发现配置
- 规则库 JSON
- 运行时挂载状态
- 存储摘要
- 任务列表与删除
- 客户端迁移状态

如果服务端要对局域网开放：

```bash
npm run server:start:public
```

## 2. 薄客户端

薄客户端通过 HTTP 连接服务端，不直接承担解析和分析。

构建：

```bash
npm run client:build:macos
```

客户端里只需要填写服务端地址，例如：

```text
http://127.0.0.1:8787
```

## 3. 命令行入口

仓库提供统一 `splitall` CLI。安装为 package bin 后可直接调用，也可以通过 npm 脚本调用：

```bash
npm run cli -- health
npm run cli -- --file a.txt --wait
npm run cli -- --path ./local --wait --output-result result.json
```

CLI 对常用 HTTP 接口提供命令别名，并保留通用 RPC 入口：

```bash
npm run cli -- settings get
npm run cli -- jobs list --limit 20
npm run cli -- search --query 合同
npm run cli -- rpc --method GET --path /api/healthz
npm run cli -- rpc-call jobs.list --params '{"limit":20}'
npm run cli -- interfaces --format markdown
npm run cli -- rpc --method PUT --path /api/upload-sessions/id/files/0?offset=0 --raw-file chunk.bin --content-type application/octet-stream
```

`rpc` 支持原始 HTTP 调用参数：`--method`、`--path`、`--body`、`--body-file`、`--raw-file`、`--content-type`、`--header` 和 `--output`。`rpc-call` 调用服务端 JSON-RPC：`POST /api/rpc`。所有命名命令和 HTTP/RPC 映射来自服务端接口注册表。

上传文件或目录时，CLI 复用服务端 upload session、checkpoint、分块上传和任务提交链路。示例：

```bash
npm run cli -- \
  --path ./mail-folder \
  --wait \
  --output-result result.json
```

## 4. 邮件导入

推荐输入：

- 装满 `.eml` 的目录
- 装满 `.eml` 的 `.zip`

服务端会：

- 遍历原始邮件
- 保持原文件名和原文件内容不变
- 计算 `sha256`
- 写入对象存储
- 建立邮件、线程、事务、时间线、人物和检索索引

外部邮箱连接器只作为可选入口处理：有可用配置时显示入口，没有配置时不影响 `.eml` / `.zip` / 文件夹导入主流程。

## 5. 归一化 DOCX 输出

SplitAll 当前定位为外部知识库的解析归一中转层，不在本地追加长期知识库模块。任务完成后可以导出：

- `result.json`：任务分析、邮件/事务结构、源文件审计和归一化 DOCX manifest。
- `normalized-documents/*.docx`：面向阅读、归档和外部知识库摄取的多颗粒度 DOCX 文档。
- `normalized-documents/source-materials/*`：仅对 PPT/PDF/HTML 等允许入库的原始材料保留副本；EML/MSG 原始邮件只保留在 raw object 审计存储中。

Markdown 和旧 `knowledge-package` 导出已移除。图片、图表和版式信息必须在 DOCX 中被嵌入或文本化，不能依赖 Markdown 外部图片地址。

读取归一化 DOCX manifest：

```http
GET /api/jobs/:jobId/normalized-documents
```

下载具体 DOCX 或允许输出的原始材料：

```http
GET /api/jobs/:jobId/normalized-documents/:documentId
```

## 6. 适配拆分 DOCX

任务完成后，服务端会在 job 工作目录生成多颗粒度 DOCX：

```text
<userDataPath>/jobs/<jobId>/normalized-documents/
```

默认策略：

- PPT/PDF/HTML：复制原始材料，并生成 deck/document/page/section/block/slide 等 DOCX。
- EML/MSG：不复制原始邮件到知识库目录，只生成 message/thread/transaction DOCX。
- `manifest.json` 记录每个 DOCX 和允许输出的原始材料，可通过 HTTP、RPC 或 CLI 下载。

CLI 示例：

```bash
npm run cli -- jobs normalized-docs --id JOB_ID
npm run cli -- jobs normalized-doc --id JOB_ID --document-id DOC_ID --output out.docx
```

## 7. 文档解析挂载

服务端主链支持挂载式组件。

核心最小构建：

- `Node`
- `SQLite`
- 原始对象存储
- 邮件事务分析链

可选挂载：

- 文档解析器
- OCR
- 外部解析或分析适配器

默认文档解析主线按 `Tika` 设计。

## 8. 校验

服务端回归：

```bash
npm run server:verify
```

客户端回归：

```bash
npm run client:test
```
