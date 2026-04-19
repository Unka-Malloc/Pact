import type {
  AgentSettings,
  BridgeResult,
  ExportResultPayload,
  SplitJob,
  RuntimeMode,
  SplitPayload,
  SplitResult
} from "./types";

type Bridge = {
  mode: RuntimeMode;
  getSettings: () => Promise<AgentSettings>;
  saveSettings: (settings: AgentSettings) => Promise<AgentSettings>;
  pickFiles: () => Promise<string[]>;
  pickFolders: () => Promise<string[]>;
  createJob: (payload: SplitPayload) => Promise<SplitJob>;
  getJob: (jobId: string) => Promise<SplitJob | null>;
  getJobResult: (jobId: string) => Promise<SplitResult>;
  exportResult: (payload: ExportResultPayload) => Promise<BridgeResult>;
};

async function extractErrorMessage(response: Response) {
  const rawText = await response.text();

  try {
    const parsed = JSON.parse(rawText);
    return parsed.error || parsed.message || rawText;
  } catch {
    return rawText;
  }
}

async function postJson<T>(url: string, payload?: unknown): Promise<T> {
  const response = await fetch(url, {
    method: payload ? "POST" : "GET",
    headers: payload
      ? {
          "Content-Type": "application/json"
        }
      : undefined,
    body: payload ? JSON.stringify(payload) : undefined
  });

  if (!response.ok) {
    const message = await extractErrorMessage(response);
    throw new Error(message || `Request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

const browserBridge: Bridge = {
  mode: "browser",
  getSettings: () => postJson<AgentSettings>("/api/settings"),
  saveSettings: (settings) => postJson<AgentSettings>("/api/settings", settings),
  pickFiles: async () => [],
  pickFolders: async () => [],
  createJob: (payload) => postJson<SplitJob>("/api/jobs", payload),
  getJob: (jobId) => postJson<SplitJob>(`/api/jobs/${encodeURIComponent(jobId)}`),
  getJobResult: (jobId) =>
    postJson<SplitResult>(`/api/jobs/${encodeURIComponent(jobId)}/result`),
  exportResult: async (payload) => {
    const response = await fetch("/api/export", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const message = await extractErrorMessage(response);
      throw new Error(message || `Export failed: ${response.status}`);
    }

    const blob = await response.blob();
    const contentDisposition = response.headers.get("content-disposition") || "";
    const fileNameMatch = contentDisposition.match(/filename="?([^"]+)"?/i);
    const fileName = fileNameMatch?.[1] || `splitall-export.${payload.format}`;
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");

    anchor.href = objectUrl;
    anchor.download = fileName;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);

    return {
      canceled: false,
      filePath: fileName
    };
  }
};

const electronBridge: Bridge | null =
  typeof window !== "undefined" && window.splitAll
    ? {
        mode: "electron",
        getSettings: () => window.splitAll.getSettings(),
        saveSettings: (settings) => window.splitAll.saveSettings(settings),
        pickFiles: () => window.splitAll.pickFiles(),
        pickFolders: () => window.splitAll.pickFolders(),
        createJob: (payload) => window.splitAll.createJob(payload),
        getJob: (jobId) => window.splitAll.getJob(jobId),
        getJobResult: (jobId) => window.splitAll.getJobResult(jobId),
        exportResult: (payload) => window.splitAll.exportResult(payload)
      }
    : null;

export const bridge = electronBridge || browserBridge;
