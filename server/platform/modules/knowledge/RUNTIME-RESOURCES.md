这里是本地打包时使用的 Tika、JRE 和 full-local OCR 运行时目录。
它们属于本地制品资产，默认**不进入 GitHub 源码仓**。
这些运行时必须放在程序目录内使用，不应依赖系统级安装。

源码仓只保留目录约定和说明文件，不保留这些大文件本体：

- `server/platform/modules/knowledge/tika/tika-app-3.2.3.jar`
- `server/platform/modules/knowledge/runtime/jre/<platform-arch>/bin/java`
- `server/platform/modules/knowledge/ocr/runtime/<platform-arch>/...`

平台目录名按 `process.platform-process.arch` 约定，例如：

- `darwin-arm64`
- `linux-x64`
- `linux-arm64`
- `win32-x64`

源码仓里会保留这些平台目录名约定：

- `darwin-arm64`
- `linux-x64`
- `linux-arm64`
- `win32-x64`

`server/platform/modules/knowledge/ocr/runtime/` 也沿用同一套目录名，但源码仓默认只放空目录和说明文件。
如果你要打 full-local 版本，需要先在本地把对应平台的 Python + PaddleOCR/PaddlePaddle 运行时放进去。

打包时不会把临时下载缓存带进去，且会按目标平台挑选对应的 JRE / OCR runtime 目录。

如果你要替换成自己的运行时，也可以继续沿用这个目录约定；如果不走默认目录，也可以在应用设置里手工填写：

- `Tika JAR 路径`
- `Java 路径`
- `OCR Python 路径`
