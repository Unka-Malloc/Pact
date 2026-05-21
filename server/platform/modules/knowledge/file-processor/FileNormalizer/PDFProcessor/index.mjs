import { extractDocumentWithTika, isTikaBackedDocument } from "../Tika/tika.mjs";
import { extractPdfVisualElements } from "./pdf-visual.mjs";
import {
  importFileDescriptorForExtension,
  importFileDescriptorForMediaType,
  mediaTypeForImportExtension
} from "../../../../../specialized/knowledge/preprocessing/file-processor/import-file-types.mjs";

export function createPdfProcessorMount() {
  return {
    id: "builtin/pdf-processor",
    kind: "pdfProcessor",
    enabled: true,
    supports({ extension = "", mediaTypeHint = "" } = {}) {
      const descriptor =
        importFileDescriptorForExtension(extension) ||
        importFileDescriptorForMediaType(mediaTypeHint);
      return descriptor?.kind === "pdf";
    },
    async extractDocument(input) {
      const extension = String(input?.extension || "").trim() ||
        (importFileDescriptorForMediaType(input?.mediaTypeHint)?.extension || "");
      const mediaTypeHint =
        input?.mediaTypeHint ||
        mediaTypeForImportExtension(extension);
      if (!isTikaBackedDocument({ extension, mediaTypeHint })) {
        throw new Error("PDFProcessor 未配置可用的 Tika 入口。");
      }

      let document = {
        parserId: "",
        metadata: {},
        text: "",
        embeddedDocuments: []
      };
      const warnings = [];
      try {
        document = await extractDocumentWithTika({
          ...input,
          mediaTypeHint
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "未知错误";
        warnings.push(`PDF Tika 文本解析失败，已尝试使用 PDF 视觉解析降级：${message}`);
      }
      let visual = {
        visualElements: [],
        text: "",
        warnings: []
      };

      try {
        visual = await extractPdfVisualElements({
          ...input,
          mediaTypeHint
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "未知错误";
        visual = {
          visualElements: [],
          warnings: [`PDF 视觉元素解析未启用或失败：${message}`]
        };
      }

      return {
        ...document,
        parserId: "builtin/pdf-processor",
        text: document.text || visual.text || "",
        pipeline: [
          "pdfProcessor",
          document.parserId || "builtin/pdf-visual-text",
          visual.parserId || "builtin/pdf-visual-extractor"
        ],
        visualElements: visual.visualElements || [],
        warnings: [...warnings, ...(visual.warnings || [])],
        metadata: {
          ...(document.metadata || {}),
          "X-SplitAll:pdfVisualPageCount": visual.pageCount || 0,
          "X-SplitAll:pdfVisualImageCount": visual.imageCount || 0,
          "X-SplitAll:pdfVisualTableCount": visual.tableCount || 0
        }
      };
    },
    async close() {}
  };
}
