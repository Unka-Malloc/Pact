import { runEmailAnalysis } from "../../server/platform/specialized/knowledge/domain/rules/email-analysis.mjs";

const modules = [
  {
    id: "mock:hybrid-module",
    label: "Mock Hybrid Module",
    description: "Test hybrid analysis module used to verify backend routing.",
    executionMode: "hybrid"
  },
  {
    id: "mock:agent-only-module",
    label: "Mock Agent-only Module",
    description: "Test agent-only module used to verify hot config switching.",
    executionMode: "agent-only"
  }
];

export function createAnalysisMount() {
  return {
    id: "tests/server/mock-analysis-engine",
    kind: "analysis",
    enabled: true,
    modules,
    async listModules() {
      return modules;
    },
    async runModule({ moduleId, sources, chunks, settings, generatedAt, rules }) {
      if (!modules.some((item) => item.id === moduleId)) {
        throw new Error(`Unsupported mock analysis module: ${moduleId}`);
      }

      const analysis = runEmailAnalysis({
        sources,
        chunks,
        settings,
        generatedAt,
        rules
      });

      return {
        ...analysis,
        overview: {
          ...analysis.overview,
          summary: `${analysis.overview.summary || ""} [${moduleId}]`.trim()
        }
      };
    },
    async close() {}
  };
}
