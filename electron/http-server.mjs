import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { buildResultArtifact } from "./exporters.mjs";
import { loadSettings, saveSettings } from "./config.mjs";
import { createJobManager } from "./jobs/job-manager.mjs";

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

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(JSON.stringify(payload));
}

async function readJsonBody(request) {
  const chunks = [];

  for await (const chunk of request) {
    chunks.push(chunk);
  }

  if (chunks.length === 0) {
    return {};
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function serveStaticFile(response, distPath, pathname) {
  const normalizedPath = pathname === "/" ? "/index.html" : pathname;
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
    const contentType =
      CONTENT_TYPES.get(extension) || "application/octet-stream";
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

export async function startLocalHttpServer({
  userDataPath,
  distPath,
  jobManager: incomingJobManager
}) {
  const jobManager = incomingJobManager || createJobManager({ userDataPath });
  const ownsJobManager = !incomingJobManager;
  const server = http.createServer(async (request, response) => {
    try {
      const method = request.method || "GET";
      const url = new URL(request.url || "/", "http://127.0.0.1");
      const jobResultMatch = url.pathname.match(/^\/api\/jobs\/([^/]+)\/result$/);
      const jobMatch = url.pathname.match(/^\/api\/jobs\/([^/]+)$/);

      if (method === "GET" && url.pathname === "/api/settings") {
        const settings = await loadSettings(userDataPath);
        sendJson(response, 200, settings);
        return;
      }

      if (method === "POST" && url.pathname === "/api/settings") {
        const settings = await readJsonBody(request);
        const saved = await saveSettings(userDataPath, settings);
        sendJson(response, 200, saved);
        return;
      }

      if (method === "POST" && url.pathname === "/api/jobs") {
        const payload = await readJsonBody(request);
        const job = await jobManager.createJob({
          ...payload,
          settings: payload.settings || {}
        });

        sendJson(response, 202, job);
        return;
      }

      if (method === "GET" && jobMatch) {
        const jobId = decodeURIComponent(jobMatch[1]);
        const job = await jobManager.getJob(jobId);

        if (!job) {
          sendJson(response, 404, {
            error: "任务不存在。"
          });
          return;
        }

        sendJson(response, 200, job);
        return;
      }

      if (method === "GET" && jobResultMatch) {
        const jobId = decodeURIComponent(jobResultMatch[1]);
        const job = await jobManager.getJob(jobId);

        if (!job) {
          sendJson(response, 404, {
            error: "任务不存在。"
          });
          return;
        }

        if (job.status !== "completed") {
          sendJson(response, 409, {
            error: "任务尚未完成。"
          });
          return;
        }

        const result = await jobManager.getJobResult(jobId);
        sendJson(response, 200, result);
        return;
      }

      if (method === "POST" && url.pathname === "/api/export") {
        const payload = await readJsonBody(request);
        const artifact = await buildResultArtifact(payload.result, payload.format);

        response.writeHead(200, {
          "Content-Type": artifact.contentType,
          "Content-Disposition": `attachment; filename="${artifact.fileName}"`,
          "Cache-Control": "no-store"
        });
        response.end(artifact.buffer);
        return;
      }

      if (method === "GET" && url.pathname === "/api/healthz") {
        sendJson(response, 200, {
          ok: true
        });
        return;
      }

      const served = await serveStaticFile(response, distPath, url.pathname);
      if (served) {
        return;
      }

      if (path.extname(url.pathname)) {
        sendJson(response, 404, {
          error: `资源不存在：${url.pathname}`
        });
        return;
      }

      const fallback = await fs.readFile(path.join(distPath, "index.html"));
      response.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store"
      });
      response.end(fallback);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Internal error";
      sendJson(response, 500, {
        error: message
      });
    }
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.removeListener("error", reject);
      resolve();
    });
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("无法确定本地服务监听地址。");
  }

  return {
    server,
    url: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise((resolve, reject) => {
        server.close(async (error) => {
          try {
            if (ownsJobManager) {
              await jobManager.close();
            }

            if (error) {
              reject(error);
              return;
            }

            resolve();
          } catch (closeError) {
            reject(closeError);
          }
        });
      })
  };
}
