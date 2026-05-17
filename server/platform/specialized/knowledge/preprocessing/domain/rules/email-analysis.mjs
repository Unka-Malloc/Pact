import {
  DEFAULT_MERGE_RULES,
  absoluteDayGap,
  addDays,
  clamp,
  compileRuleSet,
  computeTimeWeight,
  dayDiff,
  formatFreshness,
  jaccardSimilarity,
  keywordList,
  normalizeTimestamp,
  normalizeWhitespace,
  truncateText,
  uniqueNormalizedStrings
} from "./index.mjs";
import { stripHtmlToReadableText } from "./mail-readable-text.mjs";

const OPEN_SIGNAL_RE =
  /(待确认|待处理|请确认|请回复|待补充|待跟进|pending|follow\s*up|next\s*step|需要确认|尚未|未完成|未闭环)/i;
const CLOSED_SIGNAL_RE =
  /(已完成|已经完成|已解决|已关闭|已确认|确认完毕|已归档|已处理|done|resolved|closed|completed)/i;
const DECISION_SIGNAL_RE =
  /(决定|结论|确定|统一|批准|审批通过|agreed|approved|decided|按此执行|按这个方案)/i;
const RISK_SIGNAL_RE =
  /(风险|阻塞|异常|争议|冲突|延期|失败|告警|问题|投诉|升级|逾期|超时|取消)/i;
const DEPARTMENT_RE =
  /([A-Za-z][A-Za-z&/\s-]{1,28}(?:Dept|Department|Team|Office|Center|Group|Division)|[\u4e00-\u9fff]{2,12}(?:部|组|团队|中心|处|室|办|科))/i;
