import 'package:flutter_client/src/models/app_models.dart';
import 'package:flutter_client/src/models/transfer_models.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('checkpoint manifest and file records round trip json', () {
    final manifest = CheckpointManifest.fromJson({
      'inputDigest': 'input',
      'manifestDigest': 'manifest',
      'summary': 'files',
      'fileRecords': [
        {
          'label': 'mail.eml',
          'relativePath': 'mail.eml',
          'sha256': 'abc',
          'byteSize': 12,
        },
      ],
    });

    expect(manifest.fileCount, 1);
    expect(manifest.fileRecords.single.label, 'mail.eml');
    expect(manifest.toJson()['manifestDigest'], 'manifest');

    final local = CheckpointLocalFile.fromJson({
      'path': '/tmp/mail.eml',
      'label': 'mail.eml',
      'relativePath': 'mail.eml',
      'sha256': 'abc',
      'byteSize': 12,
      'mediaType': 'message/rfc822',
    });
    expect(local.toJson()['mediaType'], 'message/rfc822');
  });

  test(
    'checkpoint store advances submission lifecycle and resumes matching work',
    () {
      final manifest = _manifest('input-a', 'manifest-a');
      final store = CheckpointStore();

      final checkpointId = store.beginSubmission(
        manifest,
        forcedCheckpointId: 'cp-a',
      );
      store.bindLocalPayload(checkpointId, 'hello', [
        CheckpointLocalFile(
          path: '/tmp/a.eml',
          label: 'a.eml',
          relativePath: 'a.eml',
          sha256: 'sha-a',
          byteSize: 10,
          mediaType: 'message/rfc822',
        ),
      ]);
      store.bindUploadSession(checkpointId, 'session-a', 'http://server');
      store.markUploadVerified(
        checkpointId,
        'job-a',
        'http://server',
        'manifest-a',
        1,
      );
      store.markServerProcessing(checkpointId);
      store.markNetworkInterrupted(checkpointId, 'network down');

      expect(store.autoResumeCandidateId(), 'cp-a');
      final resumed = store.beginSubmission(manifest);
      expect(resumed, 'cp-a');
      expect(store.findNode('cp-a')!.mode, CheckpointMode.resume);
      expect(
        store.findNodeByUploadSessionId('session-a')?.checkpointId,
        'cp-a',
      );

      store.markServerCompleted('cp-a');
      store.markClientConfirmed('cp-a');
      expect(store.findNode('cp-a')!.state, CheckpointState.clientConfirmed);
      expect(store.pendingCleanup, isNull);
    },
  );

  test(
    'manual branch completion creates cleanup prompt and can be cleared',
    () {
      final store = CheckpointStore();
      final first = store.beginSubmission(
        _manifest('input-a', 'manifest-a'),
        forcedCheckpointId: 'cp-a',
      );
      store.markUploadVerified(
        first,
        'job-a',
        'http://server',
        'manifest-a',
        1,
      );
      store.markManualStopped(first);

      final branch = store.beginSubmission(
        _manifest('input-b', 'manifest-b'),
        forcedCheckpointId: 'cp-b',
      );
      store.markUploadVerified(
        branch,
        'job-b',
        'http://server',
        'manifest-b',
        1,
      );
      store.markServerCompleted(branch);
      store.markClientConfirmed(branch);

      expect(store.findNode(branch)!.mode, CheckpointMode.branch);
      expect(store.pendingCleanup?.obsoleteCheckpointId, 'cp-a');
      expect(store.pendingCleanup?.obsoleteJobId, 'job-a');

      store.clearPendingCleanup();
      expect(store.pendingCleanup, isNull);
    },
  );

  test('failed and abandoned checkpoints are not selected for resume', () {
    final store = CheckpointStore(
      nodes: [
        CheckpointNode(
          checkpointId: 'failed',
          state: CheckpointState.failed,
          updatedAt: 'unix:2',
        ),
        CheckpointNode(
          checkpointId: 'abandoned',
          state: CheckpointState.abandoned,
          updatedAt: 'unix:3',
        ),
        CheckpointNode(
          checkpointId: 'server',
          state: CheckpointState.serverProcessing,
          updatedAt: 'unix:1',
        ),
      ],
    );
    store.armNetworkResume('failed');

    expect(store.autoResumeCandidateId(), 'server');
    store.markFailed('server', 'bad');
    expect(store.autoResumeCandidateId(), isNull);
    store.markAbandoned('failed');
    expect(store.activeCheckpointId, '');
  });

  test('upload session progress aggregates file progress', () {
    final session = UploadSessionInfo.fromJson({
      'sessionId': 'session',
      'checkpointId': 'cp',
      'manifestDigest': 'manifest',
      'inputDigest': 'input',
      'status': 'uploading',
      'createdAt': 'unix:1',
      'updatedAt': 'unix:2',
      'files': [
        {
          'index': 0,
          'name': 'a.eml',
          'relativePath': 'a.eml',
          'mediaType': 'message/rfc822',
          'sha256': 'a',
          'byteSize': 100,
          'receivedBytes': 50,
          'completed': false,
        },
        {
          'index': 1,
          'name': 'b.pdf',
          'relativePath': 'b.pdf',
          'mediaType': 'application/pdf',
          'sha256': 'b',
          'byteSize': 100,
          'receivedBytes': 100,
          'completed': true,
          'completedAt': 'unix:2',
        },
      ],
    });

    expect(session.isComplete, isFalse);
    expect(session.totalBytes, 200);
    expect(session.receivedBytes, 150);
    expect(session.progress, 0.75);
    expect(session.files.first.progress, 0.5);
    expect(session.files.last.toJson()['completed'], isTrue);
  });

  test('labels and enum fallbacks are stable', () {
    expect(
      CheckpointState.fromApiValue('server-processing'),
      CheckpointState.serverProcessing,
    );
    expect(
      CheckpointState.fromApiValue('unknown'),
      CheckpointState.filesConfirmed,
    );
    expect(CheckpointMode.fromApiValue('branch'), CheckpointMode.branch);
    expect(CheckpointMode.fromApiValue('unknown'), CheckpointMode.initial);
    expect(checkpointStateLabel(CheckpointState.networkInterrupted), '网络中断');
    expect(checkpointModeLabel(CheckpointMode.append), '追加新链路');
    expect(displayUploadSessionStatus('cached'), '本地缓存');
    expect(displayUploadSessionStatus('missing'), '未知状态');
    expect(shortId('1234567890'), '12345678');
  });
}

CheckpointManifest _manifest(String inputDigest, String manifestDigest) {
  return CheckpointManifest(
    inputDigest: inputDigest,
    manifestDigest: manifestDigest,
    fileCount: 1,
    fileRecords: [
      CheckpointFileRecord(
        label: 'a.eml',
        relativePath: 'a.eml',
        sha256: manifestDigest,
        byteSize: 10,
      ),
    ],
    summary: 'a.eml',
  );
}
