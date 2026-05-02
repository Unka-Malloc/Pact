class ClientConfig {
  const ClientConfig({
    this.bootstrapBaseUrl = '',
    this.resolvedServiceBaseUrl = '',
    this.clientId = '',
    this.lastDiscoveryConfigVersion = '',
    this.lastExpertVocabularyVersion = 0,
    this.lastExpertVocabularyChecksum = '',
    this.lastExpertVocabularyPulledAt = '',
    this.lastConnectedAt = '',
    this.expertVocabularySyncPolicy = 'manual',
    this.indexHotUpdatePolicy = 'automatic',
    this.platformCapabilityPreference = 'auto',
    this.emailAnalysisModuleEnabled,
  });

  final String bootstrapBaseUrl;
  final String resolvedServiceBaseUrl;
  final String clientId;
  final String lastDiscoveryConfigVersion;
  final int lastExpertVocabularyVersion;
  final String lastExpertVocabularyChecksum;
  final String lastExpertVocabularyPulledAt;
  final String lastConnectedAt;
  final String expertVocabularySyncPolicy;
  final String indexHotUpdatePolicy;
  final String platformCapabilityPreference;
  final bool? emailAnalysisModuleEnabled;

  ClientConfig copyWith({
    String? bootstrapBaseUrl,
    String? resolvedServiceBaseUrl,
    String? clientId,
    String? lastDiscoveryConfigVersion,
    int? lastExpertVocabularyVersion,
    String? lastExpertVocabularyChecksum,
    String? lastExpertVocabularyPulledAt,
    String? lastConnectedAt,
    String? expertVocabularySyncPolicy,
    String? indexHotUpdatePolicy,
    String? platformCapabilityPreference,
    bool? emailAnalysisModuleEnabled,
  }) {
    return ClientConfig(
      bootstrapBaseUrl: bootstrapBaseUrl ?? this.bootstrapBaseUrl,
      resolvedServiceBaseUrl:
          resolvedServiceBaseUrl ?? this.resolvedServiceBaseUrl,
      clientId: clientId ?? this.clientId,
      lastDiscoveryConfigVersion:
          lastDiscoveryConfigVersion ?? this.lastDiscoveryConfigVersion,
      lastExpertVocabularyVersion:
          lastExpertVocabularyVersion ?? this.lastExpertVocabularyVersion,
      lastExpertVocabularyChecksum:
          lastExpertVocabularyChecksum ?? this.lastExpertVocabularyChecksum,
      lastExpertVocabularyPulledAt:
          lastExpertVocabularyPulledAt ?? this.lastExpertVocabularyPulledAt,
      lastConnectedAt: lastConnectedAt ?? this.lastConnectedAt,
      expertVocabularySyncPolicy:
          expertVocabularySyncPolicy ?? this.expertVocabularySyncPolicy,
      indexHotUpdatePolicy: indexHotUpdatePolicy ?? this.indexHotUpdatePolicy,
      platformCapabilityPreference:
          platformCapabilityPreference ?? this.platformCapabilityPreference,
      emailAnalysisModuleEnabled:
          emailAnalysisModuleEnabled ?? this.emailAnalysisModuleEnabled,
    );
  }

  factory ClientConfig.fromJson(Map<String, dynamic> json) {
    final rawEmailAnalysisModuleEnabled = json['emailAnalysisModuleEnabled'];
    return ClientConfig(
      bootstrapBaseUrl: (json['bootstrapBaseUrl'] ?? '').toString(),
      resolvedServiceBaseUrl: (json['resolvedServiceBaseUrl'] ?? '').toString(),
      clientId: (json['clientId'] ?? '').toString(),
      lastDiscoveryConfigVersion: (json['lastDiscoveryConfigVersion'] ?? '')
          .toString(),
      lastExpertVocabularyVersion:
          (json['lastExpertVocabularyVersion'] as num?)?.toInt() ?? 0,
      lastExpertVocabularyChecksum: (json['lastExpertVocabularyChecksum'] ?? '')
          .toString(),
      lastExpertVocabularyPulledAt: (json['lastExpertVocabularyPulledAt'] ?? '')
          .toString(),
      lastConnectedAt: (json['lastConnectedAt'] ?? '').toString(),
      expertVocabularySyncPolicy:
          (json['expertVocabularySyncPolicy'] ?? 'manual').toString(),
      indexHotUpdatePolicy: (json['indexHotUpdatePolicy'] ?? 'automatic')
          .toString(),
      platformCapabilityPreference:
          (json['platformCapabilityPreference'] ?? 'auto').toString(),
      emailAnalysisModuleEnabled: rawEmailAnalysisModuleEnabled is bool
          ? rawEmailAnalysisModuleEnabled
          : null,
    );
  }

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{
      'bootstrapBaseUrl': bootstrapBaseUrl,
      'resolvedServiceBaseUrl': resolvedServiceBaseUrl,
      'clientId': clientId,
      'lastDiscoveryConfigVersion': lastDiscoveryConfigVersion,
      'lastExpertVocabularyVersion': lastExpertVocabularyVersion,
      'lastExpertVocabularyChecksum': lastExpertVocabularyChecksum,
      'lastExpertVocabularyPulledAt': lastExpertVocabularyPulledAt,
      'lastConnectedAt': lastConnectedAt,
      'expertVocabularySyncPolicy': expertVocabularySyncPolicy,
      'indexHotUpdatePolicy': indexHotUpdatePolicy,
      'platformCapabilityPreference': platformCapabilityPreference,
    };
    if (emailAnalysisModuleEnabled != null) {
      json['emailAnalysisModuleEnabled'] = emailAnalysisModuleEnabled!;
    }
    return json;
  }
}