const EMAIL_RE = /([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/gi;
const REPLY_PREFIX_RE = /^(?:(?:re|fw|fwd|sv|答复|回复|转发)\s*[:：]\s*)+/i;
const MIME_HEADER_RE =
  /^(content-type|content-transfer-encoding|mime-version|x-[a-z0-9-]+)$/i;
const ORIGINAL_MESSAGE_RE =
  /^(-----Original Message-----|On .+ wrote:|发件人[:：].+|From:\s.+)$/i;
const HEADER_LINE_RE = /^([^:：]{1,40})[:：]\s*(.*)$/;
const unique = uniqueNormalizedStrings;
const compileAnalysisRuleSet = compileRuleSet;

function normalizeMessageId(value) {
  return String(value || "")
    .trim()
    .replace(/[<>]/g, "")
    .toLowerCase();
}

function parseReferenceIds(value) {
  return unique(
    (String(value || "").match(/<[^>]+>|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [])
      .map((item) => normalizeMessageId(item))
      .filter(Boolean)
  );
}

function detectReportSeries(text, ruleset) {
  const normalized = normalizeWhitespace(text);

  if (!normalized) {
    return null;
  }

  return (
    (ruleset?.reportSeries || []).find((entry) =>
      entry.matchers.some((matcher) => matcher.test(normalized))
    ) || null
  );
}

function normalizeHeaderName(value) {
  const key = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");

  switch (key) {
    case "from":
    case "sender":
    case "发件人":
      return "from";
    case "to":
    case "收件人":
    case "收件":
      return "to";
    case "cc":
    case "抄送":
      return "cc";
    case "bcc":
    case "密送":
      return "bcc";
    case "subject":
    case "主题":
      return "subject";
    case "date":
    case "日期":
    case "发送时间":
    case "时间":
      return "date";
    case "message-id":
    case "messageid":
      return "messageId";
    case "in-reply-to":
    case "inreplyto":
      return "inReplyTo";
    case "references":
      return "references";
    default:
      return "";
  }
}

function parseHeaderBlock(text) {
  const lines = String(text || "").replace(/\r/g, "\n").split("\n");
  const headers = new Map();
  let currentKey = "";
  let currentValue = "";
  let headerLines = 0;
  let bodyStartIndex = 0;

  function commitCurrent() {
    if (!currentKey) {
      return;
    }

    if (!currentKey.startsWith("__ignored__")) {
      headers.set(currentKey, normalizeWhitespace(currentValue));
    }
    currentKey = "";
    currentValue = "";
  }

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();

    if (trimmed === "" && headerLines > 0) {
      commitCurrent();
      bodyStartIndex = index + 1;
      break;
    }

    const match = line.match(HEADER_LINE_RE);
    const canonicalName = match ? normalizeHeaderName(match[1]) : "";

    if (match) {
      commitCurrent();
      currentKey = canonicalName || `__ignored__:${headerLines + 1}`;
      currentValue = match[2] || "";
      headerLines += 1;
      continue;
    }

    if (currentKey && /^[ \t]/.test(line)) {
      currentValue = `${currentValue} ${trimmed}`.trim();
      continue;
    }

    if (headerLines >= 2) {
      commitCurrent();
      bodyStartIndex = index;
      break;
    }

    bodyStartIndex = 0;
  }

  commitCurrent();

  return {
    headers: Object.fromEntries(headers.entries()),
    body: normalizeWhitespace(lines.slice(bodyStartIndex).join("\n"))
  };
}

function flattenMetadataValue(value) {
  if (Array.isArray(value)) {
    return value.flatMap((item) => flattenMetadataValue(item));
  }

  if (value === null || value === undefined) {
    return [];
  }

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return [String(value)];
  }

  return [];
}

function metadataValues(metadata = {}, exactKeys = [], fragmentKeys = []) {
  const normalizedExact = new Set(exactKeys.map((item) => item.toLowerCase()));
  const normalizedFragments = fragmentKeys.map((item) => item.toLowerCase());
  const values = [];

  for (const [key, value] of Object.entries(metadata || {})) {
    const normalizedKey = String(key || "").toLowerCase();
    if (
      !normalizedExact.has(normalizedKey) &&
      !normalizedFragments.some((fragment) => normalizedKey.includes(fragment))
    ) {
      continue;
    }

    values.push(...flattenMetadataValue(value));
  }

  return unique(values);
}

function firstMetadataValue(metadata = {}, exactKeys = [], fragmentKeys = []) {
  return metadataValues(metadata, exactKeys, fragmentKeys)[0] || "";
}

function buildRawParticipantFromMetadata(
  metadata = {},
  {
    fullKeys = [],
    emailKeys = [],
    nameKeys = [],
    fullKeyFragments = []
  } = {}
) {
  const fullValue = firstMetadataValue(metadata, fullKeys, fullKeyFragments);
  if (fullValue) {
    return buildRawParticipant(fullValue);
  }

  const email = firstMetadataValue(metadata, emailKeys, []);
  const name = firstMetadataValue(metadata, nameKeys, []);
  if (!email && !name) {
    return null;
  }

  const raw = email && name ? `${name} <${email}>` : email || name;
  return buildRawParticipant(raw);
}

function parseMetadataAddressList(
  metadata = {},
  { fullKeys = [], emailKeys = [], fullKeyFragments = [] } = {}
) {
  const raw = metadataValues(metadata, fullKeys, fullKeyFragments)
    .concat(metadataValues(metadata, emailKeys, []))
    .join(", ");
  return parseAddressList(raw);
}

function looksLikeHtml(value) {
  const text = String(value || "");
  return (
    /<(html|body|table|tr|td|th|div|p|span|meta|img|br|section|article)\b/i.test(text) ||
    /<\/[a-z][a-z0-9-]*>/i.test(text) ||
    /&nbsp;|&#\d+;|&[a-z][a-z0-9]+;/i.test(text)
  );
}

function readableEmailBodyText(value) {
  const raw = String(value || "");
  if (!raw.trim()) {
    return "";
  }
  return normalizeWhitespace(looksLikeHtml(raw) ? stripHtmlToReadableText(raw) : raw);
}

function pickStructuredEmailBody(source, fallbackText = "") {
  const embeddedDocuments = source.embeddedDocuments || [];
  const preferredPlain = embeddedDocuments
    .filter((entry) => {
      const contentType = firstMetadataValue(entry.metadata, ["content-type"], ["content-type"]);
      return /text\/plain/i.test(contentType);
    })
    .map((entry) => readableEmailBodyText(entry.text || ""))
    .filter(Boolean)
    .sort((left, right) => right.length - left.length)[0];
  const preferredHtml = embeddedDocuments
    .filter((entry) => {
      const contentType = firstMetadataValue(entry.metadata, ["content-type"], ["content-type"]);
      return /text\/html/i.test(contentType);
    })
    .map((entry) => readableEmailBodyText(entry.text || ""))
    .filter(Boolean)
    .sort((left, right) => right.length - left.length)[0];

  return readableEmailBodyText(preferredPlain || preferredHtml || source.text || fallbackText);
}

function parseEmailFromMetadata(source, generatedAt, ruleset) {
  const metadata = source.documentMetadata || {};
  if (!metadata || Object.keys(metadata).length === 0) {
    return null;
  }

  const subject = normalizeSubject(
    firstMetadataValue(
      metadata,
      ["message:raw-header:subject", "dc:title", "title", "subject"],
      ["raw-header:subject"]
    ),
    source.name
  );
  const rawFrom = buildRawParticipantFromMetadata(metadata, {
    fullKeys: ["message:from", "message-from", "from", "dc:creator"],
    emailKeys: ["message:from-email", "message-from-email"],
    nameKeys: ["message:from-name", "message-from-name"]
  });
  const rawTo = parseMetadataAddressList(metadata, {
    fullKeys: ["message:to", "message-to", "to"],
    emailKeys: ["message:to-email", "message-to-email"]
  });
  const rawCc = parseMetadataAddressList(metadata, {
    fullKeys: ["message:cc", "message-cc", "cc"],
    emailKeys: ["message:cc-email", "message-cc-email"]
  });
  const rawBcc = parseMetadataAddressList(metadata, {
    fullKeys: ["message:bcc", "message-bcc", "bcc"],
    emailKeys: ["message:bcc-email", "message-bcc-email"]
  });
  const sentAt = normalizeTimestamp(
    firstMetadataValue(
      metadata,
      ["message:raw-header:date", "date", "dcterms:created", "created"],
      ["raw-header:date"]
    ) ||
      source.sourceUpdatedAt ||
      source.sourceCreatedAt ||
      generatedAt,
    generatedAt
  );
  const body = normalizeEmailBody(pickStructuredEmailBody(source, source.text || ""));

  return {
    subject,
    rawFrom: rawFrom?.key ? rawFrom : null,
    rawTo,
    rawCc,
    rawBcc,
    sentAt,
    body,
    messageIdHeader: normalizeMessageId(
      firstMetadataValue(
        metadata,
        ["message:raw-header:message-id", "message-id"],
        ["raw-header:message-id"]
      )
    ),
    inReplyTo: normalizeMessageId(
      firstMetadataValue(
        metadata,
        ["message:raw-header:in-reply-to", "in-reply-to"],
        ["raw-header:in-reply-to"]
      )
    ),
    references: parseReferenceIds(
      firstMetadataValue(
        metadata,
        ["message:raw-header:references", "references"],
        ["raw-header:references"]
      )
    )
  };
}

function splitAddressParts(value) {
  return String(value || "")
    .replace(/\n/g, " ")
    .split(/[;,](?=(?:[^<]*<[^>]*>)*[^>]*$)/)
    .map((item) => normalizeWhitespace(item))
    .filter(Boolean);
}

function buildRawParticipant(part) {
  const addressMatch = part.match(/<([^>]+)>/);
  const directAddressMatch = part.match(EMAIL_RE);
  const address = (addressMatch?.[1] || directAddressMatch?.[0] || "").trim().toLowerCase();
  const cleanName = part
    .replace(/<[^>]+>/g, "")
    .replace(/["']/g, "")
    .replace(/\([^)]*\)/g, "")
    .trim();
  const fallbackName = address ? address.split("@")[0] : cleanName;
  const domain = address.includes("@") ? address.split("@")[1] : "";

  return {
    key: address || cleanName.toLowerCase() || fallbackName.toLowerCase(),
    name: normalizeWhitespace(cleanName || fallbackName),
    address,
    domain
  };
}

function inferDepartmentLabel(ruleset, ...values) {
  const normalizedValues = values.map((value) => normalizeWhitespace(value || "")).filter(Boolean);

  for (const rule of ruleset?.departmentDictionary || []) {
    if (
      normalizedValues.some(
        (value) =>
          rule.nameMatchers.some((matcher) => matcher.test(value)) ||
          rule.emailMatchers.some((matcher) => matcher.test(value))
      )
    ) {
      return rule.department;
    }
  }

  for (const value of values) {
    const match = normalizeWhitespace(value || "").match(DEPARTMENT_RE);
    if (match?.[1]) {
      return normalizeWhitespace(match[1]);
    }
  }

  return "";
}

function inferCadence(text, ruleset) {
  const matched = detectReportSeries(text, ruleset);
  return matched?.cadence || (normalizeWhitespace(text) ? "irregular" : "unknown");
}

function inferCadenceFromDates(timestamps) {
  const ordered = unique(timestamps)
    .map((timestamp) => normalizeTimestamp(timestamp))
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right));

  if (ordered.length < 2) {
    return "unknown";
  }

  const gaps = [];
  for (let index = 1; index < ordered.length; index += 1) {
    gaps.push(dayDiff(ordered[index - 1], ordered[index]));
  }

  const averageGap = gaps.reduce((sum, value) => sum + value, 0) / gaps.length;
  if (averageGap >= 5 && averageGap <= 9) {
    return "weekly";
  }

  if (averageGap >= 25 && averageGap <= 35) {
    return "monthly";
  }

  return "unknown";
}

function parseAddressList(value) {
  const participants = [];
  const seen = new Set();

  for (const part of splitAddressParts(value)) {
    const participant = buildRawParticipant(part);
    if (!participant.key || seen.has(participant.key)) {
      continue;
    }

    seen.add(participant.key);
    participants.push(participant);
  }

  return participants;
}

function inferPrimaryDomain(rawMessages) {
  const counts = new Map();

  function ensureDomainStats(domain) {
    if (!counts.has(domain)) {
      counts.set(domain, {
        total: 0,
        senderCount: 0,
        recipientCount: 0
      });
    }
    return counts.get(domain);
  }

  for (const message of rawMessages) {
    if (message.rawFrom?.domain) {
      const stats = ensureDomainStats(message.rawFrom.domain);
      stats.total += 1;
      stats.senderCount += 1;
    }

    for (const participant of [...message.rawTo, ...message.rawCc, ...message.rawBcc]) {
      if (!participant?.domain) {
        continue;
      }
      const stats = ensureDomainStats(participant.domain);
      stats.total += 1;
      stats.recipientCount += 1;
    }
  }

  const entries = [...counts.entries()];
  const recipientCandidates = entries.filter(([, stats]) => stats.recipientCount > 0);
  const candidates = recipientCandidates.length > 0 ? recipientCandidates : entries;

  return (
    candidates
      .sort((left, right) => {
        const [leftDomain, leftStats] = left;
        const [rightDomain, rightStats] = right;
        const leftBidirectional = Number(
          leftStats.senderCount > 0 && leftStats.recipientCount > 0
        );
        const rightBidirectional = Number(
          rightStats.senderCount > 0 && rightStats.recipientCount > 0
        );
        const leftBalance = Math.abs(leftStats.recipientCount - leftStats.senderCount);
        const rightBalance = Math.abs(rightStats.recipientCount - rightStats.senderCount);
        return (
          rightStats.recipientCount - leftStats.recipientCount ||
          rightBidirectional - leftBidirectional ||
          rightStats.total - leftStats.total ||
          leftBalance - rightBalance ||
          leftStats.senderCount - rightStats.senderCount ||
          leftDomain.localeCompare(rightDomain)
        );
      })[0]?.[0] || ""
  );
}

