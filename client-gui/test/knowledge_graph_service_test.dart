import 'package:flutter_client/src/models/knowledge_graph_models.dart';
import 'package:flutter_client/src/services/knowledge_graph_service.dart';
import 'package:flutter_client/src/services/macos_mail_importer.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test(
    'subscription aspect merges duplicate nodes and filters invalid edges',
    () {
      final aspect = KnowledgeGraphSubscriptionAspect();
      aspect.registerDataSource(_FakeGraphSource(enabled: true));
      aspect.registerDataSource(
        _FakeGraphSource(sourceId: 'disabled', enabled: false),
      );

      final snapshot = aspect.rebuild(_context());

      expect(snapshot.dataSources.length, 2);
      expect(snapshot.dataSources.first.enabled, isTrue);
      expect(snapshot.dataSources.last.enabled, isFalse);
      expect(snapshot.nodes.where((node) => node.id == 'shared').length, 1);
      final shared = snapshot.nodes.firstWhere((node) => node.id == 'shared');
      expect(shared.label, 'Shared A');
      expect(shared.weight, 4);
      expect(shared.metadata['extra'], 'b');
      expect(snapshot.edges.map((edge) => edge.id), contains('valid-edge'));
      expect(
        snapshot.edges.map((edge) => edge.id),
        isNot(contains('missing-target')),
      );
      expect(
        snapshot.edges.map((edge) => edge.id),
        isNot(contains('self-edge')),
      );
    },
  );

  test(
    'mail graph data source builds sender, recipient, thread and taxonomy facts',
    () {
      final contribution = const MailKnowledgeGraphDataSource().build(
        _context(
          mailDocuments: [
            _mailDoc(
              docId: 1,
              messageKey: 'm1',
              subject: 'MSA review for Acme contract',
              sender: 'Alice <alice@legal.example>',
              recipients: 'Bob <bob@example.com>',
              cc: 'Carol <carol@example.com>',
              taxonomyPath: '专家/合同',
            ),
            _mailDoc(
              docId: 2,
              messageKey: 'm2',
              subject: 'Re: MSA review for Acme contract',
              sender: 'Alice <alice@legal.example>',
              recipients: 'Bob <bob@example.com>',
              taxonomyPath: '专家/合同',
            ),
          ],
        ),
      );

      expect(contribution.version, 'mail-docs-2');
      expect(contribution.nodes.any((node) => node.kind == 'mail'), isTrue);
      expect(contribution.nodes.any((node) => node.kind == 'person'), isTrue);
      expect(contribution.nodes.any((node) => node.kind == 'domain'), isTrue);
      expect(contribution.nodes.any((node) => node.kind == 'thread'), isTrue);
      expect(contribution.edges.any((edge) => edge.label == '同主题链'), isTrue);
      expect(contribution.edges.any((edge) => edge.label == '通信'), isTrue);
    },
  );

  test(
    'mail graph data source exposes waiting node when index has no samples',
    () {
      final contribution = const MailKnowledgeGraphDataSource().build(
        _context(
          importingMacOSMail: true,
          mailImportPaused: true,
          mailDocuments: const [],
          mailIndexStats: const MacOSMailIndexStats(
            documentCount: 42,
            segmentCount: 3,
            pendingCount: 0,
            lastUpdatedAt: 'unix:42',
            indexDirectory: '/tmp/mail',
          ),
        ),
      );

      expect(contribution.version, 'mail-docs-empty');
      final waiting = contribution.nodes.firstWhere(
        (node) => node.id == 'mail:waiting',
      );
      expect(waiting.label, '42 封已索引');
      expect(waiting.metadata['状态'], '导入暂停');
    },
  );

  test('result graph data source links people and transactions', () {
    final contribution = const ResultKnowledgeGraphDataSource().build(
      _context(
        people: const [
          {'name': 'Alice', 'email': 'alice@example.com', 'role': 'Legal'},
        ],
        transactions: const [
          {
            'title': 'MSA approval',
            'summary': 'Alice approved the contract',
            'participants': ['Alice', 'Bob <bob@example.com>'],
            'date': '2026-04-28',
            'status': 'done',
          },
        ],
      ),
    );

    expect(contribution.version, 'result-v1');
    expect(
      contribution.nodes.any((node) => node.kind == 'transaction'),
      isTrue,
    );
    expect(
      contribution.nodes.where((node) => node.kind == 'person').length,
      greaterThanOrEqualTo(2),
    );
    expect(contribution.edges.any((edge) => edge.label == '参与'), isTrue);
  });

  test('affair graph clusters mail and transactions under expert taxonomy', () {
    final source = const AffairKnowledgeGraphDataSource();
    final contribution = source.build(
      _context(
        mailDocuments: [
          for (var i = 1; i <= 3; i += 1)
            _mailDoc(
              docId: i,
              messageKey: 'm$i',
              subject: 'MSA review with Acme $i',
              sender: 'Alice <alice@legal.example>',
              recipients: 'Bob <bob@example.com>',
              taxonomyPath: '专家/合同',
            ),
        ],
        mailSemanticSuggestions: {
          for (var i = 1; i <= 3; i += 1)
            'm$i': const MailKnowledgeSemanticSuggestion(
              messageKey: 'm1',
              taxonomyPath: '专家/合同',
              keywords: ['msa', 'contract'],
              entity: 'Acme',
              intent: 'approval',
              provider: 'cloud',
            ),
        },
        transactions: const [
          {
            'title': 'Acme MSA payment approval',
            'summary': 'contract approval and settlement',
            'participants': [
              'Alice <alice@legal.example>',
              'Bob <bob@example.com>',
            ],
            'date': '2026-04-28',
            'source': 'contract',
          },
        ],
      ),
    );

    expect(contribution.nodes.any((node) => node.kind == 'affair'), isTrue);
    expect(contribution.nodes.any((node) => node.kind == 'domain'), isTrue);
    expect(contribution.nodes.any((node) => node.kind == 'entity'), isTrue);
    expect(contribution.nodes.any((node) => node.kind == 'intent'), isTrue);
    expect(contribution.nodes.any((node) => node.kind == 'evidence'), isTrue);
    expect(contribution.edges.any((edge) => edge.label == '证据'), isTrue);
    expect(contribution.version, startsWith('affair-'));
  });
}

