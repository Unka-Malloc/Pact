import 'dart:io';

import 'package:flutter_client/src/controllers/app_controller.dart';
import 'package:flutter_client/src/models/app_models.dart';
import 'package:flutter_client/src/models/knowledge_graph_models.dart';
import 'package:flutter_client/src/models/transfer_models.dart';
import 'package:flutter_client/src/services/knowledge_graph_service.dart';
import 'package:flutter_client/src/services/runtime_services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:path/path.dart' as p;

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test(
    'controller initialization connects backend and projects runtime state',
    () async {
      final harness = await _ControllerHarness.create(
        backend: _FakeBackendScenario.available(),
      );
      addTearDown(harness.dispose);

      await harness.controller.initialize();

      expect(harness.controller.initialized, isTrue);
      expect(harness.controller.clientBackendAvailable, isTrue);
      expect(harness.controller.localMailIndexAvailable, isTrue);
      expect(harness.controller.mailIndexStats?.documentCount, 4);
      expect(harness.controller.clientBackendStatusLabel, 'running');
      expect(harness.backend.ensureDaemonCalls, 1);
    },
  );

  test(
    'controller pulls expert vocabulary through backend and refreshes stats',
    () async {
      final harness = await _ControllerHarness.create(
        initialConfig: const ClientConfig(
          resolvedServiceBaseUrl: 'http://splitall.test',
        ),
        backend: _FakeBackendScenario.available(
          vocabulary: _testVocabulary(version: 12, checksum: 'controller-pull'),
          stats: _stats(documentCount: 9, segmentCount: 3),
        ),
      );
      addTearDown(harness.dispose);

      await harness.controller.initialize();
      await harness.controller.pullExpertVocabulary(applyToMailIndex: true);

      expect(harness.backend.pullVocabularyCalls, 1);
      expect(harness.backend.mailIndexStatsCalls, greaterThanOrEqualTo(1));
      expect(harness.controller.expertVocabulary.version, 12);
      expect(harness.controller.expertVocabulary.checksum, 'controller-pull');
      expect(harness.controller.mailIndexStats?.documentCount, 9);
      expect(harness.controller.statusMessage, contains('v12'));
    },
  );

  test(
    'controller rebuilds mail index through backend when daemon is available',
    () async {
      final harness = await _ControllerHarness.create(
        backend: _FakeBackendScenario.available(
          stats: _stats(documentCount: 2, segmentCount: 1),
          rebuildStats: _stats(documentCount: 18, segmentCount: 6),
        ),
      );
      addTearDown(harness.dispose);

      await harness.controller.initialize();
      await harness.controller.rebuildMailIndex();

      expect(harness.backend.rebuildMailIndexCalls, 1);
      expect(harness.controller.mailIndexStats?.documentCount, 18);
      expect(harness.controller.statusMessage, '本地后台邮件索引已重建。');
    },
  );

  test(
    'controller keeps mail operations on backend when daemon is unavailable',
    () async {
      final harness = await _ControllerHarness.create(
        backend: _FakeBackendScenario.unavailable(),
      );
      addTearDown(harness.dispose);

      await harness.controller.initialize();
      expect(harness.controller.clientBackendAvailable, isFalse);
      expect(harness.controller.mailIndexStats, isNull);

      await harness.controller.refreshMailIndexStats();
      if (Platform.isMacOS) {
        expect(harness.controller.statusMessage, contains('本地客户端后台不可用'));
      } else {
        expect(harness.controller.localMailIndexAvailable, isFalse);
        expect(harness.controller.statusMessage, '等待提交任务。');
        expect(harness.backend.mailIndexStatsCalls, 0);
      }
    },
  );

  test(
    'controller mail module setting persists through shared config',
    () async {
      final harness = await _ControllerHarness.create(
        backend: _FakeBackendScenario.available(),
      );
      addTearDown(harness.dispose);

      await harness.controller.initialize();
      await harness.controller.setEmailAnalysisModuleEnabled(false);

      final saved = await harness.storage.loadConfig();
      expect(saved.emailAnalysisModuleEnabled, isFalse);
    },
  );

  test('controller selection and derived counters stay consistent', () async {
    final harness = await _ControllerHarness.create(
      backend: _FakeBackendScenario.available(),
    );
    addTearDown(harness.dispose);
    await harness.controller.initialize();

    harness.controller.queuedFiles = const [
      QueuedFile(
        path: '/tmp/a.eml',
        name: 'a.eml',
        relativePath: 'a.eml',
        byteSize: 1024,
        mediaType: 'message/rfc822',
      ),
      QueuedFile(
        path: '/tmp/b.pdf',
        name: 'b.pdf',
        relativePath: 'b.pdf',
        byteSize: 2048,
        mediaType: 'application/pdf',
      ),
    ];
    harness.controller.recentRuns = const [
      RecentRun(
        jobId: 'job-a',
        createdAt: 'unix:1',
        status: 'completed',
        stage: 'done',
        inputPreview: 'mail',
        fileCount: 1,
        serviceUrl: '',
        progressPercent: 100,
      ),
      RecentRun(
        jobId: 'job-b',
        createdAt: 'unix:2',
        status: 'running',
        stage: 'running',
        inputPreview: 'mail',
        fileCount: 2,
        serviceUrl: '',
        progressPercent: 50,
      ),
    ];
    harness.controller.checkpointStore = CheckpointStore(
      nodes: [
        CheckpointNode(
          checkpointId: 'cp-a',
          uploadSessionId: 'session-a',
          updatedAt: 'unix:1',
        ),
        CheckpointNode(
          checkpointId: 'cp-b',
          uploadSessionId: 'session-b',
          updatedAt: 'unix:2',
          state: CheckpointState.networkInterrupted,
        ),
      ],
    );

    expect(harness.controller.queueCount, 2);
    expect(harness.controller.rawDataCount, 3072);
    expect(harness.controller.queueBytesLabel, '3 千字节');
    expect(harness.controller.resumableCheckpointCount, 2);

    await harness.controller.selectRun('job-b');
    expect(harness.controller.selectedRun?.jobId, 'job-b');
    harness.controller.selectCheckpoint('cp-b');
    expect(harness.controller.selectedCheckpoint?.checkpointId, 'cp-b');
    expect(harness.controller.selectedUploadSessionId, 'session-b');
    harness.controller.selectUploadSession('session-a');
    expect(harness.controller.selectedCheckpointId, 'cp-a');
    expect(harness.controller.uploadSessionPageCount, 1);
    harness.controller.setUploadSessionPage(10);
    expect(harness.controller.uploadSessionPageIndex, 0);

    harness.controller.clearQueue();
    expect(harness.controller.queueCount, 0);
    expect(harness.controller.statusMessage, '队列已清空。');
  });

  test('controller knowledge search uses backend and can be reset', () async {
    final harness = await _ControllerHarness.create(
      backend: _FakeBackendScenario.available(),
    );
    addTearDown(harness.dispose);
    await harness.controller.initialize();

    await harness.controller.searchKnowledgeGraph(' contract ');

    expect(harness.backend.searchKnowledgeCacheCalls, 1);
    expect(harness.controller.knowledgeSearchQuery, 'contract');
    expect(harness.controller.knowledgeSearchTotal, 1);
    expect(
      harness.controller.knowledgeSearchResults.single.subject,
      'MSA review',
    );
    expect(harness.controller.statusMessage, '知识库搜索命中 1 个本地知识文档。');

    harness.controller.clearKnowledgeSearch();
    expect(harness.controller.knowledgeSearchQuery, '');
    expect(harness.controller.knowledgeSearchTotal, 0);
    expect(harness.controller.knowledgeSearchResults, isEmpty);
  });

  test(
    'controller graph source registration and log clearing update state',
    () async {
      final harness = await _ControllerHarness.create(
        backend: _FakeBackendScenario.available(),
      );
      addTearDown(harness.dispose);
      await harness.controller.initialize();

      harness.controller.registerKnowledgeGraphDataSource(_StaticDataSource());
      expect(harness.controller.statusMessage, contains('静态测试源'));
      harness.controller.unregisterKnowledgeGraphDataSource('static-test');
      expect(harness.controller.statusMessage, contains('static-test 已移除'));

      await harness.storage.appendClientLogLine('old log');
      harness.controller.logs = ['visible log'];
      harness.controller.lastError = 'previous';
      harness.controller.clearLogs();

      expect(harness.controller.logs, isEmpty);
      expect(harness.controller.lastError, '');
      expect(harness.controller.statusMessage, '本地日志已清空。');
    },
  );

  test(
    'controller executes text payload through upload session and job lifecycle',
    () async {
      final harness = await _ControllerHarness.create(
        initialConfig: const ClientConfig(
          resolvedServiceBaseUrl: 'http://splitall.test',
        ),
        backend: _FakeBackendScenario.available(),
      );
      addTearDown(harness.dispose);
      await harness.controller.initialize();

      harness.controller.inputController.text = 'Analyze this mail thread.';
      await harness.controller.executePayload();

      expect(harness.backend.submitPipelineCalls, 1);
      expect(harness.controller.activeJob?.isCompleted, isTrue);
      expect(harness.controller.activeResult?['summary'], 'done');
      expect(harness.controller.recentRuns.first.jobId, 'job-created');
      expect(harness.controller.checkpointStore.nodes.length, 1);
      expect(
        harness.controller.selectedCheckpoint?.state,
        CheckpointState.clientConfirmed,
      );
      expect(harness.controller.statusMessage, '结果载荷已就绪。');
    },
  );

  test(
    'controller syncs server interface registry through backend API',
    () async {
      final harness = await _ControllerHarness.create(
        initialConfig: const ClientConfig(
          resolvedServiceBaseUrl: 'http://splitall.test',
        ),
        backend: _FakeBackendScenario.available(),
      );
      addTearDown(harness.dispose);
      await harness.controller.initialize();

      await harness.controller.refreshServerCapabilities();

      expect(harness.backend.listServerInterfacesCalls, 1);
      expect(harness.controller.serverOperations.length, 2);
      expect(harness.controller.serverFeatureCount, 2);
      expect(harness.controller.serverReadOnlyOperationCount, 1);
      expect(harness.controller.serverOverview['health'], isA<Map>());

      await harness.controller.executeServerRequest(
        method: 'GET',
        path: '/api/runtime/info',
      );
      expect(harness.backend.serverApiCalls, greaterThanOrEqualTo(1));
      expect(
        harness.controller.serverOperationResult?['path'],
        '/api/runtime/info',
      );
    },
  );
}

