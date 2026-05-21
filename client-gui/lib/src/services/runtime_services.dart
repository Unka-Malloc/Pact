import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:crypto/crypto.dart';
import 'package:http/http.dart' as http;
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';

import '../models/app_models.dart';
import '../models/knowledge_graph_models.dart';
import '../models/transfer_models.dart';

class ApiException implements Exception {
  ApiException(this.message, {this.statusCode});

  final String message;
  final int? statusCode;

  @override
  String toString() => message;
}

class ClientWorkspaceManifest {
  const ClientWorkspaceManifest({
    required this.schemaVersion,
    required this.appId,
    required this.workspaceId,
    required this.createdAt,
    required this.updatedAt,
  });

  static const currentSchemaVersion = 1;
  static const agentStudioClientAppId = 'agentstudio-client';

  final int schemaVersion;
  final String appId;
  final String workspaceId;
  final String createdAt;
  final String updatedAt;

  factory ClientWorkspaceManifest.create() {
    final now = DateTime.now().toUtc().toIso8601String();
    final seed = '$now:$pid:${Directory.current.path}';
    final workspaceId = sha256.convert(utf8.encode(seed)).toString();
    return ClientWorkspaceManifest(
      schemaVersion: currentSchemaVersion,
      appId: agentStudioClientAppId,
      workspaceId: workspaceId,
      createdAt: now,
      updatedAt: now,
    );
  }

  factory ClientWorkspaceManifest.fromJson(Map<String, dynamic> json) {
    return ClientWorkspaceManifest(
      schemaVersion: (json['schemaVersion'] as num?)?.toInt() ?? 0,
      appId: (json['appId'] ?? '').toString(),
      workspaceId: (json['workspaceId'] ?? '').toString(),
      createdAt: (json['createdAt'] ?? '').toString(),
      updatedAt: (json['updatedAt'] ?? '').toString(),
    );
  }

  ClientWorkspaceManifest touch() {
    return ClientWorkspaceManifest(
      schemaVersion: schemaVersion,
      appId: appId,
      workspaceId: workspaceId,
      createdAt: createdAt,
      updatedAt: DateTime.now().toUtc().toIso8601String(),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'schemaVersion': schemaVersion,
      'appId': appId,
      'workspaceId': workspaceId,
      'createdAt': createdAt,
      'updatedAt': updatedAt,
    };
  }
}

class ModuleWorkspace {
  const ModuleWorkspace({required this.moduleId, required this.directory});

  final String moduleId;
  final Directory directory;

  Directory childDirectory(String name) {
    PortableStorage.validateModuleSubdirectory(name);
    return Directory(p.join(directory.path, name));
  }
}

class ClientBackendRpcConfig {
  const ClientBackendRpcConfig({
    required this.schemaVersion,
    required this.protocolVersion,
    required this.transport,
    required this.baseUrl,
    required this.token,
    required this.updatedAt,
  });

  final int schemaVersion;
  final int protocolVersion;
  final String transport;
  final String baseUrl;
  final String token;
  final String updatedAt;

  bool get isCompatible =>
      schemaVersion <= 1 &&
      protocolVersion == 1 &&
      transport == 'http' &&
      baseUrl.trim().isNotEmpty &&
      token.trim().isNotEmpty;

  factory ClientBackendRpcConfig.fromJson(Map<dynamic, dynamic> json) {
    return ClientBackendRpcConfig(
      schemaVersion: (json['schemaVersion'] as num?)?.toInt() ?? 0,
      protocolVersion: (json['protocolVersion'] as num?)?.toInt() ?? 0,
      transport: (json['transport'] ?? '').toString(),
      baseUrl: (json['baseUrl'] ?? '').toString(),
      token: (json['token'] ?? '').toString(),
      updatedAt: (json['updatedAt'] ?? '').toString(),
    );
  }
}

class ClientBackendApi {
  ClientBackendApi({required PortableStorage storage, http.Client? client})
    : _storage = storage,
      _client = client ?? http.Client();

  static const int protocolVersion = 1;
  static const Duration _rpcTimeout = Duration(seconds: 5);
  static const Duration _commandTimeout = Duration(minutes: 5);

  final PortableStorage _storage;
  final http.Client _client;
  Process? _spawnedDaemon;

  Future<ClientBackendCapabilities?> loadCapabilities() async {
    final file = await _backendFile('capabilities.json');
    if (!await file.exists()) {
      return null;
    }
    try {
      final decoded = jsonDecode(await file.readAsString());
      if (decoded is Map) {
        final capabilities = ClientBackendCapabilities.fromJson(decoded);
        return capabilities.isCompatible ? capabilities : null;
      }
    } catch (_) {
      return null;
    }
    return null;
  }

  Future<ClientBackendRuntimeState?> loadRuntimeState() async {
    final file = await _backendFile('runtime-state.json');
    if (!await file.exists()) {
      return null;
    }
    try {
      final decoded = jsonDecode(await file.readAsString());
      if (decoded is Map) {
        final state = ClientBackendRuntimeState.fromJson(decoded);
        return state.isCompatible ? state : null;
      }
    } catch (_) {
      return null;
    }
    return null;
  }

  Future<ClientBackendRpcConfig?> loadRpcConfig() async {
    final file = await _backendFile('rpc.json');
    if (!await file.exists()) {
      return null;
    }
    try {
      final decoded = jsonDecode(await file.readAsString());
      if (decoded is Map) {
        final config = ClientBackendRpcConfig.fromJson(decoded);
        return config.isCompatible ? config : null;
      }
    } catch (_) {
      return null;
    }
    return null;
  }

  Future<bool> ensureDaemon() async {
    if (await isDaemonRunning()) {
      return true;
    }
    final dataDirectory = await _storage.dataDirectory();
    final binary = await _resolveDaemonBinary();
    if (binary == null) {
      return false;
    }

    _spawnedDaemon ??= await Process.start(
      binary.path,
      const [],
      environment: {
        ...Platform.environment,
        'AGENTSTUDIO_PORTABLE_DIR': dataDirectory.path,
      },
      mode: ProcessStartMode.detached,
    );

    for (var attempt = 0; attempt < 20; attempt += 1) {
      await Future<void>.delayed(const Duration(milliseconds: 200));
      if (await isDaemonRunning()) {
        return true;
      }
    }
    return false;
  }