class ClientBackendCapabilities {
  const ClientBackendCapabilities({
    required this.schemaVersion,
    required this.protocolVersion,
    required this.platform,
    required this.mailImport,
    required this.mailIndex,
    required this.fileIndex,
    required this.localRpc,
    required this.expertVocabulary,
    required this.platformAdapters,
    required this.updatedAt,
  });

  final int schemaVersion;
  final int protocolVersion;
  final String platform;
  final bool mailImport;
  final bool mailIndex;
  final bool fileIndex;
  final bool localRpc;
  final bool expertVocabulary;
  final List<String> platformAdapters;
  final String updatedAt;

  bool get isCompatible => schemaVersion <= 1 && protocolVersion == 1;

  factory ClientBackendCapabilities.fromJson(Map<dynamic, dynamic> json) {
    final rawAdapters = json['platformAdapters'];
    return ClientBackendCapabilities(
      schemaVersion: (json['schemaVersion'] as num?)?.toInt() ?? 0,
      protocolVersion: (json['protocolVersion'] as num?)?.toInt() ?? 0,
      platform: (json['platform'] ?? '').toString(),
      mailImport: json['mailImport'] == true,
      mailIndex: json['mailIndex'] == true,
      fileIndex: json['fileIndex'] == true,
      localRpc: json['localRpc'] == true,
      expertVocabulary: json['expertVocabulary'] == true,
      platformAdapters: rawAdapters is List
          ? rawAdapters.map((item) => item.toString()).toList(growable: false)
          : const [],
      updatedAt: (json['updatedAt'] ?? '').toString(),
    );
  }
}

class ClientBackendVocabularyState {
  const ClientBackendVocabularyState({
    required this.version,
    required this.checksum,
    required this.activeEntryCount,
    required this.updatedAt,
  });

  final int version;
  final String checksum;
  final int activeEntryCount;
  final String updatedAt;

  factory ClientBackendVocabularyState.fromJson(Map<dynamic, dynamic> json) {
    return ClientBackendVocabularyState(
      version: (json['version'] as num?)?.toInt() ?? 0,
      checksum: (json['checksum'] ?? '').toString(),
      activeEntryCount: (json['activeEntryCount'] as num?)?.toInt() ?? 0,
      updatedAt: (json['updatedAt'] ?? '').toString(),
    );
  }
}

class ClientBackendRuntimeState {
  const ClientBackendRuntimeState({
    required this.schemaVersion,
    required this.protocolVersion,
    required this.daemonStatus,
    required this.currentTask,
    required this.mailIndex,
    required this.vocabulary,
    required this.recentError,
    required this.lastHeartbeatAt,
    required this.dataDirectory,
  });

  final int schemaVersion;
  final int protocolVersion;
  final String daemonStatus;
  final String currentTask;
  final Map<String, dynamic> mailIndex;
  final ClientBackendVocabularyState vocabulary;
  final String recentError;
  final String lastHeartbeatAt;
  final String dataDirectory;

  bool get isCompatible => schemaVersion <= 1 && protocolVersion == 1;

