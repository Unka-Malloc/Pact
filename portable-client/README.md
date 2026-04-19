# SplitAll Portable Client

一个基于 `Rust + Slint` 的薄客户端。

云端与本地能力边界见 [CLOUD-BOUNDARY.md](/Users/unka/DevSpace/Unka-Malloc/splitall/CLOUD-BOUNDARY.md)。

目标：

- `Portable` 分发
- 本地只做配置、选材、上传、轮询、导出
- 不再内置 `Electron / Chromium / Tika / JRE`
- OCR、图文理解、知识整理、问答生成以上云端能力为主

## 当前能力

- 本地保存连接配置
- 粘贴文本
- 选择文件
- 选择文件夹并递归展开支持的文件
- 提交远端任务：`POST /api/jobs`
- 轮询远端任务：`GET /api/jobs/:id`
- 获取结果：`GET /api/jobs/:id/result`
- 导出结果：`POST /api/export`

## 便携目录

客户端现在优先把数据写到程序旁边的 `portable-data/`：

- `portable-data/settings.json`：连接配置
- `portable-data/exports/`：建议的默认导出目录

如果程序目录不可写，才会回退到系统用户目录。也可以通过环境变量
`SPLITALL_PORTABLE_DIR` 强制指定数据目录。

## 本地构建

```bash
source "$HOME/.cargo/env"
cd portable-client
cargo build --release
```

产物：

- macOS 本地验证二进制：`target/release/portable-client`

## Portable 打包

从仓库根目录执行：

```bash
npm run portable:build
```

这会：

- 构建当前 host 平台的 release 二进制
- 在 `release/portable-client/<platform-arch>/` 下生成分发目录
- 自动附带 `portable-data/`
- 尽量同时生成 `zip`，非 Windows 还会额外生成 `tar.gz`

常用目标：

```bash
npm run portable:build:win
npm run portable:build:linux:x64
npm run portable:build:linux:arm64
```

这些命令要求本机已经装好对应 Rust target 和交叉链接环境。

## 当前体积

当前在这台 `macOS arm64` 机器上实测：

- release 二进制：约 `4.8 MB`
- zip / tar.gz 便携包：约 `2.7 MB`

这只是当前平台的实测值，不等于 Windows / 麒麟最终值，但已经说明这条路线离 `50MB` 约束很远。

## 服务协议

客户端当前按现有 SplitAll HTTP 协议对接：

- `POST /api/jobs`
- `GET /api/jobs/:id`
- `GET /api/jobs/:id/result`
- `POST /api/export`

任务提交体仍然沿用旧字段：

```json
{
  "inputText": "粘贴文本",
  "filePaths": [],
  "uploadedFiles": [
    {
      "name": "example.docx",
      "mediaType": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "dataBase64": "...",
      "relativePath": "docs/example.docx"
    }
  ],
  "settings": {
    "apiBaseUrl": "https://api.openai.com/v1",
    "apiKey": "",
    "model": "gpt-4.1-mini",
    "systemPrompt": "..."
  }
}
```

## 下一步

- 在 Windows 上本机构建 `x64` portable
- 在麒麟 V10 / `aarch64` 环境构建并验证
- 视远端服务稳定性，再决定是否收缩客户端设置项