  Future<bool> isDaemonRunning() async {
    final state = await loadRuntimeState();
    if (state == null || state.daemonStatus != 'running') {
      return false;
    }
    final heartbeat = _parseBackendTimestamp(state.lastHeartbeatAt);
    if (heartbeat == null) {
      return true;
    }
    return DateTime.now().toUtc().difference(heartbeat).abs() <
        const Duration(seconds: 20);
  }

  Future<bool> ping() async {
    try {
      await rpc('system.ping');
      return true;
    } catch (_) {
      return false;
    }
  }

  Future<Map<String, dynamic>> capabilities() async {
    final result = await rpc('system.capabilities');
    return result is Map ? Map<String, dynamic>.from(result) : {};
  }

  Future<ExpertVocabulary> pullVocabulary() async {
    final result = await _rpcCommand(
      'vocabulary.pull',
      timeout: const Duration(seconds: 20),
    );
    final rawVocabulary = result['vocabulary'];
    if (rawVocabulary is Map) {
      return ExpertVocabulary.fromJson(rawVocabulary);
    }
    throw StateError('Backend did not return an expert vocabulary.');
  }

  Future<Map<String, dynamic>> applyVocabularyToIndex() async {
    return submitCommand('vocabulary.applyToIndex');
  }

  Future<Map<String, dynamic>> rebuildMailIndex() async {
    return submitCommand('mail.index.rebuild');
  }

  Future<Map<String, dynamic>> requestMailAuthorization() async {
    return submitCommand(
      'mail.auth.request',
      timeout: const Duration(minutes: 2),
    );
  }

  Future<Map<String, dynamic>> startMailImport() async {
    return _rpcCommand(
      'mail.import.start',
      timeout: const Duration(seconds: 30),
    );
  }

  Future<Map<String, dynamic>> mailImportStatus() async {
    return _rpcCommand(
      'mail.import.status',
      timeout: const Duration(seconds: 20),
    );
  }

  Future<Map<String, dynamic>> pauseMailImport() async {
    return _rpcCommand(
      'mail.import.pause',
      timeout: const Duration(seconds: 20),
    );
  }

  Future<Map<String, dynamic>> resumeMailImport() async {
    return _rpcCommand(
      'mail.import.resume',
      timeout: const Duration(seconds: 20),
    );
  }

  Future<Map<String, dynamic>> cancelMailImport() async {
    return _rpcCommand(
      'mail.import.cancel',
      timeout: const Duration(seconds: 20),
    );
  }

  Future<Map<String, dynamic>> mailIndexStats() async {
    return _rpcCommand(
      'mail.index.stats',
      timeout: const Duration(seconds: 20),
    );
  }

  Future<Map<String, dynamic>> searchMailIndex({
    required String query,
    int limit = 50,
    int offset = 0,
  }) async {
    return _rpcCommand(
      'mail.index.search',
      params: {'query': query, 'limit': limit, 'offset': offset},
      timeout: const Duration(seconds: 20),
    );
  }

  Future<Map<String, dynamic>> openMailIndexItem({
    int? docId,
    String messageKey = '',
  }) async {
    final params = <String, dynamic>{};
    if (docId != null) {
      params['docId'] = docId;
    }
    if (messageKey.trim().isNotEmpty) {
      params['messageKey'] = messageKey.trim();
    }
    return submitCommand(
      'mail.index.open',
      params: params,
      timeout: const Duration(seconds: 20),
    );
  }

  Future<Map<String, dynamic>> submitPipeline({
    required String serviceBaseUrl,
    required String inputText,
    required List<Map<String, dynamic>> files,
    required Map<String, dynamic> settings,
  }) async {
    return submitCommand(
      'upload.queue.enqueue',
      params: {
        'serviceBaseUrl': serviceBaseUrl,
        'inputText': inputText,
        'files': files,
        'settings': settings,
        'wait': true,
        'process': true,
      },
      timeout: const Duration(hours: 6),
    );
  }

  Future<Map<String, dynamic>> listUploadQueue({
    bool includeEvents = false,
    int offset = 0,
  }) {
    return _rpcCommand(
      'upload.queue.list',
      params: {'includeEvents': includeEvents, 'offset': offset},
    );
  }

  Future<Map<String, dynamic>> controlUploadQueueTask(
    String action,
    String taskId,
  ) {
    final method = switch (action) {
      'pause' => 'upload.queue.pause',
      'resume' => 'upload.queue.resume',
      'cancel' => 'upload.queue.cancel',
      'retry' => 'upload.queue.retry',
      _ => throw ArgumentError.value(action, 'action'),
    };
    return submitCommand(method, params: {'taskId': taskId});
  }

  Future<ExportArtifact> exportResult({
    required String serviceBaseUrl,
    required Map<String, dynamic> result,
    required ExportKind format,
  }) async {
    final response = await submitCommand(
      'result.export',
      params: {
        'serviceBaseUrl': serviceBaseUrl,
        'result': result,
        'format': format.apiFormat,
        if (format.mode != null) 'mode': format.mode,
      },
      timeout: const Duration(minutes: 5),
    );
    return ExportArtifact(
      fileName: (response['fileName'] ?? 'agentstudio-result.${format.apiFormat}')
          .toString(),
      bytes: base64Decode((response['base64'] ?? '').toString()),
      contentType: (response['contentType'] ?? format.mimeType).toString(),
    );
  }

  Future<Map<String, dynamic>> serverApi({
    required String serviceBaseUrl,
    required String method,
    required String path,
    Map<String, dynamic>? body,
  }) async {
    final params = <String, dynamic>{
      'serviceBaseUrl': AgentStudioServiceUrls.normalizeBaseUrl(serviceBaseUrl),
      'method': method,
      'path': path,
    };
    if (body != null) {
      params['body'] = body;
    }
    return _rpcCommand(
      'server.api',
      params: params,
      timeout: const Duration(minutes: 2),
    );
  }

  Future<Map<String, dynamic>> listServerInterfaces({
    required String serviceBaseUrl,
  }) {
    return serverApi(
      serviceBaseUrl: serviceBaseUrl,
      method: 'GET',
      path: '/api/interfaces',
    );
  }

  Future<Map<String, dynamic>> knowledgeCacheStats() {
    return _rpcCommand(
      'knowledge.cache.stats',
      timeout: const Duration(seconds: 20),
    );
  }