class _ControllerHarness {
  _ControllerHarness({
    required this.directory,
    required this.storage,
    required this.backend,
    required this.controller,
  });

  final Directory directory;
  final PortableStorage storage;
  final _FakeClientBackendApi backend;
  final AppController controller;

  static Future<_ControllerHarness> create({
    ClientConfig initialConfig = const ClientConfig(),
    required _FakeBackendScenario backend,
  }) async {
    final directory = await Directory.systemTemp.createTemp(
      'splitall-controller-',
    );
    final storage = PortableStorage(dataDirectoryOverride: directory);
    await storage.saveConfig(initialConfig);
    final fakeBackend = _FakeClientBackendApi(
      storage: storage,
      scenario: backend,
    );
    final controller = AppController(storage: storage, backendApi: fakeBackend);
    return _ControllerHarness(
      directory: directory,
      storage: storage,
      backend: fakeBackend,
      controller: controller,
    );
  }

  Future<void> dispose() async {
    controller.dispose();
    if (await directory.exists()) {
      await directory.delete(recursive: true);
    }
  }
}

class _FakeBackendScenario {
  _FakeBackendScenario({
    required this.available,
    required this.vocabulary,
    required this.stats,
    required this.rebuildStats,
  });

  final bool available;
  final ExpertVocabulary vocabulary;
  final Map<String, dynamic> stats;
  final Map<String, dynamic> rebuildStats;

