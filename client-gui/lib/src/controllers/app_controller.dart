import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math' as math;

import 'package:file_selector/file_selector.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';
import 'package:http/http.dart' show ClientException;
import 'package:mime/mime.dart';
import 'package:path/path.dart' as p;
import 'package:uuid/uuid.dart';

import '../models/app_models.dart';
import '../models/knowledge_graph_models.dart';
import '../models/transfer_models.dart';
import '../services/daemon_services.dart';
import '../services/knowledge_graph_service.dart';
import '../services/macos_mail_importer.dart';
import '../services/runtime_services.dart';
import '../services/agent_service.dart';

class _MailKnowledgeGraphPreloadRequest {
  const _MailKnowledgeGraphPreloadRequest({
    required this.mailWorkspaceDirectory,
    required this.mailSemanticSuggestions,
    required this.emailAnalysisModuleSupported,
    required this.emailAnalysisModuleEnabled,
    required this.importingMacOSMail,
    required this.mailImportPaused,
    required this.mailImportDownloadedCount,
    required this.mailImportTotalCount,
    required this.mailIndexDocumentCount,
    required this.mailIndexSegmentCount,
    required this.mailIndexPendingCount,
    required this.mailIndexLastUpdatedAt,
    required this.mailIndexDirectory,
    required this.people,
    required this.transactions,
  });

  final String mailWorkspaceDirectory;
  final Map<String, MailKnowledgeSemanticSuggestion> mailSemanticSuggestions;
  final bool emailAnalysisModuleSupported;
  final bool emailAnalysisModuleEnabled;
  final bool importingMacOSMail;
  final bool mailImportPaused;
  final int mailImportDownloadedCount;
  final int mailImportTotalCount;
  final int? mailIndexDocumentCount;
  final int? mailIndexSegmentCount;
  final int? mailIndexPendingCount;
  final String mailIndexLastUpdatedAt;
  final String mailIndexDirectory;
  final List<Map<String, dynamic>> people;
  final List<Map<String, dynamic>> transactions;
}

class _MailKnowledgeGraphPreloadResult {
  const _MailKnowledgeGraphPreloadResult({
    required this.documents,
    required this.snapshot,
  });

  final List<MailKnowledgeDocument> documents;
  final KnowledgeGraphSnapshot snapshot;
}

class _MailKnowledgeTimelineMatch {
  const _MailKnowledgeTimelineMatch({
    required this.document,
    required this.score,
    required this.timestamp,
    required this.stage,
    required this.groupKey,
  });

  final MailKnowledgeDocument document;
  final int score;
  final DateTime timestamp;
  final String stage;
  final String groupKey;
}

class _MailKnowledgeTimelineGroup {
  _MailKnowledgeTimelineGroup({required this.stage, required this.groupKey});

  final String stage;
  final String groupKey;
  final List<_MailKnowledgeTimelineMatch> matches = [];

  void add(_MailKnowledgeTimelineMatch match) {
    matches.add(match);
  }

  int get score =>
      matches.fold<int>(0, (value, match) => math.max(value, match.score));

  DateTime get timestamp {
    if (matches.isEmpty) {
      return DateTime.fromMillisecondsSinceEpoch(0);
    }
    return matches
        .map((match) => match.timestamp)
        .reduce((left, right) => left.isBefore(right) ? left : right);
  }

  List<MailKnowledgeDocument> get documents {
    final sorted = [...matches]
      ..sort((left, right) {
        final score = right.score.compareTo(left.score);
        if (score != 0) {
          return score;
        }
        return left.timestamp.compareTo(right.timestamp);
      });
    return sorted.map((match) => match.document).toList(growable: false);
  }
}

Future<_MailKnowledgeGraphPreloadResult> _preloadMailKnowledgeGraph(
  _MailKnowledgeGraphPreloadRequest request,
) async {
  final documents = await _loadMailKnowledgeDocumentsForPreload(
    request.mailWorkspaceDirectory,
  );
  final mailIndexStats = request.mailIndexDocumentCount == null
      ? null
      : MacOSMailIndexStats(
          documentCount: request.mailIndexDocumentCount ?? 0,
          segmentCount: request.mailIndexSegmentCount ?? 0,
          pendingCount: request.mailIndexPendingCount ?? 0,
          lastUpdatedAt: request.mailIndexLastUpdatedAt,
          indexDirectory: request.mailIndexDirectory,
        );
  final aspect = KnowledgeGraphSubscriptionAspect()
    ..registerDataSource(const AffairKnowledgeGraphDataSource());
  final snapshot = aspect.rebuild(
    KnowledgeGraphContext(
      mailDocuments: documents,
      mailSemanticSuggestions: request.mailSemanticSuggestions,
      emailAnalysisModuleSupported: request.emailAnalysisModuleSupported,
      emailAnalysisModuleEnabled: request.emailAnalysisModuleEnabled,
      importingMacOSMail: request.importingMacOSMail,
      mailImportPaused: request.mailImportPaused,
      mailImportDownloadedCount: request.mailImportDownloadedCount,
      mailImportTotalCount: request.mailImportTotalCount,
      mailIndexStats: mailIndexStats,
      people: request.people,
      transactions: request.transactions,
    ),
  );
  return _MailKnowledgeGraphPreloadResult(
    documents: documents,
    snapshot: snapshot,
  );
}

Future<List<MailKnowledgeDocument>> _loadMailKnowledgeDocumentsForPreload(
  String mailWorkspaceDirectory, {
  int maxRows = 1600,
}) async {
  final file = File(p.join(mailWorkspaceDirectory, 'index', 'docs.tsv'));
  if (!await file.exists()) {
    return const [];
  }

  const maxBytes = 3 * 1024 * 1024;
  final length = await file.length();
  final start = length > maxBytes ? length - maxBytes : 0;
  final reader = await file.open();
  late final List<int> bytes;
  try {
    await reader.setPosition(start);
    bytes = await reader.read(length - start);
  } finally {
    await reader.close();
  }

  var lines = const LineSplitter().convert(
    utf8.decode(bytes, allowMalformed: true),
  );
  if (start > 0 && lines.isNotEmpty) {
    lines = lines.sublist(1);
  }
  final nonEmpty = lines.where((line) => line.trim().isNotEmpty).toList();
  final selected = nonEmpty.length > maxRows
      ? nonEmpty.sublist(nonEmpty.length - maxRows)
      : nonEmpty;
  return selected
      .map(MailKnowledgeDocument.fromTsvLine)
      .where((document) => document.isValid)
      .toList(growable: false);
}

class AppController extends ChangeNotifier {
  final AgentService agentService = AgentService();
  List<TargetCandidate> scannedTargets = [];
  Map<String, dynamic>? targetInspection;
  Map<String, dynamic>? targetConfigPlan;
  bool isScanningTargets = false;

  Future<void> scanTargets() async {
    if (isScanningTargets) return;
    isScanningTargets = true;
    notifyListeners();
    try {
      scannedTargets = await agentService.scanTargets();
      statusMessage = '已扫描 ${scannedTargets.length} 个目标适配器。';
      statusCaption = 'Targets';
    } catch (e) {
      debugPrint('Failed to scan targets: $e');
      lastError = e.toString();
    } finally {
      isScanningTargets = false;
      notifyListeners();
    }
  }

  Future<void> inspectTarget(String target) async {
    try {
      targetInspection = await agentService.inspectTarget(target);
      statusMessage = '已读取 $target 目标适配器。';
      statusCaption = 'Target inspect';
      notifyListeners();
    } catch (e) {
      debugPrint('Failed to inspect target: $e');
      lastError = e.toString();
      notifyListeners();
    }
  }

  Future<void> planTargetConfig(String target) async {
    try {
      targetConfigPlan = await agentService.planTargetConfig(target);
      statusMessage = '已生成 $target MCP 配置计划。';
      statusCaption = 'MCP config plan';
      notifyListeners();
    } catch (e) {
      debugPrint('Failed to plan target config: $e');
      lastError = e.toString();
      notifyListeners();
    }
  }

  AppController({
    required PortableStorage storage,
    ClientBackendApi? backendApi,
  }) : _storage = storage,
       _backendApi = backendApi ?? ClientBackendApi(storage: storage) {
    _moduleDaemon = ModuleDaemon(onEvent: _handleModuleDaemonEvent);
    _knowledgeDaemon = KnowledgeDaemon(
      isEnabled: () => initialized,
      onRefresh: _handleKnowledgeDaemonRefresh,
    );
    _registerDaemonTasks();
    bootstrapController.addListener(notifyListeners);
    serviceUsernameController.addListener(notifyListeners);
    servicePasswordController.addListener(notifyListeners);
    inputController.addListener(notifyListeners);
    _knowledgeGraphSubscriptionAspect.registerDataSource(
      const AffairKnowledgeGraphDataSource(),
    );
  }

  static const Map<String, dynamic> _defaultSettings = {
    'retrievalHalfLifeDays': 45,
    'staleAfterDays': 180,
    'transactionWindowDays': 30,
  };

  static const int _visibleLogLimit = 2000;
  static const int _mailImportVisibleDetailLogStep = 100;
  static const Duration _mailImportUiNotifyInterval = Duration(
    milliseconds: 500,
  );
  static const Duration _mailImportQueueSyncInterval = Duration(seconds: 2);

  static const Set<String> _supportedExtensions = {
    'txt',
    'md',
    'markdown',
    'csv',
    'json',
    'yaml',
    'yml',
    'xml',
    'html',
    'htm',
    'js',
    'ts',
    'tsx',
    'jsx',
    'py',
    'java',
    'c',
    'cpp',
    'h',
    'hpp',
    'ini',
    'log',
    'pdf',
    'doc',
    'docx',
    'dotx',
    'ppt',
    'pptx',
    'pps',
    'ppsx',
    'xls',
    'xlsx',
    'xlsm',
    'rtf',
    'msg',
    'eml',
    'zip',
    'epub',
    'odt',
    'ods',
    'odp',
    'png',
    'jpg',
    'jpeg',
    'webp',
    'gif',
    'bmp',
    'tif',
    'tiff',
  };

  static const Duration _uploadSessionWatchInterval = Duration(seconds: 2);
  static const Duration _mailImportStallTimeout = Duration(seconds: 90);
  static const String _mailWorkspaceName = 'mail-imports';
  static const String _mailCloudSyncInputPrefix = '同步 macOS Mail 导出的';

  final PortableStorage _storage;
  final ClientBackendApi _backendApi;
  final KnowledgeGraphSubscriptionAspect _knowledgeGraphSubscriptionAspect =
      KnowledgeGraphSubscriptionAspect();
  late final ModuleDaemon _moduleDaemon;
  late final KnowledgeDaemon _knowledgeDaemon;
  final bootstrapController = TextEditingController();
  final serviceUsernameController = TextEditingController();
  final servicePasswordController = TextEditingController();
  final inputController = TextEditingController();
  final Uuid _uuid = const Uuid();

  AppSection currentSection = AppSection.agents;
  ClientConfig config = const ClientConfig();
  List<QueuedFile> queuedFiles = const [];
  List<RecentRun> recentRuns = const [];
  List<String> logs = const [];
  CheckpointStore checkpointStore = CheckpointStore();
  SplitJob? activeJob;
  UploadSessionInfo? activeUploadSession;
  MacOSMailIndexStats? mailIndexStats;
  ExpertVocabulary expertVocabulary = ExpertVocabulary.empty();
  ClientBackendCapabilities? backendCapabilities;
  ClientBackendRuntimeState? backendRuntimeState;
  List<MailKnowledgeDocument> mailKnowledgeDocuments = const [];
  Map<String, MailKnowledgeSemanticSuggestion>
  mailKnowledgeSemanticSuggestions = const {};
  KnowledgeGraphSnapshot knowledgeGraph = KnowledgeGraphSnapshot.empty();
  List<ServerInterfaceOperation> serverOperations = const [];
  Map<String, dynamic> serverOverview = const {};
  Map<String, dynamic>? serverOperationResult;
  Map<String, dynamic>? activeResult;
  Map<String, dynamic>? inspectedResult;
  bool initialized = false;
  bool busy = false;
  bool connecting = false;
  bool importingMacOSMail = false;
  bool syncingMacOSMailToCloud = false;
  bool activatingMacOSMailAuthorization = false;
  bool refreshingMailIndexStats = false;
  bool pullingExpertVocabulary = false;
  bool applyingExpertVocabularyToMailIndex = false;
  bool startingClientBackend = false;
  bool clientBackendAvailable = false;
  bool refreshingMailKnowledgeGraph = false;
  bool refreshingServerCapabilities = false;
  bool invokingServerRequest = false;
  bool searchingKnowledgeIndex = false;
  bool rebuildingMailIndex = false;
  bool emailAnalysisModuleEnabled = false;
  bool macOSMailUploadToCloudEnabled = false;
  bool loadingSelectedRun = false;
  bool refreshingMacOSMailCloudSyncStatus = false;
  double packagingProgress = 0;
  double uploadProgress = 0;
  double? mailImportProgressValue;
  double? mailCloudSyncProgressValue;
  int mailImportProcessedCount = 0;
  int mailImportExportedCount = 0;
  int mailImportFailedCount = 0;
  int mailImportSkippedCount = 0;
  int mailImportTotalCount = 0;
  int mailImportCurrentSequence = 0;
  int mailCloudSyncQueueCount = 0;
  int mailCloudSyncFileCount = 0;
  bool mailImportPaused = false;
  String statusMessage = '等待提交任务。';
  String statusCaption = '空闲状态';
  String lastError = '';
  String mailCloudSyncStatusLabel = '空闲';
  String mailCloudSyncTaskId = '';
  String mailCloudSyncCheckpointId = '';
  String mailCloudSyncUpdatedAt = '';
  String selectedRunId = '';
  String selectedCheckpointId = '';
  String selectedUploadSessionId = '';
  String inspectedResultJobId = '';
  String serverOperationError = '';
  String knowledgeSearchQuery = '';
  String knowledgeSearchError = '';
  int knowledgeSearchTotal = 0;
  List<MacOSMailIndexSearchResult> knowledgeSearchResults = const [];
  List<Map<String, dynamic>> dataConnectors = const [];
  String dataConnectorError = '';
  bool refreshingDataConnectors = false;
  static const int uploadSessionPageSize = 10;
  int uploadSessionPageIndex = 0;
  final DateTime _sessionStartedAt = DateTime.now();
  Timer? _clientBackendStatePollTimer;
  Timer? _clientBackendWatchDebounceTimer;
  Timer? _uploadSessionWatchTimer;
  StreamSubscription<FileSystemEvent>? _clientBackendFileWatchSubscription;
  bool _uploadSessionWatchInFlight = false;
  DateTime _lastUploadSessionWatchErrorAt = DateTime.fromMillisecondsSinceEpoch(
    0,
  );
  DateTime _lastMailIndexStatsRefreshAt = DateTime.fromMillisecondsSinceEpoch(
    0,
  );
  Timer? _mailImportWatchdogTimer;
  Timer? _mailImportUiNotifyTimer;
  int _mailImportRunToken = 0;
  int _lastLoggedMailImportBucket = -1;
  DateTime _lastMailImportUiNotifyAt = DateTime.fromMillisecondsSinceEpoch(0);
  DateTime _lastMailImportQueueSyncAt = DateTime.fromMillisecondsSinceEpoch(0);
  int _lastMailImportQueueSyncExportedCount = -1;
  bool _mailImportUiNotifyPending = false;
  bool _mailCloudSyncStatusRefreshInFlight = false;
  bool _logsMutable = false;
  bool _disposed = false;
  bool _syncingKnowledgeGraph = false;
  bool _knowledgeGraphDirty = true;
  bool _mailKnowledgeCloudEnhanceInFlight = false;
  bool _pendingExpertVocabularyIndexApply = false;
  DateTime _lastMailKnowledgeCloudEnhanceAt =
      DateTime.fromMillisecondsSinceEpoch(0);
  int _knowledgeSearchToken = 0;

  String get bootstrapUrl => bootstrapController.text.trim();
  String get serviceUsername => serviceUsernameController.text.trim();
  String get servicePassword => servicePasswordController.text;
  String get inputText => inputController.text;
  String get resolvedServiceUrl => config.resolvedServiceBaseUrl;
  bool get connected => resolvedServiceUrl.isNotEmpty;
  bool get emailAnalysisModuleSupported => Platform.isMacOS;
  bool get clientBackendMailIndexSupported =>
      clientBackendAvailable && (backendCapabilities?.mailIndex ?? true);
  bool get localMailIndexAvailable =>
      emailAnalysisModuleSupported || clientBackendMailIndexSupported;
  bool get canImportMacOSMail =>
      emailAnalysisModuleSupported && emailAnalysisModuleEnabled;
  bool get hasMacOSMailCloudSyncActivity =>
      syncingMacOSMailToCloud ||
      refreshingMacOSMailCloudSyncStatus ||
      mailCloudSyncQueueCount > 0 ||
      mailCloudSyncTaskId.isNotEmpty;
  String get mailCloudSyncQueueLabel {
    if (syncingMacOSMailToCloud) {
      return '当前 1 个';
    }
    if (mailCloudSyncQueueCount <= 0) {
      return '无未完成任务';
    }
    final taskSuffix = mailCloudSyncTaskId.isEmpty
        ? ''
        : ' · ${shortId(mailCloudSyncTaskId)}';
    return '$mailCloudSyncQueueCount 个未完成$taskSuffix';
  }

  String get mailCloudSyncProgressLabel {
    final value = mailCloudSyncProgressValue;
    if (value == null) {
      return mailCloudSyncStatusLabel;
    }
    final percent = (value.clamp(0, 1) * 100).round();
    return '$percent% · $mailCloudSyncStatusLabel';
  }

  String get clientBackendStatusLabel {
    if (startingClientBackend) {
      return '启动中';
    }
    if (!clientBackendAvailable) {
      return backendRuntimeState == null ? '离线' : '未连接';
    }
    final status = backendRuntimeState?.daemonStatus.trim();
    return status == null || status.isEmpty ? '运行中' : status;
  }

  String get clientBackendCapabilityLabel {
    final capabilities = backendCapabilities;
    if (capabilities == null) {
      return clientBackendAvailable ? 'RPC 可用' : '未发现';
    }
    final adapters = capabilities.platformAdapters.isEmpty
        ? capabilities.platform
        : capabilities.platformAdapters.join(', ');
    return '${capabilities.platform} / $adapters';
  }

  bool get _mailDaemonEnabled =>
      initialized && localMailIndexAvailable && emailAnalysisModuleEnabled;

  void _registerDaemonTasks() {
    _moduleDaemon.registerTask(
      ModuleDaemonTask(
        id: 'modules.hot-reload',
        moduleId: 'modules',
        interval: const Duration(minutes: 3),
        runOnStart: true,
        run: _refreshModuleRegistryDaemonTask,
      ),
    );
    _moduleDaemon.registerTask(
      ModuleDaemonTask(
        id: 'mail.index-stats',
        moduleId: 'mail',
        interval: const Duration(minutes: 1),
        isEnabled: () => _mailDaemonEnabled,
        run: _refreshMailIndexStatsDaemonTask,
      ),
    );
  }

  Future<void> _refreshModuleRegistryDaemonTask() async {
    _knowledgeGraphSubscriptionAspect.registerDataSource(
      const AffairKnowledgeGraphDataSource(),
    );
    if (localMailIndexAvailable) {
      _moduleDaemon.emitModuleEnabled(
        'mail',
        enabled: emailAnalysisModuleEnabled,
      );
    }
  }

  Future<void> _refreshMailIndexStatsDaemonTask() async {
    final before = _mailIndexStatsSignature;
    await refreshMailIndexStats(silent: true);
    if (_mailIndexStatsSignature != before) {
      _moduleDaemon.emitModuleDataChanged(
        'mail',
        reason: 'mail-index-stats-changed',
      );
    }
  }

  String get _mailIndexStatsSignature {
    final stats = mailIndexStats;
    if (stats == null) {
      return 'none';
    }
    return [
      stats.documentCount,
      stats.segmentCount,
      stats.pendingCount,
      stats.lastUpdatedAt,
    ].join(':');
  }

  void _startDaemons() {
    _moduleDaemon.start();
    _knowledgeDaemon.start();
    _moduleDaemon.requestHotReload('modules');
    _knowledgeDaemon.notify(
      KnowledgeDaemonEvent(kind: KnowledgeDaemonEventKind.boot, reason: 'boot'),
      delay: const Duration(milliseconds: 900),
    );
  }

  void _requestMailIndexStatsRefreshIfStale({
    Duration delay = const Duration(milliseconds: 450),
  }) {
    if (!_mailDaemonEnabled || refreshingMailIndexStats) {
      return;
    }
    final elapsed = DateTime.now().difference(_lastMailIndexStatsRefreshAt);
    if (mailIndexStats != null && elapsed < const Duration(seconds: 20)) {
      return;
    }
    _moduleDaemon.requestTask('mail.index-stats', delay: delay);
  }

  void _notifyKnowledgeDaemon(
    KnowledgeDaemonEvent event, {
    Duration delay = const Duration(milliseconds: 650),
  }) {
    _markKnowledgeGraphDirty();
    _knowledgeDaemon.notify(event, delay: delay);
  }

  void _handleModuleDaemonEvent(ModuleDaemonEvent event) {
    if (event.kind == ModuleDaemonEventKind.taskFailed) {
      _appendLog(
        '模块守护任务失败：${event.moduleId}/${event.taskId}，${event.error}',
        notify: false,
      );
      return;
    }
    if (event.kind == ModuleDaemonEventKind.dataChanged ||
        event.kind == ModuleDaemonEventKind.moduleEnabled ||
        event.kind == ModuleDaemonEventKind.moduleDisabled ||
        event.kind == ModuleDaemonEventKind.hotReloadRequested) {
      _notifyKnowledgeDaemon(
        KnowledgeDaemonEvent(
          kind: event.kind == ModuleDaemonEventKind.dataChanged
              ? KnowledgeDaemonEventKind.moduleDataChanged
              : KnowledgeDaemonEventKind.moduleEvent,
          sourceId: event.moduleId,
          reason: event.reason.isEmpty ? event.kind.name : event.reason,
        ),
      );
    }
  }

