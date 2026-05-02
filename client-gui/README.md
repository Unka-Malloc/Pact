# SplitAll Flutter Client

基于 `Flutter` 的跨端桌面客户端，目标平台：

- `macOS`
- `Windows`
- `Ubuntu / Linux`

当前界面以 Stitch 设计稿 `SplitAll Console` 为参照，采用统一的控制台式信息架构：

- 左侧主导航
- 顶部连接栏
- `Dashboard / Export / Logs` 顶部标签
- `Input Processor / Saved States / File Queue / Active Operations / Export Pipeline / Operational Summary / Work Safety`

## 当前协议

当前 Flutter 客户端先对接稳定的 HTTP 基线协议：

- `GET /api/bootstrap`
- `POST /api/discovery/check-in`
- `POST /api/jobs`
- `GET /api/jobs/:id`
- `GET /api/jobs/:id/result`
- `POST /api/export`

首版先采用内联 `uploadedFiles[].dataBase64` 的任务提交方式，优先把跨端桌面壳和 Stitch 对齐版 UI 跑通。

## macOS Mail 导入

macOS 客户端内置 Mail.app 导入入口。点击“从 Mail 导入”后，客户端会请求系统 Automation 权限，从 Mail.app 读取本机可见邮箱，并把原始邮件源码导出为 `.eml` 文件加入现有上传队列。

导出的 `.eml` 保存在客户端便携数据目录的 `mail-imports/` 下，随后复用现有检查点、分块上传和任务提交流程。

每次导入都会在对应 `mail-imports/mail-*/diagnostics.json` 写入扫描账号数、邮箱数、邮件数、导出数、失败数和最后一个脚本错误。客户端操作日志会持久写入 `portable-data/logs/client.log`。

## 可恢复运行

客户端按 local-first 运行。服务端不可达时，前端仍可添加文件、导入 Mail、本地检索和提交任务；提交任务会先落入 Rust 后台上传队列。网络型错误会显示为可恢复队列状态，后台按指数退避自动重试，服务端恢复后继续使用原 checkpoint、manifest 和已上传 offset 接续。

服务端发布-订阅事件由 Rust 后台持久化 cursor 后同步到本地事件日志。服务端宕机期间客户端不清空本地状态；恢复后从上次 `nextCursor` 继续消费。

## 服务端能力对齐

客户端“服务”页通过 Rust CLI/daemon 调用 `server.api`，从服务端 `/api/interfaces` 拉取接口注册表，并按 feature、HTTP、RPC、风险和权限展示。这个页面不是硬编码单个服务端功能；服务端新增注册接口后，客户端可以重新同步并直接通过通用 HTTP JSON 调用面板访问。

命令行也可以直接调用服务端 API：

```bash
splitall-client server api GET /api/runtime/info
splitall-client server api POST /api/knowledge/reindex '{"wait":true}' http://127.0.0.1:3000
```

## 本地开发

```bash
cd client-gui
flutter pub get
flutter analyze
flutter test
flutter run -d macos
```

## 构建

客户端构建使用 `client-gui/packaging.modules.json` 决定打包哪些模块。默认包会包含 Flutter 前端、Rust CLI、Rust daemon、上传队列、断点续传、本地知识库镜像、智能体注册表、专家词汇、邮件索引和知识图谱 UI；macOS 还会在启用 `macos-mail-import` 时预编译 `splitall-macos-mail-tool`。服务端模块资源默认不随客户端打包，需要时把对应 `server.*` 模块的 `enabled` 改为 `true`。

查看当前打包计划：

```bash
npm run client:package:plan
```

临时覆盖模块选择：

```bash
node client-gui/scripts/package-client.mjs --platform macos --without macos-mail-import
node client-gui/scripts/package-client.mjs --platform linux --with server.FileProcessor,server.KnowledgeCore
```

macOS：

```bash
npm run client:build:macos
```

Windows：

```bash
npm run client:build:windows
```

Linux：

```bash
npm run client:build:linux
```

说明：

- `Windows` 构建需要在 Windows 环境执行
- `Linux` 构建需要在 Linux / Ubuntu 环境执行
- `npm run client:build:*` 会先按模块配置构建需要的 native sidecar，再执行
  Flutter release build，最后把启用模块的二进制、资源目录和
  `portable-data/backend/packaging-modules.json` 写入 bundle
- `npm run client:linux:smoke` 会验证 Linux bundle 内的 CLI、daemon、
  打包模块清单、共享工作区和专家词汇热更新索引链路
- `npm run client:linux:gui-smoke` 会在 Linux 环境用 Xvfb 启动桌面
  bundle，验证窗口、中文字体、截图和基础鼠标/键盘交互
- macOS 主机可用 `npm run client:ubuntu:verify` 通过 Docker 启动 Ubuntu
  验证环境，完整执行 Flutter 分析/测试、native backend 测试、Linux
  构建、bundle smoke 和 GUI smoke
- 本仓库当前已在 `macOS` 上完成 `analyze / test / build macos` 验证