function finalizeParticipant(rawParticipant, primaryDomain, ruleset) {
  if (!rawParticipant) {
    return null;
  }

  const relation = rawParticipant.domain
    ? rawParticipant.domain === primaryDomain
      ? "internal"
      : "external"
    : "unknown";

  return {
    id: `person::${rawParticipant.key}`,
    name: rawParticipant.name || rawParticipant.address || "未命名参与人",
    address: rawParticipant.address,
    domain: rawParticipant.domain,
    organization: rawParticipant.domain || "未知组织",
    department: inferDepartmentLabel(ruleset, rawParticipant.name, rawParticipant.address),
    relation
  };
}

function normalizeSubject(subject, sourceName = "") {
  const normalized = normalizeWhitespace(subject || sourceName || "未命名邮件");
  return normalized.replace(REPLY_PREFIX_RE, "").replace(/\s+/g, " ").trim() || "未命名邮件";
}

function normalizeEmailBody(value) {
  const lines = readableEmailBodyText(value)
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.trimEnd());
  const cleaned = [];

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed) {
      if (cleaned.length > 0 && cleaned[cleaned.length - 1] !== "") {
        cleaned.push("");
      }
      continue;
    }

    if (trimmed.startsWith(">")) {
      continue;
    }

    const headerMatch = trimmed.match(HEADER_LINE_RE);
    if (headerMatch && MIME_HEADER_RE.test(headerMatch[1])) {
      continue;
    }

    if (ORIGINAL_MESSAGE_RE.test(trimmed) && cleaned.length > 0) {
      break;
    }

    if (/^--[-\w]+$/.test(trimmed)) {
      continue;
    }

    cleaned.push(trimmed);
  }

  return normalizeWhitespace(cleaned.join("\n"));
}

function extractExcerpt(body) {
  const normalized = normalizeWhitespace(body);
  if (!normalized) {
    return "未提取到正文摘要。";
  }

  const firstParagraph = normalized.split(/\n{2,}/)[0] || normalized;
  const firstSentence =
    firstParagraph.split(/(?<=[。！？!?;；])/)[0] || firstParagraph;
  return truncateText(firstSentence, 140);
}

function inferMessageStatus(text, ruleset) {
  const normalized = normalizeWhitespace(text);

  if (detectReportSeries(normalized, ruleset)) {
    return "report";
  }

  if (CLOSED_SIGNAL_RE.test(normalized)) {
    return "closed";
  }

  if (OPEN_SIGNAL_RE.test(normalized) || RISK_SIGNAL_RE.test(normalized)) {
    return "watch";
  }

  return "active";
}

function inferTimelineType(message) {
  const combined = `${message.subject} ${message.body}`;

  if (message.status === "report") {
    return "report";
  }

  if (DECISION_SIGNAL_RE.test(combined)) {
    return "decision";
  }

  if (RISK_SIGNAL_RE.test(combined)) {
    return "risk";
  }

  if (message.status === "watch") {
    return "follow-up";
  }

  if (message.cc.length > 0 && message.to.length === 0) {
    return "handoff";
  }

  return "email";
}

function sourceChunkMap(chunks) {
  const map = new Map();

  for (const chunk of chunks || []) {
    if (!map.has(chunk.sourceId)) {
      map.set(chunk.sourceId, []);
    }

    map.get(chunk.sourceId).push(chunk);
  }

  return map;
}

function parseSourceAsEmail(source, relatedChunks, generatedAt, ruleset) {
  const text = normalizeWhitespace(source.text || "");
  if (!text && source.kind !== "email") {
    return null;
  }

  const metadataEnvelope = parseEmailFromMetadata(source, generatedAt, ruleset);
  const { headers, body } = parseHeaderBlock(text);
  const subject = normalizeSubject(metadataEnvelope?.subject || headers.subject, source.name);
  const rawFrom =
    metadataEnvelope?.rawFrom ||
    (headers.from ? buildRawParticipant(headers.from) : null);
  const rawTo = metadataEnvelope?.rawTo?.length
    ? metadataEnvelope.rawTo
    : parseAddressList(headers.to);
  const rawCc = metadataEnvelope?.rawCc?.length
    ? metadataEnvelope.rawCc
    : parseAddressList(headers.cc);
  const rawBcc = metadataEnvelope?.rawBcc?.length
    ? metadataEnvelope.rawBcc
    : parseAddressList(headers.bcc);
  const emailSignals =
    Number(Boolean(metadataEnvelope?.rawFrom || headers.from)) +
    Number(Boolean(metadataEnvelope?.subject || headers.subject)) +
    Number(Boolean(metadataEnvelope?.sentAt || headers.date)) +
    Number(rawTo.length > 0 || rawCc.length > 0 || rawBcc.length > 0) +
    Number(source.kind === "email");

  const sentAt = normalizeTimestamp(
    metadataEnvelope?.sentAt ||
      headers.date ||
      source.sourceUpdatedAt ||
      source.sourceCreatedAt ||
      generatedAt,
    generatedAt
  );
  const cleanedBody = normalizeEmailBody(
    metadataEnvelope?.body || (body || text)
  );
  const bodyText = cleanedBody || text;
  const keywords = keywordList(`${subject}\n${bodyText}`, 8, ruleset);
  const normalizedSubject = normalizeSubject(subject);
  const fallbackStatus = inferMessageStatus(`${subject}\n${bodyText}`, ruleset);

  return {
    isEmailLike: emailSignals >= 2,
    source,
    sourceId: source.id,
    sourceName: source.name,
    rawObjectId: source.rawObject?.objectId || "",
    rawObjectSha256: source.rawObject?.sha256 || "",
    chunkIds: (relatedChunks || []).map((chunk) => chunk.id),
    subject,
    normalizedSubject,
    rawFrom,
    rawTo,
    rawCc,
    rawBcc,
    sentAt,
    body: bodyText,
    excerpt: extractExcerpt(bodyText),
    keywords,
    status: fallbackStatus,
    messageIdHeader:
      metadataEnvelope?.messageIdHeader || normalizeMessageId(headers.messageId),
    inReplyTo: metadataEnvelope?.inReplyTo || normalizeMessageId(headers.inReplyTo),
    references: metadataEnvelope?.references?.length
      ? metadataEnvelope.references
      : parseReferenceIds(headers.references)
  };
}

function buildRawMessages(sources, chunks, generatedAt, ruleset) {
  const chunksBySource = sourceChunkMap(chunks);
  const emailSources = (sources || []).filter(
    (source) => source.kind === "email" && source.text && source.kind !== "image"
  );
  const rawMessages = [];

  for (const source of emailSources) {
    const parsed = parseSourceAsEmail(
      source,
      chunksBySource.get(source.id) || [],
      generatedAt,
      ruleset
    );

    if (parsed?.isEmailLike) {
      rawMessages.push(parsed);
    }
  }

  if (rawMessages.length > 0) {
    return rawMessages;
  }

  for (const source of emailSources) {
    if (!source.text || source.kind === "image") {
      continue;
    }

    rawMessages.push(
      parseSourceAsEmail(source, chunksBySource.get(source.id) || [], generatedAt, ruleset)
    );
  }

  return rawMessages.filter(Boolean);
}