  Future<void> _handleKnowledgeDaemonRefresh(KnowledgeDaemonEvent event) async {
    if (resolvedServiceUrl.isNotEmpty) {
      try {
        if (await _backendApi.ensureDaemon()) {
          await _backendApi.syncKnowledgeCache(
            serviceBaseUrl: resolvedServiceUrl,
            pushOutbox: false,
          );
        }
      } catch (error) {
        _appendLog('本地知识库后台同步失败：$error', notify: false);
      }
    }
    if (localMailIndexAvailable && emailAnalysisModuleEnabled) {
      await refreshMailKnowledgeGraph(silent: true);
      return;
    }
    _syncKnowledgeGraph();
    notifyListeners();
  }

  int get mailImportDownloadedCount {
    final count = math.max(0, mailImportExportedCount + mailImportSkippedCount);
    if (mailImportTotalCount <= 0) {
      return count;
    }
    return math.min(mailImportTotalCount, count);
  }

  int get mailImportCompletedCount {
    if (mailImportTotalCount <= 0) {
      return math.max(0, mailImportProcessedCount);
    }
    return math.min(
      mailImportTotalCount,
      math.max(0, mailImportProcessedCount),
    );
  }

  String get mailIndexStatusLabel {
    final stats = mailIndexStats;
    if (stats == null) {
      return refreshingMailIndexStats ? '刷新中' : '未建立';
    }
    final pending = stats.pendingCount > 0 ? '，待合并 ${stats.pendingCount}' : '';
    return '${stats.documentCount} 封 / ${stats.segmentCount} 段$pending';
  }

  String get expertVocabularyStatusLabel {
    if (applyingExpertVocabularyToMailIndex) {
      return '应用中';
    }
    if (pullingExpertVocabulary) {
      return '拉取中';
    }
    if (_pendingExpertVocabularyIndexApply) {
      return '待应用';
    }
    if (expertVocabulary.version <= 0) {
      return '未拉取';
    }
    return 'v${expertVocabulary.version} / ${expertVocabulary.activeEntryCount} 条';
  }

  String get expertVocabularyChecksumLabel {
    final checksum = expertVocabulary.checksum;
    if (checksum.isEmpty) {
      return '未记录';
    }
    return checksum.substring(0, math.min(12, checksum.length));
  }

  Map<String, dynamic>? get displayedResult {
    final run = selectedRun;
    if (run == null) {
      return activeResult;
    }
    if (inspectedResultJobId == run.jobId) {
      return inspectedResult;
    }
    if (activeJob?.id == run.jobId) {
      return activeResult;
    }
    return null;
  }

  bool get hasResult => displayedResult != null;
  int get queueCount => queuedFiles.length;
  int get alertCount => lastError.isEmpty ? 0 : 1;
  int get knowledgeGraphNodeCount => knowledgeGraph.nodes.length;
  int get knowledgeGraphEdgeCount => knowledgeGraph.edges.length;
  int get knowledgeGraphActiveSourceCount =>
      knowledgeGraph.enabledDataSourceCount;
  int get serverFeatureCount =>
      serverOperations.map((item) => item.feature).toSet().length;
  int get serverReadOnlyOperationCount =>
      serverOperations.where((item) => item.isReadOnly).length;
  int get serverWriteOperationCount =>
      serverOperations.where((item) => !item.isReadOnly).length;
  int get serverAdminOperationCount => serverOperations
      .where(
        (item) => item.requiredScopes.any(
          (scope) => scope.toLowerCase().contains('admin'),
        ),
      )
      .length;
  int get rawDataCount =>
      queuedFiles.fold<int>(0, (sum, file) => sum + file.byteSize);
  double get successRatio =>
      activeJob == null ? 0 : activeJob!.progressPercent / 100.0;
  int get resumableCheckpointCount =>
      checkpointEntries.where((item) => isResumableState(item.state)).length;

  String get queueBytesLabel => _formatBytes(rawDataCount);

  String get uptimeLabel {
    final duration = DateTime.now().difference(_sessionStartedAt);
    final hours = duration.inHours.toString().padLeft(2, '0');
    final minutes = (duration.inMinutes % 60).toString().padLeft(2, '0');
    final seconds = (duration.inSeconds % 60).toString().padLeft(2, '0');
    return '$hours:$minutes:$seconds';
  }

  RecentRun? get selectedRun {
    if (selectedRunId.isEmpty) {
      return recentRuns.isEmpty ? null : recentRuns.first;
    }
    for (final run in recentRuns) {
      if (run.jobId == selectedRunId) {
        return run;
      }
    }
    return recentRuns.isEmpty ? null : recentRuns.first;
  }

  List<CheckpointNode> get checkpointEntries {
    final entries = [...checkpointStore.nodes];
    entries.sort((left, right) {
      final updated = right.updatedAt.compareTo(left.updatedAt);
      if (updated != 0) {
        return updated;
      }
      final created = right.createdAt.compareTo(left.createdAt);
      if (created != 0) {
        return created;
      }
      return right.checkpointId.compareTo(left.checkpointId);
    });
    return entries;
  }

  List<CheckpointNode> get uploadSessionEntries {
    return checkpointEntries
        .where((item) => item.uploadSessionId.isNotEmpty)
        .toList();
  }

  CheckpointNode? get selectedCheckpoint {
    if (selectedCheckpointId.isEmpty) {
      return checkpointEntries.isEmpty ? null : checkpointEntries.first;
    }
    return checkpointStore.findNode(selectedCheckpointId) ??
        (checkpointEntries.isEmpty ? null : checkpointEntries.first);
  }

  CheckpointNode? get selectedUploadSessionNode {
    if (selectedUploadSessionId.isNotEmpty) {
      return checkpointStore.findNodeByUploadSessionId(selectedUploadSessionId);
    }
    final selected = selectedCheckpoint;
    if (selected != null && selected.uploadSessionId.isNotEmpty) {
      return selected;
    }
    return uploadSessionEntries.isEmpty ? null : uploadSessionEntries.first;
  }

  UploadSessionInfo? get selectedUploadSession {
    final node = selectedUploadSessionNode;
    if (node == null) {
      return null;
    }
    final session = activeUploadSession;
    if (session == null) {
      return null;
    }
    return session.sessionId == node.uploadSessionId ? session : null;
  }

  bool get canResumeSelectedCheckpoint {
    final selected = selectedCheckpoint;
    return selected != null && isResumableState(selected.state);
  }

  String get resultPreview {
    final result = displayedResult;
    if (result == null) {
      return '尚未加载结果载荷。';
    }
    return const JsonEncoder.withIndent('  ').convert(result);
  }

  List<Map<String, dynamic>> get transactionItems =>
      _extractList(displayedResult, 'transactions');
  List<Map<String, dynamic>> get peopleItems =>
      _extractList(displayedResult, 'people');

  Future<void> initialize() async {
    try {
      config = await _storage.loadConfig();
      recentRuns = await _storage.loadRecentRuns();
      logs = (await _storage.loadClientLogs()).toList(growable: true);
      _logsMutable = true;
      checkpointStore = await _storage.loadCheckpointStore();
      final dataDirectory = await _storage.dataDirectory();
      expertVocabulary = await _storage.loadExpertVocabulary(
        mailWorkspaceDirectory: _mailWorkspacePath(dataDirectory),
      );
      await _startClientBackendFileWatch(dataDirectory);
      _syncSelections();
      var shouldSaveConfig = false;
      if (config.clientId.isEmpty) {
        config = config.copyWith(clientId: _uuid.v4());
        shouldSaveConfig = true;
      }
      if (config.emailAnalysisModuleEnabled == null &&
          emailAnalysisModuleSupported) {
        config = config.copyWith(emailAnalysisModuleEnabled: true);
        shouldSaveConfig = true;
      }
      emailAnalysisModuleEnabled =
          emailAnalysisModuleSupported &&
          (config.emailAnalysisModuleEnabled ?? emailAnalysisModuleSupported);
      macOSMailUploadToCloudEnabled = config.macOSMailUploadToCloudEnabled;
      if (shouldSaveConfig) {
        await _storage.saveConfig(config);
      }
      bootstrapController.text = config.bootstrapBaseUrl;
      serviceUsernameController.text = config.serviceUsername;
      servicePasswordController.text = config.servicePassword;
      await _initializeClientBackend();
      if (localMailIndexAvailable) {
        emailAnalysisModuleEnabled = config.emailAnalysisModuleEnabled ?? true;
      }
      if (config.emailAnalysisModuleEnabled == null &&
          localMailIndexAvailable) {
        emailAnalysisModuleEnabled = true;
        config = config.copyWith(emailAnalysisModuleEnabled: true);
        await _storage.saveConfig(config);
      }
      macOSMailUploadToCloudEnabled = config.macOSMailUploadToCloudEnabled;
      if (config.bootstrapBaseUrl.isNotEmpty) {
        unawaited(connect(silent: true));
      }
      unawaited(refreshDataConnectors(silent: true));
    } catch (error) {
      _setError('初始化本地便携存储失败：$error');
    } finally {
      _markKnowledgeGraphDirty();
      _syncKnowledgeGraph();
      initialized = true;
      _startUploadSessionWatch();
      _startDaemons();
      _startClientBackendStatePoll();
      _requestMailIndexStatsRefreshIfStale(
        delay: const Duration(milliseconds: 200),
      );
      notifyListeners();
    }
  }

  Future<void> _initializeClientBackend() async {
    startingClientBackend = true;
    await _refreshClientBackendState(notify: false);
    notifyListeners();

    try {
      clientBackendAvailable = await _backendApi.ensureDaemon();
      await _refreshClientBackendState(notify: false);
      if (clientBackendAvailable) {
        _appendLog('本地客户端后台已连接：$clientBackendCapabilityLabel。', notify: false);
      } else {
        _appendLog('未发现本地客户端后台二进制，继续使用 Flutter/macOS 兜底能力。', notify: false);
      }
    } catch (error) {
      clientBackendAvailable = false;
      _appendLog('本地客户端后台初始化失败：$error', notify: false);
    } finally {
      startingClientBackend = false;
      notifyListeners();
    }
  }

  void _startClientBackendStatePoll() {
    _clientBackendStatePollTimer?.cancel();
    _clientBackendStatePollTimer = Timer.periodic(const Duration(seconds: 3), (
      _,
    ) {
      unawaited(_refreshClientBackendState());
    });
  }

  Future<void> _startClientBackendFileWatch(Directory dataDirectory) async {
    await _clientBackendFileWatchSubscription?.cancel();
    final backendDirectory = Directory(p.join(dataDirectory.path, 'backend'));
    await backendDirectory.create(recursive: true);
    try {
      _clientBackendFileWatchSubscription = backendDirectory
          .watch(events: FileSystemEvent.all)
          .listen(
            (event) {
              final basename = p.basename(event.path);
              if (basename == 'runtime-state.json' ||
                  basename == 'capabilities.json' ||
                  basename == 'events.jsonl' ||
                  p.split(event.path).contains('command-results')) {
                _clientBackendWatchDebounceTimer?.cancel();
                _clientBackendWatchDebounceTimer = Timer(
                  const Duration(milliseconds: 120),
                  () => unawaited(_refreshClientBackendState()),
                );
              }
            },
            onError: (_) {
              _clientBackendFileWatchSubscription = null;
            },
          );
    } catch (_) {
      _clientBackendFileWatchSubscription = null;
    }
  }

  Future<void> _refreshClientBackendState({bool notify = true}) async {
    var changed = false;
    final nextCapabilities = await _backendApi.loadCapabilities();
    if (_capabilitiesSignature(nextCapabilities) !=
        _capabilitiesSignature(backendCapabilities)) {
      backendCapabilities = nextCapabilities;
      changed = true;
    }

    final nextState = await _backendApi.loadRuntimeState();
    if (_runtimeStateSignature(nextState) !=
        _runtimeStateSignature(backendRuntimeState)) {
      backendRuntimeState = nextState;
      changed = true;
      if (nextState != null) {
        clientBackendAvailable = nextState.daemonStatus == 'running';
        if (nextState.mailIndex.isNotEmpty) {
          mailIndexStats = MacOSMailIndexStats.fromJson(nextState.mailIndex);
          _lastMailIndexStatsRefreshAt = DateTime.now();
          _markKnowledgeGraphDirty();
        }
        final backendChecksum = nextState.vocabulary.checksum;
        if (backendChecksum.isNotEmpty &&
            backendChecksum != expertVocabulary.checksum) {
          final dataDirectory = await _storage.dataDirectory();
          expertVocabulary = await _storage.loadExpertVocabulary(
            mailWorkspaceDirectory: _mailWorkspacePath(dataDirectory),
          );
        }
      }
    }

    if (notify && changed) {
      notifyListeners();
    }
  }

  String _capabilitiesSignature(ClientBackendCapabilities? capabilities) {
    if (capabilities == null) {
      return '';
    }
    return [
      capabilities.schemaVersion,
      capabilities.protocolVersion,
      capabilities.platform,
      capabilities.mailImport,
      capabilities.mailIndex,
      capabilities.fileIndex,
      capabilities.localRpc,
      capabilities.expertVocabulary,
      capabilities.platformAdapters.join('|'),
      capabilities.updatedAt,
    ].join(':');
  }

  String _runtimeStateSignature(ClientBackendRuntimeState? state) {
    if (state == null) {
      return '';
    }
    return [
      state.schemaVersion,
      state.protocolVersion,
      state.daemonStatus,
      state.currentTask,
      state.lastHeartbeatAt,
      state.vocabulary.version,
      state.vocabulary.checksum,
      state.mailIndex['documentCount'],
      state.mailIndex['segmentCount'],
      state.mailIndex['pendingCount'],
      state.recentError,
    ].join(':');
  }

  Future<void> connect({bool silent = false}) async {
    final rawBaseUrl = bootstrapUrl;
    if (rawBaseUrl.isEmpty) {
      _setError('请先输入引导地址。');
      return;
    }

    connecting = true;
    if (!silent) {
      _appendLog('正在连接引导端点：$rawBaseUrl');
    }
    notifyListeners();

    try {
      config = config.copyWith(
        bootstrapBaseUrl: PactServiceUrls.normalizeBaseUrl(rawBaseUrl),
        serviceUsername: serviceUsername,
        servicePassword: servicePassword,
      );
      await _storage.saveConfig(config);
      if (!await _backendApi.ensureDaemon()) {
        throw StateError('本地客户端后台不可用。');
      }
      clientBackendAvailable = true;
      final bootstrap = await _backendApi.fetchBootstrap(rawBaseUrl);
      config = config.copyWith(
        bootstrapBaseUrl: bootstrap.bootstrapBaseUrl.isEmpty
            ? PactServiceUrls.normalizeBaseUrl(rawBaseUrl)
            : PactServiceUrls.normalizeBaseUrl(bootstrap.bootstrapBaseUrl),
        resolvedServiceBaseUrl: PactServiceUrls.normalizeBaseUrl(
          bootstrap.activeServiceUrl,
        ),
        lastDiscoveryConfigVersion: bootstrap.configVersion,
        lastConnectedAt: DateTime.now().toIso8601String(),
      );
      bootstrapController.text = config.bootstrapBaseUrl;
      serviceUsernameController.text = config.serviceUsername;
      servicePasswordController.text = config.servicePassword;
      statusMessage = '已连接到 ${config.resolvedServiceBaseUrl}';
      statusCaption = '握手校验通过';
      lastError = '';
      await _storage.saveConfig(config);
      await _syncAgentsAfterConnect();
      await _pullExpertVocabularyAfterConnect(bootstrap.expertVocabulary);
      unawaited(
        _backendApi
            .checkIn(
              bootstrapBaseUrl: config.bootstrapBaseUrl,
              currentServiceUrl: config.resolvedServiceBaseUrl,
              clientId: config.clientId,
              configVersion: config.lastDiscoveryConfigVersion,
              busy: busy,
              lastJobId: activeJob?.id ?? '',
              lastError: '',
            )
            .catchError((_) {}),
      );
    } catch (error) {
      _setError('引导握手失败：$error');
    } finally {
      connecting = false;
      if (!connecting) {
        _startUploadSessionWatch();
      }
      notifyListeners();
    }
  }

  Future<void> _syncAgentsAfterConnect() async {
    if (resolvedServiceUrl.isEmpty) {
      return;
    }
    try {
      final result = await _backendApi.syncAgents(
        serviceBaseUrl: resolvedServiceUrl,
      );
      final registry = result['registry'];
      final agents = registry is Map
          ? (registry['agents'] as List?) ?? const []
          : const [];
      _appendLog('已同步服务端智能体列表：${agents.length} 个。', notify: false);
    } catch (error) {
      _appendLog('同步服务端智能体列表失败：$error', notify: false);
    }
  }

  Future<void> refreshServerCapabilities({bool silent = false}) async {
    if (refreshingServerCapabilities) {
      return;
    }
    if (!connected) {
      if (bootstrapUrl.isEmpty) {
        serverOperationError = '请先在设置中配置引导地址，再同步服务端能力。';
        statusMessage = '等待服务端配置。';
        statusCaption = '服务端能力未同步';
        notifyListeners();
        return;
      }
      await connect(silent: true);
      if (!connected) {
        return;
      }
    }

    refreshingServerCapabilities = true;
    serverOperationError = '';
    if (!silent) {
      statusMessage = '正在同步服务端能力注册表...';
      statusCaption = '读取 /api/interfaces';
    }
    notifyListeners();

    try {
      final interfaces = await _backendApi.listServerInterfaces(
        serviceBaseUrl: resolvedServiceUrl,
      );
      final rawOperations = interfaces['interfaces'];
      final operations = rawOperations is List
          ? rawOperations
                .whereType<Map>()
                .map(ServerInterfaceOperation.fromJson)
                .where((item) => item.id.isNotEmpty)
                .toList(growable: false)
          : const <ServerInterfaceOperation>[];
      serverOperations = [...operations]
        ..sort((left, right) {
          final feature = left.feature.compareTo(right.feature);
          return feature == 0 ? left.id.compareTo(right.id) : feature;
        });
      serverOverview = {
        'health': await _tryServerOverviewRequest('GET', '/api/healthz'),
        'runtime': await _tryServerOverviewRequest('GET', '/api/runtime/info'),
        'knowledge': await _tryServerOverviewRequest(
          'GET',
          '/api/knowledge/health',
        ),
        'console': await _tryServerOverviewRequest('GET', '/api/console/state'),
        'agents': await _tryServerOverviewRequest('GET', '/api/agents'),
      };
      statusMessage =
          '服务端能力已同步：${serverOperations.length} 个接口 / $serverFeatureCount 个切面。';
      statusCaption = '服务端注册表已对齐';
      _appendLog(
        '服务端能力注册表已同步：${serverOperations.length} 个接口，$serverFeatureCount 个 feature。',
        notify: false,
      );
    } catch (error) {
      serverOperations = const [];
      serverOverview = const {};
      serverOperationError = '同步服务端能力失败：$error';
      _setError(serverOperationError);
    } finally {
      refreshingServerCapabilities = false;
      notifyListeners();
    }
  }

  Future<Map<String, dynamic>> _tryServerOverviewRequest(
    String method,
    String path,
  ) async {
    try {
      return await _backendApi.serverApi(
        serviceBaseUrl: resolvedServiceUrl,
        method: method,
        path: path,
      );
    } catch (error) {
      return {'ok': false, 'error': error.toString()};
    }
  }

  Future<void> executeServerRequest({
    required String method,
    required String path,
    String bodyText = '',
  }) async {
    if (invokingServerRequest) {
      return;
    }
    if (path.trim().isEmpty) {
      _setError('请输入服务端 API 路径。');
      return;
    }
    if (!connected) {
      await connect(silent: true);
      if (!connected) {
        return;
      }
    }

    Map<String, dynamic>? body;
    final trimmedBody = bodyText.trim();
    if (trimmedBody.isNotEmpty) {
      try {
        final decoded = jsonDecode(trimmedBody);
        if (decoded is! Map) {
          _setError('请求体必须是 JSON object。');
          return;
        }
        body = Map<String, dynamic>.from(decoded);
      } catch (error) {
        _setError('请求体不是有效 JSON：$error');
        return;
      }
    }

    invokingServerRequest = true;
    serverOperationError = '';
    serverOperationResult = null;
    statusMessage = '正在调用服务端接口...';
    statusCaption = '${method.toUpperCase()} ${path.trim()}';
    notifyListeners();

    try {
      final result = await _backendApi.serverApi(
        serviceBaseUrl: resolvedServiceUrl,
        method: method.toUpperCase(),
        path: path.trim(),
        body: body,
      );
      serverOperationResult = result;
      statusMessage = '服务端接口调用完成。';
      statusCaption = '${method.toUpperCase()} ${path.trim()}';
      _appendLog(
        '服务端接口调用完成：${method.toUpperCase()} ${path.trim()}',
        notify: false,
      );
    } catch (error) {
      serverOperationError = '服务端接口调用失败：$error';
      _setError(serverOperationError);
    } finally {
      invokingServerRequest = false;
      notifyListeners();
    }
  }

  Future<void> syncKnowledgeMirrorFromServer() async {
    if (!connected) {
      await connect(silent: true);
      if (!connected) {
        return;
      }
    }
    statusMessage = '正在同步服务端知识库镜像...';
    statusCaption = 'KnowledgeCore mirror';
    notifyListeners();
    try {
      await _backendApi.syncKnowledgeCache(
        serviceBaseUrl: resolvedServiceUrl,
        pushOutbox: false,
      );
      await refreshServerCapabilities(silent: true);
      statusMessage = '本地知识库镜像已同步。';
      statusCaption = '服务端为准';
      _appendLog('已从服务端同步本地知识库镜像。', notify: false);
    } catch (error) {
      _setError('同步本地知识库镜像失败：$error');
    }
  }

