import { bridge } from "./bridge";

export type RuntimeDependency = {
  id: string;
  label: string;
  category?: string;
  description?: string;
  status: string;
  present?: boolean;
  cached?: boolean;
  downloadable?: boolean;
  children?: RuntimeDependency[];
  detection?: Record<string, unknown>;
  actions?: Record<string, unknown>;
  accepts?: Record<string, boolean>;
};

export type RuntimeDependencyListResponse = {
  ok: boolean;
  generatedAt?: string;
  cacheRoot?: string;
  sourceConfigPath?: string;
  triggerMode?: string;
  dependencies?: RuntimeDependency[];
  summary?: Record<string, number>;
};

export type RuntimeDependencyActionResult = {
  ok: boolean;
  targetId?: string;
  status?: string;
  reason?: string;
  mirrorHint?: string;
  sourceConfigPath?: string;
  detection?: RuntimeDependency;
  results?: RuntimeDependencyActionResult[];
};

export function statusLabel(status = "") {
  const labels: Record<string, string> = {
    present: "已存在",
    installed: "安装成功",
    failed: "安装失败",
  };
  return labels[status] || status || "未知";
}

export function statusTone(status = "") {
  if (status === "present" || status === "installed") return "success";
  if (status === "failed") return "danger";
  return "neutral";
}

export function childSummary(item: RuntimeDependency) {
  const children = item.children || [];
  if (!children.length) return "";
  return children.map((child) => `${child.label}: ${statusLabel(child.status)}`).join(" / ");
}

export function sourceHint(item: RuntimeDependency) {
  const detection = item.detection || {};
  const policy = String(detection.sourcePolicy || "");
  if (policy) return policy;
  return item.downloadable ? "检测本机后按本地源配置安装" : "检测本机连接状态";
}

export function canTrigger(item: RuntimeDependency) {
  return item.downloadable !== false && item.status !== "present";
}

export function dependencyDownloadPayload(item: RuntimeDependency) {
  return { targetId: item.id };
}

export function listRuntimeDependencies(): Promise<RuntimeDependencyListResponse> {
  return bridge.listRuntimeDependencies() as Promise<RuntimeDependencyListResponse>;
}

export function downloadRuntimeDependency(item: RuntimeDependency): Promise<RuntimeDependencyActionResult> {
  return bridge.downloadRuntimeDependency(dependencyDownloadPayload(item)) as Promise<RuntimeDependencyActionResult>;
}