class _FakeGraphSource implements KnowledgeGraphDataSource {
  _FakeGraphSource({this.sourceId = 'fake', required this.enabled});

  @override
  final String sourceId;

  final bool enabled;

  @override
  String get label => 'Fake';

  @override
  bool isEnabled(KnowledgeGraphContext context) => enabled;

  @override
  KnowledgeGraphContribution build(KnowledgeGraphContext context) {
    return const KnowledgeGraphContribution(
      version: 'fake-v1',
      nodes: [
        KnowledgeGraphNode(
          id: 'root',
          label: 'Root',
          kind: 'root',
          moduleId: 'fake',
          weight: 1,
        ),
        KnowledgeGraphNode(
          id: 'shared',
          label: 'Shared A',
          kind: 'item',
          moduleId: 'fake',
          weight: 1,
          metadata: {'base': 'a'},
        ),
        KnowledgeGraphNode(
          id: 'shared',
          label: 'Shared B',
          kind: 'item',
          moduleId: 'fake',
          weight: 4,
          metadata: {'extra': 'b'},
        ),
      ],
      edges: [
        KnowledgeGraphEdge(
          id: 'valid-edge',
          sourceId: 'root',
          targetId: 'shared',
          label: 'valid',
          moduleId: 'fake',
        ),
        KnowledgeGraphEdge(
          id: 'missing-target',
          sourceId: 'root',
          targetId: 'missing',
          label: 'bad',
          moduleId: 'fake',
        ),
        KnowledgeGraphEdge(
          id: 'self-edge',
          sourceId: 'root',
          targetId: 'root',
          label: 'bad',
          moduleId: 'fake',
        ),
      ],
    );
  }
}

KnowledgeGraphContext _context({
  List<MailKnowledgeDocument> mailDocuments = const [],
  Map<String, MailKnowledgeSemanticSuggestion> mailSemanticSuggestions =
      const {},
  bool emailAnalysisModuleSupported = true,
  bool emailAnalysisModuleEnabled = true,
  bool importingMacOSMail = false,
  bool mailImportPaused = false,
  MacOSMailIndexStats? mailIndexStats,
  List<Map<String, dynamic>> people = const [],
  List<Map<String, dynamic>> transactions = const [],
}) {
  return KnowledgeGraphContext(
    mailDocuments: mailDocuments,
    mailSemanticSuggestions: mailSemanticSuggestions,
    emailAnalysisModuleSupported: emailAnalysisModuleSupported,
    emailAnalysisModuleEnabled: emailAnalysisModuleEnabled,
    importingMacOSMail: importingMacOSMail,
    mailImportPaused: mailImportPaused,
    mailImportDownloadedCount: 0,
    mailImportTotalCount: 0,
    mailIndexStats: mailIndexStats,
    people: people,
    transactions: transactions,
  );
}

MailKnowledgeDocument _mailDoc({
  required int docId,
  required String messageKey,
  required String subject,
  required String sender,
  required String recipients,
  String cc = '',
  String taxonomyPath = '',
}) {
  return MailKnowledgeDocument(
    docId: docId,
    messageKey: messageKey,
    fileName: '$messageKey.eml',
    subject: subject,
    sender: sender,
    recipients: recipients,
    cc: cc,
    dateSent: '2026-04-28T10:00:00Z',
    dateReceived: '2026-04-28T10:01:00Z',
    account: 'Work',
    mailboxPath: 'Inbox/Contracts',
    status: 'ok',
    lastSeenAt: 'unix:1',
    error: '',
    sourceHash: 'hash-$messageKey',
    byteSize: 1024,
    taxonomyPath: taxonomyPath,
  );
}
