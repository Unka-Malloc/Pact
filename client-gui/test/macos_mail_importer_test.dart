import 'package:flutter_client/src/services/macos_mail_importer.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('mail import progress maps known and unknown event kinds', () {
    final progress = MacOSMailImportProgress.fromJson({
      'kind': 'exported',
      'sequence': 7,
      'exportedCount': 3,
      'failedCount': 1,
      'skippedCount': 2,
      'totalCount': 10,
      'title': 'Subject',
      'detail': 'detail',
      'exportDirectory': '/tmp/mail',
      'messageKey': 'm1',
      'account': 'Work',
      'mailboxPath': 'Inbox',
      'sender': 'Alice <alice@example.com>',
      'recipients': 'Bob <bob@example.com>',
      'cc': 'Carol <carol@example.com>',
      'dateSent': '2026-04-28T10:00:00Z',
      'dateReceived': '2026-04-28T10:01:00Z',
      'fileName': 'm1.eml',
      'sourceHash': 'sha',
      'byteSize': 1024,
      'error': '',
      'status': 'ok',
    });

    expect(progress.kind, MacOSMailImportProgressKind.exported);
    expect(progress.sequence, 7);
    expect(progress.exportedCount, 3);
    expect(progress.sender, contains('alice@example.com'));
    expect(
      MacOSMailImportProgressKind.fromValue('missing'),
      MacOSMailImportProgressKind.unknown,
    );
  });

  test('mail importer result models tolerate partial json', () {
    final export = MacOSMailExportResult.fromJson({
      'exportDirectory': '/tmp/mail',
      'exportedCount': 10,
      'failedCount': 1,
      'skippedCount': 2,
      'fileCount': 9,
      'scannedAccountCount': 2,
      'scannedMailboxCount': 3,
      'scannedMessageCount': 20,
      'lastError': 'last',
    });
    final auth = MacOSMailAuthorizationResult.fromJson({
      'authorized': true,
      'accountCount': 2,
    });
    final stats = MacOSMailIndexStats.fromJson({
      'documentCount': 9,
      'segmentCount': 4,
      'pendingCount': 1,
      'lastUpdatedAt': 'unix:9',
      'indexDirectory': '/tmp/index',
    });

    expect(export.fileCount, 9);
    expect(export.lastError, 'last');
    expect(auth.authorized, isTrue);
    expect(auth.accountCount, 2);
    expect(stats.documentCount, 9);
    expect(stats.pendingCount, 1);
  });

  test('mail index search response parses result rows', () {
    final response = MacOSMailIndexSearchResponse.fromJson({
      'total': 1,
      'results': [
        {
          'docId': 11,
          'messageKey': 'm11',
          'fileName': 'm11.eml',
          'path': '/tmp/m11.eml',
          'subject': 'MSA review',
          'sender': 'Alice <alice@example.com>',
          'recipients': 'Bob <bob@example.com>',
          'cc': '',
          'dateSent': '2026-04-28T10:00:00Z',
          'dateReceived': '2026-04-28T10:01:00Z',
          'account': 'Work',
          'mailboxPath': 'Inbox',
          'status': 'ok',
          'lastSeenAt': 'unix:11',
          'error': '',
        },
      ],
    });

    expect(response.total, 1);
    expect(response.results.single.docId, 11);
    expect(response.results.single.subject, 'MSA review');
    expect(response.results.single.path, '/tmp/m11.eml');
  });
}