  factory ClientBackendRuntimeState.fromJson(Map<dynamic, dynamic> json) {
    final rawMailIndex = json['mailIndex'];
    final rawVocabulary = json['vocabulary'];
    return ClientBackendRuntimeState(
      schemaVersion: (json['schemaVersion'] as num?)?.toInt() ?? 0,
      protocolVersion: (json['protocolVersion'] as num?)?.toInt() ?? 0,
      daemonStatus: (json['daemonStatus'] ?? '').toString(),
      currentTask: (json['currentTask'] ?? '').toString(),
      mailIndex: rawMailIndex is Map
          ? Map<String, dynamic>.from(rawMailIndex)
          : const {},
      vocabulary: rawVocabulary is Map
          ? ClientBackendVocabularyState.fromJson(rawVocabulary)
          : const ClientBackendVocabularyState(
              version: 0,
              checksum: '',
              activeEntryCount: 0,
              updatedAt: '',
            ),
      recentError: (json['recentError'] ?? '').toString(),
      lastHeartbeatAt: (json['lastHeartbeatAt'] ?? '').toString(),
      dataDirectory: (json['dataDirectory'] ?? '').toString(),
    );
  }
}

class QueuedFile {
  const QueuedFile({
    required this.path,
    required this.name,
    required this.relativePath,
    required this.byteSize,
    required this.mediaType,
  });

  final String path;
  final String name;
  final String relativePath;
  final int byteSize;
  final String mediaType;

  factory QueuedFile.fromJson(Map<String, dynamic> json) {
    return QueuedFile(
      path: (json['path'] ?? '').toString(),
      name: (json['name'] ?? '').toString(),
      relativePath: (json['relativePath'] ?? '').toString(),
      byteSize: (json['byteSize'] as num?)?.toInt() ?? 0,
      mediaType: (json['mediaType'] ?? 'application/octet-stream').toString(),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'path': path,
      'name': name,
      'relativePath': relativePath,
      'byteSize': byteSize,
      'mediaType': mediaType,
    };
  }
}

class RecentRun {
  const RecentRun({
    required this.jobId,
    required this.createdAt,
    required this.status,
    required this.stage,
    required this.inputPreview,
    required this.fileCount,
    required this.serviceUrl,
    required this.progressPercent,
    this.error = '',
  });

  final String jobId;
  final String createdAt;
  final String status;
  final String stage;
  final String inputPreview;
  final int fileCount;
  final String serviceUrl;
  final double progressPercent;
  final String error;

  RecentRun copyWith({
    String? jobId,
    String? createdAt,
    String? status,
    String? stage,
    String? inputPreview,
    int? fileCount,
    String? serviceUrl,
    double? progressPercent,
    String? error,
  }) {
    return RecentRun(
      jobId: jobId ?? this.jobId,
      createdAt: createdAt ?? this.createdAt,
      status: status ?? this.status,
      stage: stage ?? this.stage,
      inputPreview: inputPreview ?? this.inputPreview,
      fileCount: fileCount ?? this.fileCount,
      serviceUrl: serviceUrl ?? this.serviceUrl,
      progressPercent: progressPercent ?? this.progressPercent,
      error: error ?? this.error,
    );
  }

  factory RecentRun.fromJson(Map<String, dynamic> json) {
    return RecentRun(
      jobId: (json['jobId'] ?? '').toString(),
      createdAt: (json['createdAt'] ?? '').toString(),
      status: (json['status'] ?? '').toString(),
      stage: (json['stage'] ?? '').toString(),
      inputPreview: (json['inputPreview'] ?? '').toString(),
      fileCount: (json['fileCount'] as num?)?.toInt() ?? 0,
      serviceUrl: (json['serviceUrl'] ?? '').toString(),
      progressPercent: (json['progressPercent'] as num?)?.toDouble() ?? 0,
      error: (json['error'] ?? '').toString(),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'jobId': jobId,
      'createdAt': createdAt,
      'status': status,
      'stage': stage,
      'inputPreview': inputPreview,
      'fileCount': fileCount,
      'serviceUrl': serviceUrl,
      'progressPercent': progressPercent,
      'error': error,
    };
  }
}

class ExpertVocabularySummary {
  const ExpertVocabularySummary({
    required this.version,
    required this.checksum,
    required this.updatedAt,
    required this.publishedAt,
    required this.entryCount,
    required this.activeEntryCount,
  });

  final int version;
  final String checksum;
  final String updatedAt;
  final String publishedAt;
  final int entryCount;
  final int activeEntryCount;

