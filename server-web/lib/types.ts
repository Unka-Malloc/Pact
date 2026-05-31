export type AgentSettings = {
  tikaJarPath: string;
  javaBinPath: string;
  tikaTimeoutMs: number;
  modelIntelligenceEnabled: boolean;
  googleApiKey: string;
  googleApiKeyConfigured?: boolean;
  googleModel: string;
  openAiModel: string;
  defaultModelProvider: string;
  defaultModel: string;
  modelLibraryEntries: string[];
  modelLibraryAgentIds?: string[];
  modelLibraryAgents: AgentModelConfig[];
  agentPermissionGroups: AgentPermissionGroup[];
  agentExploreDefaults: AgentExploreDefaults;
  agentToolExecution: AgentToolExecutionConfig;
  moduleModelAssignments: Record<string, { provider: string; model: string }>;
  moduleAgentProfiles: Record<string, ModuleAgentProfileGroup>;
  moduleIntelligence: Record<string, boolean>;
  openRouterApiKey: string;
  openRouterApiKeyConfigured?: boolean;
  openRouterBaseUrl: string;
  openRouterModel: string;
  deepSeekApiKey: string;
  deepSeekApiKeyConfigured?: boolean;
  deepSeekBaseUrl: string;
  deepSeekModel: string;
  deepSeekTimeoutMs: number;
  copilotEndpoint: string;
  copilotApiKey: string;
  copilotApiKeyConfigured?: boolean;
  copilotModel: string;
  localModelEndpoint: string;
  localModelName: string;
  customModelAlias: string;
  customModelLabel: string;
  customModelApiKey: string;
  customModelApiKeyConfigured?: boolean;
  customHttpAdapter: AgentGatewayConfig;
  customHttpAdapters: AgentGatewayConfig[];
  analysisModuleId: string;
  ocrEnabled: boolean;
  ocrPythonPath: string;
  ocrLanguage: string;
  retrievalHalfLifeDays: number;
  staleAfterDays: number;
  transactionWindowDays: number;
  knowledgeIngestTargets?: KnowledgeIngestTarget[];
};

export type KnowledgeIngestTargetKind = "global" | "external" | "team" | "user";

export type KnowledgeIngestTarget = {
  kind: KnowledgeIngestTargetKind;
  label: string;
  provider?: string;
  refs?: string[];
};

export type ModelProbeResponse = {
  ok: boolean;
  configured: boolean;
  provider: string;
  model: string;
  statusCode: number;
  latencyMs: number;
  checkedAt: string;
  message: string;
  answerSnippet?: string;
};

export type AgentGatewayConfig = {
  alias: string;
  label?: string;
  url: string;
  token: string;
  tokenConfigured?: boolean;
  tokenHeader: string;
  tokenPrefix: string;
  agentName: string;
  pluginList: string[];
  engine: string;
  parameters: Record<string, unknown>;
  timeoutMs: number;
};

export type AgentModelConfig = {
  uid?: string;
  instanceId: string;
  provider: string;
  alias: string;
  label?: string;
  baseUrl?: string;
  url?: string;
  model: string;
  apiKey?: string;
  apiKeyConfigured?: boolean;
  token?: string;
  tokenConfigured?: boolean;
  tokenHeader?: string;
  tokenPrefix?: string;
  agentName?: string;
  pluginList?: string[];
  engine?: string;
  systemPrompt?: string;
  parameters?: Record<string, unknown>;
  moduleAccess?: AgentModuleAccess;
  permissionGroupId?: string;
  timeoutMs?: number;
  parametersText?: string;
};

export type AgentSelectorOption = {
  agentUid: string;
  value: string;
  label: string;
  provider: string;
  model: string;
  permissionGroupId?: string;
  moduleIds: string[];
  capabilities: string[];
  status: "available" | "unconfigured" | "unsupported";
  selectable: boolean;
  reason?: string;
};

export type AgentSelectorState = {
  schemaVersion: number;
  source: string;
  updatedAt: string;
  options: AgentSelectorOption[];
};

export type AgentConfigManifestEntry = {
  id: string;
  file: string;
  label: string;
  enabled: boolean;
};

export type AgentConfigManifest = {
  schemaVersion: number;
  kind: string;
  updatedAt: string;
  entries: AgentConfigManifestEntry[];
};

export type AgentConfigState = {
  rootPath: string;
  modelListPath: string;
  agentListPath: string;
  modelManifest: AgentConfigManifest;
  agentManifest: AgentConfigManifest;
};

export type AgentModuleAccess = {
  mode: "all" | "selected";
  moduleIds: string[];
};

export type AgentPermissionGroup = {
  id: string;
  label: string;
  description?: string;
  enabled: boolean;
  scopeIds: string[];
  toolsetIds: string[];
  toolAllow: string[];
  toolDeny: string[];
};

export type ModuleAgentProfile = {
  enabled: boolean;
  role: string;
  contextProfileId: string;
  systemPrompt: string;
  parameters: Record<string, unknown>;
  parametersText?: string;
  dependencyContext: Record<string, unknown>;
  dependencyContextText?: string;
};

export type ModuleAgentProfileGroup = {
  primaryAgent: string;
  agents: Record<string, ModuleAgentProfile>;
};

export type AgentExploreDefaults = {
  systemPrompt: string;
  toolPolicyPrompt: string;
  continuationPrompt: string;
  answerTemplate: string;
  contextProfileId: string;
  thinkingMode: string;
  temperature: number;
  maxTokens: number;
  maxIterations: number;
  limit: number;
  toolChoice: string;
  reviewFusionModelAlias?: string;
  reviewFusionSystemPrompt?: string;
  reviewFusionTemperature?: number;
  reviewFusionMaxTokens?: number;
};

export type AgentToolExecutionConfig = {
  functionCallSchema?: Record<string, unknown>;
  http: {
    enabled: boolean;
    allowedHosts: string[];
    timeoutMs: number;
    maxResponseBytes: number;
  };
  local: {
    enabled: boolean;
    allowDirectCommands: boolean;
    timeoutMs: number;
    maxOutputBytes: number;
    nodeCommand?: string;
    commands: Array<{
      commandId: string;
      label: string;
      command: string;
      args: string[];
      cwd: string;
      description: string;
      variables?: Array<{
        name: string;
        label?: string;
        required?: boolean;
        defaultValue?: string;
        allowedValues?: string[];
        description?: string;
      }>;
      allowExtraArgs?: boolean;
    }>;
  };
};

export type AgentRegistryItem = {
  alias: string;
  model: string;
  provider: string;
  label: string;
  callMode: string;
  serverHttpPath: string;
  serverRpcMethod: string;
  urlConfigured: boolean;
  tokenConfigured: boolean;
  agentName: string;
  pluginList: string[];
  engine: string;
  timeoutMs: number;
  parameterKeys: string[];
  systemPromptConfigured?: boolean;
  capabilities: string[];
};

export type AgentRegistryResponse = {
  schemaVersion: number;
  provider: string;
  defaultAlias: string;
  agents: AgentRegistryItem[];
};

export type AgentGatewayCallRequest = {
  modelAlias?: string;
  alias?: string;
  agentName?: string;
  systemPrompt?: string;
  pluginList?: string[] | string;
  question: string;
  sessionId?: string;
  taskId?: string;
  moduleId?: string;
  featureId?: string;
  functionId?: string;
  userId?: string;
  projectId?: string;
  engine?: string;
  parameters?: Record<string, unknown>;
};

export type AgentGatewayCallResponse = {
  ok: boolean;
  answer: string;
  text: string;
  dialogId: string;
  finish: boolean;
  request: AgentGatewayCallRequest;
  upstream: {
    status: number;
    contentType: string;
  };
  events: Array<{
    type: string;
    content: string;
    nodeId: string | null;
    riskDescription: string | null;
    finish: boolean;
  }>;
  chunks?: {
    answer?: string[];
    text?: string[];
    rawText?: string[];
  };
  toolCalls?: Array<{
    id: string;
    type: "function" | string;
    function: {
      name: string;
      arguments: string;
    };
  }>;
};

export type AgentExploreToolResult = {
  tool: string;
  arguments: Record<string, unknown>;
  status?: string;
  startedAt?: string;
  completedAt?: string;
  result?: Record<string, unknown> | null;
};