  Future<void> syncAgentRegistryFromServer() async {
    if (!connected) {
      await connect(silent: true);
      if (!connected) {
        return;
      }
    }
    statusMessage = '正在同步服务端智能体列表...';
    statusCaption = 'Agent registry';
    notifyListeners();
    try {
      await _backendApi.syncAgents(serviceBaseUrl: resolvedServiceUrl);
      await refreshServerCapabilities(silent: true);
      statusMessage = '服务端智能体列表已同步。';
      statusCaption = '模型分配可用';
      _appendLog('已从服务端同步智能体列表。', notify: false);
    } catch (error) {
      _setError('同步服务端智能体列表失败：$error');
    }
  }

  Future<void> _pullExpertVocabularyAfterConnect(
    ExpertVocabularySummary remoteSummary,
  ) async {
    if (resolvedServiceUrl.isEmpty) {
      return;
    }
    if (remoteSummary.version > 0 &&
        remoteSummary.checksum.isNotEmpty &&
        remoteSummary.checksum == config.lastExpertVocabularyChecksum &&
        expertVocabulary.checksum == config.lastExpertVocabularyChecksum) {
      return;
    }

    try {
      await pullExpertVocabulary(silent: true);
    } catch (error) {
      _appendLog('自动拉取专家词汇库失败：$error', notify: false);
    }
  }

  Future<void> pullExpertVocabulary({
    bool silent = false,
    bool applyToMailIndex = true,
  }) async {
    final serviceUrl = resolvedServiceUrl;
    if (serviceUrl.isEmpty) {
      if (!silent) {
        _setError('请先连接服务端，再拉取专家词汇库。');
      }
      return;
    }

    pullingExpertVocabulary = true;
    if (!silent) {
      statusMessage = '正在拉取专家词汇库...';
      statusCaption = '同步服务端版本';
      _appendLog('开始从服务端拉取专家词汇库。');
    }
    notifyListeners();

    try {
      final previousChecksum = expertVocabulary.checksum;
      if (!await _backendApi.ensureDaemon()) {
        throw StateError('本地客户端后台不可用。');
      }
      clientBackendAvailable = true;
      final remoteVocabulary = await _backendApi.pullVocabulary();
      final dataDirectory = await _storage.dataDirectory();
      expertVocabulary = await _storage.loadExpertVocabulary(
        mailWorkspaceDirectory: _mailWorkspacePath(dataDirectory),
      );
      if (expertVocabulary.version <= 0) {
        expertVocabulary = remoteVocabulary;
      }
      config = await _storage.loadConfig();
      final stats = await _backendApi.mailIndexStats();
      if (stats.isNotEmpty) {
        mailIndexStats = MacOSMailIndexStats.fromJson(stats);
        _lastMailIndexStatsRefreshAt = DateTime.now();
      }
      await _refreshClientBackendState(notify: false);
      final vocabularyChanged =
          expertVocabulary.checksum.isNotEmpty &&
          expertVocabulary.checksum != previousChecksum;
      if (!silent) {
        statusMessage = '专家词汇库已更新到 v${expertVocabulary.version}。';
        statusCaption = '${expertVocabulary.activeEntryCount} 条启用词条';
        _appendLog('专家词汇库已通过本地后台拉取并热更新索引。');
      }
      if (vocabularyChanged) {
        _moduleDaemon.emitModuleDataChanged(
          'mail',
          reason: 'expert-vocabulary-pulled',
        );
        _notifyKnowledgeDaemon(
          KnowledgeDaemonEvent(
            kind: KnowledgeDaemonEventKind.moduleDataChanged,
            sourceId: 'mail',
            reason: 'expert-vocabulary-pulled',
          ),
          delay: const Duration(milliseconds: 300),
        );
      }
    } catch (error) {
      if (!silent) {
        _setError('拉取专家词汇库失败：$error');
      } else {
        rethrow;
      }
    } finally {
      pullingExpertVocabulary = false;
      notifyListeners();
    }
  }

  Future<void> _applyExpertVocabularyToMailIndex({
    required bool silent,
    required String reason,
  }) async {
    if (!localMailIndexAvailable || !emailAnalysisModuleEnabled) {
      return;
    }
    if (importingMacOSMail) {
      _pendingExpertVocabularyIndexApply = true;
      if (!silent) {
        _appendLog('Mail.app 正在导入，专家词汇库将在导入结束后应用到索引。');
      }
      return;
    }
    if (rebuildingMailIndex || applyingExpertVocabularyToMailIndex) {
      _pendingExpertVocabularyIndexApply = true;
      return;
    }

    rebuildingMailIndex = true;
    refreshingMailIndexStats = true;
    applyingExpertVocabularyToMailIndex = true;
    if (!silent) {
      statusMessage = '正在热更新邮件索引...';
      statusCaption = expertVocabularyStatusLabel;
      _appendLog('专家词汇库已变更，开始热更新本地邮件索引。');
    }
    notifyListeners();

    try {
      if (!await _backendApi.ensureDaemon()) {
        throw StateError('本地客户端后台不可用。');
      }
      clientBackendAvailable = true;
      await _backendApi.applyVocabularyToIndex();
      final stats = await _backendApi.mailIndexStats();
      if (stats.isNotEmpty) {
        mailIndexStats = MacOSMailIndexStats.fromJson(stats);
        _lastMailIndexStatsRefreshAt = DateTime.now();
      }
      await _refreshClientBackendState(notify: false);
      if (!silent) {
        statusMessage = '专家词汇库已应用到邮件索引。';
        statusCaption = mailIndexStatusLabel;
        _appendLog('本地后台已完成专家词汇库热更新：$mailIndexStatusLabel。');
      } else {
        _appendLog('本地后台已后台应用专家词汇库：$mailIndexStatusLabel。', notify: false);
      }
      _moduleDaemon.emitModuleDataChanged('mail', reason: reason);
      _notifyKnowledgeDaemon(
        KnowledgeDaemonEvent(
          kind: KnowledgeDaemonEventKind.moduleDataChanged,
          sourceId: 'mail',
          reason: reason,
        ),
        delay: const Duration(milliseconds: 300),
      );
    } catch (error) {
      if (!silent) {
        _setError('专家词汇库热更新索引失败：$error');
      } else {
        _appendLog('专家词汇库热更新索引失败：$error', notify: false);
      }
    } finally {
      rebuildingMailIndex = false;
      refreshingMailIndexStats = false;
      applyingExpertVocabularyToMailIndex = false;
      notifyListeners();
      _applyPendingExpertVocabularyIndexUpdate();
    }
  }

  void _applyPendingExpertVocabularyIndexUpdate() {
    if (!_pendingExpertVocabularyIndexApply ||
        importingMacOSMail ||
        rebuildingMailIndex ||
        applyingExpertVocabularyToMailIndex) {
      return;
    }
    _pendingExpertVocabularyIndexApply = false;
    unawaited(
      _applyExpertVocabularyToMailIndex(
        silent: false,
        reason: 'expert-vocabulary-pending-apply',
      ),
    );
  }

  void selectSection(AppSection section) {
    if (currentSection == section) {
      return;
    }
    currentSection = section;
    _syncSelections();
    if (section == AppSection.agents && scannedTargets.isEmpty) {
      unawaited(scanTargets());
    }
    notifyListeners();
  }

  void registerKnowledgeGraphDataSource(KnowledgeGraphDataSource source) {
    _knowledgeGraphSubscriptionAspect.registerDataSource(source);
    statusMessage = '知识图谱事实提供器 ${source.label} 已接入。';
    statusCaption = '事务聚合输入已更新';
    _appendLog('知识图谱事实提供器已接入：${source.sourceId} / ${source.label}');
    _notifyKnowledgeDaemon(
      KnowledgeDaemonEvent(
        kind: KnowledgeDaemonEventKind.dataSourceChanged,
        sourceId: source.sourceId,
        reason: 'registered',
      ),
      delay: const Duration(milliseconds: 180),
    );
    notifyListeners();
  }

  void unregisterKnowledgeGraphDataSource(String sourceId) {
    _knowledgeGraphSubscriptionAspect.unregisterDataSource(sourceId);
    statusMessage = '知识图谱事实提供器 $sourceId 已移除。';
    statusCaption = '事务聚合输入已更新';
    _appendLog('知识图谱事实提供器已移除：$sourceId');
    _notifyKnowledgeDaemon(
      KnowledgeDaemonEvent(
        kind: KnowledgeDaemonEventKind.dataSourceChanged,
        sourceId: sourceId,
        reason: 'unregistered',
      ),
      delay: const Duration(milliseconds: 180),
    );
    notifyListeners();
  }

  Future<void> setEmailAnalysisModuleEnabled(bool enabled) async {
    if (enabled && !localMailIndexAvailable) {
      _setError('邮箱分析模块需要本地后台或 macOS 客户端。');
      return;
    }

    emailAnalysisModuleEnabled = enabled && localMailIndexAvailable;
    config = config.copyWith(
      emailAnalysisModuleEnabled: emailAnalysisModuleEnabled,
    );
    await _storage.saveConfig(config);
    statusMessage = emailAnalysisModuleEnabled ? '邮箱分析模块已启用。' : '邮箱分析模块已停用。';
    statusCaption = '模块配置已保存';
    _appendLog(statusMessage);
    _moduleDaemon.emitModuleEnabled(
      'mail',
      enabled: emailAnalysisModuleEnabled,
    );
    if (emailAnalysisModuleEnabled) {
      _requestMailIndexStatsRefreshIfStale(
        delay: const Duration(milliseconds: 120),
      );
    }
    notifyListeners();
  }

  Future<void> setMacOSMailUploadToCloudEnabled(bool enabled) async {
    macOSMailUploadToCloudEnabled = enabled;
    config = config.copyWith(macOSMailUploadToCloudEnabled: enabled);
    await _storage.saveConfig(config);
    statusMessage = enabled ? 'Mail.app 同步将同时上传云端。' : 'Mail.app 同步仅写入本地工作空间。';
    statusCaption = '模块配置已保存';
    _appendLog(statusMessage);
    notifyListeners();
  }

  Future<void> selectRun(String jobId) async {
    selectedRunId = jobId;
    if (inspectedResultJobId != jobId) {
      inspectedResultJobId = '';
      inspectedResult = null;
      _notifyKnowledgeDaemon(
        KnowledgeDaemonEvent(
          kind: KnowledgeDaemonEventKind.resultChanged,
          sourceId: 'result',
          reason: 'selected-run-reset',
        ),
        delay: const Duration(milliseconds: 180),
      );
    }
    notifyListeners();

    RecentRun? run;
    for (final item in recentRuns) {
      if (item.jobId == jobId) {
        run = item;
        break;
      }
    }
    if (run == null || run.serviceUrl.isEmpty) {
      return;
    }

    loadingSelectedRun = true;
    notifyListeners();

    try {
      final remoteJob = await _backendApi.getJob(run.serviceUrl, jobId);
      _upsertRun(
        run.copyWith(
          status: remoteJob.status,
          stage: displayStageLabel(remoteJob.stage),
          progressPercent: remoteJob.progressPercent,
          error: remoteJob.error,
        ),
      );
      await _persistRuns();

      if (remoteJob.isCompleted) {
        inspectedResult = await _backendApi.getJobResult(run.serviceUrl, jobId);
        inspectedResultJobId = jobId;
        statusMessage = '已载入任务 ${shortId(jobId)} 的结果。';
        statusCaption = '历史结果已同步';
        _appendLog('已从服务端载入任务 $jobId 的结果。');
      } else {
        inspectedResultJobId = '';
        inspectedResult = null;
        statusMessage = '已同步任务 ${shortId(jobId)} 的状态。';
        statusCaption = displayStageLabel(remoteJob.stage);
        _appendLog('已从服务端刷新任务 $jobId 的状态。');
      }
    } catch (error) {
      _setError('载入任务 ${shortId(jobId)} 失败：$error');
    } finally {
      loadingSelectedRun = false;
      _notifyKnowledgeDaemon(
        KnowledgeDaemonEvent(
          kind: KnowledgeDaemonEventKind.resultChanged,
          sourceId: 'result',
          reason: 'selected-run-loaded',
        ),
        delay: const Duration(milliseconds: 220),
      );
      notifyListeners();
    }
  }

  void selectCheckpoint(String checkpointId) {
    selectedCheckpointId = checkpointId;
    final node = checkpointStore.findNode(checkpointId);
    if (node != null && node.uploadSessionId.isNotEmpty) {
      selectedUploadSessionId = node.uploadSessionId;
    }
    if (selectedUploadSessionId.isNotEmpty) {
      _syncUploadSessionPage();
    }
    if (selectedUploadSessionId.isNotEmpty) {
      unawaited(refreshSelectedUploadSession(silent: true));
    }
    notifyListeners();
  }

  void selectUploadSession(String sessionId) {
    selectedUploadSessionId = sessionId;
    final node = checkpointStore.findNodeByUploadSessionId(sessionId);
    if (node != null) {
      selectedCheckpointId = node.checkpointId;
      final selectedIndex = uploadSessionEntries.indexWhere(
        (item) => item.uploadSessionId == sessionId,
      );
      if (selectedIndex >= 0) {
        uploadSessionPageIndex = selectedIndex ~/ uploadSessionPageSize;
      }
    }
    unawaited(refreshSelectedUploadSession(silent: true));
    notifyListeners();
  }

  int get uploadSessionPageCount {
    final total = uploadSessionEntries.length;
    if (total <= 0) {
      return 0;
    }
    return (total + uploadSessionPageSize - 1) ~/ uploadSessionPageSize;
  }

  void setUploadSessionPage(int index) {
    final pageCount = uploadSessionPageCount;
    if (pageCount <= 0) {
      if (uploadSessionPageIndex != 0) {
        uploadSessionPageIndex = 0;
        notifyListeners();
      }
      return;
    }
    final target = index.clamp(0, pageCount - 1);
    if (uploadSessionPageIndex != target) {
      uploadSessionPageIndex = target;
      notifyListeners();
    }
  }

  void _syncUploadSessionPage() {
    if (uploadSessionPageCount <= 0) {
      if (uploadSessionPageIndex != 0) {
        uploadSessionPageIndex = 0;
      }
      return;
    }
    final maxIndex = uploadSessionPageCount - 1;
    if (uploadSessionPageIndex > maxIndex) {
      uploadSessionPageIndex = maxIndex;
    }
    if (uploadSessionPageIndex < 0) {
      uploadSessionPageIndex = 0;
    }
  }

  Future<void> refreshSelectedUploadSession({bool silent = false}) async {
    final node = selectedUploadSessionNode;
    if (node == null || node.uploadSessionId.isEmpty) {
      if (!silent) {
        _setError('尚未选择上传会话。');
      }
      return;
    }
    final baseUrl = node.uploadSessionServiceUrl.isNotEmpty
        ? node.uploadSessionServiceUrl
        : resolvedServiceUrl;
    if (baseUrl.isEmpty) {
      if (!silent) {
        _setError('当前上传会话没有可用的服务地址。');
      }
      return;
    }

    try {
      final session = await _backendApi.getUploadSession(
        baseUrl,
        node.uploadSessionId,
      );
      selectedUploadSessionId = node.uploadSessionId;
      activeUploadSession = session;
      uploadProgress = session.progress.clamp(0, 1);

      if (!silent) {
        statusMessage = '上传会话 ${shortId(node.uploadSessionId)} 已刷新。';
        statusCaption = displayUploadSessionStatus(session.status);
        _appendLog('已从服务端刷新上传会话 ${node.uploadSessionId}。');
      }

      if (_shouldStopUploadSessionWatch(node, session)) {
        _stopUploadSessionWatch();
      }

      notifyListeners();
    } catch (error) {
      if (!silent) {
        _setError('刷新上传会话失败：$error');
      } else if (_isMissingUploadSessionError(error)) {
        _stopUploadSessionWatch();
        activeUploadSession = null;
        _appendLog('上传会话 ${shortId(node.uploadSessionId)} 已不存在，已停止自动刷新。');
        notifyListeners();
      } else {
        final now = DateTime.now();
        if (now.difference(_lastUploadSessionWatchErrorAt).inSeconds >= 8) {
          _appendLog('刷新上传会话失败：$error');
          _lastUploadSessionWatchErrorAt = now;
        }
      }
    }
  }

  bool _isMissingUploadSessionError(Object error) {
    if (error is ApiException && error.statusCode == 404) {
      return true;
    }
    final message = error.toString().toLowerCase();
    return message.contains('上传会话不存在') ||
        message.contains('upload session') && message.contains('not found');
  }

  bool _hasActiveUploadSessionWatchTarget() {
    final node = selectedUploadSessionNode;
    if (node == null || node.uploadSessionId.isEmpty) {
      return false;
    }
    if (node.uploadSessionServiceUrl.isNotEmpty) {
      return true;
    }
    return resolvedServiceUrl.isNotEmpty;
  }

  void _startUploadSessionWatch() {
    if (_uploadSessionWatchTimer?.isActive == true) {
      return;
    }
    if (!_hasActiveUploadSessionWatchTarget()) {
      return;
    }
    _uploadSessionWatchTimer = Timer.periodic(_uploadSessionWatchInterval, (_) {
      unawaited(_refreshUploadSessionWatchTick());
    });
  }

  void _stopUploadSessionWatch() {
    _uploadSessionWatchTimer?.cancel();
    _uploadSessionWatchTimer = null;
  }

  Future<void> _refreshUploadSessionWatchTick() async {
    if (_uploadSessionWatchInFlight) {
      return;
    }
    if (!_hasActiveUploadSessionWatchTarget()) {
      _stopUploadSessionWatch();
      return;
    }

    _uploadSessionWatchInFlight = true;
    try {
      await refreshSelectedUploadSession(silent: true);
    } finally {
      _uploadSessionWatchInFlight = false;
    }
  }

  bool _shouldStopUploadSessionWatch(
    CheckpointNode node,
    UploadSessionInfo session,
  ) {
    if (session.isComplete) {
      return true;
    }
    return node.state == CheckpointState.failed ||
        node.state == CheckpointState.networkInterrupted ||
        node.state == CheckpointState.manualStopped ||
        node.state == CheckpointState.abandoned ||
        node.state == CheckpointState.clientConfirmed;
  }

  Future<void> loadSelectedCheckpointIntoConsole() async {
    final node = selectedCheckpoint;
    if (node == null) {
      _setError('尚未选择检查点。');
      return;
    }
    if (node.fileCount > 0 && node.localFiles.isEmpty) {
      _setError('所选检查点缺少本地文件引用。');
      return;
    }

    inputController.text = node.inputText;
    queuedFiles =
        node.localFiles
            .map(
              (file) => QueuedFile(
                path: file.path,
                name: file.label,
                relativePath: file.relativePath,
                byteSize: file.byteSize,
                mediaType: file.mediaType,
              ),
            )
            .toList()
          ..sort(
            (left, right) => left.relativePath.compareTo(right.relativePath),
          );
    statusMessage = '检查点 ${shortId(node.checkpointId)} 已载入控制台。';
    statusCaption = '可继续恢复';
    currentSection = AppSection.activity;
    notifyListeners();
  }

  Future<void> resumeSelectedCheckpoint() async {
    final node = selectedCheckpoint;
    if (node == null) {
      _setError('尚未选择检查点。');
      return;
    }
    if (!isResumableState(node.state)) {
      _setError('所选检查点当前不可恢复。');
      return;
    }

    await loadSelectedCheckpointIntoConsole();
    checkpointStore.armNetworkResume(node.checkpointId);
    await _persistCheckpointStore();
    await executePayload();
  }

  Future<void> pickFiles() async {
    final files = await openFiles(
      acceptedTypeGroups: [
        XTypeGroup(
          label: 'Pact 数据源',
          extensions: _supportedExtensions.toList()..sort(),
        ),
      ],
    );
    if (files.isEmpty) {
      return;
    }

    final additions = <QueuedFile>[];
    for (final file in files) {
      if (file.path.isEmpty) {
        continue;
      }
      additions.add(await _queuedFileFromPath(file.path));
    }
    _mergeQueuedFiles(additions);
    _appendLog('已向队列添加 ${additions.length} 个文件。');
  }

  Future<void> addDroppedPaths(Iterable<String> paths) async {
    final additions = <QueuedFile>[];
    for (final rawPath in paths) {
      final trimmed = _normalizeDroppedPath(rawPath);
      if (trimmed.isEmpty) {
        continue;
      }

      late final FileSystemEntityType type;
      try {
        type = await FileSystemEntity.type(trimmed, followLinks: true);
      } catch (_) {
        continue;
      }

      switch (type) {
        case FileSystemEntityType.file:
          try {
            additions.add(await _queuedFileFromPath(trimmed));
          } catch (_) {
            continue;
          }
        case FileSystemEntityType.directory:
          final folderFiles = await _collectQueuedFilesFromDirectory(
            trimmed,
            includeAllFiles: true,
          );
          additions.addAll(folderFiles);
        default:
          break;
      }
    }

    if (additions.isEmpty) {
      statusMessage = '未检测到可解析文件。';
      statusCaption = '未加入解析队列';
      notifyListeners();
      return;
    }

    final previousCount = queuedFiles.length;
    _mergeQueuedFiles(additions);
    final added = queuedFiles.length - previousCount;
    if (added > 0) {
      statusMessage = '已自动加入 $added 个文件。';
    } else {
      statusMessage = '队列已有相同文件，已跳过重复项。';
    }
    statusCaption = '本地队列已更新';
    uploadSessionPageIndex = 0;
    _syncUploadSessionPage();
    _appendLog(statusMessage);
    _startUploadSessionWatch();
    notifyListeners();
  }

  String _normalizeDroppedPath(String rawPath) {
    final trimmed = rawPath.trim();
    if (trimmed.isEmpty) {
      return '';
    }
    if (!trimmed.startsWith('file://')) {
      return trimmed;
    }
    try {
      return Uri.parse(trimmed).toFilePath();
    } catch (_) {
      return trimmed;
    }
  }

  Future<void> pickDirectory() async {
    final directoryPath = await getDirectoryPath(confirmButtonText: '导入文件夹');
    if (directoryPath == null || directoryPath.isEmpty) {
      return;
    }

    final additions = await _collectQueuedFilesFromDirectory(directoryPath);
    if (additions.isEmpty) {
      _appendLog('文件夹 ${p.basename(directoryPath)} 中没有可解析文件。');
      statusMessage = '文件夹 ${p.basename(directoryPath)} 中没有可解析文件。';
      statusCaption = '未找到支持文件';
      notifyListeners();
      return;
    }
    _mergeQueuedFiles(additions);
    _appendLog(
      '已导入文件夹 ${p.basename(directoryPath)}，共 ${additions.length} 个受支持文件。',
    );
    return;
  }

