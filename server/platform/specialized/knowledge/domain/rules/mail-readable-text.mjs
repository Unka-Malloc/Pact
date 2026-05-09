function normalizeText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function lower(value) {
  return String(value || "").toLowerCase();
}

function splitHeaderAndBody(raw) {
  const text = String(raw || "");
  const match = /\r?\n\r?\n/.exec(text);
  if (!match) {
    return { headers: text, body: "" };
  }
  return {
    headers: text.slice(0, match.index),
    body: text.slice(match.index + match[0].length)
  };
}

function unfoldHeaders(rawHeaders) {
  return String(rawHeaders || "").replace(/\r?\n[ \t]+/g, " ");
}

function parseHeaders(rawHeaders) {
  const headers = new Map();
  for (const line of unfoldHeaders(rawHeaders).split(/\r?\n/)) {
    const separator = line.indexOf(":");
    if (separator <= 0) {
      continue;
    }
    const key = lower(line.slice(0, separator).trim());
    const value = line.slice(separator + 1).trim();
    if (!key) {
      continue;
    }
    const values = headers.get(key) || [];
    values.push(value);
    headers.set(key, values);
  }
  return headers;
}

function decodeBuffer(buffer, charset = "utf-8") {
  const labels = [
    String(charset || "utf-8").trim().toLowerCase(),
    "utf-8",
    "windows-1252",
    "latin1"
  ].filter(Boolean);
  for (const label of labels) {
    try {
      return new TextDecoder(label).decode(buffer);
    } catch {
      // Try the next compatible label.
    }
  }
  return buffer.toString("utf8");
}

function decodeMimeWord(charset, encoding, encodedText) {
  let buffer;
  if (String(encoding || "").toUpperCase() === "B") {
    buffer = Buffer.from(String(encodedText || ""), "base64");
  } else {
    const text = String(encodedText || "").replace(/_/g, " ");
    const chunks = [];
    for (let index = 0; index < text.length; index += 1) {
      if (text[index] === "=" && /^[0-9A-Fa-f]{2}$/.test(text.slice(index + 1, index + 3))) {
        chunks.push(Buffer.from([Number.parseInt(text.slice(index + 1, index + 3), 16)]));
        index += 2;
      } else {
        chunks.push(Buffer.from(text[index], "utf8"));
      }
    }
    buffer = Buffer.concat(chunks);
  }
  return decodeBuffer(buffer, charset);
}

export function decodeMimeEncodedWords(value) {
  return String(value || "").replace(/=\?([^?]+)\?([BQbq])\?([^?]*)\?=/g, (_match, charset, encoding, encodedText) =>
    decodeMimeWord(charset, encoding, encodedText)
  );
}

function headerValues(headers, name) {
  return headers.get(lower(name)) || [];
}

export function extractEmailHeaderValue(raw, name) {
  const { headers } = splitHeaderAndBody(raw);
  return normalizeText(decodeMimeEncodedWords(headerValues(parseHeaders(headers), name).join(" ")));
}

function parseHeaderParameters(value) {
  const parts = String(value || "").split(";");
  const type = lower(parts.shift() || "").trim();
  const params = {};
  for (const part of parts) {
    const separator = part.indexOf("=");
    if (separator <= 0) {
      continue;
    }
    const key = lower(part.slice(0, separator).trim());
    let nextValue = part.slice(separator + 1).trim();
    if (
      (nextValue.startsWith("\"") && nextValue.endsWith("\"")) ||
      (nextValue.startsWith("'") && nextValue.endsWith("'"))
    ) {
      nextValue = nextValue.slice(1, -1);
    }
    params[key] = decodeMimeEncodedWords(nextValue);
  }
  return { type, params };
}

function decodeQuotedPrintable(value, charset) {
  const source = String(value || "").replace(/=\r?\n/g, "");
  const chunks = [];
  for (let index = 0; index < source.length; index += 1) {
    if (source[index] === "=" && /^[0-9A-Fa-f]{2}$/.test(source.slice(index + 1, index + 3))) {
      chunks.push(Buffer.from([Number.parseInt(source.slice(index + 1, index + 3), 16)]));
      index += 2;
      continue;
    }
    chunks.push(Buffer.from(source[index], "utf8"));
  }
  return decodeBuffer(Buffer.concat(chunks), charset);
}

function decodeBase64Text(value, charset) {
  const compact = String(value || "").replace(/\s+/g, "");
  if (!compact || compact.length % 4 === 1) {
    return "";
  }
  try {
    return decodeBuffer(Buffer.from(compact, "base64"), charset);
  } catch {
    return "";
  }
}

function decodeTransferBody(value, transferEncoding, charset) {
  const encoding = lower(transferEncoding);
  if (encoding === "quoted-printable") {
    return decodeQuotedPrintable(value, charset);
  }
  if (encoding === "base64") {
    return decodeBase64Text(value, charset);
  }
  return String(value || "");
}