export type AgentExploreStep = {
  iteration: number;
  status?: string;
  phase?: string;
  contextBudget?: Record<string, unknown>;
  model?: Record<string, unknown>;
  functionCallSource?: string;
  toolCalls?: Array<{
    id: string;
    name: string;
    arguments: Record<string, unknown>;
    status?: string;
    selectedAt?: string;
    startedAt?: string;
    completedAt?: string;
  }>;
  toolResults?: AgentExploreToolResult[];
  events?: Array<Record<string, unknown>>;
};

export type AgentExploreRunResponse = {
  protocolVersion: string;
  ok: boolean;
  pending?: boolean;
  workspace?: Record<string, unknown>;
  run?: Record<string, unknown>;
  answer?: string;
  evidenceRefs?: string[];
  toolResults?: AgentExploreToolResult[];
  contextPack?: Record<string, unknown>;
  degraded?: boolean;
  steps?: AgentExploreStep[];
  error?: string;
};

export type AgentSyncTopicRule = {
  topic: string;
  label: string;
  description: string;
  enabled: boolean;
  retain: boolean;
};

export type AgentSyncConfig = {
  schemaVersion: number;
  enabled: boolean;
  defaultTopicEnabled: boolean;
  updatedAt: string;
  topics: AgentSyncTopicRule[];
};

export type AgentSyncPublishRequest = {
  topic: string;
  type?: string;
  agentName?: string;
  clientId?: string;
  sessionId?: string;
  userId?: string;
  projectId?: string;
  retain?: boolean;
  payload?: Record<string, unknown>;
  data?: Record<string, unknown>;
};

export type CodexOAuthStatus = {
  configured: boolean;
  valid: boolean;
  authMode: string;
  accountIdConfigured: boolean;
  accessTokenExpiresAt: string;
  lastRefresh: string;
  email: string;
  hasRefreshToken: boolean;
  codexHome: string;
  authPath: string;
  reason: string;
  login: null | {
    active: boolean;
    authorizationUrl: string;
    userCode: string;
    startedAt: string;
    expiresAt: string;
    message: string;
    error: string;
  };
};

export type CodexOAuthLogin = {
  started: boolean;
  alreadyValid: boolean;
  authorizationUrl: string;
  userCode: string;
  expiresAt?: string;
  status: CodexOAuthStatus;
};

export type ProtocolEvent = {
  schemaVersion: number;
  offset: number;
  id: string;
  topic: string;
  type: string;
  publisher: string;
  publishedAt: string;
  payload: Record<string, unknown>;
};

export type EventSubscriptionResponse = {
  cursor: number;
  nextCursor: number;
  topics: string[];
  events: ProtocolEvent[];
  snapshots?: ProtocolEvent[];
};

export type AnalysisModuleInfo = {
  id: string;
  label: string;
  description: string;
  executionMode: string;
};

export type ReportSeriesRule = {
  id: string;
  label: string;
  enabled?: boolean;
  cadence: "weekly" | "monthly" | "irregular";
  keywords: string[];
};

export type SynonymDictionaryEntry = {
  canonical: string;
  enabled?: boolean;
  terms: string[];
};

export type DepartmentDictionaryEntry = {
  department: string;
  enabled?: boolean;
  keywords: string[];
  emailKeywords: string[];
};

export type TransactionMergeRules = {
  highSimilarity: number;
  mediumSimilarity: number;
  mediumParticipantOverlap: number;
  highParticipantOverlap: number;
};

export type EmailRuleSet = {
  schemaVersion: number;
  updatedAt: string;
  reportSeries: ReportSeriesRule[];
  synonymDictionary: SynonymDictionaryEntry[];
  departmentDictionary: DepartmentDictionaryEntry[];
  keywordStopwords: string[];
  transactionMergeRules: TransactionMergeRules;
};

export type EmailRuleSetResponse = {
  path: string;
  rules: EmailRuleSet;
};

export type ExpertVocabularyEntry = {
  id: string;
  pathSegments: string[];
  label: string;
  keywords: string[];
  domains: string[];
  status: "draft" | "active" | "retired";
  notes: string;
};

export type ExpertVocabulary = {
  schemaVersion: number;
  version: number;
  updatedAt: string;
  publishedAt: string;
  source: string;
  checksum: string;
  entries: ExpertVocabularyEntry[];
};

export type ExpertVocabularyResponse = {
  path: string;
  vocabulary: ExpertVocabulary;
};

export type KnowledgeTaxonomyCategory = {
  categoryId: string;
  pathSegments: string[];
  path: string;
  label: string;
  keywords: string[];
  domains: string[];
  strongTerms: string[];
  weakTerms: string[];
  negativeTerms: string[];
  queryTriggers: string[];
  triggerAliases: Record<string, string[]>;
  expansionTerms: string[];
  primaryTerms: string[];
  anchorTerms: string[];
  requiredTerms: string[];
  contextSignals: string[];
  intentLabel: string;
  minAlignmentScore: number;
  minPrimaryHits: number;
  minPositiveHits: number;
  negativeDominance: number;
  notes: string;
};

export type KnowledgeTaxonomy = {
  schemaVersion: number;
  version: number;
  source: string;
  updatedAt: string;
  publishedAt: string;
  fallbackPath: string;
  defaultIntent: string;
  keywordStopwords: string[];
  classifierPrompt: Record<string, unknown>;
  fallbackIntents: Array<{
    intent: string;
    terms: string[];
  }>;
  categories: KnowledgeTaxonomyCategory[];
  checksum: string;
};

export type KnowledgeGuidanceSummary = {
  taxonomyPath: string;
  expertVocabularyPath: string;
  emailRulesPath: string;
  schemaVersion: number;
  version: number;
  source: string;
  checksum: string;
  categoryCount: number;
  guidance: {
    taxonomy: {
      version: number;
      checksum: string;
      categoryCount: number;
    };
    expertVocabulary: {
      version: number;
      source: string;
      updatedAt: string;
      entryCount: number;
    };
    emailRules: {
      updatedAt: string;
      reportSeriesCount: number;
      synonymCount: number;
      departmentCount: number;
    };
    compiled: {
      categoryCount: number;
      checksum: string;
    };
  } | null;
};

export type KnowledgeTaxonomyResponse = {
  path: string;
  taxonomy: KnowledgeTaxonomy;
  guidance?: KnowledgeGuidanceSummary;
};

export type ExpertVocabularyHistoryResponse = {
  current: {
    path: string;
    schemaVersion: number;
    version: number;
    updatedAt: string;
    publishedAt: string;
    checksum: string;
    entryCount: number;
    activeEntryCount: number;
  };
  history: Array<{
    version: number;
    archivedAt: string;
    path: string;
  }>;
};

export type SourceFile = {
  id: string;
  name: string;
  path: string;
  kind: "text" | "pdf" | "docx" | "document" | "image" | "email";
  sourceCreatedAt?: string;
  sourceUpdatedAt?: string;
  sourceCollectedAt?: string;
  text?: string;
  mediaType?: string;
  imageDataUrl?: string;
  imageBuffer?: unknown;
  rawObjectId?: string;
  originalFileName?: string;
  originalRelativePath?: string;
  rawObjectSha256?: string;
  rawObjectByteSize?: number;
  documentParserId?: string;
  documentMetadata?: Record<string, unknown>;
};

export type EmailParticipant = {
  id: string;
  name: string;
  address: string;
  domain: string;
  organization: string;
  department: string;
  relation: "internal" | "external" | "unknown";
};

export type EmailMessageStatus = "active" | "watch" | "closed" | "report";

export type EmailMessage = {
  id: string;
  sourceId: string;
  sourceName: string;
  rawObjectId?: string;
  rawObjectSha256?: string;
  subject: string;
  normalizedSubject: string;
  from: EmailParticipant | null;
  to: EmailParticipant[];
  cc: EmailParticipant[];
  bcc: EmailParticipant[];
  sentAt: string;
  excerpt: string;
  body: string;
  keywords: string[];
  chunkIds: string[];
  messageIdHeader: string;
  inReplyTo: string;
  references: string[];
  previousMessageIds: string[];
  conversationKey: string;
  threadId: string;
  transactionId: string;
  participantIds: string[];
  timeWeight: number;
  freshness: "current" | "aging" | "historical";
  status: EmailMessageStatus;
  formalUseAllowed: boolean;
};

export type EmailThreadStatus = "active" | "watch" | "closed" | "stale";

