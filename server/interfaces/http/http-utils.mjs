import fs from "node:fs/promises";
import path from "node:path";

const CONTENT_TYPES = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "application/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".ico", "image/x-icon"]
]);

export function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(JSON.stringify(payload));
}

export function normalizeBaseUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

export function parseBooleanFlag(value) {
  return value === "1" || value === "true" || value === "yes";
}

export function parseEntityTypes(searchParams) {
  return searchParams
    .getAll("entityType")
    .flatMap((value) => String(value || "").split(","))
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

export function contentDispositionFileName(value) {
  return String(value || "download.bin").replace(/["\r\n]/g, "_");
}

export async function readRequestBody(request) {
  const chunks = [];

  for await (const chunk of request) {
    chunks.push(chunk);
  }

  return Buffer.concat(chunks);
}

export async function readJsonBody(request) {
  const raw = await readRequestBody(request);
  if (raw.length === 0) {
    return {};
  }

  return JSON.parse(raw.toString("utf8"));
}

export async function serveStaticFile(response, distPath, pathname) {
  if (!distPath) {
    return false;
  }

  const normalizedPath = pathname === "/" || pathname === "/console" ? "/index.html" : pathname;
  const relativePath = path
    .normalize(normalizedPath)
    .replace(/^(\.\.(\/|\\|$))+/, "")
    .replace(/^[/\\]+/, "");
  const filePath = path.join(distPath, relativePath);

  try {
    const stats = await fs.stat(filePath);
    if (!stats.isFile()) {
      throw new Error("Not a file");
    }

    const extension = path.extname(filePath).toLowerCase();
    const contentType = CONTENT_TYPES.get(extension) || "application/octet-stream";
    const buffer = await fs.readFile(filePath);

    response.writeHead(200, {
      "Content-Type": contentType,
      "Cache-Control": extension === ".html" ? "no-store" : "public, max-age=31536000"
    });
    response.end(buffer);
    return true;
  } catch {
    return false;
  }
}

export function defaultAdvertisedHost(host) {
  if (!host || host === "0.0.0.0") {
    return "127.0.0.1";
  }

  if (host === "::") {
    return "::1";
  }

  return host;
}

export function formatUrlHost(host) {
  return host.includes(":") ? `[${host}]` : host;
}
