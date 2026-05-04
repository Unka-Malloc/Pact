import fs from "node:fs/promises";
import path from "node:path";

export function createMount({ mountName, userDataPath }) {
  return {
    id: `tests/server/mock-${mountName}`,
    kind: mountName,
    enabled: true,
    async onBatchCompleted({ batchId, result }) {
      const recordPath = path.join(userDataPath, `postcommit-${mountName}.json`);
      await fs.writeFile(
        recordPath,
        JSON.stringify(
          {
            mountName,
            batchId,
            itemCount: result.knowledge?.items?.length || 0,
            chunkCount: result.knowledge?.chunks?.length || 0,
            graphNodeCount: result.knowledge?.graph?.nodes?.length || 0,
            graphEdgeCount: result.knowledge?.graph?.edges?.length || 0
          },
          null,
          2
        ),
        "utf8"
      );
    },
    async close() {}
  };
}
