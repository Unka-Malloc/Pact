import path from "node:path";
import fs from "node:fs/promises";
import { unzipSync } from "fflate";

const SUPPORTED_EXTENSIONS = new Set([
  ".eml",
  ".msg",
  ".pdf",
  ".doc",
  ".docx",
  ".ppt",
  ".pptx",
  ".xls",
  ".xlsx",
  ".txt"
]);

function normalizeWhitespace(value) {
  return String(value || "").replace(/\r\n/g, "\n").trim();
}

function parseHeaderBlock(text) {
  const lines = String(text || "").replace(/\r/g, "\n").split("\n");
  const headers = new Map();
  let currentName = "";
  let currentValue = "";
  let bodyStartIndex = 0;

  function commit() {
    if (!currentName) {
      return;
    }

    headers.set(currentName, normalizeWhitespace(currentValue));
    currentName = "";
    currentValue = "";
  }

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];

    if (!line.trim()) {
      commit();
      bodyStartIndex = index + 1;
      break;
    }

    const headerMatch = line.match(/^([^:]+):\s*(.*)$/);
    if (headerMatch) {
      commit();
      currentName = headerMatch[1].trim();
      currentValue = headerMatch[2] || "";
      continue;
    }

    if (currentName && /^[ \t]/.test(line)) {
      currentValue = `${currentValue} ${line.trim()}`.trim();
      continue;
    }

    bodyStartIndex = index;
    break;
  }

  commit();

  return {
    headers: Object.fromEntries(headers.entries()),
    body: normalizeWhitespace(lines.slice(bodyStartIndex).join("\n"))
  };
}

function extractOfficeArchiveText(buffer) {
  try {
    return Object.entries(unzipSync(new Uint8Array(buffer)))
      .map(([, content]) => Buffer.from(content).toString("utf8"))
      .join("\n");
  } catch {
    return buffer.toString("utf8");
  }
}

function extractMetadataFromEmail(text, fileName, mediaTypeHint = "") {
  const { headers, body } = parseHeaderBlock(text);
  const metadata = {
    "Content-Type": mediaTypeHint || "message/rfc822",
    "dc:title": headers.Subject || fileName || "",
    "Message:Raw-Header:Subject": headers.Subject || "",
    "Message:Raw-Header:Date": headers.Date || "",
    "Message:Raw-Header:Message-ID": headers["Message-ID"] || "",
    "Message:Raw-Header:In-Reply-To": headers["In-Reply-To"] || "",
    "Message:Raw-Header:References": headers.References || "",
    "Message:From": headers.From || "",
    "Message:To": headers.To || "",
    "Message:CC": headers.Cc || "",
    "Message:BCC": headers.Bcc || "",
    "X-TIKA:content": body
  };

  return {
    parserId: "test/mock-structured-document-parser",
    text: body,
    metadata,
    embeddedDocuments: []
  };
}

async function applyTestHooks({ settings = {}, userDataPath = "", fileName = "" }) {
  const delayMs = Number(settings.testParserDelayMs || 0);
  if (Number.isFinite(delayMs) && delayMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  if (settings.testParserLogFile && userDataPath) {
    const logPath = path.isAbsolute(settings.testParserLogFile)
      ? settings.testParserLogFile
      : path.join(userDataPath, settings.testParserLogFile);
    await fs.mkdir(path.dirname(logPath), { recursive: true });
    await fs.appendFile(
      logPath,
      `${JSON.stringify({ fileName, at: new Date().toISOString() })}\n`,
      "utf8"
    );
  }
}

export function createMount() {
  return {
    id: "test/mock-structured-document-parser",
    kind: "documentParser",
    enabled: true,
    supports({ extension = "" }) {
      return SUPPORTED_EXTENSIONS.has(String(extension || "").toLowerCase());
    },
    async extractDocument({
      buffer,
      filePath = "",
      fileName = "",
      mediaTypeHint = "",
      settings = {},
      userDataPath = ""
    }) {
      const extension = path.extname(fileName || filePath).toLowerCase();
      const text = normalizeWhitespace(
        [".docx", ".pptx", ".xlsx"].includes(extension)
          ? extractOfficeArchiveText(buffer)
          : buffer.toString("utf8")
      );
      await applyTestHooks({
        settings,
        userDataPath,
        fileName: fileName || path.basename(filePath)
      });

      if (extension === ".eml" || extension === ".msg") {
        return extractMetadataFromEmail(text, fileName || path.basename(filePath), mediaTypeHint);
      }

      return {
        parserId: "test/mock-structured-document-parser",
        text,
        metadata: {
          "Content-Type": mediaTypeHint || "text/plain",
          "dc:title": fileName || path.basename(filePath)
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
