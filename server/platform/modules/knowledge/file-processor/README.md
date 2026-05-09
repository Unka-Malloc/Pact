# FileProcessor adapters

本目录只存放文件处理需要的外置解析适配器。

- `FileNormalizer/Tika`：Tika/JRE 文档解析适配。
- `FileNormalizer/OCR`：PaddleOCR 运行时适配。
- `FileNormalizer/PDFProcessor`：依赖 Tika 的 PDF 专用适配。

知识库内部文件处理逻辑位于 `server/platform/specialized/knowledge/file-processor`。