  String _mailWorkspacePath(Directory dataDirectory) {
    return PortableStorage.moduleWorkspacePath(
      dataDirectory,
      _mailWorkspaceName,
    );
  }

  Future<void> importMacOSMail() => startMacOSMailSync();

  Future<void> syncMacOSMailToCloud() async {
    if (!macOSMailUploadToCloudEnabled) {
      macOSMailUploadToCloudEnabled = true;
      config = config.copyWith(macOSMailUploadToCloudEnabled: true);
      await _storage.saveConfig(config);
    }
    await startMacOSMailSync();
  }

  Future<void> startMacOSMailSync() async {
    if (syncingMacOSMailToCloud) {
      _refreshActiveMacOSMailCloudSyncStatus();
      return;
    }
    if (busy || importingMacOSMail) {
      return;
    }
    if (!canImportMacOSMail) {
      _setError(
        emailAnalysisModuleSupported
            ? '请先在模块页启用邮箱分析模块。'
            : 'macOS Mail 导入仅支持 macOS 客户端。',
      );
      return;
    }

    final uploadToCloud = macOSMailUploadToCloudEnabled;
    var targetServiceUrl = '';
    if (uploadToCloud) {
      if (await _refreshMacOSMailCloudSyncQueueState(silent: true)) {
        statusMessage = '已刷新 Mail.app 云端同步状态，未创建新任务。';
        statusCaption = mailCloudSyncStatusLabel;
        _appendLog('Mail.app 云端同步已有未完成任务，点击已刷新状态，没有创建新任务。');
        notifyListeners();
        return;
      }

      targetServiceUrl = resolvedServiceUrl;
      if (targetServiceUrl.isEmpty && bootstrapUrl.isNotEmpty) {
        targetServiceUrl = PactServiceUrls.normalizeBaseUrl(bootstrapUrl);
      }
      if (targetServiceUrl.isEmpty) {
        _setError('请先配置服务端地址，再同步 Mail 到云端。');
        return;
      }
      if (!connected && bootstrapUrl.isNotEmpty) {
        await connect(silent: true);
        if (resolvedServiceUrl.isNotEmpty) {
          targetServiceUrl = resolvedServiceUrl;
        }
      }
    }

    importingMacOSMail = true;
    syncingMacOSMailToCloud = uploadToCloud;
    final runToken = ++_mailImportRunToken;
    final initialQueueCount = queuedFiles.length;
    _resetMailImportProgress();
    if (uploadToCloud) {
      mailCloudSyncQueueCount = 1;
      mailCloudSyncProgressValue = null;
      mailCloudSyncFileCount = 0;
      mailCloudSyncTaskId = '';
      mailCloudSyncCheckpointId = '';
      mailCloudSyncStatusLabel = '正在导出 Mail.app 邮件';
      mailCloudSyncUpdatedAt = DateTime.now().toIso8601String();
    }
    statusMessage = uploadToCloud
        ? '正在导出 Mail.app 邮件到本地工作空间，并准备上传云端...'
        : '正在请求 Mail.app 并导出本机邮件...';
    statusCaption = '等待系统自动化权限';
    lastError = '';
    _appendLog(
      uploadToCloud
          ? '已触发 Mail.app 同步，导出到本地工作空间后将提交服务端。'
          : '已触发 Mail.app 同步，正在等待系统授权和邮箱扫描。',
    );
    _scheduleMailImportWatchdog(runToken);
    notifyListeners();

    try {
      if (connected) {
        await pullExpertVocabulary(silent: true).catchError((error) {
          _appendLog('导入前同步专家词汇库失败：$error', notify: false);
        });
      }
      if (!await _backendApi.ensureDaemon()) {
        throw StateError('本地客户端后台不可用，无法同步 Mail.app。');
      }
      clientBackendAvailable = true;
      final status = await _runMacOSMailExport(
        runToken: runToken,
        queueLocalFiles: true,
        initialQueueCount: initialQueueCount,
      );
      if (status == null) {
        return;
      }
      _stopMailImportWatchdog();

      final exportDirectory = _mailExportDirectoryFromStatus(status);
      if (exportDirectory.isEmpty) {
        throw StateError('Mail.app 导入没有返回导出目录。');
      }

      final diagnostics = status['diagnostics'] is Map
          ? Map<String, dynamic>.from(status['diagnostics'] as Map)
          : const <String, dynamic>{};
      final added = queuedFiles.length - initialQueueCount;
      final failedCount = _intFrom(diagnostics['failedCount']);
      if (added <= 0) {
        statusMessage = 'Mail.app 没有导出可解析邮件。';
        statusCaption = failedCount > 0 ? '$failedCount 封邮件导出失败' : '未找到邮件';
        _appendLog(
          'Mail.app 同步未加入文件：${_formatMailImportStatusDiagnostics(status)}',
        );
      } else {
        statusMessage = '已从 Mail.app 加入 $added 封邮件。';
        statusCaption = failedCount > 0
            ? '$failedCount 封邮件导出失败'
            : 'Mail.app 同步完成';
        mailImportProgressValue = 1;
        _appendLog(
          'Mail.app 导出 ${_intFrom(diagnostics['exportedCount'])} 封邮件，加入本地队列 $added 个文件。${_formatMailImportStatusDiagnostics(status)}',
        );
        _moduleDaemon.requestTask(
          'mail.index-stats',
          delay: const Duration(milliseconds: 200),
        );
        _moduleDaemon.emitModuleDataChanged(
          'mail',
          reason: 'mail-import-completed',
        );
      }

      if (!uploadToCloud) {
        return;
      }

      final mailFiles = await _collectQueuedFilesFromDirectory(exportDirectory);
      if (mailFiles.isEmpty) {
        throw StateError('Mail.app 没有导出可同步邮件。');
      }
      busy = true;
      mailCloudSyncFileCount = mailFiles.length;
      mailCloudSyncProgressValue = 0;
      mailCloudSyncStatusLabel = '正在上传 ${mailFiles.length} 封邮件';
      mailCloudSyncUpdatedAt = DateTime.now().toIso8601String();
      statusMessage = '正在把本地工作空间中的 ${mailFiles.length} 封 Mail.app 邮件上传云端...';
      statusCaption = '云端上传中';
      notifyListeners();

      final submittedText = '同步 macOS Mail 导出的 ${mailFiles.length} 封邮件。';
      final response = await _backendApi.submitPipeline(
        serviceBaseUrl: targetServiceUrl,
        inputText: submittedText,
        files: mailFiles.map((file) => file.toJson()).toList(),
        settings: _defaultSettings,
      );
      await _applyPipelineSubmissionResponse(
        response: response,
        submittedText: submittedText,
        submittedFiles: mailFiles,
        targetServiceUrl: targetServiceUrl,
        queuedStatusMessage: 'Mail.app 云端同步任务已进入本地后台队列。',
        queuedStatusCaption: '后台自动同步',
        completedStatusMessage: 'Mail.app 已写入本地工作空间并同步到云端。',
        completedStatusCaption: '云端同步完成',
        completedLogPrefix: 'Mail.app 云端同步完成',
      );
      _applyMacOSMailCloudSubmissionSnapshot(
        response,
        fileCount: mailFiles.length,
      );
    } on PlatformException catch (error) {
      if (runToken == _mailImportRunToken) {
        if (uploadToCloud) {
          _markMacOSMailCloudSyncFailed(error.message ?? error.code);
        }
        _setError('Mail.app 同步失败：${error.message ?? error.code}');
      }
    } catch (error) {
      if (runToken == _mailImportRunToken) {
        if (uploadToCloud) {
          _markMacOSMailCloudSyncFailed(error.toString());
        }
        _setError('Mail.app 同步失败：$error');
      }
    } finally {
      if (runToken == _mailImportRunToken) {
        _stopMailImportWatchdog();
        importingMacOSMail = false;
        syncingMacOSMailToCloud = false;
        mailImportPaused = false;
        busy = false;
        if (mailCloudSyncQueueCount <= 0) {
          mailCloudSyncProgressValue ??= mailImportProgressValue;
        }
        notifyListeners();
      }
    }
  }

  Future<void> refreshMacOSMailCloudSyncStatus({bool silent = false}) async {
    if (syncingMacOSMailToCloud) {
      _refreshActiveMacOSMailCloudSyncStatus();
      return;
    }
    await _refreshMacOSMailCloudSyncQueueState(silent: silent);
  }

  void _refreshActiveMacOSMailCloudSyncStatus() {
    mailCloudSyncQueueCount = 1;
    mailCloudSyncStatusLabel = busy
        ? (mailCloudSyncFileCount > 0
              ? '正在上传 $mailCloudSyncFileCount 封邮件'
              : '正在上传邮件')
        : '正在导出 Mail.app 邮件';
    mailCloudSyncProgressValue = busy
        ? uploadProgress.clamp(0, 1).toDouble()
        : mailImportProgressValue;
    mailCloudSyncUpdatedAt = DateTime.now().toIso8601String();
    statusMessage = 'Mail.app 云端同步仍在进行，已刷新当前状态，未创建新任务。';
    statusCaption = mailCloudSyncProgressLabel;
    _appendLog('Mail.app 云端同步状态已刷新，当前任务仍在进行。');
    notifyListeners();
  }

  Future<bool> _refreshMacOSMailCloudSyncQueueState({
    required bool silent,
  }) async {
    if (_mailCloudSyncStatusRefreshInFlight) {
      return mailCloudSyncQueueCount > 0;
    }
    _mailCloudSyncStatusRefreshInFlight = true;
    refreshingMacOSMailCloudSyncStatus = true;
    if (!silent) {
      statusMessage = '正在刷新 Mail.app 云端同步队列...';
      statusCaption = '云端同步状态';
      notifyListeners();
    }

    try {
      if (!await _backendApi.ensureDaemon()) {
        throw StateError('本地客户端后台不可用，无法刷新 Mail.app 云端同步状态。');
      }
      clientBackendAvailable = true;
      final response = await _backendApi.listUploadQueue();
      final hasUnfinished = _applyMacOSMailCloudQueueSnapshot(response);
      if (!silent) {
        if (hasUnfinished) {
          statusMessage = '已刷新 Mail.app 云端同步状态，未创建新任务。';
          statusCaption = mailCloudSyncStatusLabel;
          _appendLog('Mail.app 云端同步队列已刷新：$mailCloudSyncQueueLabel。');
        } else {
          statusMessage = '没有未完成的 Mail.app 云端同步任务。';
          statusCaption = '云端同步空闲';
          _appendLog('Mail.app 云端同步队列已刷新，没有未完成任务。');
        }
      }
      return hasUnfinished;
    } catch (error) {
      if (!silent) {
        _setError('刷新 Mail.app 云端同步状态失败：$error');
      }
      return false;
    } finally {
      refreshingMacOSMailCloudSyncStatus = false;
      _mailCloudSyncStatusRefreshInFlight = false;
      if (!silent) {
        notifyListeners();
      }
    }
  }

  bool _applyMacOSMailCloudQueueSnapshot(Map<String, dynamic> response) {
    final state = response['state'];
    final stateMap = state is Map ? Map<String, dynamic>.from(state) : null;
    final rawTasks = stateMap?['tasks'];
    final tasks = rawTasks is List
        ? rawTasks
              .whereType<Map>()
              .map((item) => Map<String, dynamic>.from(item))
              .where(_isMacOSMailCloudQueueTask)
              .toList()
        : <Map<String, dynamic>>[];
    if (tasks.isEmpty) {
      if (!syncingMacOSMailToCloud) {
        mailCloudSyncQueueCount = 0;
        mailCloudSyncProgressValue = null;
        mailCloudSyncFileCount = 0;
        mailCloudSyncTaskId = '';
        mailCloudSyncCheckpointId = '';
        mailCloudSyncUpdatedAt = '';
        mailCloudSyncStatusLabel = '空闲';
      }
      return false;
    }

    final unfinished = tasks
        .where((task) => _isUnfinishedMacOSMailCloudTaskStatus(task['status']))
        .toList();
    if (unfinished.isEmpty) {
      final latest = _latestMacOSMailCloudQueueTask(tasks);
      if (latest != null && !syncingMacOSMailToCloud) {
        _applyMacOSMailCloudTaskSnapshot(latest, unfinishedCount: 0);
      }
      return false;
    }

    final activeTaskId = _stringFrom(stateMap?['activeTaskId']);
    final selected = _preferredMacOSMailCloudQueueTask(
      unfinished,
      activeTaskId: activeTaskId,
    );
    _applyMacOSMailCloudTaskSnapshot(
      selected,
      unfinishedCount: unfinished.length,
    );
    return true;
  }

  bool _isMacOSMailCloudQueueTask(Map<String, dynamic> task) {
    return _stringFrom(task['inputText']).startsWith(_mailCloudSyncInputPrefix);
  }

  Map<String, dynamic> _preferredMacOSMailCloudQueueTask(
    List<Map<String, dynamic>> tasks, {
    required String activeTaskId,
  }) {
    if (activeTaskId.isNotEmpty) {
      for (final task in tasks) {
        if (_stringFrom(task['taskId']) == activeTaskId) {
          return task;
        }
      }
    }
    for (final task in tasks) {
      if (_stringFrom(task['status']) == 'running') {
        return task;
      }
    }
    return _latestMacOSMailCloudQueueTask(tasks) ?? tasks.first;
  }

  Map<String, dynamic>? _latestMacOSMailCloudQueueTask(
    List<Map<String, dynamic>> tasks,
  ) {
    if (tasks.isEmpty) {
      return null;
    }
    final sorted = [...tasks]
      ..sort((left, right) {
        final updated = _stringFrom(
          right['updatedAt'],
        ).compareTo(_stringFrom(left['updatedAt']));
        if (updated != 0) {
          return updated;
        }
        return _stringFrom(
          right['createdAt'],
        ).compareTo(_stringFrom(left['createdAt']));
      });
    return sorted.first;
  }

  bool _isUnfinishedMacOSMailCloudTaskStatus(Object? rawStatus) {
    final status = _stringFrom(rawStatus);
    return status == 'queued' ||
        status == 'running' ||
        status == 'paused' ||
        status == 'waiting_server';
  }

  void _applyMacOSMailCloudTaskSnapshot(
    Map<String, dynamic> task, {
    required int unfinishedCount,
  }) {
    final files = task['files'];
    final fileCount = files is List
        ? files.length
        : _intFrom(task['fileCount']);
    mailCloudSyncQueueCount = unfinishedCount;
    mailCloudSyncTaskId = _stringFrom(task['taskId']);
    mailCloudSyncCheckpointId = _stringFrom(task['checkpointId']);
    mailCloudSyncFileCount = fileCount;
    mailCloudSyncProgressValue = ((task['progress'] as num?)?.toDouble() ?? 0)
        .clamp(0, 1)
        .toDouble();
    mailCloudSyncUpdatedAt = _stringFrom(task['updatedAt']);
    mailCloudSyncStatusLabel = _mailCloudQueueStatusLabel(task);
  }

  void _applyMacOSMailCloudSubmissionSnapshot(
    Map<String, dynamic> response, {
    required int fileCount,
  }) {
    mailCloudSyncCheckpointId = _stringFrom(response['checkpointId']);
    final rawTask = response['task'];
    if (rawTask is Map) {
      final task = Map<String, dynamic>.from(rawTask);
      _applyMacOSMailCloudTaskSnapshot(
        task,
        unfinishedCount: _isUnfinishedMacOSMailCloudTaskStatus(task['status'])
            ? 1
            : 0,
      );
      return;
    }

    final rawJob = response['job'];
    final rawJobMap = rawJob is Map ? Map<String, dynamic>.from(rawJob) : null;
    if (rawJobMap != null && _stringFrom(rawJobMap['id']).isNotEmpty) {
      final job = SplitJob.fromJson(rawJobMap);
      mailCloudSyncQueueCount = job.isCompleted ? 0 : 1;
      mailCloudSyncTaskId = '';
      mailCloudSyncFileCount = fileCount;
      mailCloudSyncProgressValue = (job.progressPercent / 100)
          .clamp(0, 1)
          .toDouble();
      mailCloudSyncUpdatedAt = DateTime.now().toIso8601String();
      mailCloudSyncStatusLabel = job.isCompleted
          ? '已完成'
          : displayStageLabel(job.stage);
      return;
    }

    mailCloudSyncQueueCount = 0;
    mailCloudSyncTaskId = '';
    mailCloudSyncFileCount = fileCount;
    mailCloudSyncProgressValue = 1;
    mailCloudSyncUpdatedAt = DateTime.now().toIso8601String();
    mailCloudSyncStatusLabel = '已完成';
  }

  String _mailCloudQueueStatusLabel(Map<String, dynamic> task) {
    final status = _stringFrom(task['status']);
    final knowledgeStatus = _stringFrom(task['knowledgeStatus']);
    final base = switch (status) {
      'queued' => '本地后台队列等待中',
      'running' => '本地后台正在同步',
      'paused' => '已暂停',
      'waiting_server' => '等待服务端恢复',
      'completed' => '已完成',
      'failed' => '失败',
      'cancelled' => '已取消',
      _ => status.isEmpty ? '状态未知' : status,
    };
    if (knowledgeStatus == 'syncing') {
      return '$base · 知识库同步中';
    }
    if (knowledgeStatus == 'synced') {
      return '$base · 知识库已同步';
    }
    if (knowledgeStatus == 'failed') {
      return '$base · 知识库同步失败';
    }
    return base;
  }

  void _markMacOSMailCloudSyncFailed(String message) {
    mailCloudSyncQueueCount = 0;
    mailCloudSyncProgressValue = null;
    mailCloudSyncStatusLabel = '失败';
    mailCloudSyncUpdatedAt = DateTime.now().toIso8601String();
    if (message.trim().isNotEmpty) {
      _appendLog('Mail.app 云端同步失败：$message', notify: false);
    }
  }

  Future<Map<String, dynamic>?> _runMacOSMailExport({
    required int runToken,
    required bool queueLocalFiles,
    required int initialQueueCount,
  }) async {
    Map<String, dynamic> normalizeStatus(Map<String, dynamic> raw) {
      final nested = raw['status'];
      if (nested is Map) {
        return Map<String, dynamic>.from(nested);
      }
      return raw;
    }

    Map<String, dynamic> status;
    try {
      status = normalizeStatus(await _backendApi.startMailImport());
    } catch (error) {
      if (runToken != _mailImportRunToken || !importingMacOSMail) {
        return null;
      }
      _appendLog('Mail.app 导入启动后状态返回失败，正在重新读取后台状态：$error', notify: false);
      await Future<void>.delayed(const Duration(seconds: 1));
      status = normalizeStatus(await _backendApi.mailImportStatus());
    }
    _applyBackendMailImportStatus(status);
    if (queueLocalFiles) {
      await _syncMailExportedFilesToQueue(
        status,
        initialQueueCount: initialQueueCount,
      );
    }
    var statusRefreshFailureCount = 0;
    while (_backendMailImportStillActive(status)) {
      if (runToken != _mailImportRunToken || !importingMacOSMail) {
        _appendLog('Mail.app 后端导入仍在运行，但当前导入任务已复位，已停止前端等待。');
        return null;
      }
      await Future<void>.delayed(const Duration(seconds: 1));
      try {
        status = normalizeStatus(await _backendApi.mailImportStatus());
        statusRefreshFailureCount = 0;
      } catch (error) {
        statusRefreshFailureCount += 1;
        if (statusRefreshFailureCount == 1 ||
            statusRefreshFailureCount % 5 == 0) {
          _appendLog('Mail.app 导入状态刷新失败，后台导入仍按当前进度继续等待：$error', notify: false);
        }
        continue;
      }
      _applyBackendMailImportStatus(status);
      if (queueLocalFiles) {
        await _syncMailExportedFilesToQueue(
          status,
          initialQueueCount: initialQueueCount,
        );
      }
    }
    if (runToken != _mailImportRunToken || !importingMacOSMail) {
      _appendLog('Mail.app 导入结果已返回，但当前导入任务已复位，已忽略旧结果。');
      return null;
    }

    final importStatus = _stringFrom(status['status']);
    if (importStatus == 'failed') {
      final diagnostics = status['diagnostics'] is Map
          ? Map<String, dynamic>.from(status['diagnostics'] as Map)
          : const <String, dynamic>{};
      final lastError = _stringFrom(diagnostics['lastError']);
      throw StateError(lastError.isEmpty ? 'Mail.app 后端导入失败。' : lastError);
    }
    if (queueLocalFiles) {
      await _syncMailExportedFilesToQueue(
        status,
        initialQueueCount: initialQueueCount,
        forceScan: true,
      );
    }
    return status;
  }