  Future<Map<String, dynamic>> syncKnowledgeCache({
    required String serviceBaseUrl,
    String? since,
    bool pushOutbox = false,
  }) {
    final params = <String, dynamic>{
      'serviceBaseUrl': serviceBaseUrl,
      'pushOutbox': pushOutbox,
      'scope': 'mirror',
    };
    if (since != null) {
      params['since'] = since;
    }
    return submitCommand(
      'knowledge.sync',
      params: params,
      timeout: const Duration(minutes: 3),
    );
  }

  Future<Map<String, dynamic>> syncAgents({String? serviceBaseUrl}) {
    final params = <String, dynamic>{};
    if (serviceBaseUrl != null && serviceBaseUrl.trim().isNotEmpty) {
      params['serviceBaseUrl'] = serviceBaseUrl;
    }
    return submitCommand(
      'agents.sync',
      params: params,
      timeout: const Duration(seconds: 30),
    );
  }

  Future<Map<String, dynamic>> listAgents() {
    return _rpcCommand('agents.list', timeout: const Duration(seconds: 20));
  }

  Future<Map<String, dynamic>> searchKnowledgeCache({
    required String query,
    int limit = 50,
  }) {
    return submitCommand(
      'knowledge.search',
      params: {'query': query, 'limit': limit},
      timeout: const Duration(seconds: 20),
    );
  }

  Future<Map<String, dynamic>> listDataConnectors() {
    return _rpcCommand(
      'connectors.list',
      timeout: const Duration(seconds: 20),
    );
  }

  Future<Map<String, dynamic>> controlDataConnector({
    required String providerId,
    required String action,
    Map<String, dynamic> params = const {},
  }) {
    final method = switch (action) {
      'install' => 'connectors.install',
      'enable' => 'connectors.enable',
      'disable' => 'connectors.disable',
      'uninstall' => 'connectors.uninstall',
      _ => throw ArgumentError.value(action, 'action'),
    };
    return submitCommand(
      method,
      params: {'providerId': providerId, ...params},
      timeout: const Duration(seconds: 20),
    );
  }

  Future<Map<String, dynamic>> startDataConnectorAuth({
    required String providerId,
    Map<String, dynamic> params = const {},
  }) {
    return submitCommand(
      'connectors.auth.start',
      params: {'providerId': providerId, ...params},
      timeout: const Duration(seconds: 20),
    );
  }

  Future<Map<String, dynamic>> syncDataConnector({
    required String providerId,
    Map<String, dynamic> params = const {},
  }) {
    return submitCommand(
      'connectors.sync',
      params: {'providerId': providerId, ...params},
      timeout: const Duration(minutes: 5),
    );
  }

  Future<Map<String, dynamic>> queryLocalDataConnectors({
    required String query,
    int limit = 50,
  }) {
    return submitCommand(
      'connectors.queryLocal',
      params: {'query': query, 'limit': limit},
      timeout: const Duration(seconds: 20),
    );
  }

  Future<Map<String, dynamic>> submitKnowledgeFeedback({
    required String serviceBaseUrl,
    required Map<String, dynamic> feedback,
  }) {
    return serverApi(
      serviceBaseUrl: serviceBaseUrl,
      method: 'POST',
      path: '/api/knowledge/feedback',
      body: feedback,
    );
  }

  Future<Map<String, dynamic>> listKnowledgeSuggestions({
    required String serviceBaseUrl,
    String status = 'pending',
    int limit = 100,
  }) {
    return serverApi(
      serviceBaseUrl: serviceBaseUrl,
      method: 'GET',
      path:
          '/api/knowledge/suggestions?status=${Uri.encodeQueryComponent(status)}&limit=$limit',
    );
  }

  Future<Map<String, dynamic>> resolveKnowledgeSuggestion({
    required String serviceBaseUrl,
    required String suggestionId,
    required String resolution,
    Map<String, dynamic> patch = const {},
  }) {
    return serverApi(
      serviceBaseUrl: serviceBaseUrl,
      method: 'POST',
      path:
          '/api/knowledge/suggestions/${Uri.encodeComponent(suggestionId)}/resolve',
      body: {'resolution': resolution, 'patch': patch},
    );
  }

  Future<Map<String, dynamic>> runKnowledgeLearningJob({
    required String serviceBaseUrl,
    Map<String, dynamic> params = const {},
  }) {
    return serverApi(
      serviceBaseUrl: serviceBaseUrl,
      method: 'POST',
      path: '/api/knowledge/learning/jobs',
      body: params,
    );
  }

  Future<Map<String, dynamic>> getKnowledgeLearningHealth({
    required String serviceBaseUrl,
  }) {
    return serverApi(
      serviceBaseUrl: serviceBaseUrl,
      method: 'GET',
      path: '/api/knowledge/learning/health',
    );
  }

  Future<Map<String, dynamic>> knowledgeCacheGraph({
    required String seed,
    int depth = 1,
    int limit = 120,
  }) {
    return submitCommand(
      'knowledge.graph',
      params: {'seed': seed, 'depth': depth, 'limit': limit},
      timeout: const Duration(seconds: 20),
    );
  }

  Future<Map<String, dynamic>> getKnowledgeDocument({
    required String documentId,
  }) {
    return submitCommand(
      'knowledge.document.get',
      params: {'documentId': documentId},
      timeout: const Duration(seconds: 20),
    );
  }

  Future<Map<String, dynamic>> openKnowledgeDocument({
    required String documentId,
  }) {
    return submitCommand(
      'knowledge.document.open',
      params: {'documentId': documentId},
      timeout: const Duration(seconds: 20),
    );
  }

  Future<Map<String, dynamic>> exportKnowledge({String? documentId}) {
    final params = <String, dynamic>{};
    if (documentId != null && documentId.trim().isNotEmpty) {
      params['documentId'] = documentId;
    }
    return submitCommand(
      'knowledge.export',
      params: params,
      timeout: const Duration(minutes: 2),
    );
  }

  Future<Map<String, dynamic>> knowledgeAgentContext({
    required String query,
    int limit = 8,
  }) {
    return submitCommand(
      'knowledge.agent.context',
      params: {'query': query, 'limit': limit},
      timeout: const Duration(seconds: 20),
    );
  }