function enrichMessages(rawMessages, settings, generatedAt, ruleset) {
  const primaryDomain = inferPrimaryDomain(rawMessages);
  const messages = rawMessages
    .map((message, index) => {
      const from = finalizeParticipant(message.rawFrom, primaryDomain, ruleset);
      const to = message.rawTo
        .map((participant) => finalizeParticipant(participant, primaryDomain, ruleset))
        .filter(Boolean);
      const cc = message.rawCc
        .map((participant) => finalizeParticipant(participant, primaryDomain, ruleset))
        .filter(Boolean);
      const bcc = message.rawBcc
        .map((participant) => finalizeParticipant(participant, primaryDomain, ruleset))
        .filter(Boolean);
      const sentAt = normalizeTimestamp(message.sentAt, generatedAt);
      const timeWeight = computeTimeWeight(
        sentAt,
        generatedAt,
        settings.retrievalHalfLifeDays
      );
      const freshness = formatFreshness(
        sentAt,
        generatedAt,
        settings.staleAfterDays
      );
      const participantIds = unique(
        [
          from?.id || "",
          ...to.map((item) => item.id),
          ...cc.map((item) => item.id),
          ...bcc.map((item) => item.id)
        ].filter(Boolean)
      );

      return {
        id: `email-${index + 1}`,
        sourceId: message.sourceId,
        sourceName: message.sourceName,
        rawObjectId: message.rawObjectId || "",
        rawObjectSha256: message.rawObjectSha256 || "",
        subject: message.subject,
        normalizedSubject: message.normalizedSubject,
        from,
        to,
        cc,
        bcc,
        sentAt,
        excerpt: message.excerpt,
        body: message.body,
        keywords: message.keywords,
        chunkIds: message.chunkIds,
        messageIdHeader: message.messageIdHeader,
        inReplyTo: message.inReplyTo,
        references: message.references,
        previousMessageIds: [],
        conversationKey: "",
        threadId: "",
        transactionId: "",
        participantIds,
        timeWeight,
        freshness,
        status: message.status,
        formalUseAllowed: freshness !== "historical"
      };
    })
    .sort((left, right) => left.sentAt.localeCompare(right.sentAt));

  const headerIdToMessageId = new Map();
  for (const message of messages) {
    if (message.messageIdHeader) {
      headerIdToMessageId.set(message.messageIdHeader, message.id);
    }
  }

  const linkedMessages = messages.map((message) => {
    const referenceHeaders = unique(
      [message.inReplyTo, ...message.references].filter(Boolean)
    );
    const previousMessageIds = unique(
      referenceHeaders
        .map((headerId) => headerIdToMessageId.get(headerId) || "")
        .filter(Boolean)
    );
    const conversationKey =
      referenceHeaders[0] ||
      message.messageIdHeader ||
      message.normalizedSubject ||
      message.id;

    return {
      ...message,
      previousMessageIds,
      conversationKey
    };
  });

  return {
    messages: linkedMessages,
    primaryDomain
  };
}

function buildThreads(messages, settings, generatedAt, ruleset) {
  const groups = new Map();
  const messageToThreadKey = new Map();
  const headerToThreadKey = new Map();

  for (const message of messages) {
    const fallbackKey = keywordList(`${message.subject}\n${message.body}`, 4, ruleset).join("-");
    const referencedThreadKey =
      message.previousMessageIds
        .map((messageId) => messageToThreadKey.get(messageId))
        .find(Boolean) ||
      [message.inReplyTo, ...message.references]
        .map((headerId) => headerToThreadKey.get(headerId))
        .find(Boolean);
    const key =
      referencedThreadKey ||
      (message.messageIdHeader && headerToThreadKey.get(message.messageIdHeader)) ||
      message.normalizedSubject ||
      fallbackKey ||
      message.id;

    if (!groups.has(key)) {
      groups.set(key, []);
    }

    groups.get(key).push(message);
    messageToThreadKey.set(message.id, key);
    if (message.messageIdHeader) {
      headerToThreadKey.set(message.messageIdHeader, key);
    }
  }

  const threads = [...groups.entries()].map(([groupKey, groupMessages], index) => {
    const ordered = [...groupMessages].sort((left, right) =>
      left.sentAt.localeCompare(right.sentAt)
    );
    const latestMessage = ordered[ordered.length - 1];
    const keywordCadence = inferCadence(
      ordered.map((message) => `${message.subject}\n${message.body}`).join("\n\n"),
      ruleset
    );
    const dateCadence = inferCadenceFromDates(
      ordered.map((message) => message.sentAt)
    );
    const cadence =
      keywordCadence === "weekly" || keywordCadence === "monthly"
        ? keywordCadence
        : dateCadence === "weekly" || dateCadence === "monthly"
          ? dateCadence
          : keywordCadence;
    const status =
      latestMessage.status === "closed"
        ? "closed"
        : ordered.some((message) => message.status === "watch")
          ? "watch"
          : formatFreshness(
                latestMessage.sentAt,
                generatedAt,
                settings.staleAfterDays
              ) === "historical"
            ? "stale"
            : "active";
    const freshness = formatFreshness(
      latestMessage.sentAt,
      generatedAt,
      settings.staleAfterDays
    );
    const timeWeight = computeTimeWeight(
      latestMessage.sentAt,
      generatedAt,
      settings.retrievalHalfLifeDays
    );
    const participantIds = unique(
      ordered.flatMap((message) => message.participantIds)
    );
    const senderIds = unique(
      ordered.map((message) => message.from?.id || "").filter(Boolean)
    );
    const keywords = keywordList(
      ordered.map((message) => `${message.subject}\n${message.body}`).join("\n\n"),
      8,
      ruleset
    );
    const categories = unique([
      cadence === "weekly" ? "weekly-report" : "",
      cadence === "monthly" ? "monthly-report" : "",
      senderIds.length >= 2 ? "multi-source" : "",
      dayDiff(ordered[0].sentAt, latestMessage.sentAt) >= 30 ? "long-running" : "",
      status === "watch" ? "ongoing" : ""
    ]).filter(Boolean);
    const pendingSignals = unique(
      ordered
        .filter((message) => message.status === "watch")
        .map((message) => message.excerpt)
    ).slice(0, 4);
    const summary =
      `${ordered.length} 封邮件，涉及 ${participantIds.length} 位参与人。` +
      `主题集中在 ${keywords.slice(0, 4).join(" / ") || ordered[0].subject}。` +
      (pendingSignals.length > 0
        ? `当前仍有 ${pendingSignals.length} 条待跟进线索。`
        : status === "closed"
          ? "最近状态显示该线程已收口。"
          : "当前线程仍在持续推进。");

    return {
      id: `thread-${index + 1}`,
      groupKey,
      subject: ordered[0].subject,
      normalizedSubject: ordered[0].normalizedSubject || groupKey,
      summary,
      messageIds: ordered.map((message) => message.id),
      participantIds,
      senderIds,
      startedAt: ordered[0].sentAt,
      latestActivityAt: latestMessage.sentAt,
      keywords,
      status,
      cadence,
      categories,
      pendingSignals,
      transactionId: "",
      timeWeight,
      freshness,
      formalUseAllowed: freshness !== "historical" && status !== "stale"
    };
  });

  const byMessageId = new Map();
  for (const thread of threads) {
    for (const messageId of thread.messageIds) {
      byMessageId.set(messageId, thread.id);
    }
  }

  const nextMessages = messages.map((message) => ({
    ...message,
    threadId: byMessageId.get(message.id) || ""
  }));

  return {
    messages: nextMessages,
    threads: threads.sort((left, right) => left.startedAt.localeCompare(right.startedAt))
  };
}

