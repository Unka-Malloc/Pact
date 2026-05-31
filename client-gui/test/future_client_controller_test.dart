import 'dart:io';

import 'package:flutter_client/src/controllers/future_client_controller.dart';
import 'package:flutter_client/src/models/future_client_models.dart';
import 'package:flutter_client/src/services/agent_service.dart';
import 'package:flutter_client/src/services/portable_data_root.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('initializes against portable data without legacy runtime services', () async {
    final directory = await Directory.systemTemp.createTemp('pact-future-client-');
    addTearDown(() async {
      if (await directory.exists()) {
        await directory.delete(recursive: true);
      }
    });

    final controller = FutureClientController(
      portableData: PortableDataRoot(dataDirectoryOverride: directory),
      agentService: _FakeAgentService(),
    );
    addTearDown(controller.dispose);

    await controller.initialize();

    expect(controller.initialized, isTrue);
    expect(controller.portableDataPath, directory.path);
    expect(await File('${directory.path}/.pact-workspace.json').exists(), isTrue);
  });

  test('scans target adapters through the thin future client service', () async {
    final controller = FutureClientController(agentService: _FakeAgentService());
    addTearDown(controller.dispose);

    await controller.scanTargets();

    expect(controller.scannedTargets, hasLength(1));
    expect(controller.scannedTargets.single.target, 'codex');
    expect(controller.statusCaption, 'Targets');
    expect(controller.lastError, isEmpty);
  });

  test('keeps the shell constrained to future client sections', () {
    final controller = FutureClientController(agentService: _FakeAgentService());
    addTearDown(controller.dispose);

    controller.selectSection(FutureClientSection.settings);

    expect(controller.currentSection, FutureClientSection.settings);
    expect(FutureClientSection.values, hasLength(6));
  });

  test('restores snapshots through the target service boundary', () async {
    final service = _FakeAgentService();
    final controller = FutureClientController(agentService: service);
    addTearDown(controller.dispose);

    await controller.restoreSnapshot('snapshot-codex-1');

    expect(service.restoredSnapshotId, 'snapshot-codex-1');
    expect(controller.snapshotRestoreResult?['ok'], isTrue);
    expect(controller.statusCaption, 'Snapshots');
  });

  test('adds manual targets and refreshes scan results', () async {
    final service = _FakeAgentService();
    final controller = FutureClientController(agentService: service);
    addTearDown(controller.dispose);

    await controller.addManualTarget(
      target: 'openclaw',
      configPath: '/tmp/openclaw.json',
    );

    expect(service.addedTarget, 'openclaw');
    expect(service.addedConfigPath, '/tmp/openclaw.json');
    expect(controller.scannedTargets.single.manual, isTrue);
    expect(controller.statusCaption, 'Targets');
    expect(controller.isAddingTarget, isFalse);
  });

  test('updates and rolls back MCP plugins through existing CLI boundary', () async {
    final service = _FakeAgentService();
    final controller = FutureClientController(agentService: service);
    addTearDown(controller.dispose);

    await controller.scanTargets();
    final target = controller.scannedTargets.single;

    await controller.updateMcpPlugin(target);
    expect(service.updatedPluginTarget, 'codex');
    expect(controller.mcpPluginActionResult?['status'], 'updated');
    expect(controller.isMcpPluginBusy('codex'), isFalse);

    await controller.rollbackLatestMcpPlugin(target);
    expect(service.rolledBackSnapshotId, 'snapshot-codex-1');
    expect(controller.mcpPluginActionResult?['status'], 'rolled_back');
  });

  test('loads Skill Hub pairings and model forwarding profiles', () async {
    final service = _FakeAgentService();
    final controller = FutureClientController(agentService: service);
    addTearDown(controller.dispose);

    await controller.requestSkillHubPairing('codex', target: 'manual');
    await controller.approveSkillHubPairing('codex');
    await controller.refreshSkillHub('codex');

    expect(controller.skillHubPairings.single['status'], 'approved');
    expect(controller.skillHubSkills.single['skillId'], 'review');

    await controller.saveCommandModelProfile(
      profileId: 'local-echo',
      command: 'cat',
    );
    await controller.forwardModelText(
      profileId: 'local-echo',
      text: 'hello',
    );

    expect(controller.modelProfiles.single['id'], 'local-echo');
    expect(controller.modelForwardingResult?['output'], 'hello');
  });
}

