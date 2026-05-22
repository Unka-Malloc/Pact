import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

export const INDUSTRIAL_DISTILLATION_PROTOCOL_VERSION = "pact.knowledge-distillation-industrial.v1";
export const DEFAULT_INDUSTRIAL_DISTILLATION_MODEL = "deepseek-v4-flash";
export const DEFAULT_PROJECT_DIGEST_BASELINES = ["repomix", "gitingest"];
export const DEFAULT_EVALUATION_BASELINES = ["deepeval", "geval-style-rubric"];

const IGNORED_DIRECTORY_NAMES = new Set([
  ".git",
  ".hg",
  ".svn",
  "node_modules",
  "vendor",
  "dist",
  "build",
  "coverage",
  ".next",
  ".nuxt",
  ".vite",
  ".turbo",
  ".cache",
  ".pact-server-data"
]);

const MARKDOWN_EXTENSIONS = new Set([".md", ".markdown", ".mdown", ".mkdn", ".mdx"]);
const EMAIL_EXTENSIONS = new Set([".eml"]);

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function normalizeText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeMultiline(value) {
  return String(value || "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}

function stableHash(...parts) {
  return crypto
    .createHash("sha256")
    .update(parts.map((part) => String(part ?? "")).join("\n"))
    .digest("hex");
}

function stableId(prefix, ...parts) {
  return `${prefix}_${stableHash(prefix, ...parts).slice(0, 24)}`;
}

function posixRelative(rootPath, absolutePath) {
  return path.relative(rootPath, absolutePath).split(path.sep).join("/");
}

function isMarkdownFile(filePath = "") {
  return MARKDOWN_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

function isEmailFile(filePath = "") {
  return EMAIL_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

async function walkFiles(rootPath, matcher, options = {}) {
  const root = path.resolve(rootPath);
  const maxFiles = Math.max(1, Number(options.maxFiles || 20000));
  const files = [];
  async function visit(currentPath) {
    if (files.length >= maxFiles) {
      return;
    }
    let entries = [];
    try {
      entries = await fs.readdir(currentPath, { withFileTypes: true });
    } catch {
      return;
    }
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const absolutePath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) {
        if (!IGNORED_DIRECTORY_NAMES.has(entry.name)) {
          await visit(absolutePath);
        }
        continue;
      }
      if (entry.isFile() && matcher(absolutePath)) {
        files.push(absolutePath);
      }
    }
  }
  await visit(root);
  return files;
}

function extractMarkdownOutline(markdown = "") {
  const lines = String(markdown || "").split(/\n/);
  const outline = [];
  let fenced = false;
  let fenceMarker = "";
  for (const [index, rawLine] of lines.entries()) {
    const line = rawLine.trimEnd();
    const fence = line.match(/^\s*(```+|~~~+)/);
    if (fence) {
      const marker = fence[1][0];
      if (!fenced) {
        fenced = true;
        fenceMarker = marker;
      } else if (marker === fenceMarker) {
        fenced = false;
        fenceMarker = "";
      }
      continue;
    }
    if (fenced) {
      continue;
    }
    const heading = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (heading) {
      outline.push({
        level: heading[1].length,
        title: normalizeText(heading[2]),
        line: index + 1
      });
    }
  }
  return outline;
}

function buildDirectoryTree(relativePaths = []) {
  const root = { children: new Map(), file: false };
  for (const relativePath of relativePaths) {
    const parts = String(relativePath || "").split("/").filter(Boolean);
    let cursor = root;
    for (const [index, part] of parts.entries()) {
      if (!cursor.children.has(part)) {
        cursor.children.set(part, { children: new Map(), file: index === parts.length - 1 });
      }
      cursor = cursor.children.get(part);
      if (index === parts.length - 1) {
        cursor.file = true;
      }
    }
  }
  const lines = [];
  function render(node, prefix = "") {
    const entries = [...node.children.entries()].sort((left, right) => left[0].localeCompare(right[0]));
    for (const [index, [name, child]] of entries.entries()) {
      const last = index === entries.length - 1;
      lines.push(`${prefix}${last ? "`-- " : "|-- "}${name}${child.file ? "" : "/"}`);
      render(child, `${prefix}${last ? "    " : "|   "}`);
    }
  }
  render(root);
  return lines.join("\n");
}

function markdownFileTitle(file = {}) {
  const firstHeading = asArray(file.outline).find((heading) => heading.level === 1) || file.outline?.[0];
  return firstHeading?.title || file.relativePath || file.path || "Markdown document";
}

function renderMarkdownProjectDigest({ files = [], rootPath = "", modelAlias = DEFAULT_INDUSTRIAL_DISTILLATION_MODEL } = {}) {
  const relativePaths = files.map((file) => file.relativePath);
  const lines = [
    "# Project Markdown Digest",
    "",
    `Protocol: \`${INDUSTRIAL_DISTILLATION_PROTOCOL_VERSION}\``,
    `Default framework model: \`${modelAlias}\``,
    rootPath ? `Root: \`${rootPath}\`` : "",
    "",
    "## File Summary",
    "",
    `- Files analyzed: ${files.length}`,
    `- Total bytes: ${files.reduce((sum, file) => sum + Number(file.byteLength || 0), 0)}`,
    `- Digest strategy: path-stable markdown digest with heading outline and full source text`,
    "",
    "## Directory Structure",
    "",
    "```text",
    buildDirectoryTree(relativePaths) || "(empty)",
    "```",
    "",
    "## Files"
  ].filter((line) => line !== "");

  for (const file of files) {
    lines.push("");
    lines.push(`### File: ${file.relativePath}`);
    lines.push("");
    lines.push(`- SHA256: \`${file.sha256}\``);
    lines.push(`- Bytes: ${file.byteLength}`);
    lines.push(`- Modified: ${file.modifiedAt || ""}`);
    lines.push(`- Title: ${markdownFileTitle(file)}`);
    lines.push("");
    lines.push("#### Heading Outline");
    lines.push("");
    if (file.outline.length) {
      for (const heading of file.outline) {
        lines.push(`${"  ".repeat(Math.max(0, heading.level - 1))}- L${heading.level} line ${heading.line}: ${heading.title}`);
      }
    } else {
      lines.push("- (no markdown headings)");
    }
    lines.push("");
    lines.push("#### Content");
    lines.push("");
    lines.push("```markdown");
    lines.push(file.content || "");
    lines.push("```");
  }

  return `${lines.join("\n")}\n`;
}

export async function buildMarkdownProjectDigest({
  rootPath,
  files,
  modelAlias = DEFAULT_INDUSTRIAL_DISTILLATION_MODEL,
  maxFileBytes = Number.MAX_SAFE_INTEGER
} = {}) {
  const root = rootPath ? path.resolve(rootPath) : "";
  const absoluteFiles = files
    ? asArray(files).map((file) => path.resolve(file.path || file.absolutePath || file))
    : await walkFiles(root, isMarkdownFile);
  const records = [];
  for (const absolutePath of absoluteFiles.sort((left, right) => left.localeCompare(right))) {
    const stat = await fs.stat(absolutePath);
    const relativePath = root ? posixRelative(root, absolutePath) : path.basename(absolutePath);
    const raw = await fs.readFile(absolutePath, "utf8");
    const truncated = stat.size > Number(maxFileBytes);
    const content = truncated ? raw.slice(0, Number(maxFileBytes)) : raw;
    records.push({
      path: absolutePath,
      relativePath,
      title: "",
      mediaType: "text/markdown",
      byteLength: Buffer.byteLength(raw),
      truncated,
      sha256: stableHash(raw),
      modifiedAt: stat.mtime.toISOString(),
      outline: extractMarkdownOutline(content),
      content
    });
  }
  for (const record of records) {
    record.title = markdownFileTitle(record);
  }
  const digestMarkdown = renderMarkdownProjectDigest({ files: records, rootPath: root, modelAlias });
  return {
    protocolVersion: INDUSTRIAL_DISTILLATION_PROTOCOL_VERSION,
    artifactType: "markdown-project-digest",
    modelAlias,
    baselineTools: DEFAULT_PROJECT_DIGEST_BASELINES,
    rootPath: root,
    fileCount: records.length,
    totalBytes: records.reduce((sum, file) => sum + Number(file.byteLength || 0), 0),
    files: records,
    directoryStructure: buildDirectoryTree(records.map((file) => file.relativePath)),
    digestMarkdown,
    rawDocuments: records.map((file, index) => ({
      title: file.title,
      text: file.content,
      sourcePath: file.relativePath,
      sourceType: "project-markdown",
      sourceUpdatedAt: file.modifiedAt,
      capturedAt: file.modifiedAt,
      contentHash: file.sha256,
      order: index + 1,
      metadata: {
        digestStrategy: "markdown-project-digest-v1",
        headingOutline: file.outline
      }
    }))
  };
}

function splitHeaderAndBody(raw = "") {
  const normalized = String(raw || "").replace(/\r\n?/g, "\n");
  const index = normalized.search(/\n\n/);
  if (index < 0) {
    return { headerText: normalized, bodyText: "" };
  }
  return {
    headerText: normalized.slice(0, index),
    bodyText: normalized.slice(index + 2)
  };
}

function parseEmailHeaders(raw = "") {
  const { headerText, bodyText } = splitHeaderAndBody(raw);
  const unfolded = [];
  for (const line of headerText.split(/\n/)) {
    if (/^[ \t]/.test(line) && unfolded.length) {
      unfolded[unfolded.length - 1] += ` ${line.trim()}`;
    } else {
      unfolded.push(line);
    }
  }
  const headers = new Map();
  for (const line of unfolded) {
    const separator = line.indexOf(":");
    if (separator <= 0) {
      continue;
    }
    const key = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    const previous = headers.get(key) || [];
    previous.push(value);
    headers.set(key, previous);
  }
  return {
    headers,
    bodyText: normalizeMultiline(bodyText)
  };
}

function firstHeader(headers, key) {
  return normalizeText(asArray(headers.get(String(key || "").toLowerCase()))[0] || "");
}

function allHeaderText(headers, key) {
  return asArray(headers.get(String(key || "").toLowerCase())).join(" ");
}

function extractMessageIds(value = "") {
  return [...String(value || "").matchAll(/<[^<>\s]+@[^<>\s]+>/g)].map((match) => match[0]);
}

function normalizeSubject(subject = "") {
  let result = normalizeText(subject);
  let changed = true;
  while (changed) {
    const before = result;
    result = result.replace(/^(\s*(re|fw|fwd|aw|答复|回复|转发)\s*[:：]\s*)+/i, "").trim();
    result = result.replace(/\s*\(fwd\)\s*$/i, "").trim();
    changed = before !== result;
  }
  return result;
}

function parseEmailDate(value = "") {
  const millis = Date.parse(value);
  return Number.isFinite(millis) ? new Date(millis).toISOString() : "";
}

function emailParticipants(message = {}) {
  return [
    message.from,
    message.to,
    message.cc
  ].flatMap((value) => String(value || "").toLowerCase().match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/g) || []);
}

function bodyExcerpt(text = "", limit = 420) {
  return normalizeText(
    String(text || "")
      .split(/\n/)
      .filter((line) => !/^>/.test(line.trim()))
      .join(" ")
  ).slice(0, limit);
}

async function readEmailMessages(rootPath, files) {
  const root = rootPath ? path.resolve(rootPath) : "";
  const absoluteFiles = files
    ? asArray(files).map((file) => path.resolve(file.path || file.absolutePath || file))
    : await walkFiles(root, isEmailFile);
  const messages = [];
  for (const [index, absolutePath] of absoluteFiles.sort((left, right) => left.localeCompare(right)).entries()) {
    const raw = await fs.readFile(absolutePath, "utf8");
    const { headers, bodyText } = parseEmailHeaders(raw);
    const messageId = extractMessageIds(firstHeader(headers, "message-id"))[0] || "";
    const references = extractMessageIds(allHeaderText(headers, "references"));
    const inReplyTo = extractMessageIds(allHeaderText(headers, "in-reply-to"));
    const date = parseEmailDate(firstHeader(headers, "date"));
    const relativePath = root ? posixRelative(root, absolutePath) : path.basename(absolutePath);
    messages.push({
      messageKey: messageId || stableId("synthetic_message", relativePath, raw),
      messageId,
      references,
      inReplyTo,
      subject: firstHeader(headers, "subject"),
      baseSubject: normalizeSubject(firstHeader(headers, "subject")),
      from: firstHeader(headers, "from"),
      to: firstHeader(headers, "to"),
      cc: firstHeader(headers, "cc"),
      date,
      sourcePath: relativePath,
      order: index + 1,
      sha256: stableHash(raw),
      bodyText,
      excerpt: bodyExcerpt(bodyText)
    });
  }
  return messages;
}

class UnionFind {
  constructor() {
    this.parent = new Map();
  }

  find(value) {
    const key = String(value || "");
    if (!this.parent.has(key)) {
      this.parent.set(key, key);
      return key;
    }
    const parent = this.parent.get(key);
    if (parent === key) {
      return key;
    }
    const root = this.find(parent);
    this.parent.set(key, root);
    return root;
  }

  union(left, right) {
    const leftRoot = this.find(left);
    const rightRoot = this.find(right);
    if (leftRoot !== rightRoot) {
      this.parent.set(rightRoot, leftRoot);
    }
  }
}

function groupEmailThreads(messages = []) {
  const uf = new UnionFind();
  for (const message of messages) {
    uf.find(message.messageKey);
    for (const reference of [...message.references, ...message.inReplyTo]) {
      uf.union(message.messageKey, reference);
    }
  }
  const messagesWithoutReferences = messages.filter(
    (message) => !message.messageId && message.references.length === 0 && message.inReplyTo.length === 0
  );
  const bySubject = new Map();
  for (const message of messagesWithoutReferences) {
    if (message.baseSubject.length < 4) {
      continue;
    }
    const participantKey = emailParticipants(message).sort().slice(0, 6).join("|");
    const key = `${message.baseSubject.toLowerCase()}::${participantKey}`;
    const previous = bySubject.get(key);
    if (previous) {
      uf.union(previous.messageKey, message.messageKey);
    } else {
      bySubject.set(key, message);
    }
  }
  const grouped = new Map();
  for (const message of messages) {
    const root = uf.find(message.messageKey);
    const items = grouped.get(root) || [];
    items.push(message);
    grouped.set(root, items);
  }
  return [...grouped.entries()]
    .map(([root, items]) => {
      const ordered = items.slice().sort((left, right) => {
        const leftTime = left.date || "";
        const rightTime = right.date || "";
        return leftTime.localeCompare(rightTime) || left.order - right.order;
      });
      const baseSubject = ordered.find((message) => message.baseSubject)?.baseSubject || ordered[0]?.subject || "";
      return {
        threadId: stableId("mail_thread", root, ordered.map((message) => message.messageKey).join("\n")),
        rootMessageKey: root,
        baseSubject,
        messageCount: ordered.length,
        startDate: ordered[0]?.date || "",
        endDate: ordered.at(-1)?.date || "",
        participants: [...new Set(ordered.flatMap(emailParticipants))].sort(),
        messages: ordered
      };
    })
    .sort((left, right) => left.startDate.localeCompare(right.startDate) || left.baseSubject.localeCompare(right.baseSubject));
}

function renderEmailThreadDigest({ threads = [], rootPath = "", modelAlias = DEFAULT_INDUSTRIAL_DISTILLATION_MODEL } = {}) {
  const lines = [
    "# Email Thread Digest",
    "",
    `Protocol: \`${INDUSTRIAL_DISTILLATION_PROTOCOL_VERSION}\``,
    `Default framework model: \`${modelAlias}\``,
    rootPath ? `Root: \`${rootPath}\`` : "",
    "",
    "## Thread Summary",
    "",
    `- Threads: ${threads.length}`,
    `- Messages: ${threads.reduce((sum, thread) => sum + thread.messageCount, 0)}`,
    "- Threading strategy: RFC 5322 Message-ID / In-Reply-To / References first; normalized-subject fallback only for messages without thread headers",
    "- Timeline order: oldest to newest inside each thread",
    ""
  ].filter((line) => line !== "");
  for (const thread of threads) {
    lines.push(`## Thread: ${thread.baseSubject || thread.threadId}`);
    lines.push("");
    lines.push(`- Thread ID: \`${thread.threadId}\``);
    lines.push(`- Messages: ${thread.messageCount}`);
    lines.push(`- Start: ${thread.startDate || ""}`);
    lines.push(`- End: ${thread.endDate || ""}`);
    lines.push(`- Participants: ${thread.participants.join(", ") || "(unknown)"}`);
    lines.push("");
    lines.push("### Timeline");
    lines.push("");
    for (const message of thread.messages) {
      lines.push(`#### ${message.date || "unknown date"} ${message.subject || "(no subject)"}`);
      lines.push("");
      lines.push(`- Message-ID: ${message.messageId || "(missing)"}`);
      lines.push(`- In-Reply-To: ${message.inReplyTo.join(" ") || "(none)"}`);
      lines.push(`- References: ${message.references.join(" ") || "(none)"}`);
      lines.push(`- From: ${message.from || ""}`);
      lines.push(`- To: ${message.to || ""}`);
      lines.push(`- Source: ${message.sourcePath}`);
      lines.push("");
      lines.push(message.excerpt || "(empty body)");
      lines.push("");
    }
  }
  return `${lines.join("\n")}\n`;
}

export async function buildEmailThreadDigest({
  rootPath,
  files,
  modelAlias = DEFAULT_INDUSTRIAL_DISTILLATION_MODEL
} = {}) {
  const root = rootPath ? path.resolve(rootPath) : "";
  const messages = await readEmailMessages(root, files);
  const threads = groupEmailThreads(messages);
  const digestMarkdown = renderEmailThreadDigest({ threads, rootPath: root, modelAlias });
  return {
    protocolVersion: INDUSTRIAL_DISTILLATION_PROTOCOL_VERSION,
    artifactType: "email-thread-digest",
    modelAlias,
    rootPath: root,
    threadingPolicy: "rfc5322-references-first-v1",
    messageCount: messages.length,
    threadCount: threads.length,
    messages,
    threads,
    digestMarkdown,
    rawDocuments: threads.map((thread, index) => ({
      title: thread.baseSubject || `邮件线程 ${index + 1}`,
      text: renderEmailThreadDigest({ threads: [thread], rootPath: root, modelAlias }),
      sourceType: "mail-thread",
      capturedAt: thread.startDate || thread.endDate || "",
      sourceUpdatedAt: thread.endDate || thread.startDate || "",
      contentHash: stableHash(thread.threadId, thread.messages.map((message) => message.sha256).join("\n")),
      order: index + 1,
      metadata: {
        digestStrategy: "email-thread-digest-v1",
        threadId: thread.threadId,
        messageCount: thread.messageCount,
        participants: thread.participants
      }
    }))
  };
}

function markersPresentInOrder(text = "", markers = []) {
  let cursor = 0;
  const normalized = String(text || "");
  for (const marker of markers.filter(Boolean)) {
    const index = normalized.indexOf(marker, cursor);
    if (index < 0) {
      return false;
    }
    cursor = index + marker.length;
  }
  return true;
}

function countCoveredMarkers(text = "", markers = []) {
  const normalized = String(text || "");
  const unique = [...new Set(markers.filter(Boolean))];
  const covered = unique.filter((marker) => normalized.includes(marker));
  return {
    covered,
    missing: unique.filter((marker) => !normalized.includes(marker)),
    score: unique.length ? Number((covered.length / unique.length).toFixed(6)) : 1
  };
}

function projectExpectedMarkers(projectDigest = {}) {
  return asArray(projectDigest.files).flatMap((file) => [
    file.relativePath,
    file.title,
    ...asArray(file.outline).slice(0, 3).map((heading) => heading.title)
  ]).filter(Boolean);
}

function emailExpectedMarkers(emailDigest = {}) {
  return asArray(emailDigest.threads).flatMap((thread) => [
    thread.baseSubject,
    ...asArray(thread.messages).flatMap((message) => [
      message.date,
      message.messageId,
      message.subject,
      message.excerpt.slice(0, 80)
    ])
  ]).filter(Boolean);
}

export function evaluateIndustrialDistillationGap({
  projectDigest = null,
  emailDigest = null,
  baselineDocument = "",
  frameworkDocument = "",
  minCoverageScore = 0.86,
  minBaselineDelta = -0.03
} = {}) {
  const expectedMarkers = [
    ...projectExpectedMarkers(projectDigest || {}),
    ...emailExpectedMarkers(emailDigest || {})
  ];
  const baselineCoverage = countCoveredMarkers(baselineDocument, expectedMarkers);
  const frameworkCoverage = countCoveredMarkers(frameworkDocument, expectedMarkers);
  const emailTimelineMarkers = asArray(emailDigest?.threads).flatMap((thread) =>
    asArray(thread.messages).map((message) => message.date || message.subject).filter(Boolean)
  );
  const projectOrderMarkers = asArray(projectDigest?.files).map((file) => file.relativePath).filter(Boolean);
  const timelineOrderPassed = emailTimelineMarkers.length
    ? markersPresentInOrder(frameworkDocument, emailTimelineMarkers)
    : true;
  const projectOrderPassed = projectOrderMarkers.length
    ? markersPresentInOrder(frameworkDocument, projectOrderMarkers)
    : true;
  const sameMatterMergePassed = asArray(emailDigest?.threads).every((thread) => {
    if (thread.messageCount <= 1) {
      return true;
    }
    const threadTextPresent = normalizeText(thread.baseSubject) && frameworkDocument.includes(thread.baseSubject);
    const messageEvidencePresent = thread.messages.every((message) =>
      !message.messageId || frameworkDocument.includes(message.messageId)
    );
    return threadTextPresent && messageEvidencePresent;
  });
  const sourceTracePassed = expectedMarkers.length === 0 || frameworkCoverage.covered.length >= Math.min(3, expectedMarkers.length);
  const coverageDelta = Number((frameworkCoverage.score - baselineCoverage.score).toFixed(6));
  const checks = [
    {
      id: "framework_coverage",
      passed: frameworkCoverage.score >= minCoverageScore,
      actual: frameworkCoverage.score,
      expected: `>= ${minCoverageScore}`
    },
    {
      id: "framework_not_worse_than_external_skill_baseline",
      passed: coverageDelta >= minBaselineDelta,
      actual: coverageDelta,
      expected: `>= ${minBaselineDelta}`
    },
    {
      id: "email_timeline_order",
      passed: timelineOrderPassed,
      actual: timelineOrderPassed,
      expected: true
    },
    {
      id: "project_document_order",
      passed: projectOrderPassed,
      actual: projectOrderPassed,
      expected: true
    },
    {
      id: "same_matter_email_merge",
      passed: sameMatterMergePassed,
      actual: sameMatterMergePassed,
      expected: true
    },
    {
      id: "source_trace_markers",
      passed: sourceTracePassed,
      actual: frameworkCoverage.covered.slice(0, 8),
      expected: "framework output includes source markers"
    }
  ];
  return {
    protocolVersion: INDUSTRIAL_DISTILLATION_PROTOCOL_VERSION,
    passed: checks.every((check) => check.passed),
    checks,
    metrics: {
      baselineCoverage,
      frameworkCoverage,
      coverageDelta,
      expectedMarkerCount: [...new Set(expectedMarkers)].length
    },
    gaps: frameworkCoverage.missing.slice(0, 50).map((marker) => ({
      kind: "missing_marker",
      marker,
      recommendation: "Keep this source detail in the distilled output or justify its omission in the coverage report."
    }))
  };
}

export function buildIndustrialDistillationPlan({
  modelAlias = DEFAULT_INDUSTRIAL_DISTILLATION_MODEL,
  projectRoot = "",
  emailRoot = "",
  projectDigestBaselines = DEFAULT_PROJECT_DIGEST_BASELINES,
  evaluationBaselines = DEFAULT_EVALUATION_BASELINES
} = {}) {
  return {
    protocolVersion: INDUSTRIAL_DISTILLATION_PROTOCOL_VERSION,
    modelAlias,
    baselineSkills: {
      projectDigest: projectDigestBaselines,
      evaluation: evaluationBaselines,
      note: "Use mature external repository digest/evaluation tools as comparison baselines; do not replace Pact source coverage and evidence checks."
    },
    phases: [
      {
        id: "project_markdown_digest",
        input: projectRoot,
        output: "path-stable markdown project digest",
        acceptance: ["all Markdown files scanned", "directory tree retained", "heading outline retained", "source path retained"]
      },
      {
        id: "external_project_skill_baseline",
        tools: projectDigestBaselines,
        output: "external skill distilled project document",
        acceptance: ["same project digest input", "source coverage report", "time/order assumptions explicit"]
      },
      {
        id: "framework_project_distillation",
        modelAlias,
        output: "Pact portable distilled document",
        acceptance: ["rawDocuments input", "self-contained output", "sourceTrace retained internally", "portable document has no framework lookup dependency"]
      },
      {
        id: "email_thread_digest",
        input: emailRoot,
        output: "RFC 5322/RFC 5256-aligned email thread digest",
        acceptance: ["Message-ID grouped", "In-Reply-To and References honored", "oldest-to-newest timeline", "subject fallback audited"]
      },
      {
        id: "external_email_skill_baseline",
        output: "external skill distilled email dossier",
        acceptance: ["same-matter messages merged", "thread chronology preserved", "participants and decisions retained"]
      },
      {
        id: "framework_email_distillation",
        modelAlias,
        output: "Pact portable distilled email knowledge document",
        acceptance: ["same thread merged", "time order stable", "quotes/noise reduced", "source evidence markers retained"]
      },
      {
        id: "gap_loop",
        output: "optimization backlog and regression gate",
        acceptance: ["coverage not worse than baseline", "timeline order passes", "same-matter merge passes", "unsupported claims listed"]
      }
    ]
  };
}

export async function buildIndustrialDistillationBenchmark({
  projectRoot = "",
  emailRoot = "",
  modelAlias = DEFAULT_INDUSTRIAL_DISTILLATION_MODEL
} = {}) {
  const projectDigest = projectRoot
    ? await buildMarkdownProjectDigest({ rootPath: projectRoot, modelAlias })
    : null;
  const emailDigest = emailRoot
    ? await buildEmailThreadDigest({ rootPath: emailRoot, modelAlias })
    : null;
  return {
    protocolVersion: INDUSTRIAL_DISTILLATION_PROTOCOL_VERSION,
    plan: buildIndustrialDistillationPlan({ modelAlias, projectRoot, emailRoot }),
    projectDigest,
    emailDigest,
    frameworkInputs: {
      modelAlias,
      project: projectDigest
        ? {
            query: "项目文档知识蒸馏",
            rawDocuments: projectDigest.rawDocuments
          }
        : null,
      email: emailDigest
        ? {
            query: "邮件同一事项知识蒸馏",
            rawDocuments: emailDigest.rawDocuments
          }
        : null
    },
    acceptanceGate: {
      requiredChecks: [
        "framework_coverage",
        "framework_not_worse_than_external_skill_baseline",
        "email_timeline_order",
        "project_document_order",
        "same_matter_email_merge",
        "source_trace_markers"
      ],
      modelAlias,
      minCoverageScore: 0.86,
      minBaselineDelta: -0.03
    }
  };
}