  factory _FakeBackendScenario.available({
    ExpertVocabulary? vocabulary,
    Map<String, dynamic>? stats,
    Map<String, dynamic>? rebuildStats,
  }) {
    return _FakeBackendScenario(
      available: true,
      vocabulary: vocabulary ?? _testVocabulary(),
      stats: stats ?? _stats(documentCount: 4, segmentCount: 2),
      rebuildStats: rebuildStats ?? _stats(documentCount: 7, segmentCount: 3),
    );
  }

  factory _FakeBackendScenario.unavailable() {
    return _FakeBackendScenario(
      available: false,
      vocabulary: ExpertVocabulary.empty(),
      stats: const {},
      rebuildStats: const {},
    );
  }
}

class _FakeClientBackendApi extends ClientBackendApi {
  _FakeClientBackendApi({required this.storage, required this.scenario})
    : super(
        storage: storage,
        client: MockClient((request) async => http.Response('{}', 200)),
      );

  final PortableStorage storage;
  final _FakeBackendScenario scenario;
  int ensureDaemonCalls = 0;
  int pullVocabularyCalls = 0;
  int mailIndexStatsCalls = 0;
  int rebuildMailIndexCalls = 0;
  int applyVocabularyCalls = 0;
  int searchMailIndexCalls = 0;
  int searchKnowledgeCacheCalls = 0;
  int syncKnowledgeCacheCalls = 0;
  int listServerInterfacesCalls = 0;
  int serverApiCalls = 0;
  int submitPipelineCalls = 0;
  Map<String, dynamic>? _currentStats;