function participantOverlap(leftIds, rightIds) {
  const left = new Set(leftIds);
  const right = new Set(rightIds);

  if (left.size === 0 || right.size === 0) {
    return 0;
  }

  let overlap = 0;
  for (const id of left) {
    if (right.has(id)) {
      overlap += 1;
    }
  }

  return overlap / Math.max(left.size, right.size);
}

function shouldMergeThreadIntoGroup(thread, group, ruleset, windowDays) {
  if (
    thread.normalizedSubject &&
    thread.normalizedSubject === group.normalizedSubject
  ) {
    return true;
  }

  const similarity = jaccardSimilarity(
    `${thread.subject}\n${thread.keywords.join(" ")}`,
    `${group.title}\n${group.keywords.join(" ")}`,
    ruleset
  );
  const overlap = participantOverlap(thread.participantIds, group.participantIds);
  const gapDays = absoluteDayGap(thread.startedAt, group.latestActivityAt);
  const mergeRules = ruleset?.mergeRules || DEFAULT_MERGE_RULES;

  if (similarity >= mergeRules.highSimilarity && gapDays <= windowDays * 2) {
    return true;
  }

  if (
    similarity >= mergeRules.mediumSimilarity &&
    overlap >= mergeRules.mediumParticipantOverlap &&
    gapDays <= windowDays * 2
  ) {
    return true;
  }

  if (
    overlap >= mergeRules.highParticipantOverlap &&
    similarity >= 0.1 &&
    gapDays <= windowDays
  ) {
    return true;
  }

  return false;
}

function buildTransactions(threads, messages, settings, generatedAt, ruleset) {
  const groups = [];
  const messagesById = new Map(messages.map((message) => [message.id, message]));

  for (const thread of [...threads].sort((left, right) =>
    left.startedAt.localeCompare(right.startedAt)
  )) {
    let targetGroup = null;

    for (const group of groups) {
      if (
        shouldMergeThreadIntoGroup(
          thread,
          group,
          ruleset,
          settings.transactionWindowDays
        )
      ) {
        targetGroup = group;
        break;
      }
    }

    if (!targetGroup) {
      targetGroup = {
        id: `transaction-${groups.length + 1}`,
        title: thread.subject,
        normalizedSubject: thread.normalizedSubject,
        threadIds: [],
        messageIds: [],
        participantIds: [],
        keywords: [],
        startedAt: thread.startedAt,
        latestActivityAt: thread.latestActivityAt,
        pendingItems: [],
        decisions: [],
        categories: [],
        cadences: [],
        sourceDepartments: []
      };
      groups.push(targetGroup);
    }

    targetGroup.threadIds.push(thread.id);
    targetGroup.messageIds.push(...thread.messageIds);
    targetGroup.participantIds.push(...thread.participantIds);
    targetGroup.keywords.push(...thread.keywords);
    targetGroup.categories.push(...thread.categories);
    targetGroup.cadences.push(thread.cadence);
    targetGroup.startedAt =
      targetGroup.startedAt.localeCompare(thread.startedAt) <= 0
        ? targetGroup.startedAt
        : thread.startedAt;
    targetGroup.latestActivityAt =
      targetGroup.latestActivityAt.localeCompare(thread.latestActivityAt) >= 0
        ? targetGroup.latestActivityAt
        : thread.latestActivityAt;

    for (const messageId of thread.messageIds) {
      const message = messagesById.get(messageId);
      if (!message) {
        continue;
      }

      if (message.status === "watch") {
        targetGroup.pendingItems.push(message.excerpt);
      }

      if (DECISION_SIGNAL_RE.test(`${message.subject}\n${message.body}`)) {
        targetGroup.decisions.push(message.excerpt);
      }

      for (const participant of [message.from, ...message.to, ...message.cc, ...message.bcc]) {
        if (participant?.department) {
          targetGroup.sourceDepartments.push(participant.department);
        }
      }
    }
  }

  const transactions = groups.map((group) => {
    const freshness = formatFreshness(
      group.latestActivityAt,
      generatedAt,
      settings.staleAfterDays
    );
    const timeWeight = computeTimeWeight(
      group.latestActivityAt,
      generatedAt,
      settings.retrievalHalfLifeDays
    );
    const uniquePending = unique(group.pendingItems).slice(0, 6);
    const uniqueDecisions = unique(group.decisions).slice(0, 6);
    const keywords = keywordList(group.keywords.join(" "), 8, ruleset);
    const sourceSpread = unique(
      group.messageIds
        .map((messageId) => messagesById.get(messageId))
        .map((message) => message?.from?.id || "")
        .filter(Boolean)
    ).length;
    const cadence =
      group.cadences.includes("monthly")
        ? "monthly"
        : group.cadences.includes("weekly")
          ? "weekly"
          : group.cadences.includes("irregular")
            ? "irregular"
            : "unknown";
    const status =
      uniquePending.length > 0
        ? freshness === "historical"
          ? "stale"
          : "watch"
        : uniqueDecisions.length > 0
          ? "closed"
          : freshness === "historical"
            ? "stale"
            : "active";
    const categories = unique([
      ...group.categories,
      cadence === "weekly" ? "weekly-report" : "",
      cadence === "monthly" ? "monthly-report" : "",
      dayDiff(group.startedAt, group.latestActivityAt) >= 30 ? "long-running" : "",
      sourceSpread >= 2 ? "multi-source" : "",
      status === "watch" || status === "active" ? "ongoing" : ""
    ]).filter(Boolean);
    const summaryParts = [
      `覆盖 ${group.threadIds.length} 个线程、${unique(group.participantIds).length} 位参与人。`,
      `主要议题是 ${keywords.slice(0, 4).join(" / ") || group.title}。`
    ];

    if (cadence === "weekly") {
      summaryParts.push("该事务更像一条周报 / 周进展序列。");
    } else if (cadence === "monthly") {
      summaryParts.push("该事务更像一条月报 / 月进展序列。");
    }

    if (categories.includes("long-running")) {
      summaryParts.push("事务跨度较长，属于长期跟踪事项。");
    }

    if (categories.includes("multi-source")) {
      summaryParts.push("该事务由多个来源持续提及，已归并为同一件事。");
    }

    if (uniquePending.length > 0) {
      summaryParts.push(`当前仍有 ${uniquePending.length} 条待跟进事项。`);
    } else if (uniqueDecisions.length > 0) {
      summaryParts.push("邮件里已经形成可追溯的决定或结论。");
    } else {
      summaryParts.push("事务仍需要结合最新邮件继续观察。");
    }

    return {
      id: group.id,
      title: group.title || "未命名事务",
      normalizedSubject: group.normalizedSubject || "",
      summary: summaryParts.join(" "),
      status,
      startedAt: group.startedAt,
      latestActivityAt: group.latestActivityAt,
      threadIds: unique(group.threadIds),
      messageIds: unique(group.messageIds),
      participantIds: unique(group.participantIds),
      timelineEventIds: [],
      keywords,
      decisions: uniqueDecisions,
      pendingItems: uniquePending,
      cadence,
      categories,
      sourceDepartments: unique(group.sourceDepartments).slice(0, 12),
      sourceSpread,
      timeWeight,
      freshness,
      formalUseAllowed: freshness !== "historical" && status !== "stale"
    };
  });

  const transactionByThreadId = new Map();
  for (const transaction of transactions) {
    for (const threadId of transaction.threadIds) {
      transactionByThreadId.set(threadId, transaction.id);
    }
  }

  const nextThreads = threads.map((thread) => ({
    ...thread,
    transactionId: transactionByThreadId.get(thread.id) || "",
    formalUseAllowed:
      thread.formalUseAllowed &&
      transactionByThreadId.has(thread.id)
  }));

  const nextMessages = messages.map((message) => ({
    ...message,
    transactionId: transactionByThreadId.get(message.threadId) || ""
  }));

  return {
    messages: nextMessages,
    threads: nextThreads,
    transactions: transactions.sort((left, right) =>
      left.startedAt.localeCompare(right.startedAt)
    )
  };
}