  Future<int> _syncMailExportedFilesToQueue(
    Map<String, dynamic> status, {
    required int initialQueueCount,
    bool forceScan = false,
  }) async {
    final exportDirectory = _mailExportDirectoryFromStatus(status);
    if (exportDirectory.isEmpty) {
      return 0;
    }

    final latestProgress = status['latestProgress'] is Map
        ? Map<String, dynamic>.from(status['latestProgress'] as Map)
        : const <String, dynamic>{};
    final additionsByPath = <String, QueuedFile>{};
    final latestFileName = _stringFrom(latestProgress['fileName']);
    if (latestFileName.isNotEmpty) {
      final latestPath = p.normalize(p.join(exportDirectory, latestFileName));
      if (await File(latestPath).exists()) {
        try {
          final queued = await _queuedFileFromPath(
            latestPath,
            rootDirectory: p.dirname(exportDirectory),
          );
          additionsByPath[queued.path] = queued;
        } catch (_) {}
      }
    }

    final exportedCount = _intFrom(status['exportedCount']) > 0
        ? _intFrom(status['exportedCount'])
        : _intFrom(latestProgress['exportedCount']);
    final now = DateTime.now();
    final shouldScan =
        forceScan ||
        (exportedCount > 0 &&
            exportedCount != _lastMailImportQueueSyncExportedCount &&
            now.difference(_lastMailImportQueueSyncAt) >=
                _mailImportQueueSyncInterval);
    if (shouldScan) {
      _lastMailImportQueueSyncAt = now;
      _lastMailImportQueueSyncExportedCount = exportedCount;
      for (final queued in await _collectQueuedFilesFromDirectory(
        exportDirectory,
      )) {
        additionsByPath[queued.path] = queued;
      }
    }

    if (additionsByPath.isEmpty) {
      return 0;
    }
    final added = _mergeQueuedFiles(
      additionsByPath.values.toList(growable: false),
      updateStatus: false,
      notify: false,
    );
    if (added > 0) {
      final totalAdded = queuedFiles.length - initialQueueCount;
      statusMessage = '已从 Mail.app 加入 $totalAdded 封邮件到本地队列，导入继续进行。';
      statusCaption = '本地队列已更新';
      _appendLog(
        'Mail.app 导入已增量加入 $added 封邮件；本次累计加入 $totalAdded 封。',
        notify: false,
      );
      notifyListeners();
    }
    return added;
  }

  String _mailExportDirectoryFromStatus(Map<String, dynamic> status) {
    final diagnostics = status['diagnostics'] is Map
        ? Map<String, dynamic>.from(status['diagnostics'] as Map)
        : const <String, dynamic>{};
    final latestProgress = status['latestProgress'] is Map
        ? Map<String, dynamic>.from(status['latestProgress'] as Map)
        : const <String, dynamic>{};
    if (_stringFrom(diagnostics['exportDirectory']).isNotEmpty) {
      return _stringFrom(diagnostics['exportDirectory']);
    }
    if (_stringFrom(latestProgress['exportDirectory']).isNotEmpty) {
      return _stringFrom(latestProgress['exportDirectory']);
    }
    return _stringFrom(status['downloadsDirectory']);
  }

  Future<void> _applyPipelineSubmissionResponse({
    required Map<String, dynamic> response,
    required String submittedText,
    required List<QueuedFile> submittedFiles,
    required String targetServiceUrl,
    required String queuedStatusMessage,
    required String queuedStatusCaption,
    required String completedStatusMessage,
    required String completedStatusCaption,
    required String completedLogPrefix,
  }) async {
    var checkpointId = _stringFrom(response['checkpointId']);
    selectedCheckpointId = checkpointId;
    final rawJob = response['job'];
    final rawJobMap = rawJob is Map ? Map<String, dynamic>.from(rawJob) : null;
    final rawTask = response['task'];
    final rawTaskMap = rawTask is Map
        ? Map<String, dynamic>.from(rawTask)
        : null;
    final taskStatus = _stringFrom(rawTaskMap?['status']);
    if (rawTaskMap != null &&
        (taskStatus == 'waiting_server' ||
            rawJobMap == null ||
            _stringFrom(rawJobMap['id']).isEmpty)) {
      _recordBackendQueuedCheckpoint(
        checkpointId: checkpointId,
        submittedText: submittedText,
        submittedFiles: submittedFiles,
        task: rawTaskMap,
        manifestDigest: _stringFrom(response['manifestDigest']),
        serviceUrl: targetServiceUrl,
      );
      uploadProgress = ((rawTaskMap['progress'] as num?)?.toDouble() ?? 0)
          .clamp(0, 1);
      packagingProgress = 1;
      await _persistCheckpointStore();
      statusMessage = queuedStatusMessage;
      statusCaption = queuedStatusCaption;
      _appendLog(
        '$queuedStatusMessage task=${_stringFrom(rawTaskMap['taskId'])}',
      );
      return;
    }
    if (rawJobMap == null) {
      throw StateError('本地后台没有返回任务状态。');
    }

    final job = SplitJob.fromJson(rawJobMap);
    activeJob = job;
    final rawResult = response['result'];
    activeResult = rawResult is Map
        ? Map<String, dynamic>.from(rawResult)
        : null;
    final rawSession = response['uploadSession'];
    if (rawSession is Map) {
      activeUploadSession = UploadSessionInfo.fromJson(
        Map<String, dynamic>.from(rawSession),
      );
      if (checkpointId.isEmpty) {
        checkpointId = activeUploadSession?.checkpointId ?? '';
        selectedCheckpointId = checkpointId;
      }
      selectedUploadSessionId = activeUploadSession?.sessionId ?? '';
    }
    uploadProgress = 1;
    packagingProgress = 1;

    if (checkpointId.isNotEmpty) {
      _recordBackendPipelineCheckpoint(
        checkpointId: checkpointId,
        submittedText: submittedText,
        submittedFiles: submittedFiles,
        job: job,
        uploadSession: activeUploadSession,
        manifestDigest: _stringFrom(response['manifestDigest']),
        serviceUrl: targetServiceUrl,
      );
      await _persistCheckpointStore();
    }

    _upsertRun(
      RecentRun(
        jobId: job.id,
        createdAt: DateTime.now().toIso8601String(),
        status: job.status,
        stage: displayStageLabel(job.stage),
        inputPreview: submittedText,
        fileCount: submittedFiles.length,
        serviceUrl: targetServiceUrl,
        progressPercent: job.progressPercent,
      ),
    );
    selectedRunId = job.id;
    await _persistRuns();
    if (job.isCompleted && activeResult != null) {
      try {
        await _backendApi.syncKnowledgeCache(
          serviceBaseUrl: targetServiceUrl,
          pushOutbox: false,
        );
      } catch (error) {
        _appendLog('任务完成后的本地知识库同步失败：$error', notify: false);
      }
      _notifyKnowledgeDaemon(
        KnowledgeDaemonEvent(
          kind: KnowledgeDaemonEventKind.resultChanged,
          sourceId: 'result',
          reason: 'job-completed',
        ),
        delay: const Duration(milliseconds: 220),
      );
      statusMessage = completedStatusMessage;
      statusCaption = completedStatusCaption;
      _appendLog(
        '$completedLogPrefix：任务 ${job.id}，提交 ${submittedFiles.length} 个文件。',
      );
    } else {
      throw ApiException(job.error.isNotEmpty ? job.error : '任务未成功完成。');
    }
  }

  Future<void> activateMacOSMailAuthorization() async {
    if (activatingMacOSMailAuthorization) {
      return;
    }
    if (!emailAnalysisModuleSupported) {
      _setError('Mail.app 授权仅支持 macOS 客户端。');
      return;
    }

    activatingMacOSMailAuthorization = true;
    statusMessage = '正在请求 Mail.app 授权...';
    statusCaption = '等待系统自动化授权';
    lastError = '';
    _appendLog('正在手动激活 Mail.app 自动化授权。');
    notifyListeners();

    try {
      if (!await _backendApi.ensureDaemon()) {
        throw StateError('本地客户端后台不可用。');
      }
      final result = await _backendApi.requestMailAuthorization();
      statusMessage = 'Mail.app 授权检查通过。';
      statusCaption = '邮箱授权可用';
      _appendLog(
        'Mail.app 授权检查通过，可访问 ${_intFrom(result['accountCount'])} 个账号。',
      );
    } on PlatformException catch (error) {
      final message = error.message ?? error.code;
      _setError(
        'Mail.app 授权失败：$message。请在系统设置 > 隐私与安全性 > 自动化中允许 Pact 控制 Mail。',
      );
    } catch (error) {
      _setError('Mail.app 授权失败：$error');
    } finally {
      activatingMacOSMailAuthorization = false;
      notifyListeners();
    }
  }

  Future<void> refreshMailIndexStats({bool silent = false}) async {
    if (!localMailIndexAvailable || refreshingMailIndexStats) {
      return;
    }
    refreshingMailIndexStats = true;
    if (!silent) {
      notifyListeners();
    }

    try {
      if (!await _backendApi.ensureDaemon()) {
        throw StateError('本地客户端后台不可用。');
      }
      clientBackendAvailable = true;
      final stats = await _backendApi.mailIndexStats();
      mailIndexStats = MacOSMailIndexStats.fromJson(stats);
      await _refreshClientBackendState(notify: false);
      _lastMailIndexStatsRefreshAt = DateTime.now();
      _markKnowledgeGraphDirty();
      if (!silent) {
        _syncKnowledgeGraph();
      }
      if (!silent) {
        statusMessage = '邮件索引状态已刷新。';
        statusCaption = mailIndexStatusLabel;
        _appendLog('本地后台邮件索引状态：$mailIndexStatusLabel。');
      }
    } catch (error) {
      if (!silent) {
        _setError('刷新邮件索引状态失败：$error');
      }
    } finally {
      refreshingMailIndexStats = false;
      notifyListeners();
    }
  }

  Future<void> refreshMailKnowledgeGraph({bool silent = false}) async {
    if (!localMailIndexAvailable || refreshingMailKnowledgeGraph) {
      return;
    }
    refreshingMailKnowledgeGraph = true;
    if (!silent) {
      notifyListeners();
    }

    try {
      final dataDirectory = await _storage.dataDirectory();
      final mailWorkspaceDirectory = _mailWorkspacePath(dataDirectory);
      final semanticSuggestions = await _storage
          .loadMailKnowledgeSemanticSuggestions(
            mailWorkspaceDirectory: mailWorkspaceDirectory,
          );
      mailKnowledgeSemanticSuggestions = semanticSuggestions;
      final result = await compute(
        _preloadMailKnowledgeGraph,
        _MailKnowledgeGraphPreloadRequest(
          mailWorkspaceDirectory: mailWorkspaceDirectory,
          mailSemanticSuggestions: semanticSuggestions,
          emailAnalysisModuleSupported: localMailIndexAvailable,
          emailAnalysisModuleEnabled: emailAnalysisModuleEnabled,
          importingMacOSMail: importingMacOSMail,
          mailImportPaused: mailImportPaused,
          mailImportDownloadedCount: mailImportDownloadedCount,
          mailImportTotalCount: mailImportTotalCount,
          mailIndexDocumentCount: mailIndexStats?.documentCount,
          mailIndexSegmentCount: mailIndexStats?.segmentCount,
          mailIndexPendingCount: mailIndexStats?.pendingCount,
          mailIndexLastUpdatedAt: mailIndexStats?.lastUpdatedAt ?? '',
          mailIndexDirectory: mailIndexStats?.indexDirectory ?? '',
          people: peopleItems,
          transactions: transactionItems,
        ),
        debugLabel: 'mail-knowledge-graph-preload',
      );
      mailKnowledgeDocuments = result.documents;
      if (_canUseBackgroundKnowledgeGraphSnapshot()) {
        knowledgeGraph = result.snapshot;
        _knowledgeGraphDirty = false;
      } else {
        _markKnowledgeGraphDirty();
        _syncKnowledgeGraph();
      }
      if (silent) {
        _appendLog(
          '事务知识图谱后台预加载完成：读取 ${mailKnowledgeDocuments.length} 封邮件证据，生成 ${knowledgeGraph.nodes.length} 节点 / ${knowledgeGraph.edges.length} 边。',
          notify: false,
        );
      }
      if (!silent) {
        statusMessage = '事务知识图谱已刷新。';
        statusCaption = '${mailKnowledgeDocuments.length} 封邮件证据';
        _appendLog('事务知识图谱刷新完成：读取 ${mailKnowledgeDocuments.length} 封邮件索引证据。');
      }
      _requestCloudKnowledgeEnhancement(
        documents: result.documents,
        mailWorkspaceDirectory: mailWorkspaceDirectory,
        existingSuggestions: semanticSuggestions,
      );
    } catch (error) {
      if (!silent) {
        _setError('刷新事务知识图谱失败：$error');
      } else {
        _appendLog('事务知识图谱后台预加载失败：$error', notify: false);
      }
    } finally {
      refreshingMailKnowledgeGraph = false;
      notifyListeners();
    }
  }

  void _requestCloudKnowledgeEnhancement({
    required List<MailKnowledgeDocument> documents,
    required String mailWorkspaceDirectory,
    required Map<String, MailKnowledgeSemanticSuggestion> existingSuggestions,
  }) {
    if (_mailKnowledgeCloudEnhanceInFlight ||
        resolvedServiceUrl.isEmpty ||
        documents.isEmpty) {
      return;
    }
    final elapsed = DateTime.now().difference(_lastMailKnowledgeCloudEnhanceAt);
    if (elapsed < const Duration(minutes: 2)) {
      return;
    }

    final selected = documents.reversed
        .where(
          (document) =>
              document.messageKey.trim().isNotEmpty &&
              !existingSuggestions.containsKey(document.messageKey),
        )
        .take(180)
        .toList(growable: false);
    if (selected.isEmpty) {
      return;
    }

    _mailKnowledgeCloudEnhanceInFlight = true;
    _lastMailKnowledgeCloudEnhanceAt = DateTime.now();
    unawaited(
      _enhanceMailKnowledgeWithCloud(
        documents: selected,
        mailWorkspaceDirectory: mailWorkspaceDirectory,
        existingSuggestions: existingSuggestions,
      ),
    );
  }

  Future<void> _enhanceMailKnowledgeWithCloud({
    required List<MailKnowledgeDocument> documents,
    required String mailWorkspaceDirectory,
    required Map<String, MailKnowledgeSemanticSuggestion> existingSuggestions,
  }) async {
    try {
      final merged = <String, MailKnowledgeSemanticSuggestion>{
        ...existingSuggestions,
      };
      var updated = 0;
      const batchSize = 60;
      for (var start = 0; start < documents.length; start += batchSize) {
        final end = math.min(start + batchSize, documents.length);
        final batch = documents.sublist(start, end);
        final suggestions = await _backendApi.enhanceAffairTaxonomy(
          serviceBaseUrl: resolvedServiceUrl,
          documents: batch.map(_cloudKnowledgeDocumentPayload).toList(),
        );
        for (final suggestion in suggestions) {
          if (!suggestion.isUseful || !suggestion.isCloudEnhanced) {
            continue;
          }
          merged[suggestion.messageKey] = suggestion;
          updated += 1;
        }
      }
      if (updated == 0) {
        _appendLog('云端语义增强没有返回可缓存结果，保持当前本地图谱。', notify: false);
        return;
      }

      await _storage.saveMailKnowledgeSemanticSuggestions(
        mailWorkspaceDirectory: mailWorkspaceDirectory,
        suggestions: merged,
      );
      mailKnowledgeSemanticSuggestions = merged;
      statusCaption = '云端语义 ${merged.length} 封';
      _appendLog(
        '云端语义增强完成：更新 $updated 封邮件；当前云端增强缓存 ${merged.length} 封。',
        notify: false,
      );
      notifyListeners();
      unawaited(refreshMailKnowledgeGraph(silent: true));
      _notifyKnowledgeDaemon(
        KnowledgeDaemonEvent(
          kind: KnowledgeDaemonEventKind.moduleDataChanged,
          sourceId: 'mail',
          reason: 'cloud-taxonomy',
        ),
        delay: const Duration(milliseconds: 150),
      );
    } catch (error) {
      if (error is ApiException && error.statusCode == 404) {
        _appendLog('当前服务端暂不支持图谱云端语义增强，已使用本地聚类。', notify: false);
      } else {
        _appendLog('图谱云端语义增强失败：$error', notify: false);
      }
    } finally {
      _mailKnowledgeCloudEnhanceInFlight = false;
    }
  }

  Map<String, dynamic> _cloudKnowledgeDocumentPayload(
    MailKnowledgeDocument document,
  ) {
    final title = document.subject.trim().isEmpty
        ? document.fileName.trim()
        : document.subject.trim();
    return {
      'id': document.messageKey,
      'messageKey': document.messageKey,
      'docId': document.docId,
      'title': title,
      'sender': document.sender,
      'recipients': document.recipients,
      'mailboxPath': document.mailboxPath,
      'date': document.dateReceived.isEmpty
          ? document.dateSent
          : document.dateReceived,
      'localTaxonomyPath': document.taxonomyPath,
      'localKeywords': _lightweightKeywordList(title),
      'status': document.status,
    };
  }

  List<String> _lightweightKeywordList(String value) {
    final normalized = value.toLowerCase();
    final matches = RegExp(
      r'[\p{Letter}\p{Number}][\p{Letter}\p{Number}_+-]{1,}',
      unicode: true,
    ).allMatches(normalized);
    final seen = <String>{};
    final keywords = <String>[];
    const stopWords = {
      'the',
      'and',
      'for',
      'with',
      'your',
      'you',
      'from',
      'this',
      'that',
      'are',
      'have',
      'has',
      'off',
      'sale',
    };
    for (final match in matches) {
      final item = match.group(0)?.trim() ?? '';
      if (item.length < 2 || stopWords.contains(item) || seen.contains(item)) {
        continue;
      }
      seen.add(item);
      keywords.add(item);
      if (keywords.length >= 10) {
        break;
      }
    }
    return keywords;
  }

  Future<void> searchKnowledgeGraph(String query) async {
    final normalized = query.trim();
    final token = ++_knowledgeSearchToken;
    knowledgeSearchQuery = normalized;
    knowledgeSearchError = '';

    if (normalized.isEmpty) {
      searchingKnowledgeIndex = false;
      knowledgeSearchTotal = 0;
      knowledgeSearchResults = const [];
      notifyListeners();
      return;
    }

    searchingKnowledgeIndex = true;
    notifyListeners();

    try {
      if (!await _backendApi.ensureDaemon()) {
        throw StateError('本地客户端后台不可用。');
      }
      clientBackendAvailable = true;
      final response = await _backendApi.searchKnowledgeCache(
        query: normalized,
        limit: 24,
      );
      if (token != _knowledgeSearchToken) {
        return;
      }
      final rawResults = response['items'];
      knowledgeSearchResults = rawResults is List
          ? rawResults
                .whereType<Map>()
                .map(_knowledgeSearchResultFromCacheItem)
                .toList(growable: false)
          : const [];
      knowledgeSearchTotal = (response['total'] as num?)?.toInt() ?? 0;
      statusMessage = knowledgeSearchTotal == 0
          ? '知识库搜索没有命中文档。'
          : '知识库搜索命中 $knowledgeSearchTotal 个本地知识文档。';
      statusCaption = '本地知识库搜索';
    } catch (error) {
      if (token != _knowledgeSearchToken) {
        return;
      }
      knowledgeSearchResults = const [];
      knowledgeSearchTotal = 0;
      knowledgeSearchError = '搜索本地知识库失败：$error';
    } finally {
      if (token == _knowledgeSearchToken) {
        searchingKnowledgeIndex = false;
        notifyListeners();
      }
    }
  }

  MacOSMailIndexSearchResult _knowledgeSearchResultFromCacheItem(
    Map<dynamic, dynamic> json,
  ) {
    final documentId = (json['documentId'] ?? json['itemId'] ?? '').toString();
    final title = (json['title'] ?? '').toString();
    final snippet = (json['snippet'] ?? json['summary'] ?? '').toString();
    final markdownPath = (json['localMarkdownPath'] ?? '').toString();
    return MacOSMailIndexSearchResult(
      docId: 0,
      messageKey: documentId,
      fileName: markdownPath.split('/').last,
      path: markdownPath,
      subject: title.isEmpty ? documentId : title,
      sender: (json['documentType'] ?? json['itemType'] ?? 'knowledge')
          .toString(),
      recipients: '',
      cc: '',
      dateSent: '',
      dateReceived: (json['serverUpdatedAt'] ?? '').toString(),
      account: '本地知识库',
      mailboxPath: snippet,
      status: 'cached',
      lastSeenAt: (json['serverUpdatedAt'] ?? '').toString(),
      error: '',
    );
  }

  void clearKnowledgeSearch() {
    _knowledgeSearchToken += 1;
    knowledgeSearchQuery = '';
    knowledgeSearchError = '';
    knowledgeSearchTotal = 0;
    knowledgeSearchResults = const [];
    searchingKnowledgeIndex = false;
    notifyListeners();
  }

  Future<void> refreshDataConnectors({bool silent = false}) async {
    if (refreshingDataConnectors) {
      return;
    }
    refreshingDataConnectors = true;
    dataConnectorError = '';
    if (!silent) {
      statusMessage = '正在刷新数据连接器。';
      statusCaption = '本地数据源';
      notifyListeners();
    }
    try {
      if (!clientBackendAvailable && !await _backendApi.ensureDaemon()) {
        throw StateError('本地客户端后台不可用。');
      }
      clientBackendAvailable = true;
      final response = await _backendApi.listDataConnectors();
      final rawConnectors = response['connectors'];
      dataConnectors = rawConnectors is List
          ? rawConnectors
                .whereType<Map>()
                .map((item) => Map<String, dynamic>.from(item))
                .toList(growable: false)
          : const [];
      if (!silent) {
        statusMessage = '已读取 ${dataConnectors.length} 个数据连接器。';
        statusCaption = '本地数据源';
      }
    } catch (error) {
      dataConnectorError = '刷新数据连接器失败：$error';
      if (!silent) {
        _appendLog(dataConnectorError, notify: false);
      }
    } finally {
      refreshingDataConnectors = false;
      notifyListeners();
    }
  }

  Future<void> setDataConnectorEnabled(String providerId, bool enabled) async {
    try {
      if (!await _backendApi.ensureDaemon()) {
        throw StateError('本地客户端后台不可用。');
      }
      final existing = dataConnectors.firstWhere(
        (item) => item['providerId'] == providerId,
        orElse: () => const {},
      );
      final installed = existing['installed'] == true;
      if (!installed) {
        await _backendApi.controlDataConnector(
          providerId: providerId,
          action: 'install',
        );
      }
      await _backendApi.controlDataConnector(
        providerId: providerId,
        action: enabled ? 'enable' : 'disable',
      );
      statusMessage = enabled ? '$providerId 已启用。' : '$providerId 已停用。';
      statusCaption = '数据连接器';
      await refreshDataConnectors(silent: true);
    } catch (error) {
      dataConnectorError = '更新数据连接器失败：$error';
      _setError(dataConnectorError);
    }
  }

