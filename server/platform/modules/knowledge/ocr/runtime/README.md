这里是本地服务部署使用的 OCR 运行时目录。

目录约定沿用 `process.platform-process.arch`：

- `darwin-arm64`
- `linux-x64`
- `linux-arm64`
- `win32-x64`

每个平台目录里至少要放进一个可直接执行的 Python，并且这个 Python 环境已经安装好：

- `paddleocr`
- `paddlepaddle`

当前打包脚本会按下列候选路径检查：

- macOS / Linux
  - `server/platform/modules/knowledge/ocr/runtime/<platform-arch>/bin/python3`
  - `server/platform/modules/knowledge/ocr/runtime/<platform-arch>/bin/python`
  - `server/platform/modules/knowledge/ocr/runtime/<platform-arch>/python/bin/python3`
  - `server/platform/modules/knowledge/ocr/runtime/<platform-arch>/.venv/bin/python`
  - `server/platform/modules/knowledge/ocr/runtime/<platform-arch>/venv/bin/python`
- Windows
  - `server/platform/modules/knowledge/ocr/runtime/<platform-arch>/python.exe`
  - `server/platform/modules/knowledge/ocr/runtime/<platform-arch>/Scripts/python.exe`
  - `server/platform/modules/knowledge/ocr/runtime/<platform-arch>/.venv/Scripts/python.exe`
  - `server/platform/modules/knowledge/ocr/runtime/<platform-arch>/venv/Scripts/python.exe`

如果这些路径都不存在，服务端 OCR sidecar 将无法启动。

建议把模型和依赖一并预装进这个运行时；否则首次运行时去下载模型，会破坏“全本地自带环境”的目标。
