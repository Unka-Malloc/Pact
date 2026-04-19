# SplitAll Desktop

当前仓库已经开始转向新的轻量客户端实现，见 [portable-client/README.md](/Users/unka/DevSpace/Unka-Malloc/splitall/portable-client/README.md)。
它基于 `Rust + Slint`，目标是替代当前过重的 `Electron + Tika/JRE` 客户端。
如果现在要继续往目标方向推进，优先使用这个轻量客户端，而不是继续扩展 Electron 包。

当前“哪些能力必须上云端”的边界已经单独记录在 [CLOUD-BOUNDARY.md](/Users/unka/DevSpace/Unka-Malloc/splitall/CLOUD-BOUNDARY.md)。

## GitHub 协同

这个仓库按“源码仓”管理：

- 只上传源码、配置、脚本和文本文档
- 不上传 `node_modules/`、`dist/`、`release/`
- 不上传 `portable-client/target/`
- 不上传 `.splitall-local-data/` 等本地任务数据
- 不上传 `vendor/jre/`、`vendor/tika/*.jar`、`vendor/ocr-runtime/` 里的二进制运行时

GitHub 上保留的是协同开发所需的源码，不是可直接离线运行的全量制品仓。
如果要打 full-local 包，需要先在本地按 [vendor/README.md](/Users/unka/DevSpace/Unka-Malloc/splitall/vendor/README.md) 补齐运行时资产。
协作清理细则见 [GIT-COLLAB.md](/Users/unka/DevSpace/Unka-Malloc/splitall/GIT-COLLAB.md)。

便携客户端可直接从仓库根目录构建：

```bash
npm run portable:build
```

一个自带运行时的跨平台桌面应用，用来把粘贴文本或本地文件拆分成：

- 带时间戳的最小知识文档
- 带时间戳的模拟问答对
- 可导出的 `JSON`、`Markdown`、`DOCX`

它基于 `Electron + React`，因此目标机器不需要预装 Node、Python、浏览器运行时。打包产物会把 Chromium 与 Node 一并带上，适合 Windows 和麒麟 V10 这类 Linux 发行版。

完整使用说明见：[USAGE.md](/Users/unka/DevSpace/Unka-Malloc/splitall/USAGE.md)

## 启动模式

- `desktop`：默认 Electron 桌面窗口模式，自带 Chromium 运行时。
- `browser`：由应用启动本地 HTTP 服务，再拉起奇安信浏览器访问本机页面。

浏览器模式下，页面仍由本应用本地提供，文件处理、导出和云端调用都走同一套后端逻辑。

## 功能

- 本机页面输入：文本粘贴、文件选择、文件夹选择、文件/文件夹拖拽
- 云端智能体调用：默认按 OpenAI 兼容 `/chat/completions` 接口接入
- 文件解析：文本、Markdown、CSV、JSON、内置 Tika 的 Office/PDF/邮件类文档、常见图片
- OCR 策略：以云端视觉智能体为主；本地 PaddleOCR 只作为可选兜底
- 目录导入：支持递归扫描文件夹，自动抓取可解析文档类型，忽略不支持的文件
- 规则切分管线：先解析 block，再按规则生成 chunk，再交给智能体补强
- 异步后台任务：提交后进入本地任务队列，前端轮询状态，不阻塞界面
- 结构化输出：最小知识单元 + 模拟问答对
- 导出：`JSON`、`Markdown`、`Word (.docx)`
- 时间戳：所有知识文档和问答对均带 ISO-8601 时间戳
- 图文流：当源材料包含图片时，导出的 Word 会附带原图附件段落
- 双启动：可直接启动 Electron，也可用 `--browser` 拉起奇安信浏览器
- 浏览器指定：可在应用设置中填写奇安信浏览器路径与启动参数

## 内部管线

当前处理链：

1. `electron/file-ingest.mjs` 负责读取文件和提纯内容
   文档提取优先走 `electron/tika.mjs`