function buildTimeline(messages, transactions, settings, generatedAt) {
  const transactionById = new Map(
    transactions.map((transaction) => [transaction.id, transaction])
  );

  const timeline = [...messages]
    .sort((left, right) => left.sentAt.localeCompare(right.sentAt))
    .map((message, index) => {
      const transaction = transactionById.get(message.transactionId);

      return {
        id: `timeline-${index + 1}`,
        timestamp: message.sentAt,
        title: transaction
          ? `${transaction.title} · ${message.subject}`
          : message.subject,
        summary: message.excerpt,
        type: inferTimelineType(message),
        source: message.sourceName,
        messageId: message.id,
        threadId: message.threadId,
        transactionId: message.transactionId,
        participantIds: message.participantIds,
        timeWeight: computeTimeWeight(
          message.sentAt,
          generatedAt,
          settings.retrievalHalfLifeDays
        ),
        freshness: formatFreshness(
          message.sentAt,
          generatedAt,
          settings.staleAfterDays
        )
      };
    });

  const transactionEventIds = new Map();
  for (const event of timeline) {
    if (!event.transactionId) {
      continue;
    }

    if (!transactionEventIds.has(event.transactionId)) {
      transactionEventIds.set(event.transactionId, []);
    }

    transactionEventIds.get(event.transactionId).push(event.id);
  }

  const nextTransactions = transactions.map((transaction) => ({
    ...transaction,
    timelineEventIds: transactionEventIds.get(transaction.id) || []
  }));

  return {
    timeline,
    transactions: nextTransactions
  };
}

function roleFromStats(stats) {
  if (stats.ccCount > stats.sentCount * 1.5 && stats.ccCount >= 2) {
    return "observer";
  }

  if (stats.decisionCount >= 2) {
    return "approver";
  }

  if (stats.threadStartCount >= 2 || stats.sentCount >= stats.receivedCount) {
    return "coordinator";
  }

  if (stats.transactionCount >= 2 && stats.sentCount >= 1) {
    return "driver";
  }

  return "specialist";
}

function buildPeople(messages, transactions, primaryDomain, settings, generatedAt) {
  const statsByPersonId = new Map();
  const transactionById = new Map(
    transactions.map((transaction) => [transaction.id, transaction])
  );
  const threadStarters = new Map();

  for (const message of messages) {
    if (message.threadId && !threadStarters.has(message.threadId) && message.from?.id) {
      threadStarters.set(message.threadId, message.from.id);
    }
  }

  for (const message of messages) {
    const allPeople = [];

    if (message.from) {
      allPeople.push({ participant: message.from, bucket: "from" });
    }

    allPeople.push(
      ...message.to.map((participant) => ({ participant, bucket: "to" })),
      ...message.cc.map((participant) => ({ participant, bucket: "cc" })),
      ...message.bcc.map((participant) => ({ participant, bucket: "bcc" }))
    );

    for (const { participant, bucket } of allPeople) {
      if (!participant?.id) {
        continue;
      }

      if (!statsByPersonId.has(participant.id)) {
        statsByPersonId.set(participant.id, {
          participant,
          aliases: new Set(),
          sentCount: 0,
          receivedCount: 0,
          ccCount: 0,
          bccCount: 0,
          transactionIds: new Set(),
          topics: new Map(),
          counterparties: new Map(),
          departments: new Map(),
          firstSeenAt: message.sentAt,
          lastSeenAt: message.sentAt,
          decisionCount: 0,
          threadStartCount: 0
        });
      }

      const stats = statsByPersonId.get(participant.id);
      stats.aliases.add(participant.name);
      stats.firstSeenAt =
        stats.firstSeenAt.localeCompare(message.sentAt) <= 0
          ? stats.firstSeenAt
          : message.sentAt;
      stats.lastSeenAt =
        stats.lastSeenAt.localeCompare(message.sentAt) >= 0
          ? stats.lastSeenAt
          : message.sentAt;

      if (message.transactionId) {
        stats.transactionIds.add(message.transactionId);
      }

      if (bucket === "from") {
        stats.sentCount += 1;
        if (DECISION_SIGNAL_RE.test(`${message.subject}\n${message.body}`)) {
          stats.decisionCount += 1;
        }

        if (threadStarters.get(message.threadId) === participant.id) {
          stats.threadStartCount += 1;
        }
      } else if (bucket === "to") {
        stats.receivedCount += 1;
      } else if (bucket === "cc") {
        stats.ccCount += 1;
      } else if (bucket === "bcc") {
        stats.bccCount += 1;
      }

      if (participant.department) {
        stats.departments.set(
          participant.department,
          (stats.departments.get(participant.department) || 0) + 1
        );
      }

      for (const keyword of message.keywords.slice(0, 6)) {
        stats.topics.set(keyword, (stats.topics.get(keyword) || 0) + 1);
      }

      for (const counterpartyId of message.participantIds) {
        if (counterpartyId === participant.id) {
          continue;
        }

        stats.counterparties.set(
          counterpartyId,
          (stats.counterparties.get(counterpartyId) || 0) + 1
        );
      }
    }
  }

  const people = [...statsByPersonId.values()].map((stats) => {
    const transactionCount = stats.transactionIds.size;
    const role = roleFromStats({
      sentCount: stats.sentCount,
      receivedCount: stats.receivedCount,
      ccCount: stats.ccCount,
      bccCount: stats.bccCount,
      transactionCount,
      decisionCount: stats.decisionCount,
      threadStartCount: stats.threadStartCount
    });
    const topTopics = [...stats.topics.entries()]
      .sort((left, right) => right[1] - left[1])
      .slice(0, 6)
      .map(([topic]) => topic);
    const topCounterparties = [...stats.counterparties.entries()]
      .sort((left, right) => right[1] - left[1])
      .slice(0, 6)
      .map(([personId]) => personId);
    const departments = [...stats.departments.entries()]
      .sort((left, right) => right[1] - left[1])
      .slice(0, 6)
      .map(([department]) => department);
    const freshness = formatFreshness(
      stats.lastSeenAt,
      generatedAt,
      settings.staleAfterDays
    );
    const relation = !stats.participant.domain
      ? "unknown"
      : stats.participant.domain === primaryDomain
        ? "internal"
        : "external";
    const timeWeight = computeTimeWeight(
      stats.lastSeenAt,
      generatedAt,
      settings.retrievalHalfLifeDays
    );

    return {
      id: stats.participant.id,
      name: stats.participant.name,
      primaryEmail: stats.participant.address,
      aliases: unique([...stats.aliases]).filter(
        (alias) => alias.toLowerCase() !== stats.participant.name.toLowerCase()
      ),
      organization: stats.participant.organization,
      primaryDepartment: departments[0] || stats.participant.department || "",
      departments,
      relation: relation === "unknown" ? "unknown" : relation,
      role,
      sentCount: stats.sentCount,
      receivedCount: stats.receivedCount,
      ccCount: stats.ccCount,
      bccCount: stats.bccCount,
      transactionCount,
      firstSeenAt: stats.firstSeenAt,
      lastSeenAt: stats.lastSeenAt,
      topTopics,
      topCounterparties,
      summary:
        `${stats.participant.name} 在 ${transactionCount} 个事务中出现，` +
        `发送 ${stats.sentCount} 封、直接接收 ${stats.receivedCount} 封、抄送 ${stats.ccCount} 封、密送 ${stats.bccCount} 封。` +
        `当前更像${role === "coordinator" ? "协调发起人" : role === "approver" ? "拍板 / 审批角色" : role === "observer" ? "观察 / 抄送角色" : role === "driver" ? "持续推进者" : "专业支持者"}。`,
      timeWeight,
      freshness,
      formalUseAllowed: freshness !== "historical"
    };
  });

  const peopleById = new Map(people.map((person) => [person.id, person]));

  const nextPeople = people.map((person) => ({
    ...person,
    topCounterparties: person.topCounterparties
      .map((personId) => peopleById.get(personId)?.name || "")
      .filter(Boolean)
  }));

  return nextPeople.sort((left, right) => {
    if (right.transactionCount !== left.transactionCount) {
      return right.transactionCount - left.transactionCount;
    }

    return right.sentCount - left.sentCount;
  });
}

