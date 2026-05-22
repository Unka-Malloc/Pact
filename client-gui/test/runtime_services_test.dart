import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter_client/src/models/app_models.dart';
import 'package:flutter_client/src/models/knowledge_graph_models.dart';
import 'package:flutter_client/src/services/runtime_services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:path/path.dart' as p;

void main() {
  test('portable storage creates a workspace manifest', () async {
    final directory = await Directory.systemTemp.createTemp(
      'pact-workspace-',
    );
    addTearDown(() async {
      if (await directory.exists()) {
        await directory.delete(recursive: true);
      }
    });

    final storage = PortableStorage(dataDirectoryOverride: directory);
    final dataDirectory = await storage.dataDirectory();
    final manifest = await storage.loadWorkspaceManifest();

    expect(dataDirectory.path, directory.path);
    expect(manifest.appId, ClientWorkspaceManifest.pactClientAppId);
    expect(manifest.workspaceId, isNotEmpty);
    expect(
      File(p.join(directory.path, '.pact-workspace.json')).existsSync(),
      isTrue,
    );
  });

  test(
    'module workspace is constrained to a validated child directory',
    () async {
      final directory = await Directory.systemTemp.createTemp(
        'pact-modules-',
      );
      addTearDown(() async {
        if (await directory.exists()) {
          await directory.delete(recursive: true);
        }
      });

      final storage = PortableStorage(dataDirectoryOverride: directory);
      final workspace = await storage.moduleWorkspace(
        'knowledge',
        subdirectories: const ['documents', 'assets'],
      );

      expect(workspace.directory.path, p.join(directory.path, 'knowledge'));
      expect(
        Directory(p.join(workspace.directory.path, 'documents')).existsSync(),
        isTrue,
      );
      expect(
        () => PortableStorage.moduleWorkspacePath(directory, '../bad'),
        throwsArgumentError,
      );
      expect(
        () => PortableStorage.validateModuleSubdirectory('../outside'),
        throwsArgumentError,
      );
    },
  );

  test(
    'shared json config is saved and loaded through portable storage',
    () async {
      final directory = await Directory.systemTemp.createTemp(
        'pact-config-',
      );
      addTearDown(() async {
        if (await directory.exists()) {
          await directory.delete(recursive: true);
        }
      });

      final storage = PortableStorage(dataDirectoryOverride: directory);
      await storage.saveConfig(const ClientConfig(clientId: 'client-a'));

      final config = await storage.loadConfig();
      expect(config.clientId, 'client-a');
      expect(
        File(p.join(directory.path, 'settings.json')).existsSync(),
        isTrue,
      );
    },
  );

  test('mail expert vocabulary is stored under the mail workspace', () async {
    final directory = await Directory.systemTemp.createTemp(
      'pact-vocabulary-',
    );
    addTearDown(() async {
      if (await directory.exists()) {
        await directory.delete(recursive: true);
      }
    });

    final storage = PortableStorage(dataDirectoryOverride: directory);
    final mailWorkspace = p.join(directory.path, 'mail-imports');
    await storage.saveExpertVocabulary(
      mailWorkspaceDirectory: mailWorkspace,
      vocabulary: const ExpertVocabulary(
        schemaVersion: 1,
        version: 3,
        updatedAt: '2026-04-27T00:00:00.000Z',
        publishedAt: '2026-04-27T00:00:00.000Z',
        source: 'test',
        checksum: 'abc123',
        entries: [
          ExpertVocabularyEntry(
            id: 'vocab-test',
            pathSegments: ['测试', '专家'],
            label: '专家',
            keywords: ['human review'],
            domains: ['example.org'],
            status: 'active',
            notes: '',
          ),
        ],
      ),
    );

    final vocabulary = await storage.loadExpertVocabulary(
      mailWorkspaceDirectory: mailWorkspace,
    );
    expect(vocabulary.version, 3);
    expect(vocabulary.activeEntryCount, 1);
    expect(
      File(p.join(mailWorkspace, 'expert-vocabulary.json')).existsSync(),
      isTrue,
    );
  });

  test('client backend api reads shared state files', () async {
    final directory = await Directory.systemTemp.createTemp(
      'pact-backend-',
    );
    addTearDown(() async {
      if (await directory.exists()) {
        await directory.delete(recursive: true);
      }
    });

    final backendDirectory = Directory(p.join(directory.path, 'backend'));
    await backendDirectory.create(recursive: true);
    await File(
      p.join(backendDirectory.path, 'capabilities.json'),
    ).writeAsString(
      jsonEncode({
        'schemaVersion': 1,
        'protocolVersion': 1,
        'platform': 'test',
        'mailImport': false,
        'mailIndex': true,
        'fileIndex': true,
        'localRpc': true,
        'expertVocabulary': true,
        'platformAdapters': ['filesystem'],
        'updatedAt': 'unix:1',
      }),
    );
    await File(
      p.join(backendDirectory.path, 'runtime-state.json'),
    ).writeAsString(
      jsonEncode({
        'schemaVersion': 1,
        'protocolVersion': 1,
        'daemonStatus': 'running',
        'currentTask': '',
        'mailIndex': {
          'documentCount': 2,
          'segmentCount': 3,
          'pendingCount': 0,
          'lastUpdatedAt': 'unix:2',
          'indexDirectory': '/tmp/index',
        },
        'vocabulary': {
          'version': 4,
          'checksum': 'abc',
          'activeEntryCount': 5,
          'updatedAt': 'unix:3',
        },
        'recentError': '',
        'lastHeartbeatAt': 'unix:4',
        'dataDirectory': directory.path,
      }),
    );
    await File(p.join(backendDirectory.path, 'rpc.json')).writeAsString(
      jsonEncode({
        'schemaVersion': 1,
        'protocolVersion': 1,
        'transport': 'http',
        'baseUrl': 'http://127.0.0.1:12345',
        'token': 'secret',
        'updatedAt': 'unix:5',
      }),
    );

    final api = ClientBackendApi(
      storage: PortableStorage(dataDirectoryOverride: directory),
    );
    addTearDown(api.dispose);

    final capabilities = await api.loadCapabilities();
    final state = await api.loadRuntimeState();
    final rpc = await api.loadRpcConfig();

    expect(capabilities?.mailIndex, isTrue);
    expect(state?.daemonStatus, 'running');
    expect(state?.mailIndex['documentCount'], 2);
    expect(rpc?.baseUrl, 'http://127.0.0.1:12345');
  });

  test('client backend api submits workspace command files', () async {
    final directory = await Directory.systemTemp.createTemp(
      'pact-command-',
    );
    addTearDown(() async {
      if (await directory.exists()) {
        await directory.delete(recursive: true);
      }
    });

    final backendDirectory = Directory(p.join(directory.path, 'backend'));
    await Directory(
      p.join(backendDirectory.path, 'commands', 'inbox'),
    ).create(recursive: true);
    await Directory(
      p.join(backendDirectory.path, 'command-results'),
    ).create(recursive: true);
    await File(
      p.join(backendDirectory.path, 'runtime-state.json'),
    ).writeAsString(
      jsonEncode({
        'schemaVersion': 1,
        'protocolVersion': 1,
        'daemonStatus': 'running',
        'currentTask': '',
        'mailIndex': {
          'documentCount': 0,
          'segmentCount': 0,
          'pendingCount': 0,
          'lastUpdatedAt': '',
          'indexDirectory': '',
        },
        'vocabulary': {
          'version': 0,
          'checksum': '',
          'activeEntryCount': 0,
          'updatedAt': '',
        },
        'recentError': '',
        'lastHeartbeatAt':
            'unix:${DateTime.now().toUtc().millisecondsSinceEpoch ~/ 1000}',
        'dataDirectory': directory.path,
      }),
    );

    final api = ClientBackendApi(
      storage: PortableStorage(dataDirectoryOverride: directory),
    );
    addTearDown(api.dispose);

    final responder = Future<void>(() async {
      final inbox = Directory(
        p.join(backendDirectory.path, 'commands', 'inbox'),
      );
      File? commandFile;
      for (var attempt = 0; attempt < 30; attempt += 1) {
        final files = inbox
            .listSync()
            .whereType<File>()
            .where((file) => p.extension(file.path) == '.json')
            .toList();
        if (files.isNotEmpty) {
          commandFile = files.first;
          break;
        }
        await Future<void>.delayed(const Duration(milliseconds: 50));
      }
      expect(commandFile, isNotNull);
      final command = jsonDecode(await commandFile!.readAsString()) as Map;
      final commandId = command['commandId'].toString();
      await File(
        p.join(backendDirectory.path, 'command-results', '$commandId.json'),
      ).writeAsString(
        jsonEncode({
          'schemaVersion': 1,
          'protocolVersion': 1,
          'commandId': commandId,
          'method': command['method'],
          'status': 'completed',
          'result': {
            'documentCount': 7,
            'segmentCount': 2,
            'pendingCount': 0,
            'lastUpdatedAt': 'unix:9',
            'indexDirectory': '/tmp/index',
          },
          'error': null,
          'startedAt': 'unix:8',
          'finishedAt': 'unix:9',
        }),
      );
    });

    final result = await api.mailIndexStats();
    await responder;
    expect(result['documentCount'], 7);
    expect(result['segmentCount'], 2);
  });

  test('client backend api normalizes bare bootstrap URLs', () async {
    final directory = await Directory.systemTemp.createTemp(
      'pact-bootstrap-url-',
    );
    addTearDown(() async {
      if (await directory.exists()) {
        await directory.delete(recursive: true);
      }
    });

    final backendDirectory = Directory(p.join(directory.path, 'backend'));
    await Directory(
      p.join(backendDirectory.path, 'commands', 'inbox'),
    ).create(recursive: true);
    await Directory(
      p.join(backendDirectory.path, 'command-results'),
    ).create(recursive: true);
    await File(
      p.join(backendDirectory.path, 'runtime-state.json'),
    ).writeAsString(
      jsonEncode({
        'schemaVersion': 1,
        'protocolVersion': 1,
        'daemonStatus': 'running',
        'currentTask': '',
        'mailIndex': const {},
        'vocabulary': const {
          'version': 0,
          'checksum': '',
          'activeEntryCount': 0,
          'updatedAt': '',
        },
        'recentError': '',
        'lastHeartbeatAt':
            'unix:${DateTime.now().toUtc().millisecondsSinceEpoch ~/ 1000}',
        'dataDirectory': directory.path,
      }),
    );

    final api = ClientBackendApi(
      storage: PortableStorage(dataDirectoryOverride: directory),
    );
    addTearDown(api.dispose);

    final responder = Future<void>(() async {
      final inbox = Directory(
        p.join(backendDirectory.path, 'commands', 'inbox'),
      );
      File? commandFile;
      for (var attempt = 0; attempt < 30; attempt += 1) {
        final files = inbox
            .listSync()
            .whereType<File>()
            .where((file) => p.extension(file.path) == '.json')
            .toList();
        if (files.isNotEmpty) {
          commandFile = files.first;
          break;
        }
        await Future<void>.delayed(const Duration(milliseconds: 50));
      }
      expect(commandFile, isNotNull);
      final command = jsonDecode(await commandFile!.readAsString()) as Map;
      expect(command['method'], 'server.api');
      final params = Map<String, dynamic>.from(command['params'] as Map);
      expect(params['serviceBaseUrl'], 'http://127.0.0.1:8787');
      expect(params['path'], '/api/bootstrap');
      final commandId = command['commandId'].toString();
      await File(
        p.join(backendDirectory.path, 'command-results', '$commandId.json'),
      ).writeAsString(
        jsonEncode({
          'schemaVersion': 1,
          'protocolVersion': 1,
          'commandId': commandId,
          'method': command['method'],
          'status': 'completed',
          'result': {
            'bootstrapBaseUrl': 'http://127.0.0.1:8787',
            'activeServiceUrl': 'http://127.0.0.1:8787',
            'configVersion': 'test',
            'resolvedAt': 'unix:1',
          },
          'error': null,
          'startedAt': 'unix:1',
          'finishedAt': 'unix:1',
        }),
      );
    });

    final bootstrap = await api.fetchBootstrap('127.0.0.1:8787');
    await responder;

    expect(bootstrap.bootstrapBaseUrl, 'http://127.0.0.1:8787');
    expect(
      PactServiceUrls.normalizeBaseUrl('localhost:8787/api/bootstrap/'),
      'http://localhost:8787',
    );
  });

  test(
    'client backend api rejects incompatible shared protocol files',
    () async {
      final directory = await Directory.systemTemp.createTemp(
        'pact-incompatible-backend-',
      );
      addTearDown(() async {
        if (await directory.exists()) {
          await directory.delete(recursive: true);
        }
      });

      final backendDirectory = Directory(p.join(directory.path, 'backend'));
      await backendDirectory.create(recursive: true);
      await File(
        p.join(backendDirectory.path, 'capabilities.json'),
      ).writeAsString(
        jsonEncode({
          'schemaVersion': 99,
          'protocolVersion': 99,
          'platform': 'future',
        }),
      );
      await File(p.join(backendDirectory.path, 'rpc.json')).writeAsString(
        jsonEncode({
          'schemaVersion': 1,
          'protocolVersion': 1,
          'transport': 'http',
          'baseUrl': 'http://127.0.0.1:12345',
          'token': '',
          'updatedAt': 'unix:1',
        }),
      );

      final api = ClientBackendApi(
        storage: PortableStorage(dataDirectoryOverride: directory),
      );
      addTearDown(api.dispose);

      expect(await api.loadCapabilities(), isNull);
      expect(await api.loadRpcConfig(), isNull);
    },
  );

  test('client backend api treats stale heartbeat as stopped', () async {
    final directory = await Directory.systemTemp.createTemp(
      'pact-stale-backend-',
    );
    addTearDown(() async {
      if (await directory.exists()) {
        await directory.delete(recursive: true);
      }
    });

    final backendDirectory = Directory(p.join(directory.path, 'backend'));
    await backendDirectory.create(recursive: true);
    await File(
      p.join(backendDirectory.path, 'runtime-state.json'),
    ).writeAsString(
      jsonEncode({
        'schemaVersion': 1,
        'protocolVersion': 1,
        'daemonStatus': 'running',
        'currentTask': '',
        'mailIndex': const {},
        'vocabulary': const {
          'version': 0,
          'checksum': '',
          'activeEntryCount': 0,
          'updatedAt': '',
        },
        'recentError': '',
        'lastHeartbeatAt': 'unix:1',
        'dataDirectory': directory.path,
      }),
    );

    final api = ClientBackendApi(
      storage: PortableStorage(dataDirectoryOverride: directory),
    );
    addTearDown(api.dispose);

    expect(await api.isDaemonRunning(), isFalse);
  });

  test('client backend api surfaces failed command results', () async {
    final directory = await Directory.systemTemp.createTemp(
      'pact-command-failure-',
    );
    addTearDown(() async {
      if (await directory.exists()) {
        await directory.delete(recursive: true);
      }
    });

    final backendDirectory = Directory(p.join(directory.path, 'backend'));
    await Directory(
      p.join(backendDirectory.path, 'commands', 'inbox'),
    ).create(recursive: true);
    await Directory(
      p.join(backendDirectory.path, 'command-results'),
    ).create(recursive: true);
    await File(
      p.join(backendDirectory.path, 'runtime-state.json'),
    ).writeAsString(
      jsonEncode({
        'schemaVersion': 1,
        'protocolVersion': 1,
        'daemonStatus': 'running',
        'currentTask': '',
        'mailIndex': const {},
        'vocabulary': const {
          'version': 0,
          'checksum': '',
          'activeEntryCount': 0,
          'updatedAt': '',
        },
        'recentError': '',
        'lastHeartbeatAt':
            'unix:${DateTime.now().toUtc().millisecondsSinceEpoch ~/ 1000}',
        'dataDirectory': directory.path,
      }),
    );

    final api = ClientBackendApi(
      storage: PortableStorage(dataDirectoryOverride: directory),
    );
    addTearDown(api.dispose);

    final responder = Future<void>(() async {
      final inbox = Directory(
        p.join(backendDirectory.path, 'commands', 'inbox'),
      );
      File? commandFile;
      for (var attempt = 0; attempt < 30; attempt += 1) {
        final files = inbox
            .listSync()
            .whereType<File>()
            .where((file) => p.extension(file.path) == '.json')
            .toList();
        if (files.isNotEmpty) {
          commandFile = files.first;
          break;
        }
        await Future<void>.delayed(const Duration(milliseconds: 50));
      }
      expect(commandFile, isNotNull);
      final command = jsonDecode(await commandFile!.readAsString()) as Map;
      final commandId = command['commandId'].toString();
      await File(
        p.join(backendDirectory.path, 'command-results', '$commandId.json'),
      ).writeAsString(
        jsonEncode({
          'schemaVersion': 1,
          'protocolVersion': 1,
          'commandId': commandId,
          'method': command['method'],
          'status': 'failed',
          'result': null,
          'error': {'code': -32000, 'message': 'boom'},
          'startedAt': 'unix:1',
          'finishedAt': 'unix:2',
        }),
      );
    });

    await expectLater(
      api.mailIndexStats(),
      throwsA(
        isA<ApiException>().having((error) => error.message, 'message', 'boom'),
      ),
    );
    await responder;
  });

  test(
    'client backend api times out when command result never arrives',
    () async {
      final directory = await Directory.systemTemp.createTemp(
        'pact-command-timeout-',
      );
      addTearDown(() async {
        if (await directory.exists()) {
          await directory.delete(recursive: true);
        }
      });

      final backendDirectory = Directory(p.join(directory.path, 'backend'));
      await Directory(
        p.join(backendDirectory.path, 'commands', 'inbox'),
      ).create(recursive: true);
      await Directory(
        p.join(backendDirectory.path, 'command-results'),
      ).create(recursive: true);
      await File(
        p.join(backendDirectory.path, 'runtime-state.json'),
      ).writeAsString(
        jsonEncode({
          'schemaVersion': 1,
          'protocolVersion': 1,
          'daemonStatus': 'running',
          'currentTask': '',
          'mailIndex': const {},
          'vocabulary': const {
            'version': 0,
            'checksum': '',
            'activeEntryCount': 0,
            'updatedAt': '',
          },
          'recentError': '',
          'lastHeartbeatAt':
              'unix:${DateTime.now().toUtc().millisecondsSinceEpoch ~/ 1000}',
          'dataDirectory': directory.path,
        }),
      );

      final api = ClientBackendApi(
        storage: PortableStorage(dataDirectoryOverride: directory),
      );
      addTearDown(api.dispose);

      await expectLater(
        api.submitCommand(
          'mail.index.stats',
          timeout: const Duration(milliseconds: 80),
        ),
        throwsA(isA<TimeoutException>()),
      );
      expect(
        Directory(p.join(backendDirectory.path, 'commands', 'inbox'))
            .listSync()
            .whereType<File>()
            .where((file) => p.extension(file.path) == '.json'),
        isNotEmpty,
      );
    },
  );

  test('client backend api rpc maps backend errors', () async {
    final directory = await Directory.systemTemp.createTemp('pact-rpc-');
    addTearDown(() async {
      if (await directory.exists()) {
        await directory.delete(recursive: true);
      }
    });

    final backendDirectory = Directory(p.join(directory.path, 'backend'));
    await backendDirectory.create(recursive: true);
    await File(p.join(backendDirectory.path, 'rpc.json')).writeAsString(
      jsonEncode({
        'schemaVersion': 1,
        'protocolVersion': 1,
        'transport': 'http',
        'baseUrl': 'http://127.0.0.1:12345/',
        'token': 'secret',
        'updatedAt': 'unix:5',
      }),
    );

    final api = ClientBackendApi(
      storage: PortableStorage(dataDirectoryOverride: directory),
      client: MockClient((request) async {
        expect(request.url.toString(), 'http://127.0.0.1:12345/rpc');
        expect(request.headers['x-pact-client-token'], 'secret');
        return http.Response(
          jsonEncode({
            'jsonrpc': '2.0',
            'id': '1',
            'error': {'code': -32000, 'message': 'rpc failed'},
          }),
          200,
        );
      }),
    );
    addTearDown(api.dispose);

    await expectLater(
      api.rpc('system.ping'),
      throwsA(
        isA<ApiException>().having(
          (error) => error.message,
          'message',
          'rpc failed',
        ),
      ),
    );
  });

  test(
    'portable storage keeps recent runs, logs and mail docs bounded',
    () async {
      final directory = await Directory.systemTemp.createTemp(
        'pact-storage-more-',
      );
      addTearDown(() async {
        if (await directory.exists()) {
          await directory.delete(recursive: true);
        }
      });

      final storage = PortableStorage(dataDirectoryOverride: directory);
      await storage.saveRecentRuns([
        const RecentRun(
          jobId: 'job-a',
          createdAt: 'unix:1',
          status: 'completed',
          stage: 'done',
          inputPreview: 'mail',
          fileCount: 2,
          serviceUrl: 'http://server',
          progressPercent: 100,
        ),
      ]);
      await storage.appendClientLogLine('first');
      await storage.appendClientLogLine('second');

      final mailWorkspace = p.join(directory.path, 'mail-imports');
      await Directory(p.join(mailWorkspace, 'index')).create(recursive: true);
      await File(p.join(mailWorkspace, 'index', 'docs.tsv')).writeAsString(
        '1\tm1\tmail.eml\tSubject\tSender <a@example.com>\tto@example.com\t\t2026\t2026\tacc\tInbox\tok\tunix:1\t\tsha\t42\t专家/合同\n'
        'bad\t\tinvalid.eml\tNo id\n',
      );

      final runs = await storage.loadRecentRuns();
      final logs = await storage.loadClientLogs();
      final docs = await storage.loadMailKnowledgeDocuments(
        mailWorkspaceDirectory: mailWorkspace,
      );

      expect(runs.single.jobId, 'job-a');
      expect(logs, containsAll(['first', 'second']));
      expect(docs.length, 1);
      expect(docs.single.taxonomyPath, '专家/合同');
      expect(docs.single.byteSize, 42);
    },
  );

  test(
    'portable storage filters semantic suggestions to cloud useful items',
    () async {
      final directory = await Directory.systemTemp.createTemp(
        'pact-suggestions-',
      );
      addTearDown(() async {
        if (await directory.exists()) {
          await directory.delete(recursive: true);
        }
      });

      final storage = PortableStorage(dataDirectoryOverride: directory);
      final mailWorkspace = p.join(directory.path, 'mail-imports');
      await storage.saveMailKnowledgeSemanticSuggestions(
        mailWorkspaceDirectory: mailWorkspace,
        suggestions: {
          'm1': const MailKnowledgeSemanticSuggestion(
            messageKey: 'm1',
            taxonomyPath: '专家/合同',
            provider: 'cloud',
          ),
          'm2': const MailKnowledgeSemanticSuggestion(
            messageKey: 'm2',
            taxonomyPath: '本地',
            provider: 'local-rule',
          ),
          'm3': const MailKnowledgeSemanticSuggestion(
            messageKey: 'm3',
            provider: 'cloud',
          ),
        },
      );

      final loaded = await storage.loadMailKnowledgeSemanticSuggestions(
        mailWorkspaceDirectory: mailWorkspace,
      );
      expect(loaded.keys, ['m1']);
      expect(loaded['m1']!.taxonomyPath, '专家/合同');
    },
  );

  test(
    'app models preserve backend policies and sanitize vocabulary entries',
    () {
      final config = ClientConfig.fromJson({
        'bootstrapBaseUrl': 'http://server/api/bootstrap',
        'expertVocabularySyncPolicy': 'automatic',
        'indexHotUpdatePolicy': 'manual',
        'platformCapabilityPreference': 'backend',
      });
      final vocabulary = ExpertVocabulary.fromJson({
        'version': 3,
        'checksum': 'abc',
        'entries': [
          {
            'id': 'ok',
            'pathSegments': [' 专家 ', '', '合同'],
            'keywords': [' msa ', ''],
            'domains': ['example.com'],
            'status': 'active',
          },
          {'id': 'ignored', 'pathSegments': []},
        ],
      });

      expect(config.expertVocabularySyncPolicy, 'automatic');
      expect(config.indexHotUpdatePolicy, 'manual');
      expect(config.platformCapabilityPreference, 'backend');
      expect(vocabulary.entries.length, 1);
      expect(vocabulary.activeEntryCount, 1);
      expect(vocabulary.entries.single.pathSegments, ['专家', '合同']);
      expect(
        PactServiceUrls.normalizeBaseUrl(' http://server/api/bootstrap/ '),
        'http://server',
      );
      expect(
        PactServiceUrls.normalizeBaseUrl('127.0.0.1:8787'),
        'http://127.0.0.1:8787',
      );
      expect(
        PactServiceUrls.normalizeBaseUrl('https://example.test:9443/'),
        'https://example.test:9443',
      );
    },
  );
}
