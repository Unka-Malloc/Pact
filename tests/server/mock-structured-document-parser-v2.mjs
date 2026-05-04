import path from "node:path";

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
    "X-TIKA:content": `[v2] ${body}`.trim()
  };

  return {
    parserId: "test/mock-structured-document-parser-v2",
    text: `[v2] ${body}`.trim(),
    metadata,
    embeddedDocuments: []
  };
}

export function createMount() {
  return {
    id: "test/mock-structured-document-parser-v2",
    kind: "documentParser",
    enabled: true,
    supports({ extension = "" }) {
      return SUPPORTED_EXTENSIONS.has(String(extension || "").toLowerCase());
    },
    async extractDocument({ buffer, filePath = "", fileName = "", mediaTypeHint = "" }) {
      const extension = path.extname(fileName || filePath).toLowerCase();
      const text = normalizeWhitespace(buffer.toString("utf8"));

      if (extension === ".eml" || extension === ".msg") {
        return extractMetadataFromEmail(text, fileName || path.basename(filePath), mediaTypeHint);
      }

      return {
        parserId: "test/mock-structured-document-parser-v2",
        text: `[v2] ${text}`.trim(),
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
