# FileProcessor

运行代码中的文件处理模块。

模块职责：

- `server/config/default-import-file-types.json` 定义可导入文件、编程语言后缀词典、媒体类型、默认路由和归一化策略。
- `file-routing-table.mjs` 从导入文件类型词典派生默认文件类型路由，不再维护硬编码后缀列表。
- `FileNormalizer/NormalizedDocuments` 生成 normalized DOCX 和 manifest。
- `index.mjs` 负责收集输入、展开压缩包、调用路由和生成 source records。

外置解析适配器不放在本目录：

- `server/platform/modules/knowledge/file-processor/FileNormalizer/Tika`
- `server/platform/modules/knowledge/file-processor/FileNormalizer/OCR`
- `server/platform/modules/knowledge/file-processor/FileNormalizer/PDFProcessor`

协议不放在本目录；通信断点续传不放在本目录。