export type EmailThread = {
  id: string;
  subject: string;
  normalizedSubject: string;
  summary: string;
  messageIds: string[];
  participantIds: string[];
  senderIds: string[];
  startedAt: string;
  latestActivityAt: string;
  keywords: string[];
  status: EmailThreadStatus;
  cadence: "weekly" | "monthly" | "irregular" | "unknown";
  categories: string[];
  pendingSignals: string[];
  transactionId: string;
  timeWeight: number;
  freshness: "current" | "aging" | "historical";
  formalUseAllowed: boolean;
};

export type EmailTransactionStatus = "active" | "watch" | "closed" | "stale";

export type TransactionLifecycleStage = "new" | "matched" | "recovered";

export type TransactionLifecycle = {
  stage: TransactionLifecycleStage;
  previousState: "" | "active" | "interrupted" | "archived";
  nextState: "active" | "interrupted" | "archived";
  matchScore: number;
  matchReasons: string[];
  matchedBatchId: string;
  matchedTransactionId: string;
  pulledEventCount: number;
  pulledBatchCount: number;
  pulledTransactionCount: number;
};

export type EmailTransaction = {
  id: string;
  title: string;
  normalizedSubject: string;
  summary: string;
  status: EmailTransactionStatus;
  startedAt: string;
  latestActivityAt: string;
  threadIds: string[];
  messageIds: string[];
  participantIds: string[];
  timelineEventIds: string[];
  keywords: string[];
  decisions: string[];
  pendingItems: string[];
  cadence: "weekly" | "monthly" | "irregular" | "unknown";
  categories: string[];
  sourceDepartments: string[];
  sourceSpread: number;
  timeWeight: number;
  freshness: "current" | "aging" | "historical";
  formalUseAllowed: boolean;
  lineageId?: string;
  lifecycle?: TransactionLifecycle;
};

export type TimelineEventType =
  | "email"
  | "report"
  | "follow-up"
  | "decision"
  | "risk"
  | "handoff";

export type TimelineEvent = {
  id: string;
  timestamp: string;
  title: string;
  summary: string;
  type: TimelineEventType;
  source: string;
  messageId: string;
  threadId: string;
  transactionId: string;
  participantIds: string[];
  timeWeight: number;
  freshness: "current" | "aging" | "historical";
  lineageId?: string;
  timelinePhase?: "current" | "history";
  originBatchId?: string;
  originTransactionId?: string;
};

export type PersonRole =
  | "coordinator"
  | "driver"
  | "approver"
  | "specialist"
  | "observer";

export type PersonProfile = {
  id: string;
  name: string;
  primaryEmail: string;
  aliases: string[];
  organization: string;
  primaryDepartment: string;
  departments: string[];
  relation: "internal" | "external" | "mixed" | "unknown";
  role: PersonRole;
  sentCount: number;
  receivedCount: number;
  ccCount: number;
  bccCount: number;
  transactionCount: number;
  firstSeenAt: string;
  lastSeenAt: string;
  topTopics: string[];
  topCounterparties: string[];
  summary: string;
  timeWeight: number;
  freshness: "current" | "aging" | "historical";
  formalUseAllowed: boolean;
};

export type KnowledgeNetworkNode = {
  id: string;
  kind: "transaction" | "thread" | "person";
  label: string;
  summary: string;
  timeWeight: number;
};

export type KnowledgeNetworkEdge = {
  id: string;
  sourceId: string;
  targetId: string;
  relation: "drives" | "participates" | "collaborates" | "relates-to";
  weight: number;
  evidenceIds: string[];
};

export type KnowledgeNetwork = {
  nodes: KnowledgeNetworkNode[];
  edges: KnowledgeNetworkEdge[];
};

export type TransactionAssociationRelation =
  | "same-topic"
  | "same-people"
  | "same-department"
  | "same-cadence"
  | "continuation";

export type TransactionAssociation = {
  id: string;
  leftTransactionId: string;
  rightTransactionId: string;
  leftTitle: string;
  rightTitle: string;
  relationTypes: TransactionAssociationRelation[];
  strength: number;
  summary: string;
  evidenceMessageIds: string[];
  sharedParticipants: string[];
  sharedKeywords: string[];
  sharedDepartments: string[];
  timeGapDays: number;
};

export type TransactionAssociationSummary = {
  totalCount: number;
  strongCount: number;
  continuationCount: number;
  crossDepartmentCount: number;
};

export type TransactionAssociationCollection = {
  summary: TransactionAssociationSummary;
  items: TransactionAssociation[];
};

export type RetrievalEntityType =
  | "message"
  | "thread"
  | "transaction"
  | "person";

export type RetrievalItem = {
  id: string;
  entityType: RetrievalEntityType;
  title: string;
  text: string;
  snippet: string;
  timestamp: string;
  source: string;
  keywords: string[];
  participantIds: string[];
  transactionId?: string;
  threadId?: string;
  timeWeight: number;
  freshness: "current" | "aging" | "historical";
  status: string;
  formalUseAllowed: boolean;
  reviewDueAt: string;
};

export type RetrievalSearchResult = {
  itemId: string;
  entityType: RetrievalEntityType;
  title: string;
  snippet: string;
  timestamp: string;
  source: string;
  relevanceScore: number;
  timeWeight: number;
  finalScore: number;
  freshness: "current" | "aging" | "historical";
  transactionId?: string;
  threadId?: string;
};

export type TimeWeightedRetrieval = {
  referenceTime: string;
  halfLifeDays: number;
  staleAfterDays: number;
  items: RetrievalItem[];
  reviewQueue: RetrievalItem[];
  searchPreview: RetrievalSearchResult[];
};

export type SplitOverview = {
  emailCount: number;
  threadCount: number;
  transactionCount: number;
  peopleCount: number;
  timelineCount: number;
  currentCount: number;
  agingCount: number;
  historicalCount: number;
};

export type SplitLifecycleSummary = {
  newCount: number;
  matchedCount: number;
  recoveredCount: number;
  pulledEventCount: number;
  pulledBatchCount: number;
  pulledTransactionCount: number;
  activeLineageCount: number;
  interruptedLineageCount: number;
  archivedLineageCount: number;
};

export type NormalizedDocumentEntry = {
  documentId: string;
  artifactType: "docx" | "source-material";
  adapterId: string;
  sourceId: string;
  granularity: string;
  title: string;
  relativePath: string;
  sha256: string;
  byteSize: number;
  machineReadableFormat?: "yaml";
  machineReadableRelativePath?: string;
  machineReadableSha256?: string;
  machineReadableByteSize?: number;
  sourceMaterialRelativePath: string;
  warnings: string[];
};

export type NormalizedDocumentsManifest = {
  schemaVersion: number;
  packageType: "pact.normalized-documents";
  batchId: string;
  generatedAt: string;
  rootRelativePath: string;
  humanReadable?: {
    format: "docx";
    purpose: string;
    policy: string;
  };
  machineReadable?: {
    format: "yaml";
    purpose: string;
    manifestRelativePath: string;
    sidecarPattern: string;
  };
  documents: NormalizedDocumentEntry[];
  sourceMaterials: NormalizedDocumentEntry[];
  summary: {
    documentCount: number;
    sourceMaterialCount: number;
    byGranularity: Record<string, number>;
  };
  warnings: string[];
};

export type SplitResult = {
  generatedAt: string;
  overview: SplitOverview;
  emails: EmailMessage[];
  threads: EmailThread[];
  transactions: EmailTransaction[];
  people: PersonProfile[];
  timeline: TimelineEvent[];
  network: KnowledgeNetwork;
  associations: TransactionAssociationCollection;
  lifecycle?: SplitLifecycleSummary;
  retrieval: TimeWeightedRetrieval;
  warnings: string[];
  normalizedDocuments?: NormalizedDocumentsManifest;
  sourceFiles: SourceFile[];
};

export type SplitJobStatus = "queued" | "running" | "completed" | "failed";

export type SplitJob = {
  id: string;
  status: SplitJobStatus;
  queueId?: string;
  unifiedRegistration?: UnifiedRegistrationRecord;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  finishedAt?: string;
  progressPercent: number;
  stage: string;
  checkpointTreeId?: string;
  checkpointId?: string;
  archiveBatchId?: string;
  uploadSessionId?: string;
  versionGroupId?: string;
  versionNumber?: number;
  parentJobId?: string;
  reparseFromJobId?: string;
  queueState?: Record<string, unknown>;
  error?: string;
  resultSummary?: {
    emails: number;
    transactions: number;
    people: number;
    warnings: number;
  };
};