function overlapDetails(leftValues, rightValues) {
  const left = new Set((leftValues || []).filter(Boolean));
  const right = new Set((rightValues || []).filter(Boolean));
  const shared = [...left].filter((value) => right.has(value));
  const denominator = Math.max(left.size, right.size, 1);

  return {
    shared,
    score: shared.length / denominator
  };
}

function buildTransactionAssociations(transactions, people, ruleset) {
  const peopleById = new Map((people || []).map((person) => [person.id, person]));
  const items = [];

  for (let leftIndex = 0; leftIndex < transactions.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < transactions.length; rightIndex += 1) {
      const left = transactions[leftIndex];
      const right = transactions[rightIndex];
      const participant = overlapDetails(left.participantIds, right.participantIds);
      const keywords = overlapDetails(left.keywords, right.keywords);
      const departments = overlapDetails(left.sourceDepartments, right.sourceDepartments);
      const titleSimilarity = jaccardSimilarity(
        `${left.title}\n${left.normalizedSubject}\n${left.summary}`,
        `${right.title}\n${right.normalizedSubject}\n${right.summary}`,
        ruleset
      );
      const cadenceMatch =
        left.cadence !== "unknown" &&
        right.cadence !== "unknown" &&
        left.cadence === right.cadence;
      const timeGapDays = absoluteDayGap(left.startedAt, right.latestActivityAt);
      const continuation =
        participant.score >= 0.2 &&
        timeGapDays <= 21 &&
        (left.status === "watch" ||
          right.status === "watch" ||
          left.status === "active" ||
          right.status === "active");

      const reasons = [];
      if (titleSimilarity >= 0.2 || keywords.score >= 0.25) {
        reasons.push("same-topic");
      }
      if (participant.score >= 0.25) {
        reasons.push("same-people");
      }
      if (departments.score >= 0.34) {
        reasons.push("same-department");
      }
      if (cadenceMatch && keywords.shared.length > 0) {
        reasons.push("same-cadence");
      }
      if (continuation) {
        reasons.push("continuation");
      }

      if (reasons.length === 0) {
        continue;
      }

      const strength = clamp(
        Number(
          (
            titleSimilarity * 0.35 +
            keywords.score * 0.25 +
            participant.score * 0.2 +
            departments.score * 0.1 +
            (cadenceMatch ? 0.05 : 0) +
            (continuation ? 0.05 : 0)
          ).toFixed(4)
        ),
        0.1,
        1
      );

      if (strength < 0.24 && reasons.length < 2) {
        continue;
      }

      const sharedParticipantNames = participant.shared
        .map((personId) => peopleById.get(personId)?.name || "")
        .filter(Boolean);
      const summaryParts = [];

      if (reasons.includes("same-topic")) {
        summaryParts.push(
          `主题高度接近，重叠关键词包括 ${keywords.shared.slice(0, 4).join(" / ") || "主要议题"}.`
        );
      }
      if (reasons.includes("same-people")) {
        summaryParts.push(
          `参与人重叠，涉及 ${sharedParticipantNames.slice(0, 4).join("、") || "同一批人"}.`
        );
      }
      if (reasons.includes("same-department")) {
        summaryParts.push(
          `涉及相同部门线索：${departments.shared.slice(0, 4).join("、") || "同部门"}.`
        );
      }
      if (reasons.includes("same-cadence")) {
        summaryParts.push(`都呈现 ${left.cadence} 节奏，更像同一系列进展。`);
      }
      if (reasons.includes("continuation")) {
        summaryParts.push(`时间上前后紧邻，可能是同一事项的续接或交接。`);
      }

      items.push({
        id: `association::${left.id}::${right.id}`,
        leftTransactionId: left.id,
        rightTransactionId: right.id,
        leftTitle: left.title,
        rightTitle: right.title,
        relationTypes: reasons,
        strength,
        summary: summaryParts.join(" "),
        evidenceMessageIds: unique([...left.messageIds.slice(0, 4), ...right.messageIds.slice(0, 4)]),
        sharedParticipants: sharedParticipantNames,
        sharedKeywords: keywords.shared.slice(0, 6),
        sharedDepartments: departments.shared.slice(0, 6),
        timeGapDays
      });
    }
  }

  items.sort((left, right) => {
    if (right.strength !== left.strength) {
      return right.strength - left.strength;
    }

    return left.timeGapDays - right.timeGapDays;
  });

  return {
    summary: {
      totalCount: items.length,
      strongCount: items.filter((item) => item.strength >= 0.55).length,
      continuationCount: items.filter((item) => item.relationTypes.includes("continuation")).length,
      crossDepartmentCount: items.filter((item) => item.sharedDepartments.length > 0).length
    },
    items
  };
}

function buildNetwork(transactions, threads, people, associations) {
  const nodes = [
    ...transactions.map((transaction) => ({
      id: transaction.id,
      kind: "transaction",
      label: transaction.title,
      summary: transaction.summary,
      timeWeight: transaction.timeWeight
    })),
    ...threads.map((thread) => ({
      id: thread.id,
      kind: "thread",
      label: thread.subject,
      summary: thread.summary,
      timeWeight: thread.timeWeight
    })),
    ...people.map((person) => ({
      id: person.id,
      kind: "person",
      label: person.name,
      summary: person.summary,
      timeWeight: person.timeWeight
    }))
  ];
  const edges = [];

  for (const transaction of transactions) {
    for (const participantId of transaction.participantIds) {
      const person = people.find((item) => item.id === participantId);
      if (!person) {
        continue;
      }

      edges.push({
        id: `edge::${participantId}::${transaction.id}`,
        sourceId: participantId,
        targetId: transaction.id,
        relation: person.role === "coordinator" || person.role === "driver" ? "drives" : "participates",
        weight: clamp(Number((person.timeWeight * transaction.timeWeight).toFixed(4)), 0.1, 1),
        evidenceIds: transaction.messageIds.slice(0, 6)
      });
    }
  }

  const collaborationCounts = new Map();

  for (const transaction of transactions) {
    const participants = [...transaction.participantIds].sort();
    for (let leftIndex = 0; leftIndex < participants.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < participants.length; rightIndex += 1) {
        const key = `${participants[leftIndex]}::${participants[rightIndex]}`;
        collaborationCounts.set(key, (collaborationCounts.get(key) || 0) + 1);
      }
    }
  }

  for (const [key, count] of collaborationCounts.entries()) {
    const [sourceId, targetId] = key.split("::");
    edges.push({
      id: `edge::collab::${sourceId}::${targetId}`,
      sourceId,
      targetId,
      relation: "collaborates",
      weight: clamp(Number((count / Math.max(1, transactions.length)).toFixed(4)), 0.1, 1),
      evidenceIds: []
    });
  }

  for (const association of associations.items || []) {
    edges.push({
      id: `edge::transaction::${association.leftTransactionId}::${association.rightTransactionId}`,
      sourceId: association.leftTransactionId,
      targetId: association.rightTransactionId,
      relation: "relates-to",
      weight: association.strength,
      evidenceIds: association.evidenceMessageIds
    });
  }

  return {
    nodes,
    edges
  };
}