  factory ExpertVocabularySummary.fromJson(Map<String, dynamic> json) {
    return ExpertVocabularySummary(
      version: (json['version'] as num?)?.toInt() ?? 0,
      checksum: (json['checksum'] ?? '').toString(),
      updatedAt: (json['updatedAt'] ?? '').toString(),
      publishedAt: (json['publishedAt'] ?? '').toString(),
      entryCount: (json['entryCount'] as num?)?.toInt() ?? 0,
      activeEntryCount: (json['activeEntryCount'] as num?)?.toInt() ?? 0,
    );
  }
}

class ExpertVocabularyEntry {
  const ExpertVocabularyEntry({
    required this.id,
    required this.pathSegments,
    required this.label,
    required this.keywords,
    required this.domains,
    required this.status,
    required this.notes,
  });

  final String id;
  final List<String> pathSegments;
  final String label;
  final List<String> keywords;
  final List<String> domains;
  final String status;
  final String notes;

  bool get isActive => status == 'active';

  factory ExpertVocabularyEntry.fromJson(Map<dynamic, dynamic> json) {
    List<String> strings(Object? value) {
      if (value is List) {
        return value
            .map((item) => item.toString().trim())
            .where((item) {
              return item.isNotEmpty;
            })
            .toList(growable: false);
      }
      return const [];
    }

    return ExpertVocabularyEntry(
      id: (json['id'] ?? '').toString(),
      pathSegments: strings(json['pathSegments']),
      label: (json['label'] ?? '').toString(),
      keywords: strings(json['keywords']),
      domains: strings(json['domains']),
      status: (json['status'] ?? 'active').toString(),
      notes: (json['notes'] ?? '').toString(),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'pathSegments': pathSegments,
      'label': label,
      'keywords': keywords,
      'domains': domains,
      'status': status,
      'notes': notes,
    };
  }
}

class ExpertVocabulary {
  const ExpertVocabulary({
    required this.schemaVersion,
    required this.version,
    required this.updatedAt,
    required this.publishedAt,
    required this.source,
    required this.checksum,
    required this.entries,
  });

  factory ExpertVocabulary.empty() {
    return const ExpertVocabulary(
      schemaVersion: 1,
      version: 0,
      updatedAt: '',
      publishedAt: '',
      source: '',
      checksum: '',
      entries: [],
    );
  }

  final int schemaVersion;
  final int version;
  final String updatedAt;
  final String publishedAt;
  final String source;
  final String checksum;
  final List<ExpertVocabularyEntry> entries;

  int get activeEntryCount => entries.where((entry) => entry.isActive).length;

  factory ExpertVocabulary.fromJson(Map<dynamic, dynamic> json) {
    final rawEntries = json['entries'];
    return ExpertVocabulary(
      schemaVersion: (json['schemaVersion'] as num?)?.toInt() ?? 1,
      version: (json['version'] as num?)?.toInt() ?? 0,
      updatedAt: (json['updatedAt'] ?? '').toString(),
      publishedAt: (json['publishedAt'] ?? '').toString(),
      source: (json['source'] ?? '').toString(),
      checksum: (json['checksum'] ?? '').toString(),
      entries: rawEntries is List
          ? rawEntries
                .whereType<Map>()
                .map(ExpertVocabularyEntry.fromJson)
                .where((entry) => entry.pathSegments.isNotEmpty)
                .toList(growable: false)
          : const [],
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'schemaVersion': schemaVersion,
      'version': version,
      'updatedAt': updatedAt,
      'publishedAt': publishedAt,
      'source': source,
      'checksum': checksum,
      'entries': entries.map((entry) => entry.toJson()).toList(),
    };
  }
}

class BootstrapInfo {
  const BootstrapInfo({
    required this.bootstrapBaseUrl,
    required this.activeServiceUrl,
    required this.configVersion,
    required this.expertVocabulary,
    required this.resolvedAt,
  });

  final String bootstrapBaseUrl;
  final String activeServiceUrl;
  final String configVersion;
  final ExpertVocabularySummary expertVocabulary;
  final String resolvedAt;

  factory BootstrapInfo.fromJson(Map<String, dynamic> json) {
    final rawVocabulary = json['expertVocabulary'];
    return BootstrapInfo(
      bootstrapBaseUrl: (json['bootstrapBaseUrl'] ?? '').toString(),
      activeServiceUrl: (json['activeServiceUrl'] ?? '').toString(),
      configVersion: (json['configVersion'] ?? '').toString(),
      expertVocabulary: rawVocabulary is Map
          ? ExpertVocabularySummary.fromJson(
              Map<String, dynamic>.from(rawVocabulary),
            )
          : const ExpertVocabularySummary(
              version: 0,
              checksum: '',
              updatedAt: '',
              publishedAt: '',
              entryCount: 0,
              activeEntryCount: 0,
            ),
      resolvedAt: (json['resolvedAt'] ?? '').toString(),
    );
  }
}