export type SplitJobListResponse = {
  summary: {
    totalCount: number;
    queuedCount: number;
    runningCount: number;
    completedCount: number;
    failedCount: number;
  };
  items: SplitJob[];
};

export type SplitPayload = {
  inputText: string;
  filePaths: string[];
  uploadedFiles: UploadedFilePayload[];
  uploadSessionId?: string;
  forceNewVersion?: boolean;
  reparseFromJobId?: string;
  parentJobId?: string;
  versionGroupId?: string;
  archiveBatchId?: string;
  settings: AgentSettings;
  documentParsing?: DocumentParsingConfig;
};

export type UploadedFilePayload = {
  name: string;
  mediaType: string;
  dataBase64: string;
  relativePath?: string;
  originalFileName?: string;
  stagedPath?: string;
  sha256?: string;
  byteSize?: number;
};

export type DocumentParsingConfig = {
  pipelineId?: string;
  expectedOutput?: "sources" | "blocks" | "chunks" | "preprocessResult" | string;
  expectedOutputs?: string[];
  chunking?: {
    maxTokens?: number;
    maxChars?: number;
    overlapTokens?: number;
    sectionLevel?: number;
  };
  contextBudget?: {
    knowledgeTokens?: number;
    budgetScope?: string;
  };
  payloadBudget?: {
    maxResponseBytes?: number;
    maxEvidenceBytes?: number;
    continuationToken?: string;
  };
  granularity?: {
    preferOriginalStructure?: boolean;
    allowPartialEvidence?: boolean;
    targetTokens?: number;
    targetChars?: number;
    tableGranularity?: string;
    secondaryParse?: {
      enabled?: boolean;
      algorithm?: string;
      targetTokens?: number;
      targetChars?: number;
    };
  };
  dynamicParsing?: {
    enabled?: boolean;
    preserveStructureArtifacts?: boolean;
    algorithmRegistry?: Record<string, string>;
    tableGranularity?: string;
  };
};

export type DocumentParseChunk = {
  id: string;
  sourceId?: string;
  sourceName?: string;
  title?: string;
  titlePath?: string[];
  headingPath?: string[];
  chunkType?: string;
  content?: string;
  text?: string;
  tokenCount?: number;
  charCount?: number;
  overlapTokenCount?: number;
  sourceStartLine?: number;
  sourceEndLine?: number;
  sourceRange?: {
    startLine?: number;
    endLine?: number;
  };
  sectionId?: string;
  blockIds?: string[];
  metadata?: Record<string, unknown>;
};

export type DocumentParseResponse = {
  schemaVersion: number;
  generatedAt: string;
  pipelineId: string;
  expectedOutputs: string[];
  sources: Array<Record<string, unknown>>;
  blocks: Array<Record<string, unknown>>;
  chunks: DocumentParseChunk[];
  structureArtifacts?: Array<Record<string, unknown>>;
  granularityFragments?: Array<Record<string, unknown>>;
  preprocessResult: Record<string, unknown> | null;
  dynamicParsing?: Record<string, unknown> | null;
  payload?: Record<string, unknown> | null;
  backendTrace?: Record<string, unknown> | null;
  warnings: string[];
  summary: {
    sources: number;
    blocks: number;
    chunks: number;
    structureArtifacts?: number;
    granularityFragments?: number;
    warnings: number;
  };
  pipelines: Array<{
    id: string;
    label: string;
    description?: string;
  }>;
};

export type ClientMigrationState =
  | "aligned"
  | "outdated"
  | "draining"
  | "bootstrap-only"
  | "offline"
  | "unknown";

export type DiscoveryClientSummary = {
  totalCount: number;
  alignedCount: number;
  outdatedCount: number;
  drainingCount: number;
  bootstrapOnlyCount: number;
  offlineCount: number;
  unknownCount: number;
  pactClientCount?: number;
  mcpPluginCount?: number;
  migratableCount?: number;
};

export type ClientConnectionKind = "pact-client" | "mcp-plugin" | string;

export type DiscoveryClientRegistration = {
  clientId: string;
  clientLabel: string;
  appVersion: string;
  platform: string;
  hostname: string;
  bootstrapUrl: string;
  currentServiceUrl: string;
  desiredServiceUrl: string;
  currentJobServiceUrl: string;
  configVersion: string;
  migrationState: ClientMigrationState;
  connectionKind?: ClientConnectionKind;
  connectionMethod?: string;
  connectionState?: string;
  connectionStatusLabel?: string;
  connectionDetail?: string;
  supportsMigration?: boolean;
  sourceGrantId?: string;
  busy: boolean;
  lastJobId: string;
  lastError: string;
  firstSeenAt: string;
  lastSeenAt: string;
  lastSeenServerId: string;
};

export type DiscoveryClientsResponse = {
  summary: DiscoveryClientSummary;
  items: DiscoveryClientRegistration[];
};

export type DiscoveryConfig = {
  serverId: string;
  serverLabel: string;
  bootstrapBaseUrl: string;
  advertisedBaseUrl: string;
  activeServiceUrl: string;
  forwardBaseUrl: string;
  mode: "active" | "forward";
  configVersion: string;
  refreshIntervalSeconds: number;
  checkInIntervalSeconds: number;
  offlineAfterSeconds: number;
};

export type DiscoveryConfigResponse = {
  path: string;
  value: DiscoveryConfig;
  bootstrap: {
    ok: boolean;
    serverId: string;
    serverLabel: string;
    bootstrapBaseUrl: string;
    advertisedBaseUrl: string;
    activeServiceUrl: string;
    forwardBaseUrl: string;
    mode: "active" | "forward";
    configVersion: string;
    refreshIntervalSeconds: number;
    checkInIntervalSeconds: number;
    offlineAfterSeconds: number;
    migrationRequired: boolean;
  };
};

export type RuntimeMountInfo = {
  name: string;
  id: string;
  kind: string;
  enabled: boolean;
  reason: string;
  supportsStructuredDocument: boolean;
  supportsTextExtraction: boolean;
  supportsBatchHook: boolean;
};

export type MountRouteTarget = {
  mountName: string;
  action: string;
};

export type MountRoutingConfig = {
  kindRoutes: Record<string, MountRouteTarget>;
  extensionRoutes: Record<string, MountRouteTarget>;
  mediaTypeRoutes: Record<string, MountRouteTarget>;
};

export type RuntimeMountConfig = {
  mountModules: Record<string, string>;
  mountRouting: MountRoutingConfig;
};

export type RuntimeInfoResponse = {
  server: {
    url: string;
    userDataPath: string;
    distPath: string;
    hostname: string;
  };
  runtime: {
    profile: string;
    cwd: string;
    mountModules: Record<string, string>;
    mountRouting: MountRoutingConfig;
    mountGeneration: number;
    mountConfigPath?: string;
    mountConfigPaths?: {
      modulesPath: string;
      routingPath: string;
    };
    mountConfig?: RuntimeMountConfig;
    mounts: RuntimeMountInfo[];
    analysisModules: AnalysisModuleInfo[];
    currentAnalysisModuleId?: string;
  };
  storage: {
    databasePath: string;
    objectRootPath: string;
    batchCount: number;
    rawObjectCount: number;
    sourceCount: number;
    emailCount: number;
    threadCount: number;
    transactionCount: number;
    lineageCount: number;
    lineageRunCount: number;
    clientCount: number;
    peopleCount: number;
    retrievalCount: number;
  };
  discovery: DiscoveryConfigResponse["bootstrap"];
  auth?: ConsoleAuthSummary | null;
  features?: FeatureRuntimeSummary | null;
};

export type FeatureRuntimeSummary = {
  schemaVersion: number;
  edition: string;
  profileName?: string;
  generatedAt?: string;
  activeFeatureIds: string[];
  disabledFeatureIds: string[];
  activeFeatures?: Array<{
    featureId: string;
    label: string;
    group: string;
    required?: boolean;
    reason?: string;
  }>;
  disabledFeatures?: Array<{
    featureId: string;
    label: string;
    group: string;
    required?: boolean;
    reason?: string;
  }>;
  operations?: {
    total: number;
    active: number;
    disabled: number;
  };
};

export type RuntimeMountsResponse = {
  path: string;
  paths: {
    modulesPath: string;
    routingPath: string;
  };
  value: RuntimeMountConfig;
  runtime: Pick<
    RuntimeInfoResponse["runtime"],
    "mountGeneration" | "mountModules" | "mountRouting"
  > & {
    mounts?: RuntimeMountInfo[];
  };
  analysisModules?: AnalysisModuleInfo[];
  currentAnalysisModuleId?: string;
};