function buildRetrieval(transactions, threads, messages, people, settings, generatedAt) {
  const items = [
    ...transactions.map((transaction) => ({
      id: `retrieval::transaction::${transaction.id}`,
      entityType: "transaction",
      title: transaction.title,
      text: `${transaction.title}\n${transaction.summary}\n${transaction.keywords.join(" ")}\n${transaction.pendingItems.join(" ")}\n${transaction.decisions.join(" ")}\n${transaction.categories.join(" ")}\n${transaction.sourceDepartments.join(" ")}`,
      snippet: truncateText(transaction.summary),
      timestamp: transaction.latestActivityAt,
      source: "事务汇总",
      keywords: transaction.keywords,
      participantIds: transaction.participantIds,
      transactionId: transaction.id,
      threadId: "",
      timeWeight: transaction.timeWeight,
      freshness: transaction.freshness,
      status: transaction.status,
      formalUseAllowed: transaction.formalUseAllowed,
      reviewDueAt: addDays(transaction.latestActivityAt, settings.staleAfterDays)
    })),
    ...threads.map((thread) => ({
      id: `retrieval::thread::${thread.id}`,
      entityType: "thread",
      title: thread.subject,
      text: `${thread.subject}\n${thread.summary}\n${thread.keywords.join(" ")}\n${thread.pendingSignals.join(" ")}\n${thread.categories.join(" ")}\n${thread.cadence}`,
      snippet: truncateText(thread.summary),
      timestamp: thread.latestActivityAt,
      source: "邮件线程",
      keywords: thread.keywords,
      participantIds: thread.participantIds,
      transactionId: thread.transactionId,
      threadId: thread.id,
      timeWeight: thread.timeWeight,
      freshness: thread.freshness,
      status: thread.status,
      formalUseAllowed: thread.formalUseAllowed,
      reviewDueAt: addDays(thread.latestActivityAt, settings.staleAfterDays)
    })),
    ...messages.map((message) => ({
      id: `retrieval::message::${message.id}`,
      entityType: "message",
      title: message.subject,
      text: `${message.subject}\n${message.body}\n${message.keywords.join(" ")}\n${message.references.join(" ")}`,
      snippet: message.excerpt,
      timestamp: message.sentAt,
      source: message.sourceName,
      keywords: message.keywords,
      participantIds: message.participantIds,
      transactionId: message.transactionId,
      threadId: message.threadId,
      timeWeight: message.timeWeight,
      freshness: message.freshness,
      status: message.status,
      formalUseAllowed: message.formalUseAllowed,
      reviewDueAt: addDays(message.sentAt, settings.staleAfterDays)
    })),
    ...people.map((person) => ({
      id: `retrieval::person::${person.id}`,
      entityType: "person",
      title: person.name,
      text: `${person.name}\n${person.summary}\n${person.topTopics.join(" ")}\n${person.topCounterparties.join(" ")}\n${person.departments.join(" ")}`,
      snippet: truncateText(person.summary),
      timestamp: person.lastSeenAt,
      source: person.organization,
      keywords: person.topTopics,
      participantIds: [person.id],
      transactionId: "",
      threadId: "",
      timeWeight: person.timeWeight,
      freshness: person.freshness,
      status: person.role,
      formalUseAllowed: person.formalUseAllowed,
      reviewDueAt: addDays(person.lastSeenAt, settings.staleAfterDays)
    }))
  ].sort((left, right) => right.timestamp.localeCompare(left.timestamp));

  const reviewQueue = items
    .filter((item) => !item.formalUseAllowed || item.freshness === "historical")
    .slice(0, 20);

  const searchPreview = items
    .filter((item) => item.entityType === "transaction" || item.entityType === "person")
    .map((item) => ({
      itemId: item.id,
      entityType: item.entityType,
      title: item.title,
      snippet: item.snippet,
      timestamp: item.timestamp,
      source: item.source,
      relevanceScore: 1,
      timeWeight: item.timeWeight,
      finalScore: item.timeWeight,
      freshness: item.freshness,
      transactionId: item.transactionId || undefined,
      threadId: item.threadId || undefined
    }))
    .sort((left, right) => right.finalScore - left.finalScore)
    .slice(0, 12);

  return {
    referenceTime: generatedAt,
    halfLifeDays: settings.retrievalHalfLifeDays,
    staleAfterDays: settings.staleAfterDays,
    items,
    reviewQueue,
    searchPreview
  };
}

function buildOverview(emails, threads, transactions, people, timeline, retrieval) {
  const freshnessCounts = retrieval.items.reduce(
    (accumulator, item) => {
      accumulator[item.freshness] += 1;
      return accumulator;
    },
    {
      current: 0,
      aging: 0,
      historical: 0
    }
  );

  return {
    emailCount: emails.length,
    threadCount: threads.length,
    transactionCount: transactions.length,
    peopleCount: people.length,
    timelineCount: timeline.length,
    currentCount: freshnessCounts.current,
    agingCount: freshnessCounts.aging,
    historicalCount: freshnessCounts.historical
  };
}

export function runEmailAnalysis({
  sources,
  chunks,
  settings,
  generatedAt,
  rules
}) {
  const ruleset = compileAnalysisRuleSet(rules);
  const rawMessages = buildRawMessages(sources, chunks, generatedAt, ruleset);
  const { messages: enrichedMessages, primaryDomain } = enrichMessages(
    rawMessages,
    settings,
    generatedAt,
    ruleset
  );
  const threaded = buildThreads(enrichedMessages, settings, generatedAt, ruleset);
  const transactionized = buildTransactions(
    threaded.threads,
    threaded.messages,
    settings,
    generatedAt,
    ruleset
  );
  const timelineResult = buildTimeline(
    transactionized.messages,
    transactionized.transactions,
    settings,
    generatedAt
  );
  const people = buildPeople(
    transactionized.messages,
    timelineResult.transactions,
    primaryDomain,
    settings,
    generatedAt
  );
  const associations = buildTransactionAssociations(
    timelineResult.transactions,
    people,
    ruleset
  );
  const network = buildNetwork(
    timelineResult.transactions,
    transactionized.threads,
    people,
    associations
  );
  const retrieval = buildRetrieval(
    timelineResult.transactions,
    transactionized.threads,
    transactionized.messages,
    people,
    settings,
    generatedAt
  );
  const overview = buildOverview(
    transactionized.messages,
    transactionized.threads,
    timelineResult.transactions,
    people,
    timelineResult.timeline,
    retrieval
  );

  return {
    overview,
    emails: transactionized.messages,
    threads: transactionized.threads,
    transactions: timelineResult.transactions,
    people,
    timeline: timelineResult.timeline,
    network,
    associations,
    retrieval
  };
}