function splitMultipartBody(body, boundary) {
  const marker = `--${boundary}`;
  const parts = [];
  let current = null;
  for (const line of String(body || "").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed === marker || trimmed === `${marker}--`) {
      if (current) {
        parts.push(current.join("\n"));
      }
      current = trimmed.endsWith("--") ? null : [];
      if (trimmed.endsWith("--")) {
        break;
      }
      continue;
    }
    if (current) {
      current.push(line);
    }
  }
  return parts;
}

function parseMimeLeafParts(raw, depth = 0) {
  if (depth > 8) {
    return [];
  }
  const { headers: rawHeaders, body } = splitHeaderAndBody(raw);
  const headers = parseHeaders(rawHeaders);
  const contentType = parseHeaderParameters(headerValues(headers, "content-type")[0] || "text/plain; charset=utf-8");
  const disposition = parseHeaderParameters(headerValues(headers, "content-disposition")[0] || "");
  const transferEncoding = headerValues(headers, "content-transfer-encoding")[0] || "";
  if (contentType.type.startsWith("multipart/") && contentType.params.boundary) {
    return splitMultipartBody(body, contentType.params.boundary).flatMap((part) => parseMimeLeafParts(part, depth + 1));
  }
  return [
    {
      mediaType: contentType.type || "text/plain",
      charset: contentType.params.charset || "utf-8",
      disposition: disposition.type,
      transferEncoding,
      body
    }
  ];
}

function decodeHtmlEntities(value) {
  const named = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: "\"",
    apos: "'",
    nbsp: " "
  };
  return String(value || "").replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]+);/gi, (match, entity) => {
    const key = lower(entity);
    if (key.startsWith("#x")) {
      const codePoint = Number.parseInt(key.slice(2), 16);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
    }
    if (key.startsWith("#")) {
      const codePoint = Number.parseInt(key.slice(1), 10);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
    }
    return Object.prototype.hasOwnProperty.call(named, key) ? named[key] : match;
  });
}

export function stripHtmlToReadableText(raw) {
  return normalizeText(
    decodeHtmlEntities(
      String(raw || "")
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<!--[\s\S]*?-->/g, " ")
        .replace(/<\s*br\s*\/?>/gi, "\n")
        .replace(/<\/\s*(p|div|li|tr|td|th|h[1-6]|section|article|table|tbody|thead|ul|ol)\s*>/gi, "\n")
        .replace(/<img\b[^>]*\balt=(["'])(.*?)\1[^>]*>/gi, " $2 ")
        .replace(/<[^>]+>/g, " ")
    )
  );
}

export function stripUrlNoise(raw) {
  return String(raw || "")
    .replace(/https?:\/\/[^\s"'<>]+/gi, " ")
    .replace(/mailto:[^\s"'<>]+/gi, " ")
    .replace(/\b[a-z][a-z0-9+.-]*:\/\/[^\s"'<>]+/gi, " ")
    .replace(/\b(?:utm|campaign|tracking|token|signature|redirect|url|href|src|osub|sojtags|emid|crd|mpre|ch|bu|user-id|instance|site-id|templateid|trackingcode)[a-z0-9_-]*=[^\s"'<>]+/gi, " ");
}

function shouldSkipPart(part) {
  const mediaType = lower(part.mediaType);
  const disposition = lower(part.disposition);
  if (disposition === "attachment") {
    return true;
  }
  if (mediaType === "text/plain" || mediaType === "text/html") {
    return false;
  }
  return !mediaType.startsWith("text/");
}

function readablePartText(part) {
  const decoded = decodeTransferBody(part.body, part.transferEncoding, part.charset);
  if (lower(part.mediaType) === "text/html") {
    return stripHtmlToReadableText(decoded);
  }
  return normalizeText(decoded);
}

export function extractReadableEmailText(raw, { includeHeaders = true, removeUrlNoise = true } = {}) {
  const headerText = includeHeaders
    ? [
        extractEmailHeaderValue(raw, "Subject"),
        extractEmailHeaderValue(raw, "From"),
        extractEmailHeaderValue(raw, "To"),
        extractEmailHeaderValue(raw, "Cc"),
        extractEmailHeaderValue(raw, "Date")
      ].filter(Boolean).join("\n")
    : "";
  const parts = parseMimeLeafParts(raw)
    .filter((part) => !shouldSkipPart(part))
    .map(readablePartText)
    .filter(Boolean);
  const plainParts = parts.length ? parts : [stripHtmlToReadableText(splitHeaderAndBody(raw).body)];
  const text = normalizeText([headerText, ...plainParts].filter(Boolean).join("\n\n"));
  return removeUrlNoise ? normalizeText(stripUrlNoise(text)) : text;
}