  Future<Map<String, dynamic>> knowledgeAgentAnswer({
    required String query,
    int limit = 8,
    String? agentEndpointUrl,
    String? agentToken,
    String? agentAlias,
    String? agentName,
    List<dynamic> pluginList = const [],
    String? sessionId,
    String? userId,
    String? projectId,
    String? engine,
    Map<String, dynamic> parameters = const {},
  }) {
    final params = <String, dynamic>{'query': query, 'limit': limit};
    if (agentEndpointUrl != null && agentEndpointUrl.trim().isNotEmpty) {
      params['agentEndpointUrl'] = agentEndpointUrl.trim();
    }
    if (agentToken != null && agentToken.trim().isNotEmpty) {
      params['agentToken'] = agentToken.trim();
    }
    if (agentAlias != null && agentAlias.trim().isNotEmpty) {
      params['agentAlias'] = agentAlias.trim();
      params['customModelAlias'] = agentAlias.trim();
    }
    if (agentName != null && agentName.trim().isNotEmpty) {
      params['agentName'] = agentName.trim();
    }
    if (pluginList.isNotEmpty) {
      params['pluginList'] = pluginList;
    }
    if (sessionId != null && sessionId.trim().isNotEmpty) {
      params['sessionId'] = sessionId.trim();
    }
    if (userId != null && userId.trim().isNotEmpty) {
      params['userId'] = userId.trim();
    }
    if (projectId != null && projectId.trim().isNotEmpty) {
      params['projectId'] = projectId.trim();
    }
    if (engine != null && engine.trim().isNotEmpty) {
      params['engine'] = engine.trim();
    }
    if (parameters.isNotEmpty) {
      params['parameters'] = parameters;
    }
    return submitCommand(
      'knowledge.agent.answer',
      params: params,
      timeout: const Duration(minutes: 2),
    );
  }

  Future<Map<String, dynamic>> invokeAgent({
    required String question,
    String? agentEndpointUrl,
    String? agentToken,
    String? agentAlias,
    String? agentName,
    List<dynamic> pluginList = const [],
    String? sessionId,
    String? userId,
    String? projectId,
    String? engine,
    Map<String, dynamic> parameters = const {},
  }) {
    final params = <String, dynamic>{'question': question};
    if (agentEndpointUrl != null && agentEndpointUrl.trim().isNotEmpty) {
      params['agentEndpointUrl'] = agentEndpointUrl.trim();
    }
    if (agentToken != null && agentToken.trim().isNotEmpty) {
      params['agentToken'] = agentToken.trim();
    }
    if (agentAlias != null && agentAlias.trim().isNotEmpty) {
      params['agentAlias'] = agentAlias.trim();
      params['customModelAlias'] = agentAlias.trim();
    }
    if (agentName != null && agentName.trim().isNotEmpty) {
      params['agentName'] = agentName.trim();
    }
    if (pluginList.isNotEmpty) {
      params['pluginList'] = pluginList;
    }
    if (sessionId != null && sessionId.trim().isNotEmpty) {
      params['sessionId'] = sessionId.trim();
    }
    if (userId != null && userId.trim().isNotEmpty) {
      params['userId'] = userId.trim();
    }
    if (projectId != null && projectId.trim().isNotEmpty) {
      params['projectId'] = projectId.trim();
    }
    if (engine != null && engine.trim().isNotEmpty) {
      params['engine'] = engine.trim();
    }
    if (parameters.isNotEmpty) {
      params['parameters'] = parameters;
    }
    return submitCommand(
      'agent.invoke',
      params: params,
      timeout: const Duration(minutes: 2),
    );
  }

  Future<Map<String, dynamic>> queueKnowledgeChange({
    required String entityId,
    required String entityType,
    required int baseRevision,
    required Map<String, dynamic> fieldPatch,
    String? operationId,
    String? clientId,
  }) {
    final params = <String, dynamic>{
      'entityId': entityId,
      'entityType': entityType,
      'baseRevision': baseRevision,
      'fieldPatch': fieldPatch,
    };
    if (operationId != null) {
      params['operationId'] = operationId;
    }
    if (clientId != null) {
      params['clientId'] = clientId;
    }
    return submitCommand(
      'knowledge.change.queue',
      params: params,
      timeout: const Duration(seconds: 20),
    );
  }

  Future<Map<String, dynamic>> listPendingKnowledgeChanges() {
    return submitCommand(
      'knowledge.outbox.list',
      timeout: const Duration(seconds: 20),
    );
  }

  Future<BootstrapInfo> fetchBootstrap(String baseUrl) async {
    final decoded = await serverApi(
      serviceBaseUrl: AgentStudioServiceUrls.normalizeBaseUrl(baseUrl),
      method: 'GET',
      path: '/api/bootstrap',
    );
    return BootstrapInfo.fromJson(decoded);
  }

  Future<void> checkIn({
    required String bootstrapBaseUrl,
    required String currentServiceUrl,
    required String clientId,
    required String configVersion,
    required bool busy,
    required String lastJobId,
    required String lastError,
  }) async {
    await serverApi(
      serviceBaseUrl: bootstrapBaseUrl,
      method: 'POST',
      path: '/api/discovery/check-in',
      body: {
        'clientId': clientId,
        'clientLabel': 'Flutter 桌面客户端',
        'appVersion': '0.1.0-flutter',
        'platform': Platform.operatingSystem,
        'hostname': Platform.localHostname,
        'bootstrapUrl': AgentStudioServiceUrls.normalizeBaseUrl(bootstrapBaseUrl),
        'currentServiceUrl': currentServiceUrl,
        'desiredServiceUrl': currentServiceUrl,
        'currentJobServiceUrl': currentServiceUrl,
        'configVersion': configVersion,
        'busy': busy,
        'lastJobId': lastJobId,
        'lastError': lastError,
      },
    );
  }

  Future<SplitJob> getJob(String serviceBaseUrl, String jobId) async {
    final decoded = await serverApi(
      serviceBaseUrl: serviceBaseUrl,
      method: 'GET',
      path: '/api/jobs/${Uri.encodeComponent(jobId)}',
    );
    return SplitJob.fromJson(decoded);
  }

  Future<Map<String, dynamic>> getJobResult(
    String serviceBaseUrl,
    String jobId,
  ) {
    return serverApi(
      serviceBaseUrl: serviceBaseUrl,
      method: 'GET',
      path: '/api/jobs/${Uri.encodeComponent(jobId)}/result',
    );
  }

