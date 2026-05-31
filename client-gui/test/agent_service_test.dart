import 'package:flutter_client/src/services/agent_service.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('target candidate parses target adapter scan shape', () {
    final target = TargetCandidate.fromJson({
      'target': 'opencode',
      'label': 'OpenCode',
      'kind': 'cli',
      'status': 'detected',
      'configured': false,
      'confidence': 0.72,
      'detail': 'OpenCode remote MCP configuration',
      'configPath': '/tmp/opencode.jsonc',
      'binaryPath': '/usr/local/bin/opencode',
      'adapterStatus': 'skeleton',
      'manual': true,
    });

    expect(target.target, 'opencode');
    expect(target.label, 'OpenCode');
    expect(target.configured, isFalse);
    expect(target.configPath, '/tmp/opencode.jsonc');
    expect(target.binaryPath, '/usr/local/bin/opencode');
    expect(target.adapterStatus, 'skeleton');
    expect(target.manual, isTrue);
  });
}
