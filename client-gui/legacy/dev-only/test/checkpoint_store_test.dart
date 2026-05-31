import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_client/src/models/transfer_models.dart';

void main() {
  CheckpointManifest makeManifest(
    String inputText,
    List<CheckpointFileRecord> files,
  ) {
    return CheckpointManifest(
      inputDigest: inputText,
      manifestDigest: files.map((item) => item.relativePath).join('|'),
      fileCount: files.length,
      fileRecords: files,
      summary: files.isEmpty ? 'text-only' : files.first.label,
    );
  }

  test('resumes same checkpoint after network interruption', () {
    final store = CheckpointStore();
    final manifest = makeManifest('weekly-report', [
      CheckpointFileRecord(
        label: 'weekly.eml',
        relativePath: 'mailbox/weekly.eml',
        sha256: 'sha-a',
        byteSize: 12,
      ),
    ]);

    final startedId = store.beginSubmission(manifest);
    store.markNetworkInterrupted(startedId, 'network down');

    final resumedId = store.beginSubmission(manifest);
    final node = store.findNode(resumedId)!;

    expect(resumedId, startedId);
    expect(node.mode, CheckpointMode.resume);
    expect(node.resumeCount, 1);
  });

  test('auto resume prefers network resume pointer', () {
    final store = CheckpointStore();
    final first = store.beginSubmission(
      makeManifest('first', [
        CheckpointFileRecord(
          label: 'a.eml',
          relativePath: 'mailbox/a.eml',
          sha256: 'sha-a',
          byteSize: 10,
        ),
      ]),
    );
    final second = store.beginSubmission(
      makeManifest('second', [
        CheckpointFileRecord(
          label: 'b.eml',
          relativePath: 'mailbox/b.eml',
          sha256: 'sha-b',
          byteSize: 11,
        ),
      ]),
    );

    store.networkResumeCheckpointId = first;
    store.activeCheckpointId = second;
    store.markServerProcessing(first);

    expect(store.autoResumeCandidateId(), first);
  });
}