  Future<UploadSessionInfo> getUploadSession(
    String serviceBaseUrl,
    String sessionId,
  ) async {
    final decoded = await serverApi(
      serviceBaseUrl: serviceBaseUrl,
      method: 'GET',
      path: '/api/upload-sessions/${Uri.encodeComponent(sessionId)}',
    );
    return UploadSessionInfo.fromJson(decoded);
  }

  Future<List<MailKnowledgeSemanticSuggestion>> enhanceAffairTaxonomy({
    required String serviceBaseUrl,
    required List<Map<String, dynamic>> documents,
  }) async {
    final decoded = await serverApi(
      serviceBaseUrl: serviceBaseUrl,
      method: 'POST',
      path: '/api/knowledge/affair-taxonomy',
      body: {'documents': documents},
    );
    final rawItems = decoded['items'];
    if (rawItems is! List) {
      return const [];
    }
    return rawItems
        .whereType<Map>()
        .map(MailKnowledgeSemanticSuggestion.fromJson)
        .where((item) => item.isUseful && item.isCloudEnhanced)
        .toList(growable: false);
  }

  Future<Map<String, dynamic>> submitCommand(
    String method, {
    Map<String, dynamic> params = const {},
    Duration timeout = _commandTimeout,
  }) async {
    if (!await ensureDaemon()) {
      throw StateError('Local backend daemon is not available.');
    }
    final commandId = _newCommandId(method);
    final inboxFile = await _backendNestedFile([
      'commands',
      'inbox',
      '$commandId.json',
    ]);
    await _writeJsonAtomically(inboxFile, {
      'schemaVersion': 1,
      'protocolVersion': protocolVersion,
      'commandId': commandId,
      'method': method,
      'params': params,
      'createdAt': DateTime.now().toUtc().toIso8601String(),
    });
    final result = await _waitForCommandResult(commandId, timeout: timeout);
    final error = result['error'];
    if (error is Map) {
      throw ApiException(
        (error['message'] ?? 'Backend command failed.').toString(),
      );
    }
    final payload = result['result'];
    return payload is Map ? Map<String, dynamic>.from(payload) : {};
  }

  Future<Map<String, dynamic>> _rpcCommand(
    String method, {
    Map<String, dynamic> params = const {},
    Duration timeout = _commandTimeout,
  }) async {
    if (!await ensureDaemon()) {
      throw StateError('Local backend daemon is not available.');
    }
    try {
      final result = await rpc(method, params: params, timeout: timeout);
      return result is Map ? Map<String, dynamic>.from(result) : {};
    } on StateError catch (error) {
      if (error.message != 'Local backend RPC is not available.') {
        rethrow;
      }
      return submitCommand(method, params: params, timeout: timeout);
    }
  }

  Future<dynamic> rpc(
    String method, {
    Map<String, dynamic> params = const {},
    Duration timeout = _rpcTimeout,
  }) async {
    final config = await loadRpcConfig();
    if (config == null) {
      throw StateError('Local backend RPC is not available.');
    }
    final base = config.baseUrl.trim().replaceFirst(RegExp(r'/+$'), '');
    final response = await _client
        .post(
          Uri.parse('$base/rpc'),
          headers: {
            'content-type': 'application/json',
            'x-agentstudio-client-token': config.token,
          },
          body: jsonEncode({
            'jsonrpc': '2.0',
            'id': DateTime.now().microsecondsSinceEpoch.toString(),
            'method': method,
            'params': params,
            'protocolVersion': protocolVersion,
          }),
        )
        .timeout(timeout);
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw ApiException(
        'Local backend RPC failed with HTTP ${response.statusCode}.',
        statusCode: response.statusCode,
      );
    }
    final decoded = jsonDecode(utf8.decode(response.bodyBytes));
    if (decoded is! Map) {
      throw StateError('Local backend RPC returned an invalid response.');
    }
    final error = decoded['error'];
    if (error is Map) {
      throw ApiException(
        (error['message'] ?? 'Local backend RPC failed.').toString(),
      );
    }
    return decoded['result'];
  }

  Future<File> _backendFile(String name) async {
    final directory = await _storage.dataDirectory();
    return File(p.join(directory.path, 'backend', name));
  }

  Future<File> _backendNestedFile(List<String> parts) async {
    final directory = await _storage.dataDirectory();
    return File(p.joinAll([directory.path, 'backend', ...parts]));
  }

  Future<Map<String, dynamic>> _waitForCommandResult(
    String commandId, {
    required Duration timeout,
  }) async {
    final resultFile = await _backendNestedFile([
      'command-results',
      '$commandId.json',
    ]);
    final resultDirectory = resultFile.parent;
    await resultDirectory.create(recursive: true);
    final deadline = DateTime.now().add(timeout);
    StreamSubscription<FileSystemEvent>? subscription;
    final events = StreamController<void>.broadcast();
    try {
      subscription = resultDirectory.watch().listen((event) {
        if (p.equals(event.path, resultFile.path)) {
          events.add(null);
        }
      });
    } catch (_) {
      subscription = null;
    }

    try {
      while (DateTime.now().isBefore(deadline)) {
        final decoded = await _tryReadJsonMap(resultFile);
        if (decoded != null) {
          return decoded;
        }
        final remaining = deadline.difference(DateTime.now());
        if (remaining <= Duration.zero) {
          break;
        }
        final delay = remaining < const Duration(milliseconds: 250)
            ? remaining
            : const Duration(milliseconds: 250);
        if (subscription == null) {
          await Future<void>.delayed(delay);
        } else {
          await events.stream.first.timeout(delay, onTimeout: () {});
        }
      }
    } finally {
      await subscription?.cancel();
      await events.close();
    }
    throw TimeoutException('Backend command timed out: $commandId');
  }

  Future<Map<String, dynamic>?> _tryReadJsonMap(File file) async {
    try {
      if (!await file.exists()) {
        return null;
      }
      final raw = await file.readAsString();
      if (raw.trim().isEmpty) {
        return null;
      }
      final decoded = jsonDecode(raw);
      return decoded is Map ? Map<String, dynamic>.from(decoded) : null;
    } catch (_) {
      return null;
    }
  }

  Future<void> _writeJsonAtomically(File file, Object? value) {
    return _writeTextAtomically(
      file,
      const JsonEncoder.withIndent('  ').convert(value),
    );
  }

  Future<void> _writeTextAtomically(File file, String contents) async {
    await file.parent.create(recursive: true);
    final lock = File(
      p.join(file.parent.path, '${p.basename(file.path)}.lock'),
    );
    final lockHandle = await lock.open(mode: FileMode.write);
    try {
      await lockHandle.lock(FileLock.exclusive);
      final temp = File(
        p.join(
          file.parent.path,
          '.${p.basename(file.path)}.$pid.${DateTime.now().toUtc().microsecondsSinceEpoch}.tmp',
        ),
      );
      await temp.writeAsString(contents, flush: true);
      await temp.rename(file.path);
    } finally {
      try {
        await lockHandle.unlock();
      } finally {
        await lockHandle.close();
      }
    }
  }

  String _newCommandId(String method) {
    final normalized = method
        .replaceAll(RegExp(r'[^A-Za-z0-9_.-]'), '-')
        .replaceAll('.', '-');
    return '$normalized-${DateTime.now().toUtc().microsecondsSinceEpoch}-$pid';
  }

  DateTime? _parseBackendTimestamp(String value) {
    if (value.startsWith('unix:')) {
      final seconds = int.tryParse(value.substring(5));
      if (seconds == null) {
        return null;
      }
      return DateTime.fromMillisecondsSinceEpoch(seconds * 1000, isUtc: true);
    }
    return DateTime.tryParse(value)?.toUtc();
  }

  Future<File?> _resolveDaemonBinary() async {
    final suffix = Platform.isWindows ? '.exe' : '';
    final override = Platform.environment['AGENTSTUDIO_CLIENTD_PATH'];
    final candidates = <String>[
      if (override != null && override.trim().isNotEmpty) override.trim(),
      p.join(
        File(Platform.resolvedExecutable).parent.path,
        'agentstudio-clientd$suffix',
      ),
      p.join(
        Directory.current.path,
        '..',
        'client-cli',
        'target',
        'debug',
        'agentstudio-clientd$suffix',
      ),
      p.join(
        Directory.current.path,
        'client-cli',
        'target',
        'debug',
        'agentstudio-clientd$suffix',
      ),
    ];
    for (final candidate in candidates) {
      final file = File(p.normalize(candidate));
      if (await file.exists()) {
        return file;
      }
    }
    return null;
  }

  void dispose() {
    _client.close();
  }
}

