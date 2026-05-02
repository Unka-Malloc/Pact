# FileProcessor

运行代码中的文件处理模块。

模块职责：

- `server/config/default-import-file-types.json` 定义可导入文件、编程语言后缀词典、媒体类型、默认路由和归一化策略。
- `file-routing-table.mjs` 从导入文件类型词典派生默认文件类型路由，不再维护硬编码后缀列表。
- `FileNormalizer/Tika/tika.mjs` 封装 Tika 入口，只读使用 Tika jar 和 JRE。
- `FileNormalizer/OCR/paddle-ocr.mjs` 封装 OCR 入口。
- `FileNormalizer/PDFProcessor/index.mjs` 封装 PDF 专用处理入口。
- `FileNormalizer/NormalizedDocuments` 生成 normalized DOCX 和 manifest。
- `index.mjs` 负责收集输入、展开压缩包、调用路由和生成 source records。

协议不放在本目录；通信断点续传不放在本目录。
