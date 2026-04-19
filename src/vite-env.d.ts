/// <reference types="vite/client" />

import type {
  AgentSettings,
  BridgeResult,
  ExportResultPayload,
  SplitJob,
  SplitPayload,
  SplitResult
} from "./lib/types";

declare global {
  interface Window {
    splitAll: {
      getSettings: () => Promise<AgentSettings>;
      saveSettings: (settings: AgentSettings) => Promise<AgentSettings>;
      pickFiles: () => Promise<string[]>;
      pickFolders: () => Promise<string[]>;
      createJob: (payload: SplitPayload) => Promise<SplitJob>;
      getJob: (jobId: string) => Promise<SplitJob | null>;
      getJobResult: (jobId: string) => Promise<SplitResult>;
      exportResult: (payload: ExportResultPayload) => Promise<BridgeResult>;
    };
  }
}

export {};