class PortableStorage {
  PortableStorage({Directory? dataDirectoryOverride})
    : _dataDirectoryOverride = dataDirectoryOverride;

  static final RegExp _moduleIdPattern = RegExp(r'^[a-z][a-z0-9-]{0,63}$');
  static const String _workspaceManifestFileName = '.agentstudio-workspace.json';
  static const int _clientLogTailBytes = 4 * 1024 * 1024;
  static const int _clientLogFlushBatchSize = 120;
  static const Duration _clientLogFlushDelay = Duration(milliseconds: 300);

  final Directory? _dataDirectoryOverride;
  Directory? _cachedDataDir;
  Future<void> _logWriteQueue = Future.value();
  final List<String> _pendingLogLines = <String>[];
  Timer? _logFlushTimer;

  Future<ClientConfig> loadConfig() async {
    final file = await _settingsFile();
    if (!await file.exists()) {
      return const ClientConfig();
    }

    final raw = await file.readAsString();
    if (raw.trim().isEmpty) {
      return const ClientConfig();
    }

    return ClientConfig.fromJson(jsonDecode(raw) as Map<String, dynamic>);
  }

  Future<void> saveConfig(ClientConfig config) async {
    final file = await _settingsFile();
    await _writeJsonAtomically(file, config.toJson());
  }

  Future<List<RecentRun>> loadRecentRuns() async {
    final file = await _historyFile();
    if (!await file.exists()) {
      return const [];
    }

    final raw = await file.readAsString();
    if (raw.trim().isEmpty) {
      return const [];
    }

    final decoded = jsonDecode(raw);
    if (decoded is! List) {
      return const [];
    }

    return decoded
        .whereType<Map>()
        .map((item) => RecentRun.fromJson(Map<String, dynamic>.from(item)))
        .toList();
  }

  Future<List<String>> loadClientLogs() async {
    await _flushClientLogLines();
    final file = await _clientLogFile();
    if (!await file.exists()) {
      return const [];
    }

    final lines = await _readRecentLogLines(
      file,
      maxBytes: _clientLogTailBytes,
    );
    return lines
        .where((line) => line.trim().isNotEmpty)
        .toList()
        .reversed
        .take(2000)
        .toList();
  }

  Future<List<String>> loadAllClientLogs() async {
    await _flushClientLogLines();
    final file = await _clientLogFile();
    if (!await file.exists()) {
      return const [];
    }

    final lines = await _readLogLines(file);
    return lines.where((line) => line.trim().isNotEmpty).toList();
  }

  Future<List<MailKnowledgeDocument>> loadMailKnowledgeDocuments({
    required String mailWorkspaceDirectory,
    int maxRows = 1600,
  }) async {
    final file = File(p.join(mailWorkspaceDirectory, 'index', 'docs.tsv'));
    if (!await file.exists()) {
      return const [];
    }

    final lines = await _readRecentLogLines(file, maxBytes: 3 * 1024 * 1024);
    final nonEmpty = lines.where((line) => line.trim().isNotEmpty).toList();
    final selected = nonEmpty.length > maxRows
        ? nonEmpty.sublist(nonEmpty.length - maxRows)
        : nonEmpty;
    return selected
        .map(MailKnowledgeDocument.fromTsvLine)
        .where((document) => document.isValid)
        .toList(growable: false);
  }

