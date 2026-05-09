# SplitAll

当前仓库主路径按职责收敛：

- `server`：`Node + SQLite` 服务端
- `server-web`：服务端配套的 `Vue` 控制台
- `client-cli`：`Rust` 客户端执行层
- `client-gui`：`Flutter` 跨端桌面客户端
- `docs`：项目级文档
- `tests`：仓库级测试资产和大型 fixtures
- `build`：本地生成物、运行态数据和打包产物

## 当前页面

- 服务端控制台：`/`
- 主要用途：管理运行时挂载、服务发现、规则库、任务和客户端迁移状态

薄客户端不是浏览器页面，而是 `client-gui` 的跨端桌面程序。

## 启动

安装依赖：

```bash
npm install
```

开发控制台：

```bash
npm run dev
```

启动服务端：

```bash
npm run server:start
```

一键启动控制台和服务端：

```bash
npm run server:console
```

本地运行时依赖采用程序目录内 `server/platform/modules/knowledge/` 资产，不向系统安装 Java/Tika：

```bash
npm run server:setup-runtime
```

构建控制台静态资源：

```bash
npm run build:renderer
```

安装 Flutter 客户端依赖：

```bash
npm run client:get
```

分析和测试 Flutter 客户端：

```bash
npm test
npm run client:analyze
npm run client:test
npm run client:native:test
```

本机构建 macOS 客户端：

```bash
npm run client:build:macos
```

命令行调用服务端：

```bash
npm run cli -- health
npm run cli -- --file a.txt --wait
npm run cli -- --path ./mail-folder --wait --output-result result.json
npm run cli -- jobs normalized-docs --id JOB_ID
npm run cli -- jobs normalized-doc --id JOB_ID --document-id DOC_ID --output out.docx
npm run cli -- rpc --method GET --path /api/healthz
npm run cli -- rpc-call jobs.list --params '{"limit":20}'
npm run cli -- interfaces --format markdown
npm run cli -- rpc --method POST --path /api/settings --body settings.json
```

## 当前能力

- 批量导入 `.eml` 文件夹或 `.zip`
- 原始邮件对象存储，保留原标题和原内容
- `SQLite` 元数据分表与检索索引
- 邮件线程、事务、时间线、参与人归纳
- 大批量 `.eml` 目录的纯算法事务工程模型、接续索引与事务 DOCX 证据文档
- PPT/PDF/HTML/邮件适配拆分为多颗粒度 DOCX 知识文档
- 事务 lineage 的匹配、恢复、拉取
- 上传与任务 checkpoint 恢复
- 注册式 HTTP / JSON-RPC / CLI 接口映射
- `splitall` CLI 覆盖文件/目录上传、任务轮询、归一化文档下载、通用 HTTP 调用和 JSON-RPC 调用
- 服务发现、客户端迁移登记与控制台观测
- Tika 挂载式文档解析与可选 OCR 挂载

## 目录

- [SERVER.md](/Users/unka/DevSpace/Unka-Malloc/splitall/docs/SERVER.md)：服务端启动与接口
- [USAGE.md](/Users/unka/DevSpace/Unka-Malloc/splitall/docs/USAGE.md)：控制台和薄客户端使用方式
- [client-gui/README.md](/Users/unka/DevSpace/Unka-Malloc/splitall/client-gui/README.md)：Flutter 客户端构建与运行

## 验证

```bash
npm test
npm run test:regression
npm run test:security
npm run test:list
```

统一测试框架见 [TEST-FRAMEWORK.md](/Users/unka/DevSpace/Unka-Malloc/splitall/docs/TEST-FRAMEWORK.md)。新增功能或重构时，必须同步更新对应层级的单元、契约、集成或平台测试。