export type ServerPathBrowseEntry = {
  name: string;
  path: string;
  type: "directory" | "file" | "other" | string;
  byteSize: number;
  modifiedAt: string;
  hidden: boolean;
  selectable: boolean;
  browsable: boolean;
};

export type ServerPathBrowseResponse = {
  currentPath: string;
  parentPath: string;
  mode: "directory" | "file" | string;
  extensions: string[];
  roots: Array<{ label: string; path: string }>;
  entries: ServerPathBrowseEntry[];
  truncated: boolean;
  error?: string;
};

export type RuntimeMountReloadResponse = {
  ok: boolean;
  mountGeneration: number;
  mountModules: Record<string, string>;
  mountRouting: MountRoutingConfig;
};

export type ToolManagementScope = {
  id: string;
  label: string;
  description: string;
};

export type ToolManagementGrant = {
  id: string;
  label: string;
  type?: string;
  enabled: boolean;
  toolsets?: string[];
  toolAllow?: string[];
  toolDeny?: string[];
  scopes: string[];
  expiresAt?: string;
  maxUses?: number;
  rateLimit?: Record<string, unknown>;
  allowedOrigins?: string[];
  allowedCidrs?: string[];
  metadata?: Record<string, unknown>;
  reason?: string;
  tokenPrefix: string;
  hasToken: boolean;
  createdAt: string;
  updatedAt: string;
  revokedAt?: string;
  lastUsedAt: string;
};

export type ToolManagementGrantsResponse = {
  schemaVersion: number;
  grants: ToolManagementGrant[];
};

export type ToolManagementGrantIssue = {
  grant: ToolManagementGrant;
  token: string;
};

export type ToolManagementRisk =
  | "read_only"
  | "safe_write"
  | "repair_write"
  | "destructive"
  | string;

export type ToolManagementToolset = {
  id: string;
  label: string;
  requiredScopes: string[];
  maxRisk: ToolManagementRisk;
  grantable?: boolean;
  defaultForAgents?: boolean;
};

export type ToolManagementProfile = {
  id: string;
  label: string;
  agentType: string;
  toolsets: string[];
  toolAllow: string[];
  toolDeny: string[];
  maxRisk: ToolManagementRisk;
  approvalPolicy: string;
  concurrencyLimit: number;
  sandboxPolicy: string;
  auditTags: string[];
};

export type ToolManagementTool = {
  id: string;
  version: string;
  label: string;
  description: string;
  owner: string;
  source: string;
  operationId: string;
  handlerId: string;
  toolsets: string[];
  requiredScopes: string[];
  risk: ToolManagementRisk;
  readOnly: boolean;
  destructive: boolean;
  concurrencySafe: boolean;
  requiresApproval: boolean;
  approvalScope: string;
  timeoutMs: number;
  maxResultBytes: number;
  status: string;
  tags: string[];
};

export type ToolManagementCatalog = {
  schemaVersion: number;
  generatedAt: string;
  fingerprint: string;
  scopes: ToolManagementScope[];
  toolsets: ToolManagementToolset[];
  profiles: ToolManagementProfile[];
  tools: ToolManagementTool[];
};

export type ToolManagementAuditItem = {
  toolExecutionId: string;
  traceId: string;
  toolId: string;
  toolVersion: string;
  toolsetIds: string[];
  subjectType: string;
  subjectId: string;
  grantId: string;
  agentId: string;
  profileId: string;
  operationId: string;
  risk: ToolManagementRisk;
  decision: string;
  resultSummary?: Record<string, unknown>;
  status: string;
  errorCode: string;
  durationMs: number;
  startedAt: string;
  finishedAt: string;
  policyDecisionId: string;
};

export type ToolManagementAuditResponse = {
  schemaVersion: number;
  items: ToolManagementAuditItem[];
};

export type ToolManagementMetrics = {
  callsTotal: number;
  byStatus: Record<string, number>;
  byTool: Record<string, number>;
  byProfile: Record<string, number>;
  byGrant: Record<string, number>;
  byRisk: Record<string, number>;
  deniedByReason: Record<string, number>;
  timeoutTotal: number;
  rateLimitedTotal: number;
  activeExecutions: number;
  averageDurationMs: number;
  resultBytesTotal: number;
};

export type ToolManagementMetricsResponse = {
  schemaVersion: number;
  metrics: ToolManagementMetrics;
};

export type EmailRuleSetPayload = {
  path: string;
  rules: EmailRuleSet;
};

export type ConsoleRole = {
  roleId: "owner" | "admin" | "operator" | "viewer" | string;
  label: string;
  scopes: string[];
};

export type ConsoleUser = {
  userId: string;
  username: string;
  displayName: string;
  roleId: string;
  roleLabel: string;
  scopes: string[];
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string;
};

export type ConsoleAuthSession = {
  authenticated: boolean;
  csrfToken: string;
  expiresAt: string;
  user: ConsoleUser | null;
};

export type ConsoleOidcConfig = {
  enabled: boolean;
  issuer: string;
  clientId: string;
  clientSecretConfigured: boolean;
  redirectUri: string;
  allowedDomains: string[];
  roleMapping: Record<string, string>;
  updatedAt: string;
};

export type ConsoleAuthSummary = {
  enabled: boolean;
  bootstrap: {
    required: boolean;
    tokenPrefix: string;
    tokenFilePath: string;
  };
  session: ConsoleAuthSession;
  roles: ConsoleRole[];
  oidc: ConsoleOidcConfig;
};

export type ConsoleAuditItem = {
  auditId: string;
  userId?: string;
  username?: string;
  operationId: string;
  action?: string;
  method?: string;
  path?: string;
  transport?: string;
  actor?: Record<string, unknown>;
  risk?: string;
  readOnly?: boolean;
  durationMs?: number;
  inputHash?: string;
  redactedInput?: Record<string, unknown>;
  redactedOutputSummary?: Record<string, unknown>;
  status: string;
  target?: Record<string, unknown>;
  error: string;
  createdAt: string;
};

export type KnowledgeProtocolModule = {
  id?: string;
  kind?: string;
  enabled?: boolean;
  status?: string;
  backend?: string;
  license?: string;
  reason?: string;
  [key: string]: unknown;
};

export type KnowledgeHealth = {
  ok?: boolean;
  status?: string;
  protocol?: string;
  counts?: Record<string, number>;
  modules?: Record<string, KnowledgeProtocolModule>;
  quality?: Record<string, number>;
  recentMaintenanceRuns?: KnowledgeMaintenanceRun[];
  [key: string]: unknown;
};

export type KnowledgeCapabilities = {
  protocol?: string;
  methods?: string[];
  retrievalModes?: Array<{ value: string; label: string }>;
  modules?: Record<string, KnowledgeProtocolModule>;
  [key: string]: unknown;
};

export type MaintenanceSettings = Record<string, unknown>;

export type KnowledgeMaintenanceRun = {
  runId: string;
  taskType: string;
  status: "queued" | "running" | "completed" | "failed" | string;
  inputSummary?: Record<string, unknown>;
  outputSummary?: Record<string, unknown>;
  error?: string;
  startedAt?: string;
  finishedAt?: string;
  createdAt?: string;
};

export type KnowledgeSource = {
  sourceId: string;
  label: string;
  directoryPath: string;
  enabled: boolean;
  autoSync: boolean;
  recursive: boolean;
  debounceMs: number;
  hydrationEnabled?: boolean;
  hydrationPolicy?: string;
  hydrationTimeoutMs?: number;
  hydrationCommand?: string;
  hydrationArgs?: string[];
  status: "idle" | "pending" | "syncing" | "queued" | "error" | string;
  watcherStatus: "watching" | "partial" | "stopped" | "error" | string;
  watcherCount: number;
  lastEventAt?: string;
  lastScanAt?: string;
  lastSyncedAt?: string;
  lastSnapshotHash?: string;
  lastHydratedSnapshotHash?: string;
  lastHydrationAt?: string;
  lastHydrationStatus?: string;
  lastHydratedFileCount?: number;
  lastHydrationFailedCount?: number;
  lastHydrationSkippedCount?: number;
  lastHydrationFailureSamples?: Array<{
    relativePath?: string;
    reason?: string;
  }>;
  indexStatus?: "idle" | "indexing" | "indexed" | "failed" | string;
  lastIndexAt?: string;
  lastIndexReason?: string;
  lastIndexSnapshotHash?: string;
  lastIndexedFileCount?: number;
  lastIndexSkippedCount?: number;
  lastIndexFailedCount?: number;
  lastIndexError?: string;
  lastIndexCheckpointTreeId?: string;
  lastFileCount: number;
  lastTotalBytes: number;
  lastJobId?: string;
  lastJobStatus?: SplitJobStatus | string;
  lastJobStage?: string;
  lastJobProgressPercent?: number;
  lastJobUpdatedAt?: string;
  lastSyncCheckpointTreeId?: string;
  pendingReason?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
};