  Future<Map<String, MailKnowledgeSemanticSuggestion>>
  loadMailKnowledgeSemanticSuggestions({
    required String mailWorkspaceDirectory,
  }) async {
    final file = File(
      p.join(mailWorkspaceDirectory, 'index', 'cloud-taxonomy.json'),
    );
    if (!await file.exists()) {
      return const {};
    }

    try {
      final raw = await file.readAsString();
      final decoded = jsonDecode(raw);
      final rawItems = decoded is Map ? decoded['items'] : null;
      final items = <String, MailKnowledgeSemanticSuggestion>{};
      if (rawItems is Map) {
        for (final entry in rawItems.entries) {
          if (entry.value is! Map) {
            continue;
          }
          final suggestion = MailKnowledgeSemanticSuggestion.fromJson(
            Map<dynamic, dynamic>.from(entry.value as Map),
          );
          if (suggestion.isUseful && suggestion.isCloudEnhanced) {
            items[entry.key.toString()] = suggestion;
          }
        }
      } else if (rawItems is List) {
        for (final item in rawItems.whereType<Map>()) {
          final suggestion = MailKnowledgeSemanticSuggestion.fromJson(item);
          if (suggestion.isUseful && suggestion.isCloudEnhanced) {
            items[suggestion.messageKey] = suggestion;
          }
        }
      }
      return items;
    } catch (_) {
      return const {};
    }
  }

  Future<void> saveMailKnowledgeSemanticSuggestions({
    required String mailWorkspaceDirectory,
    required Map<String, MailKnowledgeSemanticSuggestion> suggestions,
  }) async {
    final file = File(
      p.join(mailWorkspaceDirectory, 'index', 'cloud-taxonomy.json'),
    );
    await _writeJsonAtomically(file, {
      'version': 1,
      'updatedAt': DateTime.now().toIso8601String(),
      'items': {
        for (final entry in suggestions.entries)
          if (entry.value.isUseful && entry.value.isCloudEnhanced)
            entry.key: entry.value.toJson(),
      },
    });
  }

  Future<ExpertVocabulary> loadExpertVocabulary({
    required String mailWorkspaceDirectory,
  }) async {
    final file = File(p.join(mailWorkspaceDirectory, 'expert-vocabulary.json'));
    if (!await file.exists()) {
      return ExpertVocabulary.empty();
    }

    try {
      final raw = await file.readAsString();
      if (raw.trim().isEmpty) {
        return ExpertVocabulary.empty();
      }
      return ExpertVocabulary.fromJson(jsonDecode(raw) as Map);
    } catch (_) {
      return ExpertVocabulary.empty();
    }
  }

  Future<File> saveExpertVocabulary({
    required String mailWorkspaceDirectory,
    required ExpertVocabulary vocabulary,
  }) async {
    final file = File(p.join(mailWorkspaceDirectory, 'expert-vocabulary.json'));
    await _writeJsonAtomically(file, vocabulary.toJson());
    return file;
  }

  Future<void> appendClientLogLine(String line) {
    _pendingLogLines.add(line);
    if (_pendingLogLines.length >= _clientLogFlushBatchSize) {
      return _flushClientLogLines();
    }
    _logFlushTimer ??= Timer(_clientLogFlushDelay, () {
      _logFlushTimer = null;
      unawaited(_flushClientLogLines());
    });
    return Future.value();
  }

  Future<void> _flushClientLogLines() {
    _logFlushTimer?.cancel();
    _logFlushTimer = null;
    if (_pendingLogLines.isEmpty) {
      return _logWriteQueue.catchError((_) {});
    }
    final lines = List<String>.of(_pendingLogLines);
    _pendingLogLines.clear();
    final write = _logWriteQueue.catchError((_) {}).then((_) async {
      final file = await _clientLogFile();
      await file.parent.create(recursive: true);
      await file.writeAsString('${lines.join('\n')}\n', mode: FileMode.append);
    });
    _logWriteQueue = write.catchError((_) {});
    return write;
  }

  Future<void> clearClientLogs() async {
    _pendingLogLines.clear();
    _logFlushTimer?.cancel();
    _logFlushTimer = null;
    await _logWriteQueue.catchError((_) {});
    final file = await _clientLogFile();
    if (await file.exists()) {
      await file.writeAsString('');
    }
  }

  Future<void> saveRecentRuns(List<RecentRun> runs) async {
    final file = await _historyFile();
    await _writeJsonAtomically(file, runs.map((run) => run.toJson()).toList());
  }

  Future<CheckpointStore> loadCheckpointStore() async {
    final file = await _checkpointStoreFile();
    if (!await file.exists()) {
      return CheckpointStore();
    }

    final raw = await file.readAsString();
    if (raw.trim().isEmpty) {
      return CheckpointStore();
    }

    return CheckpointStore.fromJson(jsonDecode(raw) as Map<String, dynamic>);
  }

  Future<void> saveCheckpointStore(CheckpointStore store) async {
    final file = await _checkpointStoreFile();
    await _writeJsonAtomically(file, store.toJson());
  }

  Future<Directory> exportsDirectory() async {
    final dataDir = await dataDirectory();
    final directory = Directory(p.join(dataDir.path, 'exports'));
    await directory.create(recursive: true);
    return directory;
  }

  Future<ModuleWorkspace> moduleWorkspace(
    String moduleId, {
    Iterable<String> subdirectories = const [],
  }) async {
    final dataDir = await dataDirectory();
    final directory = Directory(moduleWorkspacePath(dataDir, moduleId));
    await directory.create(recursive: true);
    for (final subdirectory in subdirectories) {
      validateModuleSubdirectory(subdirectory);
      await Directory(
        p.join(directory.path, subdirectory),
      ).create(recursive: true);
    }
    return ModuleWorkspace(moduleId: moduleId, directory: directory);
  }

  static String moduleWorkspacePath(Directory dataDirectory, String moduleId) {
    validateModuleId(moduleId);
    return p.join(dataDirectory.path, moduleId);
  }

  static void validateModuleId(String moduleId) {
    if (!_moduleIdPattern.hasMatch(moduleId)) {
      throw ArgumentError.value(
        moduleId,
        'moduleId',
        'Module ids must use lowercase letters, digits, and hyphens.',
      );
    }
  }

  static void validateModuleSubdirectory(String subdirectory) {
    if (subdirectory.trim().isEmpty ||
        p.isAbsolute(subdirectory) ||
        p.split(subdirectory).any((part) => part == '..')) {
      throw ArgumentError.value(
        subdirectory,
        'subdirectory',
        'Module subdirectories must be relative paths inside the module root.',
      );
    }
  }