  Future<void> startDataConnectorAuth(String providerId) async {
    try {
      if (!await _backendApi.ensureDaemon()) {
        throw StateError('本地客户端后台不可用。');
      }
      await _backendApi.startDataConnectorAuth(providerId: providerId);
      statusMessage = '$providerId 授权流程已创建。';
      statusCaption = '连接器授权';
      await refreshDataConnectors(silent: true);
    } catch (error) {
      dataConnectorError = '启动连接器授权失败：$error';
      _setError(dataConnectorError);
    }
  }

  Future<void> syncDataConnector(String providerId) async {
    try {
      if (!await _backendApi.ensureDaemon()) {
        throw StateError('本地客户端后台不可用。');
      }
      final result = await _backendApi.syncDataConnector(providerId: providerId);
      final count = (result['itemCount'] as num?)?.toInt() ?? 0;
      statusMessage = '$providerId 已同步 $count 条本地镜像记录。';
      statusCaption = '连接器同步';
      await refreshDataConnectors(silent: true);
    } catch (error) {
      dataConnectorError = '同步数据连接器失败：$error';
      _setError(dataConnectorError);
    }
  }

  Future<void> openKnowledgeMailEvidence({
    int? docId,
    String messageKey = '',
    String label = '邮件原始证据',
  }) async {
    final normalizedKey = messageKey.trim();
    final normalizedDocId = docId == null || docId <= 0 ? null : docId;
    if (normalizedDocId == null && normalizedKey.isEmpty) {
      _setError('缺少邮件证据的 docId 或 messageKey，无法跳转。');
      return;
    }

    try {
      if (!await _backendApi.ensureDaemon()) {
        throw StateError('本地客户端后台不可用。');
      }
      clientBackendAvailable = true;
      if (normalizedDocId == null && normalizedKey.isNotEmpty) {
        try {
          final opened = await _backendApi.openKnowledgeDocument(
            documentId: normalizedKey,
          );
          final openedPath = _stringFrom(opened['path']);
          statusMessage = '本地知识文档已打开。';
          statusCaption = '知识库';
          _appendLog('本地知识文档已打开：$openedPath');
          notifyListeners();
          return;
        } catch (_) {
          // Fall through to the macOS Mail evidence path when the key is not a knowledge document id.
        }
      }
      if (!emailAnalysisModuleSupported) {
        _setError('邮件原始证据跳转仅支持 macOS 客户端。');
        return;
      }
      final result = await _backendApi.openMailIndexItem(
        docId: normalizedDocId,
        messageKey: normalizedKey,
      );
      final path = _stringFrom(result['path']);
      if (path.trim().isEmpty) {
        throw StateError('邮件索引没有返回可打开路径。');
      }
      statusMessage = '$label已定位。';
      statusCaption = '证据跳转';
      _appendLog('$label已定位：$path');
      notifyListeners();
    } catch (error) {
      _setError('打开邮件原始证据失败：$error');
    }
  }

  KnowledgeTimeline knowledgeTimelineForNode(
    KnowledgeGraphNode? node, {
    int eventLimit = 9,
    int evidenceLimit = 72,
  }) {
    if (node == null ||
        mailKnowledgeDocuments.isEmpty ||
        eventLimit <= 0 ||
        evidenceLimit <= 0) {
      return KnowledgeTimeline.empty;
    }
    final terms = _knowledgeNodeSearchTerms(node);
    final exactDocIds = _knowledgeNodeEvidenceDocIds(node);
    if (terms.isEmpty && exactDocIds.isEmpty) {
      return KnowledgeTimeline.empty;
    }

    final matches = <_MailKnowledgeTimelineMatch>[];
    for (final document in mailKnowledgeDocuments) {
      final exactEvidence = exactDocIds.contains(document.docId);
      final score = _mailKnowledgeTimelineScore(
        node,
        document,
        terms,
        exactEvidence: exactEvidence,
      );
      if (score <= 0) {
        continue;
      }
      final timestamp = _mailKnowledgeDocumentTimestamp(document);
      final stage = _mailKnowledgeTimelineStage(node, document);
      matches.add(
        _MailKnowledgeTimelineMatch(
          document: document,
          score: score,
          timestamp: timestamp,
          stage: stage,
          groupKey: _mailKnowledgeTimelineGroupKey(
            node,
            document,
            stage,
            timestamp,
          ),
        ),
      );
    }
    matches.sort((left, right) {
      final score = right.score.compareTo(left.score);
      if (score != 0) {
        return score;
      }
      return right.timestamp.compareTo(left.timestamp);
    });
    final groups = <String, _MailKnowledgeTimelineGroup>{};
    for (final match in matches.take(evidenceLimit)) {
      groups
          .putIfAbsent(
            match.groupKey,
            () => _MailKnowledgeTimelineGroup(
              stage: match.stage,
              groupKey: match.groupKey,
            ),
          )
          .add(match);
    }

    final selectedGroups = groups.values.toList()
      ..sort((left, right) {
        final score = right.score.compareTo(left.score);
        if (score != 0) {
          return score;
        }
        return left.timestamp.compareTo(right.timestamp);
      });
    final chronological = selectedGroups.take(eventLimit).toList()
      ..sort((left, right) => left.timestamp.compareTo(right.timestamp));
    if (chronological.isEmpty) {
      return KnowledgeTimeline.empty;
    }

    final events = chronological
        .map(
          (group) => KnowledgeTimelineEvent(
            stage: group.stage,
            title: _mailKnowledgeTimelineEventTitle(node, group),
            summary: _mailKnowledgeTimelineEventSummary(node, group),
            timestamp: group.timestamp,
            evidence: group.documents.take(4).toList(growable: false),
            evidenceCount: group.matches.length,
            participants: _mailKnowledgeTimelineParticipants(group.documents),
            score: group.score,
          ),
        )
        .toList(growable: false);

    return KnowledgeTimeline(
      nodeId: node.id,
      title: node.label,
      events: events,
      evidenceCount: matches.length,
      startAt: events.first.timestamp,
      endAt: events.last.timestamp,
    );
  }

  Set<int> _knowledgeNodeEvidenceDocIds(KnowledgeGraphNode node) {
    final nodeById = {for (final item in knowledgeGraph.nodes) item.id: item};
    final ids = <int>{};
    void collect(KnowledgeGraphNode item) {
      final raw = item.metadata['docId'] ?? item.metadata['文档ID'] ?? '';
      final parsed = int.tryParse(raw.trim());
      if (parsed != null && parsed > 0) {
        ids.add(parsed);
      }
    }

    collect(node);
    var frontier = <String>{node.id};
    final visited = <String>{node.id};
    for (var depth = 0; depth < 5 && frontier.isNotEmpty; depth += 1) {
      final next = <String>{};
      for (final edge in knowledgeGraph.edges) {
        if (!_isKnowledgeTimelineTraversalEdge(edge)) {
          continue;
        }
        String? relatedId;
        if (frontier.contains(edge.sourceId)) {
          relatedId = edge.targetId;
        } else if (frontier.contains(edge.targetId)) {
          relatedId = edge.sourceId;
        }
        if (relatedId == null || !visited.add(relatedId)) {
          continue;
        }
        final related = nodeById[relatedId];
        if (related == null) {
          continue;
        }
        collect(related);
        if (related.kind != 'evidence') {
          next.add(related.id);
        }
      }
      frontier = next;
    }
    return ids;
  }

  bool _isKnowledgeTimelineTraversalEdge(KnowledgeGraphEdge edge) {
    return const {'领域', '分类', '实体', '意图', '事务', '证据'}.contains(edge.label);
  }

  Set<String> _knowledgeNodeSearchTerms(KnowledgeGraphNode node) {
    final values = <String>[
      node.label,
      node.kind,
      ...node.metadata.values,
      if (node.metadata['路径'] != null) node.metadata['路径']!,
      if (node.metadata['分类'] != null) node.metadata['分类']!,
      if (node.metadata['聚合实体'] != null) node.metadata['聚合实体']!,
      if (node.metadata['参与者'] != null) node.metadata['参与者']!,
      if (node.metadata['关键词'] != null) node.metadata['关键词']!,
      if (node.metadata['messageKey'] != null) node.metadata['messageKey']!,
      if (node.metadata['文件名'] != null) node.metadata['文件名']!,
    ];
    final terms = <String>{};
    final splitter = RegExp(r'[\s,，、/|;；:：()（）\[\]【】<>]+');
    for (final value in values) {
      final normalizedValue = value.trim().toLowerCase();
      if (normalizedValue.length >= 2 && normalizedValue.length <= 96) {
        terms.add(normalizedValue);
      }
      for (final part in normalizedValue.split(splitter)) {
        final term = part.trim();
        if (term.length >= 2 && term.length <= 64) {
          terms.add(term);
        }
      }
    }
    return terms.take(28).toSet();
  }

  int _mailKnowledgeTimelineScore(
    KnowledgeGraphNode node,
    MailKnowledgeDocument document,
    Set<String> terms, {
    required bool exactEvidence,
  }) {
    var score = 0;
    final label = node.label.trim().toLowerCase();
    final messageKey = node.metadata['messageKey']?.trim();
    final fileName = node.metadata['文件名']?.trim().toLowerCase();
    final semantic =
        mailKnowledgeSemanticSuggestions[document.messageKey] ??
        mailKnowledgeSemanticSuggestions['doc:${document.docId}'];
    final haystack = [
      document.subject,
      document.sender,
      document.recipients,
      document.cc,
      document.account,
      document.mailboxPath,
      document.taxonomyPath,
      document.fileName,
      document.messageKey,
      document.status,
    ].join('\n').toLowerCase();

    if (exactEvidence) {
      score += 240;
    }
    if (messageKey != null &&
        messageKey.isNotEmpty &&
        messageKey == document.messageKey) {
      score += 120;
    }
    if (fileName != null &&
        fileName.isNotEmpty &&
        fileName == document.fileName.toLowerCase()) {
      score += 90;
    }
    if (label.isNotEmpty && haystack.contains(label)) {
      score += node.kind == 'affair' ? 16 : 10;
    }

    final nodeIntent =
        node.metadata['事务类型'] ?? (node.kind == 'intent' ? node.label : '');
    if (nodeIntent.trim().isNotEmpty) {
      final documentIntent = _mailKnowledgeTimelineNormalizedIntent(
        '${semantic?.intent ?? ''} ${document.subject} ${document.taxonomyPath}',
      );
      if (documentIntent == nodeIntent.trim()) {
        score += node.kind == 'intent' ? 60 : 28;
      }
    }

    final nodeEntity =
        node.metadata['聚合实体'] ??
        node.metadata['实体'] ??
        (node.kind == 'entity' ? node.label : '');
    if (nodeEntity.trim().isNotEmpty) {
      final normalizedEntity = nodeEntity.trim().toLowerCase();
      final semanticEntity = semantic?.entity.trim().toLowerCase() ?? '';
      if (semanticEntity == normalizedEntity ||
          document.sender.toLowerCase().contains(normalizedEntity) ||
          document.subject.toLowerCase().contains(normalizedEntity)) {
        score += node.kind == 'entity' ? 70 : 24;
      }
    }

    for (final term in terms) {
      if (haystack.contains(term)) {
        score += term.length > 8 ? 4 : 2;
      }
    }

    final taxonomy = node.metadata['分类'] ?? node.metadata['路径'] ?? '';
    if (taxonomy.isNotEmpty &&
        document.taxonomyPath.toLowerCase().contains(taxonomy.toLowerCase())) {
      score += 12;
    }
    if (node.kind == 'person' || node.kind == 'entity') {
      if (document.sender.toLowerCase().contains(label) ||
          document.recipients.toLowerCase().contains(label) ||
          document.cc.toLowerCase().contains(label)) {
        score += 10;
      }
    }
    if (node.kind == 'domain' ||
        node.kind == 'category' ||
        node.kind == 'subcategory') {
      if (document.taxonomyPath.toLowerCase().contains(label)) {
        score += 10;
      }
    }
    if (node.kind == 'evidence' &&
        score < 60 &&
        label.isNotEmpty &&
        document.subject.toLowerCase().contains(label)) {
      score += 24;
    }
    return score;
  }

  DateTime _mailKnowledgeDocumentTimestamp(MailKnowledgeDocument document) {
    for (final value in [
      document.dateReceived,
      document.dateSent,
      document.lastSeenAt,
    ]) {
      final parsed = _parseMailKnowledgeDate(value);
      if (parsed != null) {
        return parsed;
      }
    }
    return DateTime.fromMillisecondsSinceEpoch(0);
  }

  DateTime? _parseMailKnowledgeDate(String value) {
    final trimmed = value.trim();
    if (trimmed.isEmpty || trimmed == '-') {
      return null;
    }
    final parsed = DateTime.tryParse(trimmed);
    if (parsed != null) {
      return parsed;
    }
    final match = RegExp(
      r'(?:[A-Za-z]+,\s*)?([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})\s+at\s+(\d{1,2}):(\d{2})(?::(\d{2}))?',
    ).firstMatch(trimmed);
    if (match == null) {
      return null;
    }
    const months = {
      'january': 1,
      'february': 2,
      'march': 3,
      'april': 4,
      'may': 5,
      'june': 6,
      'july': 7,
      'august': 8,
      'september': 9,
      'october': 10,
      'november': 11,
      'december': 12,
    };
    final month = months[(match.group(1) ?? '').toLowerCase()];
    final day = int.tryParse(match.group(2) ?? '');
    final year = int.tryParse(match.group(3) ?? '');
    final hour = int.tryParse(match.group(4) ?? '');
    final minute = int.tryParse(match.group(5) ?? '');
    final second = int.tryParse(match.group(6) ?? '0') ?? 0;
    if (month == null ||
        day == null ||
        year == null ||
        hour == null ||
        minute == null) {
      return null;
    }
    return DateTime(year, month, day, hour, minute, second);
  }

  String _mailKnowledgeTimelineStage(
    KnowledgeGraphNode node,
    MailKnowledgeDocument document,
  ) {
    final text = [
      node.label,
      node.metadata['事务类型'] ?? '',
      document.subject,
      document.sender,
      document.taxonomyPath,
      document.status,
    ].join(' ').toLowerCase();
    if (_containsAny(text, const [
      'last chance',
      'final',
      'ends soon',
      'ending',
      'deadline',
      'reminder',
      'hurry',
      'expire',
      '提醒',
      '截止',
      '最后',
      '即将结束',
    ])) {
      return '提醒推进';
    }
    if (_containsAny(text, const [
      'confirmed',
      'confirmation',
      'success',
      'successful',
      'completed',
      'fixed',
      'resolved',
      'receipt',
      'shipped',
      'delivered',
      '退款已经成功',
      '成功',
      '确认',
      '完成',
      '已修复',
      '收据',
    ])) {
      return '结果确认';
    }
    if (_containsAny(text, const [
      'cancel',
      'changed',
      'update',
      'updated',
      'apolog',
      'confusion',
      'issue',
      'problem',
      '变更',
      '更新',
      '取消',
      '问题',
      '抱歉',
      '修正',
    ])) {
      return '变更修正';
    }
    final intent = _mailKnowledgeTimelineNormalizedIntent(text);
    if (intent == '账号安全') {
      return '安全验证';
    }
    if (intent == '购买订单') {
      return '交易发生';
    }
    if (intent == '订阅账单') {
      return '账单周期';
    }
    if (intent == '社交通知') {
      return '互动通知';
    }
    if (intent == '反馈调研') {
      return '反馈收集';
    }
    if (intent == '促销折扣') {
      return '促销触达';
    }
    if (intent == '发布更新') {
      return '发布更新';
    }
    return '线索记录';
  }

  String _mailKnowledgeTimelineGroupKey(
    KnowledgeGraphNode node,
    MailKnowledgeDocument document,
    String stage,
    DateTime timestamp,
  ) {
    final subjectKey = _mailKnowledgeTimelineSubjectKey(document.subject);
    final senderKey = _mailKnowledgeSenderKey(document.sender);
    final monthKey = timestamp.year <= 1970
        ? 'unknown'
        : '${timestamp.year}-${timestamp.month.toString().padLeft(2, '0')}';
    final intent =
        node.metadata['事务类型'] ?? (node.kind == 'intent' ? node.label : '');
    final noisy =
        intent == '促销折扣' ||
        intent == '社交通知' ||
        node.kind == 'entity' ||
        node.kind == 'intent';
    if (noisy && senderKey.isNotEmpty) {
      return '$stage|$senderKey|$monthKey';
    }
    return '$stage|$subjectKey';
  }

  String _mailKnowledgeTimelineSubjectKey(String value) {
    final normalized = value
        .toLowerCase()
        .replaceAll(RegExp(r'\b\d{4,}\b'), ' ')
        .replaceAll(RegExp(r'\b\d{1,3}%\b'), ' ')
        .replaceAll(RegExp(r'[^a-z0-9\u4e00-\u9fff]+'), ' ')
        .replaceAll(RegExp(r'\s+'), ' ')
        .trim();
    return normalized.length > 80 ? normalized.substring(0, 80) : normalized;
  }

  String _mailKnowledgeTimelineEventTitle(
    KnowledgeGraphNode node,
    _MailKnowledgeTimelineGroup group,
  ) {
    final documents = group.documents;
    final primary = documents.isEmpty ? null : documents.first;
    if (primary == null) {
      return group.stage;
    }
    final sender = _mailKnowledgeSenderLabel(primary.sender);
    if (sender.isNotEmpty && node.kind != 'entity') {
      return '$sender · ${group.stage}';
    }
    return group.stage;
  }

  String _mailKnowledgeTimelineEventSummary(
    KnowledgeGraphNode node,
    _MailKnowledgeTimelineGroup group,
  ) {
    final documents = group.documents;
    if (documents.isEmpty) {
      return node.label;
    }
    final primary = documents.first;
    final title = primary.subject.trim().isEmpty
        ? primary.fileName.trim()
        : primary.subject.trim();
    final suffix = group.matches.length > 1
        ? '，合并 ${group.matches.length} 封相似证据'
        : '';
    return '$title$suffix';
  }

  List<String> _mailKnowledgeTimelineParticipants(
    List<MailKnowledgeDocument> documents,
  ) {
    final participants = <String>{};
    for (final document in documents) {
      final sender = _mailKnowledgeSenderLabel(document.sender);
      if (sender.isNotEmpty) {
        participants.add(sender);
      }
      final recipient = document.recipients
          .split(RegExp(r'[,;，；]'))
          .first
          .trim();
      if (recipient.isNotEmpty) {
        participants.add(_mailKnowledgeSenderLabel(recipient));
      }
      if (participants.length >= 4) {
        break;
      }
    }
    return participants.take(4).toList(growable: false);
  }

  String _mailKnowledgeSenderLabel(String value) {
    final trimmed = value.trim();
    if (trimmed.isEmpty) {
      return '';
    }
    final angle = RegExp(r'^(.+?)\s*<[^>]+>$').firstMatch(trimmed);
    if (angle != null) {
      return (angle.group(1) ?? '').replaceAll('"', '').trim();
    }
    return trimmed.length > 42 ? trimmed.substring(0, 42) : trimmed;
  }

  String _mailKnowledgeSenderKey(String value) {
    final trimmed = value.trim().toLowerCase();
    final email = RegExp(r'<([^>]+)>').firstMatch(trimmed)?.group(1) ?? trimmed;
    final domain = email.contains('@') ? email.split('@').last : email;
    return domain.replaceAll(RegExp(r'[^a-z0-9.\-]+'), '').trim();
  }

  String _mailKnowledgeTimelineNormalizedIntent(String value) {
    final text = value.toLowerCase();
    if (_containsAny(text, const [
      'marketing',
      'promotion',
      'promo',
      'sale',
      'discount',
      'deal',
      'offer',
      'coupon',
      '促销',
      '折扣',
      '优惠',
      '营销',
    ])) {
      return '促销折扣';
    }
    if (_containsAny(text, const [
      'security',
      'account',
      'verification',
      'login',
      'sign-in',
      'password',
      '安全',
      '账号',
      '验证',
      '登录',
    ])) {
      return '账号安全';
    }
    if (_containsAny(text, const [
      'subscription',
      'renewal',
      'billing',
      'invoice',
      'bill',
      '订阅',
      '续费',
      '账单',
    ])) {
      return '订阅账单';
    }
    if (_containsAny(text, const [
      'purchase',
      'order',
      'payment',
      'transaction',
      'receipt',
      'bought',
      '购买',
      '订单',
      '支付',
      '交易',
    ])) {
      return '购买订单';
    }
    if (_containsAny(text, const [
      'social',
      'notification',
      'message',
      'invite',
      'comment',
      '社交',
      '通知',
      '消息',
      '评论',
    ])) {
      return '社交通知';
    }
    if (_containsAny(text, const [
      'survey',
      'feedback',
      'review',
      'rating',
      '满意',
      '调查',
      '反馈',
      '评价',
    ])) {
      return '反馈调研';
    }
    if (_containsAny(text, const [
      'release',
      'launch',
      'update',
      'new',
      'arrived',
      '发布',
      '上线',
      '更新',
      '新品',
    ])) {
      return '发布更新';
    }
    return '';
  }

  bool _containsAny(String text, List<String> needles) {
    for (final needle in needles) {
      if (text.contains(needle)) {
        return true;
      }
    }
    return false;
  }

  bool _canUseBackgroundKnowledgeGraphSnapshot() {
    final sources = _knowledgeGraphSubscriptionAspect.dataSources;
    return sources.length == 1 && sources.first.sourceId == 'affair';
  }

