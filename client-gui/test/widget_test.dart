import 'package:flutter_test/flutter_test.dart';

import 'package:flutter_client/src/models/app_models.dart';

void main() {
  test('export kinds remain stable', () {
    expect(ExportKind.values, [
      ExportKind.json,
      ExportKind.docx,
      ExportKind.knowledgeDocx,
      ExportKind.sourceLogs,
    ]);
  });

  test('app sections are the future client modules', () {
    expect(AppSection.values, [
      AppSection.agents,
      AppSection.mcpPlugins,
      AppSection.skillHub,
      AppSection.modelForwarding,
      AppSection.activity,
      AppSection.settings,
    ]);
  });

  test('client config preserves email analysis module setting', () {
    final config = ClientConfig.fromJson({
      'emailAnalysisModuleEnabled': false,
      'macOSMailUploadToCloudEnabled': true,
    });

    expect(config.emailAnalysisModuleEnabled, isFalse);
    expect(config.macOSMailUploadToCloudEnabled, isTrue);
    expect(config.toJson()['emailAnalysisModuleEnabled'], isFalse);
    expect(config.toJson()['macOSMailUploadToCloudEnabled'], isTrue);
  });

  test('server interface operation parses HTTP and safety metadata', () {
    final operation = ServerInterfaceOperation.fromJson({
      'id': 'runtime.info',
      'feature': 'runtime',
      'label': '运行时信息',
      'target': 'system.handleRuntimeInfo',
      'http': 'GET /api/runtime/info',
      'rpc': 'runtime.info',
      'cli': 'runtime info',
      'safety': {
        'risk': 'read_only',
        'readOnly': true,
        'concurrencySafe': true,
      },
      'readOnly': true,
      'destructive': false,
      'concurrencySafe': true,
      'audit': {'enabled': true, 'redaction': 'default'},
      'inputSchema': {'type': 'object'},
      'requiredScopes': ['console:read'],
    });

    expect(operation.httpMethod, 'GET');
    expect(operation.httpPath, '/api/runtime/info');
    expect(operation.isReadOnly, isTrue);
    expect(operation.concurrencySafe, isTrue);
    expect(operation.audit['redaction'], 'default');
    expect(operation.inputSchema['type'], 'object');
    expect(operation.matches('runtime'), isTrue);
    expect(operation.matches('concurrencySafe'), isTrue);
    expect(operation.matches('knowledge'), isFalse);
  });
}