2. `electron/chunking/rule-parser.mjs` 负责把文本转成结构 block
3. `electron/chunking/rule-chunker.mjs` 负责把 block 切成稳定 chunk
4. `electron/chunking/pipeline.mjs` 负责组合 parser/chunker 并生成基础知识文档
5. `electron/agent.mjs` 基于 chunk 和基础文档生成最终文档与问答
6. `electron/job-runner.mjs` 负责单次任务执行
7. `electron/jobs/job-manager.mjs` 负责异步队列、worker 进程和结果持久化

这套接口是为后续替换成 `LangChain`、`Docling`、`Chonkie` 之类的外部框架预留的。

## 开发

```bash
npm install
npm run dev
```

奇安信浏览器模式：

```bash
npm run browser
```

## 打包

```bash
npm run bundle:linux
npm run bundle:win
```

也可以直接：

```bash
npm run bundle
```

如果要做“全本地重版”，也就是把 `Electron + Tika + JRE17 + PaddleOCR` 都打进本地：

```bash
npm run bundle:full-local:mac
npm run bundle:full-local:linux:x64
npm run bundle:full-local:linux:arm64
npm run bundle:full-local:win
```

这组脚本会先检查：

- `vendor/tika/tika-app-3.2.3.jar`
- `vendor/jre/<platform-arch>/bin/java`
- `vendor/ocr-runtime/<platform-arch>/...` 下是否存在可执行 Python

缺任意一项都会直接报错，不会生成一个缺运行时的假包。

## 交付建议

- Windows：交付 `nsis` 安装包和 `portable` 免安装版。
- 麒麟 V10：优先交付 `AppImage`，同时保留 `deb` 安装包。
- 如果需要直接进入奇安信浏览器模式，可在启动参数中传 `--browser`。

## 注意

- 该项目已经把桌面运行时打进应用，但 Linux 仍会依赖操作系统自己的基础内核和 glibc，这属于 Electron 桌面应用的正常边界。
- GitHub 源码仓默认不包含 `tika-app-3.2.3.jar`、JRE 和 PaddleOCR Python 运行时；这些都属于本地或私有制品仓资产。
- 运行时目录仍按 `darwin-arm64`、`linux-x64`、`linux-arm64`、`win32-x64` 约定；需要时本地自行放入 `vendor/`。
- 打包配置已经按平台收口：Windows 包只带 `win32-x64`，macOS 包只带 `darwin-arm64`，Linux 包带 `linux-x64` 与 `linux-arm64`，避免所有平台运行时一起进同一个安装包。
- “Tika JAR 路径”和“Java 路径”设置项仍然保留，主要用于替换成你们自己的 Tika/JRE，默认情况下不需要填写。
- PaddleOCR 通过 Python sidecar 接入，配置说明见 [ocr/README.md](/Users/unka/DevSpace/Unka-Malloc/splitall/ocr/README.md)；默认不会打进便携薄客户端，也不应作为核心 OCR 依赖。
- 如果要打 full-local 版，PaddleOCR 运行时要预先放进 `vendor/ocr-runtime/<platform-arch>/`；目录约定见 [vendor/ocr-runtime/README.md](/Users/unka/DevSpace/Unka-Malloc/splitall/vendor/ocr-runtime/README.md)。
- 如果你要稳定处理图文混合材料，请选用支持视觉输入的云端模型。
- `bundle:win` 最稳妥的做法是在 Windows 或 CI 的 Windows Runner 上执行；`bundle:linux` 最稳妥的做法是在 Linux 或 CI 的 Linux Runner 上执行。
- 浏览器模式会优先使用你在设置里填写的奇安信浏览器路径；留空时，程序会尝试常见可执行文件名和常见安装目录。
- 麒麟 V10 上，如果奇安信浏览器要求禁用 sandbox，可在“奇安信浏览器参数”里保留 `--no-sandbox`。
