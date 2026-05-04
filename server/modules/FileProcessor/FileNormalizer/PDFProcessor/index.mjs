import { extractDocumentWithTika, isTikaBackedDocument } from "../Tika/tika.mjs";
import {
  importFileDescriptorForExtension,
  importFileDescriptorForMediaType,
  mediaTypeForImportExtension
} from "../../import-file-types.mjs";

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

      const document = await extractDocumentWithTika({
        ...input,
        mediaTypeHint
      });

      return {
        ...document,
        parserId: "builtin/pdf-processor",
        pipeline: ["pdfProcessor", document.parserId || "builtin/tika"]
      };
    },
    async close() {}
  };
}