  @override
  Future<bool> ensureDaemon() async {
    ensureDaemonCalls += 1;
    return scenario.available;
  }

  @override
  Future<ClientBackendCapabilities?> loadCapabilities() async {
    if (!scenario.available) {
      return null;
    }
    return const ClientBackendCapabilities(
      schemaVersion: 1,
      protocolVersion: 1,
      platform: 'test',
      mailImport: false,
      mailIndex: true,
      fileIndex: true,
      localRpc: true,
      expertVocabulary: true,
      platformAdapters: ['filesystem', 'test'],
      updatedAt: 'unix:capabilities',
    );
  }

  @override
  Future<ClientBackendRuntimeState?> loadRuntimeState() async {
    if (!scenario.available) {
      return null;
    }
    final stats = _currentStats ?? scenario.stats;
    return ClientBackendRuntimeState(
      schemaVersion: 1,
      protocolVersion: 1,
      daemonStatus: 'running',
      currentTask: '',
      mailIndex: stats,
      vocabulary: ClientBackendVocabularyState(
        version: scenario.vocabulary.version,
        checksum: scenario.vocabulary.checksum,
        activeEntryCount: scenario.vocabulary.activeEntryCount,
        updatedAt: scenario.vocabulary.updatedAt,
      ),
      recentError: '',
      lastHeartbeatAt: 'unix:${DateTime.now().millisecondsSinceEpoch ~/ 1000}',
      dataDirectory: (await storage.dataDirectory()).path,
    );
  }

  @override
  Future<ExpertVocabulary> pullVocabulary() async {
    pullVocabularyCalls += 1;
    final directory = await storage.dataDirectory();
    await storage.saveExpertVocabulary(
      mailWorkspaceDirectory: p.join(directory.path, 'mail-imports'),
      vocabulary: scenario.vocabulary,
    );
    return scenario.vocabulary;
  }

  @override
  Future<Map<String, dynamic>> mailIndexStats() async {
    mailIndexStatsCalls += 1;
    return _currentStats ?? scenario.stats;
  }

  @override
  Future<Map<String, dynamic>> rebuildMailIndex() async {
    rebuildMailIndexCalls += 1;
    _currentStats = scenario.rebuildStats;
    return scenario.rebuildStats;
  }

  @override
  Future<Map<String, dynamic>> applyVocabularyToIndex() async {
    applyVocabularyCalls += 1;
    return {
      'documentCount': (_currentStats ?? scenario.stats)['documentCount'] ?? 0,
      'updatedDocumentCount': 1,
      'taxonomySignature': scenario.vocabulary.checksum,
      'indexDirectory':
          (_currentStats ?? scenario.stats)['indexDirectory'] ?? '',
    };
  }

  @override
  Future<Map<String, dynamic>> searchMailIndex({
    required String query,
    int limit = 50,
    int offset = 0,
  }) async {
    searchMailIndexCalls += 1;
    return {
      'total': 1,
      'results': [
        {
          'docId': 1,
          'messageKey': 'm1',
          'fileName': 'm1.eml',
          'path': '/tmp/m1.eml',
          'subject': 'MSA review',
          'sender': 'Alice <alice@legal.example>',
          'recipients': 'Bob <bob@example.com>',
          'cc': '',
          'dateSent': '2026-04-28T10:00:00Z',
          'dateReceived': '2026-04-28T10:01:00Z',
          'account': 'Work',
          'mailboxPath': 'Inbox',
          'status': 'ok',
          'lastSeenAt': 'unix:1',
          'error': '',
        },
      ],
    };
  }

  @override
  Future<Map<String, dynamic>> searchKnowledgeCache({
    required String query,
    int limit = 50,
  }) async {
    searchKnowledgeCacheCalls += 1;
    return {
      'total': 1,
      'items': [
        {
          'documentId': 'doc-msa',
          'itemId': 'doc-msa',
          'documentType': 'transaction',
          'title': 'MSA review',
          'summary': 'Contract review summary.',
          'snippet': 'Contract review summary.',
          'localMarkdownPath': '/tmp/doc-msa.md',
          'serverUpdatedAt': '2026-04-28T10:01:00Z',
        },
      ],
    };
  }

