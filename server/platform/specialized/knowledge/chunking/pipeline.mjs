import { createRuleBasedChunkerAdapter } from "./rule-chunker.mjs";
import { createRuleBasedParserAdapter } from "./rule-parser.mjs";

export function createKnowledgePipeline({
  parser = createRuleBasedParserAdapter(),
  chunker = createRuleBasedChunkerAdapter()
} = {}) {
  return {
    parser,
    chunker,
    async run(sources) {
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

      return {
        blocks,
        chunks
      };
    }
  };
}