export type KnowledgeSourceState = {
  schemaVersion: number;
  updatedAt: string;
  summary: {
    totalCount: number;
    enabledCount: number;
    watchingCount: number;
    syncingCount: number;
    indexingCount?: number;
    errorCount: number;
  };
  sources: KnowledgeSource[];
};

export type KnowledgeSourceMutationResponse = {
  skipped?: boolean;
  reason?: string;
  duplicateOf?: string;
  source?: KnowledgeSource;
  deletedSource?: KnowledgeSource;
  job?: SplitJob;
  results?: Array<Record<string, unknown>>;
  state: KnowledgeSourceState;
};

export type KnowledgeReviewItem = {
  reviewId: string;
  source?: string;
  operationId?: string;
  entityId: string;
  entityType: string;
  status: string;
  reason: string;
  severity?: string;
  batchId?: string;
  title?: string;
  summary?: string;
  baseRevision?: number;
  currentRevision?: number;
  clientId?: string;
  fieldPatch?: Record<string, unknown>;
  serverRecord?: Record<string, unknown> | null;
  currentRecord?: Record<string, unknown>;
  incomingRecord?: Record<string, unknown>;
  evidenceRefs?: Array<Record<string, unknown> | string>;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
  resolution?: Record<string, unknown>;
};

export type KnowledgeReviewItemsResponse = {
  status: string;
  count?: number;
  sources?: Record<string, number>;
  items: KnowledgeReviewItem[];
};

export type KnowledgeRuleAuthoringResponse = {
  protocolVersion: string;
  ok: boolean;
  status: string;
  runId?: string;
  message?: string;
  intent?: Record<string, unknown>;
  template?: Record<string, unknown>;
  package?: Record<string, unknown>;
  manifest?: Record<string, unknown>;
  gate?: Record<string, unknown>;
  steps?: Array<Record<string, unknown>>;
  confirmation?: {
    packageId: string;
    version: number;
    publishEndpoint: string;
    action?: string;
  };
  answer?: string;
  error?: string;
  startedAt?: string;
  completedAt?: string;
};

export type KnowledgeWordCloudTerm = {
  term: string;
  frequency: number;
  weight?: number;
  quality?: string;
  removed?: boolean;
};

export type KnowledgeWordCloudCorpusPath = {
  path: string;
  type?: "directory" | "file" | string;
};

export type KnowledgeWordBag = {
  wordBagId: string;
  label: string;
  summary?: string;
  relation?: "separate" | "overlap" | "contains" | string;
  absorbThreshold?: number;
  terms: KnowledgeWordCloudTerm[];
  removedTerms?: KnowledgeWordCloudTerm[];
  children?: KnowledgeWordBag[];
  parentWordBagId?: string;
  childWordBagIds?: string[];
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  color?: string;
  zIndex?: number;
  layout?: {
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    color?: string;
    zIndex?: number;
  };
};

export type KnowledgeWordCloud = KnowledgeWordBag;

export type KnowledgeWordBagSet = {
  schemaVersion?: number;
  wordBagSetId: string;
  title: string;
  status: string;
  wordBagCount?: number;
  termsSnapshot?: KnowledgeWordCloudTerm[];
  wordBags: KnowledgeWordBag[];
  unassignedTerms?: KnowledgeWordCloudTerm[];
  corpusPaths?: KnowledgeWordCloudCorpusPath[];
  modelAlias?: string;
  agentResponse?: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
};

export type KnowledgeWordCloudSet = KnowledgeWordBagSet;

export type KnowledgeWordCloudState = {
  ok?: boolean;
  schemaVersion?: number;
  terms: KnowledgeWordCloudTerm[];
  corpusPaths?: KnowledgeWordCloudCorpusPath[];
  wordBagSet: KnowledgeWordBagSet | null;
  wordBagSets?: KnowledgeWordBagSet[];
};

export type KnowledgeWordCloudProposeResponse = {
  ok: boolean;
  terms?: KnowledgeWordCloudTerm[];
  agentResponse?: Record<string, unknown>;
  wordBagSet: KnowledgeWordBagSet;
  run?: {
    runId: string;
    queueId?: string;
    status?: string;
    startedAt?: string;
  };
};

export type KnowledgeWordBagMutationResponse = {
  ok: boolean;
  action: "added" | "updated" | "deleted" | string;
  wordBag?: KnowledgeWordBag;
  wordBagSet: KnowledgeWordBagSet;
  deletedWordBagId?: string;
  returnedTermCount?: number;
  defaultWordBagId?: string;
  code?: string;
  error?: string;
};

export type KnowledgeWordBagTermsGroup = {
  wordBagId: string;
  label: string;
  parentWordBagId?: string;
  includeChildren: boolean;
  sourceWordBagIds: string[];
  childWordBagIds: string[];
  wordBags: Array<{
    wordBagId: string;
    label: string;
    parentWordBagId?: string;
    childWordBagIds: string[];
    terms: KnowledgeWordCloudTerm[];
    removedTerms?: KnowledgeWordCloudTerm[];
  }>;
  terms: KnowledgeWordCloudTerm[];
  removedTerms?: KnowledgeWordCloudTerm[];
};

export type KnowledgeWordBagTermsResponse = {
  ok: boolean;
  schemaVersion?: number;
  wordBagSetId: string;
  title?: string;
  status?: string;
  updatedAt?: string;
  includeChildren: boolean;
  requestedWordBagIds: string[];
  missingWordBagIds: string[];
  groups: KnowledgeWordBagTermsGroup[];
  terms: KnowledgeWordCloudTerm[];
  removedTerms?: KnowledgeWordCloudTerm[];
};

export type KnowledgeWordCloudExportResponse = {
  ok: boolean;
  exportType: "pact.knowledge.word_bags.export" | string;
  schemaVersion?: number;
  exportedAt: string;
  wordBagSet: KnowledgeWordBagSet;
};

export type KnowledgeWordCloudImportResponse = {
  ok: boolean;
  action: "imported" | string;
  mode: "copy" | "overwrite" | string;
  importedFromWordBagSetId?: string;
  exportType?: string;
  wordBagSet: KnowledgeWordBagSet;
};

export type KnowledgeConsoleState = {
  available: boolean;
  health: KnowledgeHealth | null;
  capabilities: KnowledgeCapabilities | null;
  maintenance: MaintenanceSettings | null;
  recentJobs: SplitJob[];
  sources?: KnowledgeSourceState;
};

export type KnowledgeConfigField = {
  name: string;
  type: "string" | "number" | "boolean" | "select" | string;
  label: string;
  defaultValue?: unknown;
  min?: number;
  max?: number;
  step?: number;
  options?: Array<{ label: string; value: string | number | boolean }>;
  description?: string;
  danger?: "low" | "medium" | "high" | string;
};

export type KnowledgeConfigSchema = {
  schemaVersion: number;
  groups: Array<{
    id: string;
    label: string;
    fields: KnowledgeConfigField[];
  }>;
  maintenanceTasks: Array<{
    id: string;
    label: string;
    danger: "low" | "medium" | "high" | string;
    requiresConfirm: boolean;
    supportsDryRun?: boolean;
  }>;
};

export type KnowledgeHierarchyNode = {
  hierarchyId?: string;
  nodeType?: "collection" | "document" | "section" | string;
  level?: number;
  targetId?: string;
  documentId?: string;
  sectionId?: string;
  title?: string;
  categoryPath?: string;
  score?: number;
};

export type KnowledgeHierarchyPlan = {
  enabled: boolean;
  policy?: string;
  enforced?: boolean;
  topScore?: number;
  threshold?: number;
  selected?: {
    collections?: KnowledgeHierarchyNode[];
    documents?: KnowledgeHierarchyNode[];
    sections?: KnowledgeHierarchyNode[];
  };
  candidates?: KnowledgeHierarchyNode[];
};