class SplitJob {
  const SplitJob({
    required this.id,
    required this.status,
    required this.progressPercent,
    required this.stage,
    this.error = '',
  });

  final String id;
  final String status;
  final double progressPercent;
  final String stage;
  final String error;

  bool get isTerminal => switch (status) {
    'completed' || 'failed' || 'cancelled' || 'deleted' => true,
    _ => false,
  };

  bool get isCompleted => status == 'completed';

  factory SplitJob.fromJson(Map<String, dynamic> json) {
    return SplitJob(
      id: (json['id'] ?? '').toString(),
      status: (json['status'] ?? 'queued').toString(),
      progressPercent: (json['progressPercent'] as num?)?.toDouble() ?? 0,
      stage: (json['stage'] ?? '').toString(),
      error: (json['error'] ?? '').toString(),
    );
  }
}

class ExportArtifact {
  const ExportArtifact({
    required this.fileName,
    required this.bytes,
    required this.contentType,
  });

  final String fileName;
  final List<int> bytes;
  final String contentType;
}

class ServerInterfaceOperation {
  const ServerInterfaceOperation({
    required this.id,
    required this.feature,
    required this.label,
    required this.target,
    required this.http,
    required this.rpc,
    required this.cli,
    required this.aliases,
    required this.localInForwardMode,
    required this.binary,
    required this.aspects,
    required this.safety,
    required this.audit,
    required this.inputSchema,
    required this.readOnly,
    required this.destructive,
    required this.concurrencySafe,
    required this.requiredScopes,
  });

  final String id;
  final String feature;
  final String label;
  final String target;
  final String http;
  final String rpc;
  final String cli;
  final List<String> aliases;
  final bool localInForwardMode;
  final bool binary;
  final List<String> aspects;
  final Map<String, dynamic> safety;
  final Map<String, dynamic> audit;
  final Map<String, dynamic> inputSchema;
  final bool readOnly;
  final bool destructive;
  final bool concurrencySafe;
  final List<String> requiredScopes;

  factory ServerInterfaceOperation.fromJson(Map<dynamic, dynamic> json) {
    final rawAliases = json['aliases'];
    final rawAspects = json['aspects'];
    final rawSafety = json['safety'];
    final rawAudit = json['audit'];
    final rawInputSchema = json['inputSchema'];
    final rawScopes = json['requiredScopes'];
    return ServerInterfaceOperation(
      id: (json['id'] ?? '').toString(),
      feature: (json['feature'] ?? '').toString(),
      label: (json['label'] ?? '').toString(),
      target: (json['target'] ?? '').toString(),
      http: (json['http'] ?? '').toString(),
      rpc: (json['rpc'] ?? '').toString(),
      cli: (json['cli'] ?? '').toString(),
      aliases: rawAliases is List
          ? rawAliases.map((item) => item.toString()).toList(growable: false)
          : const [],
      localInForwardMode: json['localInForwardMode'] == true,
      binary: json['binary'] == true,
      aspects: rawAspects is List
          ? rawAspects.map((item) => item.toString()).toList(growable: false)
          : const [],
      safety: rawSafety is Map
          ? Map<String, dynamic>.from(rawSafety)
          : const {},
      audit: rawAudit is Map ? Map<String, dynamic>.from(rawAudit) : const {},
      inputSchema: rawInputSchema is Map
          ? Map<String, dynamic>.from(rawInputSchema)
          : const {},
      readOnly:
          json['readOnly'] == true ||
          (rawSafety is Map && rawSafety['readOnly'] == true),
      destructive:
          json['destructive'] == true ||
          (rawSafety is Map && rawSafety['destructive'] == true),
      concurrencySafe:
          json['concurrencySafe'] == true ||
          (rawSafety is Map && rawSafety['concurrencySafe'] == true),
      requiredScopes: rawScopes is List
          ? rawScopes.map((item) => item.toString()).toList(growable: false)
          : const [],
    );
  }

  String get httpMethod {
    final parts = http.trim().split(RegExp(r'\s+'));
    return parts.isEmpty ? '' : parts.first.toUpperCase();
  }