class _FakeAgentService extends AgentService {
  String restoredSnapshotId = '';
  String addedTarget = '';
  String addedConfigPath = '';
  String updatedPluginTarget = '';
  String rolledBackSnapshotId = '';
  String pairingStatus = 'requested';
  bool modelProfileSaved = false;

  @override
  Future<List<TargetCandidate>> scanTargets() async {
    return [
      TargetCandidate(
        target: 'codex',
        label: 'Codex',
        kind: 'cli',
        status: 'detected',
        configured: false,
        confidence: 0.82,
        manual: addedTarget.isNotEmpty,
        configPath: '/tmp/codex.toml',
        adapterStatus: 'implemented',
      ),
    ];
  }

  @override
  Future<Map<String, dynamic>> addTarget({
    required String target,
    String configPath = '',
    String binaryPath = '',
  }) async {
    addedTarget = target;
    addedConfigPath = configPath;
    return {'ok': true, 'target': target};
  }

  @override
  Future<Map<String, dynamic>> restoreSnapshot(String snapshotId) async {
    restoredSnapshotId = snapshotId;
    return {'ok': true, 'snapshotId': snapshotId};
  }

  @override
  Future<Map<String, dynamic>> updateMcpPlugin({
    required String target,
    String configPath = '',
  }) async {
    updatedPluginTarget = target;
    return {
      'ok': true,
      'status': 'updated',
      'apply': {'snapshotId': 'snapshot-codex-1'},
    };
  }

  @override
  Future<List<Map<String, dynamic>>> listSnapshots({String target = ''}) async {
    return [
      {'snapshotId': 'snapshot-codex-1', 'target': target},
    ];
  }

  @override
  Future<Map<String, dynamic>> rollbackMcpPlugin({
    required String target,
    required String snapshotId,
    String configPath = '',
  }) async {
    rolledBackSnapshotId = snapshotId;
    return {'ok': true, 'status': 'rolled_back'};
  }

  @override
  Future<List<Map<String, dynamic>>> listPairings({String agent = ''}) async {
    return [
      {'agentId': agent, 'target': 'manual', 'status': pairingStatus},
    ];
  }

  @override
  Future<Map<String, dynamic>> requestPairing({
    required String agent,
    String target = '',
  }) async {
    pairingStatus = 'requested';
    return {'ok': true, 'status': pairingStatus};
  }

  @override
  Future<Map<String, dynamic>> approvePairing({required String agent}) async {
    pairingStatus = 'approved';
    return {'ok': true, 'status': pairingStatus};
  }

  @override
  Future<List<Map<String, dynamic>>> listSkills({required String agent}) async {
    return pairingStatus == 'approved'
        ? [
            {'skillId': 'review', 'version': '1.0.0'},
          ]
        : [];
  }

  @override
  Future<List<Map<String, dynamic>>> listModelProfiles() async {
    return modelProfileSaved
        ? [
            {'id': 'local-echo', 'provider': 'command', 'command': 'cat'},
          ]
        : [];
  }

  @override
  Future<Map<String, dynamic>> saveCommandModelProfile({
    required String profileId,
    required String command,
  }) async {
    modelProfileSaved = true;
    return {'ok': true, 'status': 'saved', 'profile': profileId};
  }

  @override
  Future<Map<String, dynamic>> forwardText({
    required String profileId,
    required String text,
  }) async {
    return {'ok': true, 'mode': 'thin-forward', 'output': text};
  }
}
