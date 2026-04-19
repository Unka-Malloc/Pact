import { createRuleBasedChunkerAdapter } from "./rule-chunker.mjs";
import { createRuleBasedParserAdapter } from "./rule-parser.mjs";

function deriveDocumentTitle(chunk, index) {
  return chunk.title?.trim() || `知识单元 ${index + 1}`;
}

function deriveDocumentTags(chunk) {
  return [...new Set(chunk.titlePath.filter(Boolean).slice(-3))];
}

export function createKnowledgePipeline({
  parser = createRuleBasedParserAdapter(),
  chunker = createRuleBasedChunkerAdapter()
} = {}) {
  return {
    parser,
    chunker,
    async run(sources, generatedAt) {
      const blocks = [];
      const chunks = [];

      for (const source of sources) {
        if (source.kind === "image") {
          continue;
        }

        const parsedBlocks = await parser.parse(source);
        blocks.push(...parsedBlocks);

        const sourceChunks = await chunker.chunk(source, parsedBlocks);
        chunks.push(...sourceChunks);
      }

      const documents = chunks.map((chunk, index) => ({
        id: `doc-${index + 1}`,
        title: deriveDocumentTitle(chunk, index),
        source: chunk.sourceName,
        content: chunk.content,
        tags: deriveDocumentTags(chunk),
        timestamp: generatedAt,
        chunkIds: [chunk.id]
      }));

      return {
        blocks,
        chunks,
        documents
      };
    }
  };
}