  Future<void> rebuildMailIndex() async {
    if (!localMailIndexAvailable || rebuildingMailIndex) {
      return;
    }
    if (importingMacOSMail) {
      _setError('请先暂停或等待 Mail.app 导入结束，再重建邮件索引。');
      return;
    }

    rebuildingMailIndex = true;
    refreshingMailIndexStats = true;
    statusMessage = '正在通过本地后台重建邮件索引...';
    statusCaption = expertVocabularyStatusLabel;
    notifyListeners();
    try {
      if (!await _backendApi.ensureDaemon()) {
        throw StateError('本地客户端后台不可用。');
      }
      clientBackendAvailable = true;
      if (connected) {
        await pullExpertVocabulary(
          silent: true,
          applyToMailIndex: true,
        ).catchError((error) {
          _appendLog('重建前同步专家词汇库失败：$error', notify: false);
        });
      } else {
        await _backendApi.rebuildMailIndex();
      }
      final stats = await _backendApi.mailIndexStats();
      if (stats.isNotEmpty) {
        mailIndexStats = MacOSMailIndexStats.fromJson(stats);
        _lastMailIndexStatsRefreshAt = DateTime.now();
      }
      await _refreshClientBackendState(notify: false);
      statusMessage = '本地后台邮件索引已重建。';
      statusCaption = mailIndexStatusLabel;
      _appendLog('本地后台邮件索引重建完成：$mailIndexStatusLabel。');
      _moduleDaemon.emitModuleDataChanged('mail', reason: 'mail-index-rebuilt');
      _notifyKnowledgeDaemon(
        KnowledgeDaemonEvent(
          kind: KnowledgeDaemonEventKind.moduleDataChanged,
          sourceId: 'mail',
          reason: 'mail-index-rebuilt',
        ),
        delay: const Duration(milliseconds: 300),
      );
    } catch (error) {
      _setError('本地后台重建邮件索引失败：$error');
    } finally {
      rebuildingMailIndex = false;
      refreshingMailIndexStats = false;
      notifyListeners();
    }
  }

  Future<void> pauseMacOSMailImport() async {
    if (!importingMacOSMail || mailImportPaused) {
      return;
    }
    try {
      final status = await _backendApi.pauseMailImport();
      _applyBackendMailImportStatus(status);
      mailImportPaused = true;
      statusMessage = 'Mail.app 导入已暂停。';
      statusCaption = '等待继续';
      notifyListeners();
    } catch (error) {
      _setError('暂停 Mail.app 导入失败：$error');
    }
  }

  Future<void> resumeMacOSMailImport() async {
    if (!importingMacOSMail || !mailImportPaused) {
      return;
    }
    try {
      final status = await _backendApi.resumeMailImport();
      _applyBackendMailImportStatus(status);
      mailImportPaused = false;
      statusMessage = 'Mail.app 导入继续执行。';
      statusCaption = '从当前位置继续';
      notifyListeners();
    } catch (error) {
      _setError('继续 Mail.app 导入失败：$error');
    }
  }

  void _resetMailImportProgress() {
    _mailImportUiNotifyTimer?.cancel();
    _mailImportUiNotifyTimer = null;
    _mailImportUiNotifyPending = false;
    _lastMailImportUiNotifyAt = DateTime.fromMillisecondsSinceEpoch(0);
    _lastMailImportQueueSyncAt = DateTime.fromMillisecondsSinceEpoch(0);
    _lastMailImportQueueSyncExportedCount = -1;
    mailImportProgressValue = null;
    mailImportProcessedCount = 0;
    mailImportExportedCount = 0;
    mailImportFailedCount = 0;
    mailImportSkippedCount = 0;
    mailImportTotalCount = 0;
    mailImportCurrentSequence = 0;
    mailImportPaused = false;
    _lastLoggedMailImportBucket = -1;
  }

  bool _backendMailImportStillActive(Map<String, dynamic> status) {
    if (status['running'] == true) {
      return true;
    }
    final state = _stringFrom(status['status']);
    return state == 'running' || state == 'paused' || state == 'cancelling';
  }

  void _applyBackendMailImportStatus(Map<String, dynamic> status) {
    final rawProgress = status['latestProgress'];
    if (rawProgress is Map) {
      _handleMailImportProgress(MacOSMailImportProgress.fromJson(rawProgress));
    } else {
      mailImportPaused = status['paused'] == true;
      _syncMailImportProgressValue();
    }
  }

  String _formatMailImportStatusDiagnostics(Map<String, dynamic> status) {
    final diagnostics = status['diagnostics'] is Map
        ? Map<String, dynamic>.from(status['diagnostics'] as Map)
        : const <String, dynamic>{};
    final scannedMessageCount = _intFrom(diagnostics['scannedMessageCount']);
    final scannedMailboxCount = _intFrom(diagnostics['scannedMailboxCount']);
    final exportedCount = _intFrom(diagnostics['exportedCount']);
    final skippedCount = _intFrom(diagnostics['skippedCount']);
    final failedCount = _intFrom(diagnostics['failedCount']);
    final lastError = _stringFrom(diagnostics['lastError']);
    final fields = [
      '扫描 $scannedMessageCount 封邮件 / $scannedMailboxCount 个邮箱',
      '导出 $exportedCount',
      '跳过 $skippedCount',
      '失败 $failedCount',
      if (lastError.isNotEmpty) '最后错误 $lastError',
    ];
    return fields.join('；');
  }

  int _intFrom(Object? value) {
    if (value is num) {
      return value.toInt();
    }
    return int.tryParse((value ?? '').toString()) ?? 0;
  }

  String _stringFrom(Object? value) {
    return (value ?? '').toString();
  }

  void _handleMailImportProgress(MacOSMailImportProgress progress) {
    if (!importingMacOSMail &&
        progress.kind != MacOSMailImportProgressKind.started) {
      return;
    }

    _scheduleMailImportWatchdog(_mailImportRunToken);
    mailImportExportedCount = progress.exportedCount;
    mailImportFailedCount = progress.failedCount;
    mailImportSkippedCount = progress.skippedCount;
    if (progress.totalCount > 0) {
      mailImportTotalCount = progress.totalCount;
    }

    switch (progress.kind) {
      case MacOSMailImportProgressKind.started:
        _resetMailImportProgress();
        statusMessage = 'Mail.app 已响应，正在准备扫描邮箱。';
        statusCaption = 'Mail.app 已连接';
      case MacOSMailImportProgressKind.scanning:
        mailImportProcessedCount = math.max(
          mailImportProcessedCount,
          progress.sequence,
        );
        final scanned = progress.sequence > 0
            ? '已发现 ${progress.sequence} 封邮件'
            : '正在读取邮箱';
        statusMessage = progress.title.trim().isEmpty
            ? '正在扫描 Mail.app 邮箱：$scanned。'
            : '正在扫描 Mail.app 邮箱：${progress.title}，$scanned。';
        statusCaption = '扫描邮箱中';
      case MacOSMailImportProgressKind.planned:
        mailImportTotalCount = progress.totalCount;
        statusMessage = '已扫描 ${progress.totalCount} 封邮件，开始导出。';
        statusCaption = '导出队列已建立';
        _appendLog(
          'Mail.app 扫描完成：共 ${progress.totalCount} 封邮件，开始导出。',
          notify: false,
        );
      case MacOSMailImportProgressKind.processing:
        if (progress.sequence > 0) {
          mailImportCurrentSequence = progress.sequence;
          mailImportProcessedCount = math.max(
            mailImportProcessedCount,
            progress.sequence - 1,
          );
        }
      case MacOSMailImportProgressKind.exported:
        mailImportProcessedCount = math.max(
          mailImportProcessedCount,
          progress.sequence,
        );
        _appendLog(
          _formatMailImportProgressDetail(progress),
          notify: false,
          visible: _shouldShowMailImportDetailInMemory(progress),
        );
      case MacOSMailImportProgressKind.skipped:
        mailImportProcessedCount = math.max(
          mailImportProcessedCount,
          progress.sequence,
        );
        _appendLog(
          _formatMailImportProgressDetail(progress),
          notify: false,
          visible: _shouldShowMailImportDetailInMemory(progress),
        );
      case MacOSMailImportProgressKind.failed:
        mailImportProcessedCount = math.max(
          mailImportProcessedCount,
          progress.sequence,
        );
        _appendLog(
          _formatMailImportProgressDetail(progress),
          notify: false,
          visible: _shouldShowMailImportDetailInMemory(progress),
        );
      case MacOSMailImportProgressKind.paused:
        mailImportPaused = true;
        statusMessage = 'Mail.app 导入已暂停。';
        statusCaption = _mailImportProgressLabel();
      case MacOSMailImportProgressKind.resumed:
        mailImportPaused = false;
        statusMessage = 'Mail.app 导入继续执行。';
        statusCaption = _mailImportProgressLabel();
      case MacOSMailImportProgressKind.completed:
        if (mailImportTotalCount > 0) {
          mailImportProcessedCount = mailImportTotalCount;
        }
        mailImportProgressValue = 1;
      case MacOSMailImportProgressKind.unknown:
        break;
    }

    if (progress.kind != MacOSMailImportProgressKind.completed) {
      _syncMailImportProgressValue();
      if (mailImportTotalCount > 0 &&
          progress.kind != MacOSMailImportProgressKind.started &&
          progress.kind != MacOSMailImportProgressKind.planned) {
        final label = _mailImportProgressLabel();
        statusMessage = '正在导出 Mail.app 邮件：$label';
        statusCaption = 'Mail.app 导入中';
        _appendMailImportProgressLogIfNeeded(notify: false);
      }
    }

    _notifyMailImportProgress(
      immediate: switch (progress.kind) {
        MacOSMailImportProgressKind.started ||
        MacOSMailImportProgressKind.planned ||
        MacOSMailImportProgressKind.paused ||
        MacOSMailImportProgressKind.resumed ||
        MacOSMailImportProgressKind.completed => true,
        _ => false,
      },
    );
  }

  bool _shouldShowMailImportDetailInMemory(MacOSMailImportProgress progress) {
    if (progress.kind == MacOSMailImportProgressKind.failed) {
      return true;
    }
    if (progress.sequence <= 10) {
      return true;
    }
    if (progress.totalCount > 0 && progress.sequence >= progress.totalCount) {
      return true;
    }
    return progress.sequence % _mailImportVisibleDetailLogStep == 0;
  }

  void _notifyMailImportProgress({required bool immediate}) {
    if (immediate) {
      _mailImportUiNotifyTimer?.cancel();
      _mailImportUiNotifyTimer = null;
      _mailImportUiNotifyPending = false;
      _lastMailImportUiNotifyAt = DateTime.now();
      notifyListeners();
      return;
    }

    final now = DateTime.now();
    final elapsed = now.difference(_lastMailImportUiNotifyAt);
    if (elapsed >= _mailImportUiNotifyInterval) {
      _lastMailImportUiNotifyAt = now;
      notifyListeners();
      return;
    }
    if (_mailImportUiNotifyPending) {
      return;
    }

    _mailImportUiNotifyPending = true;
    _mailImportUiNotifyTimer?.cancel();
    _mailImportUiNotifyTimer = Timer(_mailImportUiNotifyInterval - elapsed, () {
      _mailImportUiNotifyTimer = null;
      if (!_mailImportUiNotifyPending) {
        return;
      }
      _mailImportUiNotifyPending = false;
      _lastMailImportUiNotifyAt = DateTime.now();
      notifyListeners();
    });
  }

  void _scheduleMailImportWatchdog(int runToken) {
    _mailImportWatchdogTimer?.cancel();
    if (!importingMacOSMail || runToken != _mailImportRunToken) {
      return;
    }
    _mailImportWatchdogTimer = Timer(_mailImportStallTimeout, () {
      unawaited(_handleMailImportStalled(runToken));
    });
  }

  void _stopMailImportWatchdog() {
    _mailImportWatchdogTimer?.cancel();
    _mailImportWatchdogTimer = null;
  }

  Future<void> _handleMailImportStalled(int runToken) async {
    if (!importingMacOSMail || runToken != _mailImportRunToken) {
      return;
    }

    _mailImportRunToken++;
    _stopMailImportWatchdog();
    importingMacOSMail = false;
    mailImportPaused = false;
    final label = _mailImportProgressLabel();
    statusMessage = 'Mail.app 导入长时间没有进度，已自动中断并复位。';
    statusCaption = '导入已复位';
    _appendLog(
      'Mail.app 导入超过 ${_mailImportStallTimeout.inSeconds} 秒没有进度，已自动取消并复位按钮状态。当前进度：$label。',
    );
    notifyListeners();

    try {
      await _backendApi.cancelMailImport();
    } catch (error) {
      _appendLog('发送 Mail.app 导入取消信号失败：$error');
    }
  }

  String _mailImportProgressLabel() {
    if (mailImportTotalCount <= 0) {
      return '等待扫描结果';
    }
    final completed = math.min(
      mailImportTotalCount,
      math.max(0, mailImportProcessedCount),
    );
    final percent = (completed / mailImportTotalCount * 100).toStringAsFixed(1);
    return '$completed/$mailImportTotalCount ($percent%)';
  }

  void _appendMailImportProgressLogIfNeeded({bool notify = true}) {
    if (mailImportTotalCount <= 0) {
      return;
    }
    final bucket = (mailImportProgressValue ?? 0) ~/ 0.05;
    if (bucket <= _lastLoggedMailImportBucket) {
      return;
    }
    _lastLoggedMailImportBucket = bucket;
    _appendLog('Mail.app 导入进度：${_mailImportProgressLabel()}。', notify: notify);
  }

  String _formatMailImportProgressDetail(MacOSMailImportProgress progress) {
    final action = switch (progress.kind) {
      MacOSMailImportProgressKind.exported => '已导出',
      MacOSMailImportProgressKind.skipped => '已跳过',
      MacOSMailImportProgressKind.failed => '导出失败',
      _ => progress.kind.name,
    };
    final errorText = _normalizedMailError(progress);
    final fields = <String>[
      'Mail.app 邮件$action',
      '序号 ${progress.sequence}/${progress.totalCount}',
      '计数 导出 ${progress.exportedCount} / 跳过 ${progress.skippedCount} / 失败 ${progress.failedCount}',
      '状态 ${_mailLogValue(progress.status.isEmpty ? progress.kind.name : progress.status)}',
      '账号 ${_mailLogValue(progress.account)}',
      '邮箱路径 ${_mailLogValue(progress.mailboxPath)}',
      '标题 ${_mailLogValue(progress.title)}',
      'messageKey ${_mailLogValue(progress.messageKey)}',
      '发件人 ${_mailLogValue(progress.sender)}',
      '收件人 ${_mailLogValue(progress.recipients)}',
      '抄送 ${_mailLogValue(progress.cc)}',
      '发送时间 ${_mailLogValue(progress.dateSent)}',
      '接收时间 ${_mailLogValue(progress.dateReceived)}',
      '文件名 ${_mailLogValue(progress.fileName.isEmpty ? progress.detail : progress.fileName)}',
      '文件路径 ${_mailLogValue(_mailImportFilePath(progress))}',
      'SHA-256 ${_mailLogValue(progress.sourceHash)}',
      '字节数 ${progress.byteSize > 0 ? '${progress.byteSize} (${_formatBytes(progress.byteSize)})' : '-'}',
    ];
    if (errorText.isNotEmpty) {
      fields.add('错误 $errorText');
    }
    return fields.join('；');
  }

  String _normalizedMailError(MacOSMailImportProgress progress) {
    final rawError = progress.error.trim();
    final detail = progress.detail.trim();
    if (rawError.isNotEmpty && rawError != '-') {
      return rawError;
    }
    if (progress.kind == MacOSMailImportProgressKind.failed &&
        detail.isNotEmpty &&
        detail != '-') {
      return detail;
    }
    return '';
  }

  String _mailImportFilePath(MacOSMailImportProgress progress) {
    final fileName = progress.fileName.isEmpty
        ? progress.detail
        : progress.fileName;
    if (progress.exportDirectory.isEmpty || fileName.isEmpty) {
      return '';
    }
    return p.join(progress.exportDirectory, fileName);
  }

  String _mailLogValue(String value) {
    final trimmed = value.trim();
    return trimmed.isEmpty ? '-' : trimmed;
  }

  void _syncMailImportProgressValue() {
    if (mailImportTotalCount <= 0) {
      mailImportProgressValue = null;
      return;
    }
    final completed = math.min(
      mailImportTotalCount,
      math.max(0, mailImportProcessedCount),
    );
    mailImportProgressValue = completed / mailImportTotalCount;
  }

  Future<List<QueuedFile>> _collectQueuedFilesFromDirectory(
    String directoryPath, {
    bool includeAllFiles = false,
  }) async {
    final additions = <QueuedFile>[];
    try {
      await for (final entity in Directory(
        directoryPath,
      ).list(recursive: true, followLinks: false)) {
        if (entity is! File) {
          continue;
        }
        final entityPath = entity.path;
        final extension = p
            .extension(entityPath)
            .replaceFirst('.', '')
            .toLowerCase();
        if (!includeAllFiles && !_supportedExtensions.contains(extension)) {
          continue;
        }
        try {
          additions.add(
            await _queuedFileFromPath(
              entityPath,
              rootDirectory: p.dirname(directoryPath),
            ),
          );
        } catch (_) {
          continue;
        }
      }
    } catch (_) {
      return additions;
    }
    return additions;
  }

  void clearQueue() {
    queuedFiles = const [];
    uploadSessionPageIndex = 0;
    statusMessage = '队列已清空。';
    statusCaption = '本地队列已重置';
    notifyListeners();
  }

  Future<void> clearUploadSessionHistory() async {
    checkpointStore = CheckpointStore();
    selectedCheckpointId = '';
    selectedUploadSessionId = '';
    uploadSessionPageIndex = 0;
    activeUploadSession = null;
    _stopUploadSessionWatch();
    _syncSelections();
    await _persistCheckpointStore();
    statusMessage = '上传记录已清空。';
    statusCaption = '历史上传会话已重置';
    notifyListeners();
  }

  Future<void> executePayload() async {
    if (busy) {
      return;
    }
    if (inputText.trim().isEmpty && queuedFiles.isEmpty) {
      _setError('请提供输入文本或至少添加一个文件。');
      return;
    }
    var targetServiceUrl = resolvedServiceUrl;
    if (targetServiceUrl.isEmpty && bootstrapUrl.isNotEmpty) {
      targetServiceUrl = PactServiceUrls.normalizeBaseUrl(bootstrapUrl);
    }
    if (targetServiceUrl.isEmpty) {
      _setError('请先配置服务端地址。服务端暂时不可用时，客户端会先保存任务并在恢复后自动接续。');
      return;
    }
    if (!connected && bootstrapUrl.isNotEmpty) {
      await connect(silent: true);
      if (resolvedServiceUrl.isNotEmpty) {
        targetServiceUrl = resolvedServiceUrl;
      }
    }

    busy = true;
    activeJob = null;
    activeResult = null;
    inspectedResult = null;
    inspectedResultJobId = '';
    _notifyKnowledgeDaemon(
      KnowledgeDaemonEvent(
        kind: KnowledgeDaemonEventKind.resultChanged,
        sourceId: 'result',
        reason: 'submission-started',
      ),
      delay: const Duration(milliseconds: 120),
    );
    packagingProgress = 0;
    uploadProgress = 0;
    statusMessage = '正在准备检查点清单...';
    statusCaption = '本地清单组装中';
    lastError = '';
    notifyListeners();

    var checkpointId = '';
    try {
      if (!await _backendApi.ensureDaemon()) {
        throw StateError('本地客户端后台不可用。');
      }
      clientBackendAvailable = true;
      statusMessage = '正在通过本地后台提交任务...';
      statusCaption = '后端上传与任务编排中';
      notifyListeners();

      final response = await _backendApi.submitPipeline(
        serviceBaseUrl: targetServiceUrl,
        inputText: inputText.trim(),
        files: queuedFiles.map((file) => file.toJson()).toList(),
        settings: _defaultSettings,
      );
      checkpointId = _stringFrom(response['checkpointId']);
      selectedCheckpointId = checkpointId;
      final rawJob = response['job'];
      final rawJobMap = rawJob is Map
          ? Map<String, dynamic>.from(rawJob)
          : null;
      final rawTask = response['task'];
      final rawTaskMap = rawTask is Map
          ? Map<String, dynamic>.from(rawTask)
          : null;
      final taskStatus = _stringFrom(rawTaskMap?['status']);
      if (rawTaskMap != null &&
          (taskStatus == 'waiting_server' ||
              rawJobMap == null ||
              _stringFrom(rawJobMap['id']).isEmpty)) {
        _recordBackendQueuedCheckpoint(
          checkpointId: checkpointId,
          submittedText: inputText.trim(),
          submittedFiles: queuedFiles,
          task: rawTaskMap,
          manifestDigest: _stringFrom(response['manifestDigest']),
          serviceUrl: targetServiceUrl,
        );
        uploadProgress = ((rawTaskMap['progress'] as num?)?.toDouble() ?? 0)
            .clamp(0, 1);
        packagingProgress = 1;
        await _persistCheckpointStore();
        if (taskStatus == 'waiting_server') {
          statusMessage = '服务端暂不可用，任务已保存到本地恢复队列。';
          statusCaption = '恢复后自动续传';
          _appendLog(
            '任务 ${_stringFrom(rawTaskMap['taskId'])} 已进入可恢复队列，服务端恢复后会自动接续。',
          );
        } else {
          statusMessage = '任务已进入本地后台队列。';
          statusCaption = '后台自动处理';
          _appendLog('任务 ${_stringFrom(rawTaskMap['taskId'])} 已加入本地后台队列。');
        }
        return;
      }
      if (rawJobMap == null) {
        throw StateError('本地后台没有返回任务状态。');
      }
      final job = SplitJob.fromJson(rawJobMap);
      activeJob = job;
      final rawResult = response['result'];
      activeResult = rawResult is Map
          ? Map<String, dynamic>.from(rawResult)
          : null;
      final rawSession = response['uploadSession'];
      if (rawSession is Map) {
        activeUploadSession = UploadSessionInfo.fromJson(
          Map<String, dynamic>.from(rawSession),
        );
        if (checkpointId.isEmpty) {
          checkpointId = activeUploadSession?.checkpointId ?? '';
          selectedCheckpointId = checkpointId;
        }
        selectedUploadSessionId = activeUploadSession?.sessionId ?? '';
      }
      uploadProgress = 1;
      packagingProgress = 1;

      if (checkpointId.isNotEmpty) {
        _recordBackendPipelineCheckpoint(
          checkpointId: checkpointId,
          submittedText: inputText.trim(),
          submittedFiles: queuedFiles,
          job: job,
          uploadSession: activeUploadSession,
          manifestDigest: _stringFrom(response['manifestDigest']),
          serviceUrl: targetServiceUrl,
        );
        await _persistCheckpointStore();
      }

      _upsertRun(
        RecentRun(
          jobId: job.id,
          createdAt: DateTime.now().toIso8601String(),
          status: job.status,
          stage: displayStageLabel(job.stage),
          inputPreview: _inputPreview(),
          fileCount: queuedFiles.length,
          serviceUrl: resolvedServiceUrl,
          progressPercent: job.progressPercent,
        ),
      );
      selectedRunId = job.id;
      await _persistRuns();
      if (job.isCompleted && activeResult != null) {
        try {
          await _backendApi.syncKnowledgeCache(
            serviceBaseUrl: targetServiceUrl,
            pushOutbox: false,
          );
        } catch (error) {
          _appendLog('任务完成后的本地知识库同步失败：$error', notify: false);
        }
        _notifyKnowledgeDaemon(
          KnowledgeDaemonEvent(
            kind: KnowledgeDaemonEventKind.resultChanged,
            sourceId: 'result',
            reason: 'job-completed',
          ),
          delay: const Duration(milliseconds: 220),
        );
        statusMessage = '结果载荷已就绪。';
        statusCaption = '导出功能已解锁';
        _appendLog('本地后台已完成任务 ${job.id} 并下载结果载荷。');
      } else {
        throw ApiException(job.error.isNotEmpty ? job.error : '任务未成功完成。');
      }
    } catch (error) {
      if (checkpointId.isNotEmpty) {
        if (_isRecoverableError(error)) {
          checkpointStore.markNetworkInterrupted(
            checkpointId,
            error.toString(),
          );
          statusCaption = '检查点可恢复';
        } else {
          checkpointStore.markFailed(checkpointId, error.toString());
        }
        selectedCheckpointId = checkpointId;
        await _persistCheckpointStore();
      }
      _setError('执行失败：$error');
    } finally {
      busy = false;
      notifyListeners();
    }
  }