  String get httpPath {
    final parts = http.trim().split(RegExp(r'\s+'));
    return parts.length < 2 ? '' : parts.sublist(1).join(' ');
  }

  String get risk => (safety['risk'] ?? '').toString();

  bool get isReadOnly => readOnly || httpMethod == 'GET' || risk == 'read_only';

  bool matches(String query) {
    final normalized = query.trim().toLowerCase();
    if (normalized.isEmpty) {
      return true;
    }
    return [
      id,
      feature,
      label,
      target,
      http,
      rpc,
      cli,
      aliases.join(' '),
      requiredScopes.join(' '),
      risk,
      audit['redaction']?.toString() ?? '',
      inputSchema['type']?.toString() ?? '',
      readOnly ? 'readOnly' : '',
      destructive ? 'destructive' : '',
      concurrencySafe ? 'concurrencySafe' : '',
    ].any((value) => value.toLowerCase().contains(normalized));
  }
}

enum AppSection {
  console,
  queue,
  server,
  modules,
  knowledgeGraph,
  export,
  checkpoints,
  localLogs,
  settings,
}

enum ExportKind {
  json('json', '导出结构化数据', 'application/json'),
  docx(
    'docx',
    '导出 DOCX 报告',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ),
  knowledgeDocx(
    'docx',
    '导出知识包 DOCX',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    mode: 'knowledge-package',
  ),
  sourceLogs('logs', '导出源日志', 'text/plain');

  const ExportKind(this.apiFormat, this.label, this.mimeType, {this.mode});

  final String apiFormat;
  final String label;
  final String mimeType;
  final String? mode;
}

String displayJobStatus(String value) {
  return switch (value.trim().toLowerCase()) {
    'queued' => '排队中',
    'running' => '运行中',
    'completed' => '已完成',
    'failed' => '失败',
    'cancelled' => '已取消',
    'deleted' => '已删除',
    _ => '未知状态',
  };
}

String displayUploadSessionStatus(String value) {
  return switch (value.trim().toLowerCase()) {
    'uploading' => '上传中',
    'complete' => '已完成',
    'cached' => '本地缓存',
    _ => '未知状态',
  };
}

String displayStageLabel(String value) {
  final trimmed = value.trim();
  if (trimmed.isEmpty) {
    return '等待阶段更新';
  }
  if (RegExp(r'[\u4e00-\u9fff]').hasMatch(trimmed)) {
    return trimmed;
  }

  final normalized = trimmed.toLowerCase();
  return switch (normalized) {
    'queued' || 'waiting' || 'pending' || 'pending start' => '等待执行',
    'running' || 'processing' || 'in progress' => '处理中',
    'completed' || 'done' || 'finished' => '已完成',
    'failed' || 'error' => '执行失败',
    'background job started' => '后台任务已启动',
    'saving config' => '保存配置',
    'reading input email' => '读取输入邮件',
    'splitting body blocks' => '切分正文块',
    'calling cloud model to parse document' => '调用云端模型解析文档',
    'analyzing transaction and people network' => '分析事务与人物网络',
    'result generated' => '结果已生成',
    'recovery in progress' => '任务恢复中',
    'task aborted' => '任务已中止',
    _ => trimmed,
  };
}

String displayDataKey(String key) {
  return switch (key.trim().toLowerCase()) {
    'title' => '标题',
    'name' => '名称',
    'subject' => '主题',
    'id' => '标识',
    'type' => '类型',
    'status' => '状态',
    'stage' => '阶段',
    'summary' => '摘要',
    'description' => '描述',
    'createdat' || 'created_at' => '创建时间',
    'updatedat' || 'updated_at' => '更新时间',
    'date' => '日期',
    'time' => '时间',
    'amount' => '金额',
    'currency' => '币种',
    'source' => '来源',
    'email' => '邮箱',
    'phone' => '电话',
    'address' => '地址',
    'location' => '位置',
    'person' => '人员',
    'people' => '人员',
    'company' => '公司',
    'organization' => '机构',
    'role' => '角色',
    'confidence' => '置信度',
    'participants' => '参与方',
    'counterparties' => '交易对手',
    'transactionid' || 'transaction_id' => '事务标识',
    'lineageid' || 'lineage_id' => '谱系标识',
    'matchedbatchid' || 'matched_batch_id' => '匹配批次',
    'pulledeventcount' || 'pulled_event_count' => '拉取事件数',
    'lifecycle' => '生命周期',
    _ => key,
  };
}