export type KnowledgeSearchResult = {
  evidenceId?: string;
  itemId?: string;
  documentId?: string;
  title: string;
  snippet?: string;
  score?: number;
  finalScore?: number;
  relevanceScore?: number;
  retrievalPath?: string[];
  sourceLocator?: Record<string, unknown> | string;
  relatedAssetIds?: string[];
  assetIds?: string[];
  assets?: KnowledgeAssetRef[];
  modalities?: string[];
  localMirror?: {
    matched?: boolean;
    openable?: boolean;
    sourceType?: string;
    providerId?: string;
    externalId?: string;
    syncBatchId?: string;
    timestamp?: string;
    status?: string;
  };
  fusion?: Record<string, unknown>;
  hierarchy?: {
    documentId?: string;
    sectionId?: string;
    score?: number;
    path?: string;
  } | null;
  reasons?: Array<Record<string, unknown> | string>;
  [key: string]: unknown;
};

export type KnowledgeSearchResponse = {
  query?: string;
  items?: KnowledgeSearchResult[];
  results?: KnowledgeSearchResult[];
  evidencePacks?: EvidencePack[];
  markdown?: string;
  responseProfile?: "agent" | "api" | "console" | string;
  agentMessage?: Record<string, unknown>;
  hierarchy?: KnowledgeHierarchyPlan;
  retrievalProfileId?: string;
  retrievalProfileVersion?: number;
  learningRuntime?: Record<string, unknown>;
  fusion?: Record<string, unknown>;
  explain?: Record<string, unknown>;
  [key: string]: unknown;
};

export type KnowledgeAssetRef = {
  assetId: string;
  mediaType?: string;
  title?: string;
  caption?: string;
  ocrText?: string;
  sourceLocator?: Record<string, unknown> | string;
  thumbnailAssetId?: string;
};

export type EvidencePack = {
  evidenceId: string;
  title?: string;
  summary?: string;
  text?: string;
  snippet?: string;
  document?: Record<string, unknown>;
  section?: Record<string, unknown>;
  block?: Record<string, unknown>;
  assets?: KnowledgeAssetRef[];
  reasons?: string[];
  sourceLocator?: Record<string, unknown> | string;
  [key: string]: unknown;
};

export type RenderMarkdownResponse = {
  evidenceId?: string;
  markdown?: string;
  content?: string;
  format?: string;
};

export type UploadSessionResponse = {
  sessionId: string;
  checkpointId?: string;
  checkpointTreeId?: string;
  manifestDigest?: string;
  inputDigest?: string;
  status: string;
  receivedBytes?: number;
  totalBytes?: number;
  files?: Array<{
    index?: number;
    fileIndex?: number;
    name: string;
    relativePath?: string;
    byteSize: number;
    receivedBytes: number;
    completed?: boolean;
    complete?: boolean;
  }>;
};

export type MaintenanceAgentRisk =
  | "read_only"
  | "safe_write"
  | "repair_write"
  | "destructive"
  | string;

export type MaintenanceAgentSchedule = {
  id: string;
  label: string;
  enabled: boolean;
  runbook: string;
  intervalMinutes: number;
  nextRunAt: string;
};

export type MaintenanceAgentConfig = {
  schemaVersion: number;
  enabled: boolean;
  plannerMode: "gateway" | "gateway_fallback" | "fixed_runbook" | string;
  autoApproveRisk: MaintenanceAgentRisk;
  scheduler: {
    tickSeconds: number;
  };
  concurrency?: {
    maxActiveRuns: number;
  };
  schedules: MaintenanceAgentSchedule[];
  runbooks: Record<string, { id: string; label: string; description?: string }>;
};

export type MaintenanceAgentPlanStep = {
  toolId: string;
  input: Record<string, unknown>;
  risk: MaintenanceAgentRisk;
  reason: string;
};

export type MaintenanceAgentPlan = {
  schemaVersion: number;
  source: string;
  intent: string;
  summary: string;
  risk: MaintenanceAgentRisk;
  requiresApproval: boolean;
  approvalReason: string;
  steps: MaintenanceAgentPlanStep[];
};

export type MaintenanceAgentRunStep = MaintenanceAgentPlanStep & {
  stepId: string;
  index: number;
  status: "pending" | "running" | "completed" | "failed" | "cancelled" | string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  output: Record<string, unknown> | null;
  error: string;
};

export type MaintenanceAgentRun = {
  schemaVersion: number;
  runId: string;
  status:
    | "awaiting_approval"
    | "queued"
    | "running"
    | "completed"
    | "completed_with_errors"
    | "failed"
    | "cancelled"
    | "rejected"
    | string;
  trigger: string;
  source: string;
  intent: string;
  summary: string;
  risk: MaintenanceAgentRisk;
  requiresApproval: boolean;
  approvalReason: string;
  planHash: string;
  plan: MaintenanceAgentPlan;
  steps: MaintenanceAgentRunStep[];
  actor?: Record<string, unknown> | null;
  input?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  startedAt: string;
  completedAt: string;
  approvedAt: string;
  approvedBy?: Record<string, unknown> | null;
  cancelRequested: boolean;
  error: string;
  auditIds?: string[];
  unifiedRegistration?: UnifiedRegistrationRecord;
};

export type MaintenanceAgentTool = {
  id: string;
  risk: MaintenanceAgentRisk;
  scopes: string[];
  timeoutMs: number;
  inputSchema: Record<string, unknown>;
  redaction: string;
};

export type MaintenanceAgentSummary = {
  config: MaintenanceAgentConfig;
  tools: MaintenanceAgentTool[];
  latestRun: MaintenanceAgentRun | null;
  runs: MaintenanceAgentRun[];
  activeRunId: string;
  queuedRunIds: string[];
  pendingApprovalCount: number;
  nextRunAt: string;
  auditPath: string;
  runsPath: string;
};

export type BackgroundProcessItem = {
  role: string;
  label: string;
  description: string;
  processType?: "service" | "daemon" | string;
  responsibility?: string;
  services?: string[];
  features?: string[];
  monitors?: string[];
  alerts?: string[];
  desired: boolean;
  pid: number;
  alive: boolean;
  stale: boolean;
  status: string;
  mode?: string;
  startedAt?: string;
  lastHeartbeatAt?: string;
  heartbeatAgeMs?: number | null;
  restartCount: number;
  lastExit?: Record<string, unknown> | null;
  details?: Record<string, unknown>;
  error?: string;
  unifiedRegistration?: UnifiedRegistrationRecord;
};

export type UnifiedOriginalType = "process" | "queue" | "task" | "monitor" | "alert" | string;

export type UnifiedRegistrationRecord = {
  schemaVersion: number;
  registrationId: string;
  originalType: UnifiedOriginalType;
  originalId: string;
  label: string;
  status: string;
  tone: string;
  source: string;
  registeredAt: string;
  route: {
    originalType: UnifiedOriginalType;
    section: string;
    behavior: string;
  };
  relations: Record<string, unknown>;
  attributes: Record<string, unknown>;
  originalRef: Record<string, unknown>;
};

export type UnifiedSystemStatus = {
  schemaVersion: number;
  updatedAt: string;
  source: string;
  summary: {
    totalCount: number;
    processCount: number;
    queueCount: number;
    taskCount: number;
    monitorCount: number;
    alertCount: number;
  };
  registrations: UnifiedRegistrationRecord[];
  routes: Record<string, { section: string; behavior: string }>;
  processes: UnifiedRegistrationRecord[];
  queues: UnifiedRegistrationRecord[];
  tasks: UnifiedRegistrationRecord[];
  monitors: UnifiedRegistrationRecord[];
  alerts: UnifiedRegistrationRecord[];
};

export type ClientRuntimeHeatRow = {
  clientUid: string;
  clientKey: string;
  profileId: string;
  matched: boolean;
  workspaceId: string;
  contextProfileId: string;
  retrievalProfileId: string;
  modelAlias: string;
  taskTypes: Array<{ taskType: string; count: number }>;
  surfaces: Array<{ surface: string; count: number }>;
  firstSeenAt: string;
  lastSeenAt: string;
  coolingState: "hot" | "warm" | "cooled" | string;
  heatLevel: "hot" | "warm" | "cold" | string;
  coolingReason: string;
  totalCalls: number;
  recentCalls: number;
  heatScore: number;
  heatPercent: number;
  ageMs: number;
};