  Future<void> exportResult(ExportKind kind) async {
    if (!hasResult) {
      _setError('当前还没有可导出的结果载荷。');
      return;
    }

    try {
      final artifact = switch (kind) {
        ExportKind.sourceLogs => ExportArtifact(
          fileName: 'pact-source-logs.txt',
          bytes: utf8.encode(logs.join('\n')),
          contentType: 'text/plain',
        ),
        _ => await _backendApi.exportResult(
          serviceBaseUrl: resolvedServiceUrl,
          result: activeResult!,
          format: kind,
        ),
      };

      final exportsDirectory = await _storage.exportsDirectory();
      final location = await getSaveLocation(
        suggestedName: artifact.fileName,
        initialDirectory: exportsDirectory.path,
      );
      if (location == null) {
        return;
      }

      final file = File(location.path);
      await file.parent.create(recursive: true);
      await file.writeAsBytes(artifact.bytes);
      statusMessage = '导出文件已写入 ${file.path}';
      statusCaption = kind.label;
      _appendLog('${kind.label}已导出到 ${file.path}。');
      notifyListeners();
    } catch (error) {
      _setError('导出失败：$error');
    }
  }

  Future<void> copyResultPreview() async {
    if (!hasResult) {
      _setError('当前还没有可复制的结果载荷。');
      return;
    }

    await Clipboard.setData(ClipboardData(text: resultPreview));
    statusMessage = '结果载荷已复制到剪贴板。';
    statusCaption = '结果已复制';
    _appendLog('已将当前结果载荷复制到剪贴板。');
    notifyListeners();
  }

  Future<void> copyLogs() async {
    if (logs.isEmpty) {
      _setError('当前还没有可复制的日志。');
      return;
    }

    final allLogs = (await _storage.loadAllClientLogs()).reversed.toList();
    await Clipboard.setData(
      ClipboardData(text: (allLogs.isEmpty ? logs : allLogs).join('\n')),
    );
    statusMessage = '日志文本已复制到剪贴板。';
    statusCaption = '日志已复制';
    _appendLog('已复制当前日志文本。');
    notifyListeners();
  }

  Future<void> openPortableDataDirectory() async {
    try {
      final directory = await _storage.dataDirectory();
      await _openPath(directory.path, label: '便携数据目录');
    } catch (error) {
      _setError('打开便携数据目录失败：$error');
    }
  }

  Future<void> openMailWorkspaceDirectory() async {
    try {
      final dataDirectory = await _storage.dataDirectory();
      final directory = Directory(_mailWorkspacePath(dataDirectory));
      await directory.create(recursive: true);
      await Directory(
        p.join(directory.path, 'downloads'),
      ).create(recursive: true);
      await Directory(p.join(directory.path, 'index')).create(recursive: true);
      await Directory(p.join(directory.path, 'tmp')).create(recursive: true);
      await _openPath(directory.path, label: '邮箱工作空间');
    } catch (error) {
      _setError('打开邮箱工作空间失败：$error');
    }
  }

  Future<void> openExportsDirectory() async {
    try {
      final directory = await _storage.exportsDirectory();
      await _openPath(directory.path, label: '导出目录');
    } catch (error) {
      _setError('打开导出目录失败：$error');
    }
  }

  void clearLogs() {
    logs = <String>[];
    _logsMutable = true;
    lastError = '';
    statusMessage = '本地日志已清空。';
    statusCaption = '日志已重置';
    unawaited(_storage.clearClientLogs());
    notifyListeners();
  }

  Future<QueuedFile> _queuedFileFromPath(
    String filePath, {
    String? rootDirectory,
  }) async {
    final stat = await File(filePath).stat();
    final relativePath = rootDirectory == null
        ? p.basename(filePath)
        : p.relative(filePath, from: rootDirectory);
    return QueuedFile(
      path: filePath,
      name: p.basename(filePath),
      relativePath: relativePath,
      byteSize: stat.size,
      mediaType: lookupMimeType(filePath) ?? 'application/octet-stream',
    );
  }

  int _mergeQueuedFiles(
    List<QueuedFile> additions, {
    bool updateStatus = true,
    bool notify = true,
  }) {
    final previousCount = queuedFiles.length;
    final merged = <String, QueuedFile>{
      for (final file in queuedFiles) file.path: file,
    };
    for (final file in additions) {
      merged[file.path] = file;
    }
    queuedFiles = merged.values.toList()
      ..sort((left, right) => left.relativePath.compareTo(right.relativePath));
    if (updateStatus) {
      statusMessage = '已加入 ${queuedFiles.length} 个文件。';
      statusCaption = '本地队列已更新';
    }
    if (notify) {
      notifyListeners();
    }
    return queuedFiles.length - previousCount;
  }

  void _upsertRun(RecentRun run) {
    final next = [...recentRuns];
    final index = next.indexWhere((item) => item.jobId == run.jobId);
    if (index >= 0) {
      next[index] = run;
    } else {
      next.insert(0, run);
    }
    recentRuns = next.take(12).toList();
  }

  Future<void> _persistRuns() async {
    await _storage.saveRecentRuns(recentRuns);
  }

  Future<void> _persistCheckpointStore() async {
    _syncSelections();
    await _storage.saveCheckpointStore(checkpointStore);
    notifyListeners();
  }

  void _recordBackendPipelineCheckpoint({
    required String? checkpointId,
    required String submittedText,
    required List<QueuedFile> submittedFiles,
    required SplitJob job,
    required UploadSessionInfo? uploadSession,
    required String manifestDigest,
    required String serviceUrl,
  }) {
    final normalizedCheckpointId = checkpointId?.trim() ?? '';
    if (normalizedCheckpointId.isEmpty) {
      return;
    }

    final now = nowIsoString();
    final uploadFilesByRelativePath = {
      for (final file
          in uploadSession?.files ?? const <UploadSessionFileInfo>[])
        if (file.relativePath.isNotEmpty) file.relativePath: file,
    };
    final fileRecords = uploadSession?.files.isNotEmpty == true
        ? uploadSession!.files
              .map(
                (file) => CheckpointFileRecord(
                  label: file.name.isNotEmpty ? file.name : file.relativePath,
                  relativePath: file.relativePath,
                  sha256: file.sha256,
                  byteSize: file.byteSize,
                ),
              )
              .toList()
        : submittedFiles
              .map(
                (file) => CheckpointFileRecord(
                  label: file.name,
                  relativePath: file.relativePath,
                  sha256: '',
                  byteSize: file.byteSize,
                ),
              )
              .toList();
    final localFiles = submittedFiles.map((file) {
      final uploaded = uploadFilesByRelativePath[file.relativePath];
      return CheckpointLocalFile(
        path: file.path,
        label: file.name,
        relativePath: file.relativePath,
        sha256: uploaded?.sha256 ?? '',
        byteSize: file.byteSize,
        mediaType: file.mediaType,
      );
    }).toList();
    final effectiveManifestDigest = manifestDigest.isNotEmpty
        ? manifestDigest
        : uploadSession?.manifestDigest ?? '';
    final node =
        checkpointStore.findNode(normalizedCheckpointId) ??
        CheckpointNode(
          checkpointId: normalizedCheckpointId,
          treeRootId: normalizedCheckpointId,
          branchRootId: normalizedCheckpointId,
          mode: CheckpointMode.initial,
          createdAt: now,
        );
    if (!checkpointStore.nodes.contains(node)) {
      checkpointStore.nodes.add(node);
    }

    node.state = job.isCompleted
        ? CheckpointState.clientConfirmed
        : CheckpointState.serverProcessing;
    node.updatedAt = now;
    node.inputDigest = uploadSession?.inputDigest ?? node.inputDigest;
    node.inputText = submittedText;
    node.manifestDigest = effectiveManifestDigest;
    node.summary = _inputPreview();
    node.fileCount = submittedFiles.length;
    node.fileRecords = fileRecords;
    node.localFiles = localFiles;
    node.localVerifiedAt = node.localVerifiedAt.isEmpty
        ? now
        : node.localVerifiedAt;
    node.uploadVerifiedAt = uploadSession == null
        ? node.uploadVerifiedAt
        : (node.uploadVerifiedAt.isEmpty ? now : node.uploadVerifiedAt);
    node.uploadSessionId = uploadSession?.sessionId ?? node.uploadSessionId;
    node.uploadSessionServiceUrl = uploadSession == null
        ? node.uploadSessionServiceUrl
        : serviceUrl;
    node.serverProcessingAt = node.serverProcessingAt.isEmpty
        ? now
        : node.serverProcessingAt;
    node.serverCompletedAt = job.isCompleted ? now : node.serverCompletedAt;
    node.clientConfirmedAt = job.isCompleted ? now : node.clientConfirmedAt;
    node.serverJobId = job.id;
    node.serverServiceUrl = serviceUrl;
    node.serverVerifiedManifestDigest = effectiveManifestDigest;
    node.serverVerifiedFileCount =
        uploadSession?.files.length ?? submittedFiles.length;
    node.lastError = '';

    checkpointStore.activeCheckpointId = normalizedCheckpointId;
    checkpointStore.networkResumeCheckpointId = '';
    checkpointStore.manualBranchAnchorId = '';
    selectedCheckpointId = normalizedCheckpointId;
    selectedUploadSessionId =
        uploadSession?.sessionId ?? selectedUploadSessionId;
  }

  void _recordBackendQueuedCheckpoint({
    required String? checkpointId,
    required String submittedText,
    required List<QueuedFile> submittedFiles,
    required Map<String, dynamic> task,
    required String manifestDigest,
    required String serviceUrl,
  }) {
    final normalizedCheckpointId = checkpointId?.trim() ?? '';
    if (normalizedCheckpointId.isEmpty) {
      return;
    }

    final now = nowIsoString();
    final node =
        checkpointStore.findNode(normalizedCheckpointId) ??
        CheckpointNode(
          checkpointId: normalizedCheckpointId,
          treeRootId: normalizedCheckpointId,
          branchRootId: normalizedCheckpointId,
          mode: CheckpointMode.initial,
          createdAt: now,
        );
    if (!checkpointStore.nodes.contains(node)) {
      checkpointStore.nodes.add(node);
    }

    final taskStatus = _stringFrom(task['status']);
    final rawSession = task['uploadSession'];
    final uploadSession = rawSession is Map
        ? UploadSessionInfo.fromJson(Map<String, dynamic>.from(rawSession))
        : null;
    final rawJob = task['job'];
    final jobId = rawJob is Map ? _stringFrom(rawJob['id']) : '';
    final uploadFilesByRelativePath = {
      for (final file
          in uploadSession?.files ?? const <UploadSessionFileInfo>[])
        if (file.relativePath.isNotEmpty) file.relativePath: file,
    };
    final fileRecords = uploadSession?.files.isNotEmpty == true
        ? uploadSession!.files
              .map(
                (file) => CheckpointFileRecord(
                  label: file.name.isNotEmpty ? file.name : file.relativePath,
                  relativePath: file.relativePath,
                  sha256: file.sha256,
                  byteSize: file.byteSize,
                ),
              )
              .toList()
        : submittedFiles
              .map(
                (file) => CheckpointFileRecord(
                  label: file.name,
                  relativePath: file.relativePath,
                  sha256: '',
                  byteSize: file.byteSize,
                ),
              )
              .toList();
    final localFiles = submittedFiles.map((file) {
      final uploaded = uploadFilesByRelativePath[file.relativePath];
      return CheckpointLocalFile(
        path: file.path,
        label: file.name,
        relativePath: file.relativePath,
        sha256: uploaded?.sha256 ?? '',
        byteSize: file.byteSize,
        mediaType: file.mediaType,
      );
    }).toList();

    node.state = taskStatus == 'waiting_server'
        ? CheckpointState.networkInterrupted
        : jobId.isEmpty
        ? CheckpointState.filesConfirmed
        : CheckpointState.serverProcessing;
    node.updatedAt = now;
    node.inputDigest = uploadSession?.inputDigest ?? node.inputDigest;
    node.inputText = submittedText;
    node.manifestDigest = manifestDigest.isNotEmpty
        ? manifestDigest
        : uploadSession?.manifestDigest ?? node.manifestDigest;
    node.summary = _inputPreview();
    node.fileCount = submittedFiles.length;
    node.fileRecords = fileRecords;
    node.localFiles = localFiles;
    node.localVerifiedAt = node.localVerifiedAt.isEmpty
        ? now
        : node.localVerifiedAt;
    node.uploadVerifiedAt = uploadSession == null
        ? node.uploadVerifiedAt
        : (node.uploadVerifiedAt.isEmpty ? now : node.uploadVerifiedAt);
    node.uploadSessionId = uploadSession?.sessionId ?? node.uploadSessionId;
    node.uploadSessionServiceUrl = uploadSession == null
        ? node.uploadSessionServiceUrl
        : serviceUrl;
    node.serverJobId = jobId;
    node.serverServiceUrl = serviceUrl;
    node.serverVerifiedManifestDigest = node.manifestDigest;
    node.serverVerifiedFileCount =
        uploadSession?.files.length ?? submittedFiles.length;
    node.lastError = _stringFrom(task['error']);
    if (taskStatus == 'waiting_server') {
      node.networkInterruptedAt = now;
      checkpointStore.networkResumeCheckpointId = normalizedCheckpointId;
    } else {
      checkpointStore.networkResumeCheckpointId = '';
    }

    checkpointStore.activeCheckpointId = normalizedCheckpointId;
    checkpointStore.manualBranchAnchorId = '';
    selectedCheckpointId = normalizedCheckpointId;
    selectedUploadSessionId =
        uploadSession?.sessionId ?? selectedUploadSessionId;
  }

  void _syncSelections() {
    if (selectedCheckpointId.isNotEmpty &&
        checkpointStore.findNode(selectedCheckpointId) == null) {
      selectedCheckpointId = '';
    }
    if (selectedCheckpointId.isEmpty && checkpointEntries.isNotEmpty) {
      selectedCheckpointId = checkpointEntries.first.checkpointId;
    }

    final uploadNode = selectedUploadSessionId.isEmpty
        ? null
        : checkpointStore.findNodeByUploadSessionId(selectedUploadSessionId);
    if (selectedUploadSessionId.isNotEmpty && uploadNode == null) {
      selectedUploadSessionId = '';
    }

    if (selectedUploadSessionId.isEmpty) {
      final selected = selectedCheckpoint;
      if (selected != null && selected.uploadSessionId.isNotEmpty) {
        selectedUploadSessionId = selected.uploadSessionId;
      } else if (uploadSessionEntries.isNotEmpty) {
        selectedUploadSessionId = uploadSessionEntries.first.uploadSessionId;
      }
    }
    _syncUploadSessionPage();
    if (selectedUploadSessionId.isNotEmpty) {
      final selectedIndex = uploadSessionEntries.indexWhere(
        (item) => item.uploadSessionId == selectedUploadSessionId,
      );
      if (selectedIndex >= 0) {
        uploadSessionPageIndex = selectedIndex ~/ uploadSessionPageSize;
      }
    }
  }

  void _appendLog(String line, {bool notify = true, bool visible = true}) {
    final entry = '${DateTime.now().toIso8601String()}  $line';
    if (visible) {
      if (!_logsMutable) {
        logs = List<String>.of(logs, growable: true);
        _logsMutable = true;
      }
      logs.insert(0, entry);
      if (logs.length > _visibleLogLimit) {
        logs.removeRange(_visibleLogLimit, logs.length);
      }
    }
    unawaited(_storage.appendClientLogLine(entry).catchError((_) {}));
    if (notify) {
      notifyListeners();
    }
  }

  void reportDragStatus(String message, String caption) {
    statusMessage = message;
    statusCaption = caption;
    _appendLog(message);
  }

  void _setError(String message) {
    lastError = message;
    statusMessage = message;
    statusCaption = '需要人工处理';
    _appendLog(message);
  }

  bool _isRecoverableError(Object error) {
    if (error is SocketException ||
        error is TimeoutException ||
        error is HttpException ||
        error is ClientException) {
      return true;
    }
    if (error is ApiException) {
      final statusCode = error.statusCode;
      return statusCode == null || statusCode >= 500 || statusCode == 409;
    }
    return false;
  }

  Future<void> _openPath(String path, {required String label}) async {
    final executable = switch (Platform.operatingSystem) {
      'macos' => 'open',
      'windows' => 'explorer',
      _ => 'xdg-open',
    };
    final arguments = switch (Platform.operatingSystem) {
      'windows' => <String>[p.windows.normalize(path)],
      _ => <String>[path],
    };
    final result = await Process.run(executable, arguments);
    if (result.exitCode != 0) {
      throw ProcessException(
        executable,
        arguments,
        result.stderr?.toString() ?? '',
        result.exitCode,
      );
    }
    statusMessage = '$label已在系统中打开。';
    statusCaption = '外部目录已打开';
    _appendLog('$label已打开：$path');
  }

  List<Map<String, dynamic>> _extractList(
    Map<String, dynamic>? result,
    String key,
  ) {
    if (result == null) {
      return const [];
    }

    final direct = result[key];
    if (direct is List) {
      return direct
          .whereType<Map>()
          .map((item) => Map<String, dynamic>.from(item))
          .toList();
    }

    final nested = result['result'];
    if (nested is Map<String, dynamic>) {
      final nestedValue = nested[key];
      if (nestedValue is List) {
        return nestedValue
            .whereType<Map>()
            .map((item) => Map<String, dynamic>.from(item))
            .toList();
      }
    }

    return const [];
  }

  KnowledgeGraphContext _knowledgeGraphContext() {
    return KnowledgeGraphContext(
      mailDocuments: mailKnowledgeDocuments,
      mailSemanticSuggestions: mailKnowledgeSemanticSuggestions,
      people: peopleItems,
      transactions: transactionItems,
      emailAnalysisModuleSupported: localMailIndexAvailable,
      emailAnalysisModuleEnabled: emailAnalysisModuleEnabled,
      importingMacOSMail: importingMacOSMail,
      mailImportPaused: mailImportPaused,
      mailImportDownloadedCount: mailImportDownloadedCount,
      mailImportTotalCount: mailImportTotalCount,
      mailIndexStats: mailIndexStats,
    );
  }

  void _markKnowledgeGraphDirty() {
    _knowledgeGraphDirty = true;
  }

  void _syncKnowledgeGraph({bool force = false}) {
    if (_syncingKnowledgeGraph || (!force && !_knowledgeGraphDirty)) {
      return;
    }
    _syncingKnowledgeGraph = true;
    try {
      knowledgeGraph = _knowledgeGraphSubscriptionAspect.rebuild(
        _knowledgeGraphContext(),
      );
      _knowledgeGraphDirty = false;
    } finally {
      _syncingKnowledgeGraph = false;
    }
  }

  String _inputPreview() {
    final text = inputText.trim();
    if (text.isEmpty) {
      return queuedFiles.isEmpty ? '无输入内容' : '已加入 ${queuedFiles.length} 个文件';
    }
    return text.length > 72 ? '${text.substring(0, 72)}…' : text;
  }

  String _formatBytes(int bytes) {
    if (bytes >= 1024 * 1024 * 1024) {
      return '${(bytes / (1024 * 1024 * 1024)).toStringAsFixed(1)} 吉字节';
    }
    if (bytes >= 1024 * 1024) {
      return '${(bytes / (1024 * 1024)).toStringAsFixed(1)} 兆字节';
    }
    if (bytes >= 1024) {
      return '${(bytes / 1024).toStringAsFixed(0)} 千字节';
    }
    return '$bytes 字节';
  }

  @override
  void notifyListeners() {
    if (_disposed) {
      return;
    }
    super.notifyListeners();
  }

  @override
  void dispose() {
    _disposed = true;
    _knowledgeDaemon.dispose();
    _moduleDaemon.dispose();
    _clientBackendStatePollTimer?.cancel();
    _clientBackendWatchDebounceTimer?.cancel();
    unawaited(_clientBackendFileWatchSubscription?.cancel());
    _mailImportUiNotifyTimer?.cancel();
    _stopUploadSessionWatch();
    _stopMailImportWatchdog();
    _backendApi.dispose();
    bootstrapController.dispose();
    serviceUsernameController.dispose();
    servicePasswordController.dispose();
    inputController.dispose();
    super.dispose();
  }
}