  @override
  Future<Map<String, dynamic>> syncKnowledgeCache({
    required String serviceBaseUrl,
    String? since,
    bool pushOutbox = false,
  }) async {
    syncKnowledgeCacheCalls += 1;
    return {
      'ok': true,
      'stats': {'documentCount': 1},
    };
  }

  @override
  Future<Map<String, dynamic>> listServerInterfaces({
    required String serviceBaseUrl,
  }) async {
    listServerInterfacesCalls += 1;
    return {
      'interfaces': [
        {
          'id': 'runtime.info',
          'feature': 'runtime',
          'label': '运行时信息',
          'target': 'system.handleRuntimeInfo',
          'http': 'GET /api/runtime/info',
          'rpc': 'runtime.info',
          'cli': 'runtime info',
          'safety': {'risk': 'read_only'},
          'requiredScopes': ['console:read'],
        },
        {
          'id': 'knowledge.reindex',
          'feature': 'knowledge',
          'label': '知识库重建索引',
          'target': 'system.handleKnowledgeReindex',
          'http': 'POST /api/knowledge/reindex',
          'rpc': 'knowledge.reindex',
          'cli': 'knowledge reindex',
          'safety': {'risk': 'repair_write'},
          'requiredScopes': ['knowledge:admin'],
        },
      ],
    };
  }

  @override
  Future<Map<String, dynamic>> serverApi({
    required String serviceBaseUrl,
    required String method,
    required String path,
    Map<String, dynamic>? body,
  }) async {
    serverApiCalls += 1;
    final result = {'ok': true, 'method': method, 'path': path};
    if (body != null) {
      result['body'] = body;
    }
    return result;
  }

  @override
  Future<Map<String, dynamic>> submitPipeline({
    required String serviceBaseUrl,
    required String inputText,
    required List<Map<String, dynamic>> files,
    required Map<String, dynamic> settings,
  }) async {
    submitPipelineCalls += 1;
    return {
      'ok': true,
      'checkpointId': 'checkpoint-created',
      'manifestDigest': 'manifest-created',
      'serviceBaseUrl': serviceBaseUrl,
      'job': {
        'id': 'job-created',
        'status': 'completed',
        'progressPercent': 100,
        'stage': 'completed',
      },
      'result': {
        'summary': 'done',
        'people': [
          {'name': 'Alice'},
        ],
        'transactions': [
          {'title': 'MSA approval'},
        ],
      },
      'uploadSession': {
        'sessionId': 'session-created',
        'checkpointId': 'checkpoint-created',
        'manifestDigest': 'manifest-created',
        'inputDigest': 'input-created',
        'status': 'complete',
        'createdAt': 'unix:1',
        'updatedAt': 'unix:2',
        'files': const [],
      },
    };
  }

  @override
  void dispose() {}
}

class _StaticDataSource implements KnowledgeGraphDataSource {
  @override
  String get sourceId => 'static-test';

  @override
  String get label => '静态测试源';

  @override
  bool isEnabled(KnowledgeGraphContext context) => true;

  @override
  KnowledgeGraphContribution build(KnowledgeGraphContext context) {
    return const KnowledgeGraphContribution(
      nodes: [
        KnowledgeGraphNode(
          id: 'static-root',
          label: 'Static',
          kind: 'root',
          moduleId: 'static-test',
        ),
      ],
      edges: [],
    );
  }
}

ExpertVocabulary _testVocabulary({
  int version = 4,
  String checksum = 'checksum-controller',
}) {
  return ExpertVocabulary(
    schemaVersion: 1,
    version: version,
    updatedAt: 'unix:$version',
    publishedAt: 'unix:$version',
    source: 'test',
    checksum: checksum,
    entries: const [
      ExpertVocabularyEntry(
        id: 'contract',
        pathSegments: ['专家', '合同'],
        label: '合同',
        keywords: ['msa'],
        domains: ['legal.example'],
        status: 'active',
        notes: '',
      ),
    ],
  );
}

Map<String, dynamic> _stats({
  required int documentCount,
  required int segmentCount,
  int pendingCount = 0,
}) {
  return {
    'documentCount': documentCount,
    'segmentCount': segmentCount,
    'pendingCount': pendingCount,
    'lastUpdatedAt': 'unix:$documentCount',
    'indexDirectory': '/tmp/mail-$documentCount',
  };
}