  Future<Directory> dataDirectory() async {
    if (_cachedDataDir != null) {
      return _cachedDataDir!;
    }

    if (_dataDirectoryOverride != null) {
      _cachedDataDir = await _prepareDataDirectory(_dataDirectoryOverride);
      return _cachedDataDir!;
    }

    final override = Platform.environment['AGENTSTUDIO_PORTABLE_DIR'];
    if (override != null && override.trim().isNotEmpty) {
      _cachedDataDir = await _prepareDataDirectory(Directory(override.trim()));
      return _cachedDataDir!;
    }

    final executableDirectory = File(Platform.resolvedExecutable).parent;
    final portableDirectory = _portableDirectoryForExecutable(
      executableDirectory,
    );
    if (await _tryUseDirectory(portableDirectory)) {
      _cachedDataDir = await _prepareDataDirectory(portableDirectory);
      return portableDirectory;
    }

    final appSupport = await getApplicationSupportDirectory();
    final fallback = Directory(p.join(appSupport.path, 'portable-data'));
    _cachedDataDir = await _prepareDataDirectory(fallback);
    return fallback;
  }

  Future<ClientWorkspaceManifest> loadWorkspaceManifest() async {
    final directory = await dataDirectory();
    return _loadOrCreateWorkspaceManifest(directory);
  }

  Future<Directory> _prepareDataDirectory(Directory directory) async {
    await directory.create(recursive: true);
    await _loadOrCreateWorkspaceManifest(directory);
    return directory;
  }

  Future<ClientWorkspaceManifest> _loadOrCreateWorkspaceManifest(
    Directory directory,
  ) async {
    final file = File(p.join(directory.path, _workspaceManifestFileName));
    if (await file.exists()) {
      ClientWorkspaceManifest? manifest;
      try {
        final raw = await file.readAsString();
        manifest = ClientWorkspaceManifest.fromJson(
          jsonDecode(raw) as Map<String, dynamic>,
        );
      } catch (error) {
        final corruptFile = File(
          '${file.path}.corrupt.${DateTime.now().toUtc().microsecondsSinceEpoch}',
        );
        await file.rename(corruptFile.path);
      }
      if (manifest != null) {
        if (manifest.appId != ClientWorkspaceManifest.agentStudioClientAppId ||
            manifest.schemaVersion >
                ClientWorkspaceManifest.currentSchemaVersion ||
            manifest.workspaceId.isEmpty) {
          throw StateError('不是 AgentStudio 客户端工作空间：${directory.path}');
        }
        final touched = manifest.touch();
        await _writeJsonAtomically(file, touched.toJson());
        return touched;
      }
    }

    final manifest = ClientWorkspaceManifest.create();
    await _writeJsonAtomically(file, manifest.toJson());
    return manifest;
  }

  Future<File> _settingsFile() async {
    final directory = await dataDirectory();
    return File(p.join(directory.path, 'settings.json'));
  }

  Future<File> _historyFile() async {
    final directory = await dataDirectory();
    return File(p.join(directory.path, 'recent-runs.json'));
  }

  Future<File> _clientLogFile() async {
    final directory = await dataDirectory();
    return File(p.join(directory.path, 'logs', 'client.log'));
  }

  Future<File> _checkpointStoreFile() async {
    final directory = await dataDirectory();
    return File(p.join(directory.path, 'checkpoints.json'));
  }

  Future<void> _writeJsonAtomically(File file, Object? value) {
    return _writeTextAtomically(
      file,
      const JsonEncoder.withIndent('  ').convert(value),
    );
  }

  Future<void> _writeTextAtomically(File file, String contents) async {
    await file.parent.create(recursive: true);
    final lock = File(
      p.join(file.parent.path, '${p.basename(file.path)}.lock'),
    );
    final lockHandle = await lock.open(mode: FileMode.write);
    try {
      await lockHandle.lock(FileLock.exclusive);
      final temp = File(
        p.join(
          file.parent.path,
          '.${p.basename(file.path)}.$pid.${DateTime.now().toUtc().microsecondsSinceEpoch}.tmp',
        ),
      );
      await temp.writeAsString(contents, flush: true);
      await temp.rename(file.path);
    } finally {
      try {
        await lockHandle.unlock();
      } finally {
        await lockHandle.close();
      }
    }
  }

  Future<List<String>> _readLogLines(File file) async {
    final bytes = await file.readAsBytes();
    final raw = const Utf8Decoder(allowMalformed: true).convert(bytes);
    return const LineSplitter().convert(raw);
  }

  Future<List<String>> _readRecentLogLines(
    File file, {
    required int maxBytes,
  }) async {
    final length = await file.length();
    if (length <= maxBytes) {
      return _readLogLines(file);
    }

    final handle = await file.open();
    try {
      final start = length - maxBytes;
      await handle.setPosition(start);
      final bytes = await handle.read(maxBytes);
      final raw = const Utf8Decoder(allowMalformed: true).convert(bytes);
      final lines = const LineSplitter().convert(raw);
      if (lines.length <= 1) {
        return const [];
      }
      return lines.sublist(1);
    } finally {
      await handle.close();
    }
  }

  Directory _portableDirectoryForExecutable(Directory executableDirectory) {
    final contentsDirectory = executableDirectory.parent;
    final appBundleDirectory = contentsDirectory.parent;
    final isBundledMacExecutable =
        p.basename(executableDirectory.path) == 'MacOS' &&
        p.basename(contentsDirectory.path) == 'Contents' &&
        p.extension(appBundleDirectory.path) == '.app';

    if (isBundledMacExecutable) {
      return Directory(p.join(appBundleDirectory.parent.path, 'portable-data'));
    }

    return Directory(p.join(executableDirectory.path, 'portable-data'));
  }

  Future<bool> _tryUseDirectory(Directory directory) async {
    try {
      await directory.create(recursive: true);
      final probe = File(p.join(directory.path, '.agentstudio-probe'));
      await probe.writeAsString('ok');
      await probe.delete();
      return true;
    } catch (_) {
      return false;
    }
  }
}

class AgentStudioServiceUrls {
  const AgentStudioServiceUrls._();

  static String normalizeBaseUrl(String value) {
    var normalized = value.trim();
    if (normalized.endsWith('/')) {
      normalized = normalized.substring(0, normalized.length - 1);
    }
    if (normalized.endsWith('/api/bootstrap')) {
      normalized = normalized.substring(
        0,
        normalized.length - '/api/bootstrap'.length,
      );
    }
    if (normalized.isNotEmpty &&
        !RegExp(r'^[A-Za-z][A-Za-z0-9+.-]*://').hasMatch(normalized)) {
      normalized = 'http://$normalized';
    }
    return normalized;
  }
}
