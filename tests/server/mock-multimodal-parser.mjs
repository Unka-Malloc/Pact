export function createMount() {
  return {
    id: "test/mock-multimodal-parser",
    kind: "multimodalParser",
    enabled: true,
    async extractDocument({ fileName = "", mediaTypeHint = "", sourceKind = "" }) {
      return {
        parserId: "test/mock-multimodal-parser",
        text: `[multimodal] ${fileName || sourceKind || "image"}`.trim(),
        metadata: {
          "Content-Type": mediaTypeHint || "image/png",
          "X-Multimodal-Route": "enabled"
        },
        embeddedDocuments: []
      };
    },
    async extractText(input) {
      const result = await this.extractDocument(input);
      return result.text;
    },
    async close() {}
  };
}