export type ClientRuntimeStatus = {
  protocolVersion: string;
  schemaVersion: number;
  updatedAt: string;
  configPath: string;
  usagePath: string;
  coolingPolicy: Record<string, unknown>;
  summary: {
    totalClients: number;
    hotClients: number;
    warmClients: number;
    cooledClients: number;
    totalCalls: number;
    workspaceCount: number;
    contextCount: number;
  };
  heatmap: {
    clients: ClientRuntimeHeatRow[];
    workspaces: Array<Record<string, unknown>>;
    contexts: Array<Record<string, unknown>>;
  };
  cooledClients: ClientRuntimeHeatRow[];
};

export type BackgroundProcessStatus = {
  schemaVersion: number;
  ok: boolean;
  status: string;
  updatedAt: string;
  statePath: string;
  supervisor: {
    pid: number;
    alive: boolean;
    status: string;
    startedAt?: string;
    roles?: string[];
  };
  processes: BackgroundProcessItem[];
  systemStatus?: UnifiedSystemStatus;
};

export type MonitorAlertRule = {
  enabled: boolean;
  severity: string;
  statuses?: string[];
  restartCountThreshold?: number;
  titleTemplate: string;
  messageTemplate: string;
};

export type MonitorAlertConfig = {
  schemaVersion: number;
  enabled: boolean;
  intervalMs: number;
  heartbeatStaleMs: number;
  queueHeartbeatStaleMs?: number;
  recoverInterruptedQueues?: boolean;
  historyLimit: number;
  serviceLabel?: string;
  rules: Record<string, MonitorAlertRule>;
};

export type MonitorAlertItem = {
  alertId: string;
  ruleId: string;
  severity: string;
  title: string;
  message: string;
  source: string;
  role: string;
  status: string;
  active: boolean;
  ackRequired?: boolean;
  acknowledgedAt?: string;
  queueId?: string;
  interruptedAt?: string;
  recoveredAt?: string;
  tone?: string;
  evidence?: Record<string, unknown>;
  firstSeenAt: string;
  lastSeenAt: string;
  resolvedAt?: string;
  variables?: Record<string, unknown>;
  unifiedRegistration?: UnifiedRegistrationRecord;
};

export type QueueMonitorItem = {
  queueId: string;
  kind: string;
  ownerId: string;
  label: string;
  source: string;
  sources?: string[];
  lifecycleStatus: string;
  phase: string;
  status: string;
  startedAt?: string;
  closedAt?: string;
  lastHeartbeatAt?: string;
  checkpointId?: string;
  checkpointTreeId?: string;
  lastCheckpointAt?: string;
  recoveryAttemptedAt?: string;
  recoveryQueuedAt?: string;
  recoveredAt?: string;
  interruptedAt?: string;
  interruptedReason?: string;
  acknowledgedAt?: string;
  recoveryStatus?: string;
  evidence?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  unifiedRegistration?: UnifiedRegistrationRecord;
};

export type QueueMonitorState = {
  schemaVersion: number;
  updatedAt: string;
  statePath: string;
  eventLogPath: string;
  summary: {
    totalCount: number;
    openCount: number;
    interruptedCount: number;
    recoveredCount: number;
    closedCount: number;
  };
  items: QueueMonitorItem[];
  systemStatus?: UnifiedSystemStatus;
};

export type MonitorAlertState = {
  schemaVersion: number;
  ok: boolean;
  status: string;
  updatedAt: string;
  configPath: string;
  shellConfigPath?: string;
  statePath: string;
  config: MonitorAlertConfig;
  summary: {
    activeCount: number;
    visibleCount?: number;
    recoveredCount?: number;
    criticalCount: number;
    warningCount: number;
    historyCount: number;
  };
  queueMonitor?: QueueMonitorState | null;
  acknowledgedAlerts?: Record<string, string>;
  systemStatus?: UnifiedSystemStatus;
  activeAlerts: MonitorAlertItem[];
  history: MonitorAlertItem[];
};

export type ProductionHealthGateStatus = "pass" | "fail" | "timeout" | "blocked" | "missing" | "partial" | "warning" | "unknown" | string;

export type ProductionHealthGate = {
  id: string;
  title: string;
  status: ProductionHealthGateStatus;
  tone: string;
  blockerLevel: string;
  owner: string;
  coverage: string[];
  evidencePath: string;
  nextStep: string;
  commandSummary: {
    total: number;
    failed: number;
    timedOut: number;
    elapsedMs: number;
  };
  commands: Array<{
    command: string;
    exitCode: number;
    timedOut: boolean;
    elapsedMs: number;
  }>;
};

export type ProductionHealthSection = {
  id: string;
  label: string;
  description: string;
  gateIds: string[];
  status: ProductionHealthGateStatus;
  tone: string;
  passed: number;
  total: number;
  missingGateIds: string[];
  gates: Array<{
    id: string;
    title: string;
    status: ProductionHealthGateStatus;
    tone: string;
    blockerLevel: string;
    nextStep: string;
    evidencePath: string;
  }>;
  nextSteps: string[];
};

export type ProductionHealthResponse = {
  schemaVersion: number;
  reportType: "pact.production-health.v1" | string;
  generatedAt: string;
  status: ProductionHealthGateStatus;
  tone: string;
  reportRoot: string;
  latestReport: null | {
    reportType: string;
    runId: string;
    generatedAt: string;
    mode: string;
    reportPath: string;
    markdownPath: string;
    readError?: string;
    git: {
      branch: string;
      commit: string;
      dirtyFileCount: number;
    };
  };
  summary: {
    pass: number;
    fail: number;
    timeout: number;
    blockedP0: number;
  };
  coverage: {
    required: string[];
    missing: string[];
  };
  capabilityKernel?: {
    ok: boolean;
    protocolVersion: string;
    status: string;
    tone: string;
    alias: string;
    provider: string;
    configuredBackend: string;
    securityMode: string;
    degraded: boolean;
    runtimeLookupLoaded: boolean;
    runtimeLookupGeneration: number;
    bindingCount: number;
    permissionBindingCount: number;
    stateRoot: string;
    statePath: string;
    linuxDetectedBackends: string[];
    recoverySupported: boolean;
    message: string;
  } | null;
  capabilityBindingGuard?: {
    ok: boolean;
    protocolVersion: string;
    status: string;
    tone: string;
    alias: string;
    provider: string;
    configuredBackend: string;
    securityMode: string;
    degraded: boolean;
    bindingCount: number;
    activeBindingCount: number;
    stateRoot: string;
    statePath: string;
    message: string;
  } | null;
  sections: ProductionHealthSection[];
  gates: ProductionHealthGate[];
  history?: Array<{
    runId: string;
    generatedAt: string;
    status: ProductionHealthGateStatus;
    mode: string;
    reportPath: string;
  }>;
  actions: Array<{
    id: string;
    label: string;
    command: string;
  }>;
};

export type V001BaselinePortSummary = {
  port: string;
  implementation: string;
  path?: string;
  configRoot?: string;
  artifactRoot?: string;
  registryPath?: string;
  auditPath?: string;
  verificationMode?: string;
  recordCount?: number;
  entryCount?: number;
  taskCount?: number;
  queuedCount?: number;
  artifactCount?: number;
  secretRefCount?: number;
  counts?: Record<string, number>;
};

export type V001BaselineStatus = {
  schemaVersion: number;
  protocolVersion: string;
  status: string;
  verificationMode: string;
  rootPath: string;
  boundaries: Record<string, string>;
  mcpOutlets: string[];
  storageStates: string[];
  ports: V001BaselinePortSummary[];
};

export type ServerConsoleState = {
  server: RuntimeInfoResponse["server"];
  runtime: RuntimeInfoResponse["runtime"];
  settings: {
    path: string;
    value: AgentSettings;
  };
  agentSelector?: AgentSelectorState;
  agentConfigs?: AgentConfigState;
  discovery: DiscoveryConfigResponse;
  emailRules: EmailRuleSetPayload;
  expertVocabulary: ExpertVocabularyResponse;
  knowledgeTaxonomy: KnowledgeTaxonomyResponse;
  auth?: ConsoleAuthSummary | null;
  maintenanceAgent?: MaintenanceAgentSummary | null;
  knowledgeConsole?: KnowledgeConsoleState | null;
  storage: RuntimeInfoResponse["storage"];
  v001Baseline?: V001BaselineStatus | null;
  jobs: SplitJobListResponse;
  clients: DiscoveryClientsResponse;
  clientRuntime?: ClientRuntimeStatus | null;
  features?: FeatureRuntimeSummary | null;
};
