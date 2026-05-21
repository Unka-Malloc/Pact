import 'dart:collection';
import 'dart:math' as math;

import '../models/app_models.dart';
import '../models/knowledge_graph_models.dart';
import '../services/macos_mail_importer.dart';

const String knowledgeGraphRootId = 'affair:knowledge';

class KnowledgeGraphContext {
  const KnowledgeGraphContext({
    required this.mailDocuments,
    required this.mailSemanticSuggestions,
    required this.emailAnalysisModuleSupported,
    required this.emailAnalysisModuleEnabled,
    required this.importingMacOSMail,
    required this.mailImportPaused,
    required this.mailImportDownloadedCount,
    required this.mailImportTotalCount,
    required this.mailIndexStats,
    required this.people,
    required this.transactions,
  });

  final List<MailKnowledgeDocument> mailDocuments;
  final Map<String, MailKnowledgeSemanticSuggestion> mailSemanticSuggestions;
  final bool emailAnalysisModuleSupported;
  final bool emailAnalysisModuleEnabled;
  final bool importingMacOSMail;
  final bool mailImportPaused;
  final int mailImportDownloadedCount;
  final int mailImportTotalCount;
  final MacOSMailIndexStats? mailIndexStats;
  final List<Map<String, dynamic>> people;
  final List<Map<String, dynamic>> transactions;
}

abstract class KnowledgeGraphDataSource {
  String get sourceId;
  String get label;

  bool isEnabled(KnowledgeGraphContext context);

  KnowledgeGraphContribution build(KnowledgeGraphContext context);
}

class KnowledgeGraphSubscriptionAspect {
  final LinkedHashMap<String, KnowledgeGraphDataSource> _dataSources =
      LinkedHashMap<String, KnowledgeGraphDataSource>();

  List<KnowledgeGraphDataSource> get dataSources =>
      List<KnowledgeGraphDataSource>.unmodifiable(_dataSources.values);

  void registerDataSource(KnowledgeGraphDataSource dataSource) {
    _dataSources[dataSource.sourceId] = dataSource;
  }

  void unregisterDataSource(String sourceId) {
    _dataSources.remove(sourceId);
  }

  KnowledgeGraphSnapshot rebuild(KnowledgeGraphContext context) {
    final nodes = <String, KnowledgeGraphNode>{};
    final edges = <String, KnowledgeGraphEdge>{};
    final dataSources = <KnowledgeGraphDataSourceStatus>[];

    for (final dataSource in _dataSources.values) {
      final enabled = dataSource.isEnabled(context);
      if (!enabled) {
        dataSources.add(
          KnowledgeGraphDataSourceStatus(
            sourceId: dataSource.sourceId,
            label: dataSource.label,
            enabled: false,
            nodeCount: 0,
            edgeCount: 0,
            version: 'disabled',
          ),
        );
        continue;
      }

      final contribution = dataSource.build(context);
      var nodeCount = 0;
      for (final node in contribution.nodes) {
        if (node.id.trim().isEmpty) {
          continue;
        }
        nodes[node.id] = nodes[node.id]?.merge(node) ?? node;
        nodeCount += 1;
      }

      var edgeCount = 0;
      for (final edge in contribution.edges) {
        if (edge.id.trim().isEmpty ||
            edge.sourceId.trim().isEmpty ||
            edge.targetId.trim().isEmpty ||
            edge.sourceId == edge.targetId) {
          continue;
        }
        edges[edge.id] = edge;
        edgeCount += 1;
      }

      dataSources.add(
        KnowledgeGraphDataSourceStatus(
          sourceId: dataSource.sourceId,
          label: dataSource.label,
          enabled: true,
          nodeCount: nodeCount,
          edgeCount: edgeCount,
          version: contribution.version,
        ),
      );
    }

    final filteredEdges = edges.values
        .where(
          (edge) =>
              nodes.containsKey(edge.sourceId) &&
              nodes.containsKey(edge.targetId),
        )
        .toList(growable: false);

    return KnowledgeGraphSnapshot(
      nodes: nodes.values.toList(growable: false),
      edges: filteredEdges,
      dataSources: dataSources,
      updatedAt: DateTime.now(),
    );
  }
}

class AffairKnowledgeGraphDataSource implements KnowledgeGraphDataSource {
  const AffairKnowledgeGraphDataSource();

  static const int _maxMailEvidence = 900;
  static const int _maxAffairs = 34;
  static const int _maxEvidencePerAffair = 4;
  static const int _maxPeoplePerAffair = 5;
  static const int _maxKeywordsPerAffair = 3;
  static const int _maxAffairLinks = 30;
  static const int _maxEntitySamplesPerAffair = 6;

  @override
  String get sourceId => 'affair';

  @override
  String get label => '事务聚合器';

  @override
  bool isEnabled(KnowledgeGraphContext context) =>
      context.emailAnalysisModuleEnabled ||
      context.transactions.isNotEmpty ||
      context.people.isNotEmpty;

  @override
  KnowledgeGraphContribution build(KnowledgeGraphContext context) {
    final graph = _KnowledgeGraphDraft(sourceId);
    final clusterer = _AffairClusterer(context.mailSemanticSuggestions);

    for (final document in context.mailDocuments.reversed.take(
      _maxMailEvidence,
    )) {
      clusterer.addMail(document);
    }
    for (final transaction in context.transactions) {
      clusterer.addTransaction(transaction);
    }

    final clusters = clusterer.topClusters(_maxAffairs);
    graph.addNode(
      KnowledgeGraphNode(
        id: knowledgeGraphRootId,
        label: '事务知识图谱',
        kind: 'root',
        moduleId: sourceId,
        weight: 3,
        metadata: {
          '事务数': '${clusterer.clusterCount}',
          '证据数': '${clusterer.evidenceCount}',
          '邮件证据': '${context.mailDocuments.length}',
          '分析事务': '${context.transactions.length}',
        },
      ),
    );

    if (clusters.isEmpty) {
      graph.addNode(
        KnowledgeGraphNode(
          id: 'affair:waiting',
          label: context.mailIndexStats == null
              ? '等待事实输入'
              : '${context.mailIndexStats!.documentCount} 封邮件可用于聚合',
          kind: 'index',
          moduleId: sourceId,
          weight: 1.2,
          metadata: {
            '状态': context.importingMacOSMail
                ? (context.mailImportPaused ? '导入暂停' : '导入中')
                : '等待事务证据',
          },
        ),
      );
      graph.addEdge(knowledgeGraphRootId, 'affair:waiting', '输入');
      return graph.toContribution(version: 'affair-empty');
    }

    for (final cluster in clusters) {
      _addAffair(graph, cluster);
    }
    _addAffairLinks(graph, clusters);
    return graph.toContribution(version: 'affair-${clusterer.evidenceCount}');
  }

  void _addAffair(_KnowledgeGraphDraft graph, _AffairCluster cluster) {
    final affairId = _affairNodeId(cluster.key);
    final people = cluster.topPeople(_maxPeoplePerAffair);
    final keywords = cluster.topTerms(_maxKeywordsPerAffair);
    final evidence = cluster.evidence.take(_maxEvidencePerAffair).toList();
    final taxonomyPath = cluster.primaryTaxonomy;
    final entity = cluster.primaryEntity;
    final intent = _normalizeAffairIntent(
      cluster.intent,
      title: cluster.label,
      terms: keywords.map((item) => item.key),
      taxonomyPath: taxonomyPath,
    );

    graph.addNode(
      KnowledgeGraphNode(
        id: affairId,
        label: cluster.label,
        kind: 'affair',
        moduleId: sourceId,
        weight: _weight(cluster.evidenceCount + cluster.sources.length),
        metadata: {
          '证据数': '${cluster.evidenceCount}',
          '证据来源': cluster.sources.join(' / '),
          if (entity != null) '聚合实体': entity.label,
          if (intent.isNotEmpty) '事务类型': intent,
          if (people.isNotEmpty)
            '参与者': people.map((item) => item.label).join('，'),
          if (keywords.isNotEmpty)
            '关键词': keywords.map((item) => item.key).join('，'),
          if (cluster.primaryMonth.isNotEmpty) '时间': cluster.primaryMonth,
          if (taxonomyPath.isNotEmpty) '分类': taxonomyPath,
        },
      ),
    );

    final taxonomyNodeId = _addTaxonomyPath(graph, taxonomyPath);
    if (entity == null) {
      graph.addEdge(taxonomyNodeId, affairId, '事务');
    } else {
      final entityId = _affairEntityNodeId(entity.key);
      graph.addNode(
        KnowledgeGraphNode(
          id: entityId,
          label: entity.label,
          kind: 'entity',
          moduleId: sourceId,
          weight: _weight(entity.count),
          metadata: {
            '出现次数': '${entity.count}',
            '聚合事务': intent.isEmpty ? '综合动态' : intent,
            '分类': taxonomyPath,
            if (cluster.entityEvidenceLabels.isNotEmpty)
              '样本': cluster.entityEvidenceLabels
                  .take(_maxEntitySamplesPerAffair)
                  .join('，'),
          },
        ),
      );
      final intentId = _affairIntentNodeId(entity.key, intent, taxonomyPath);
      graph.addNode(
        KnowledgeGraphNode(
          id: intentId,
          label: intent.isEmpty ? '综合动态' : intent,
          kind: 'intent',
          moduleId: sourceId,
          weight: _weight(cluster.evidenceCount),
          metadata: {
            '实体': entity.label,
            '证据数': '${cluster.evidenceCount}',
            '分类': taxonomyPath,
          },
        ),
      );
      graph.addEdge(taxonomyNodeId, entityId, '实体');
      graph.addEdge(entityId, intentId, '意图');
      graph.addEdge(intentId, affairId, '事务');
    }

    for (final person in people) {
      final personId = _affairPersonNodeId(person.key);
      graph.addNode(
        KnowledgeGraphNode(
          id: personId,
          label: person.label,
          kind: 'person',
          moduleId: sourceId,
          weight: _weight(person.count),
          metadata: {'出现次数': '${person.count}'},
        ),
      );
      graph.addEdge(affairId, personId, '参与');
    }

    if (cluster.primaryMonth.isNotEmpty) {
      final monthId = _affairTimeNodeId(cluster.primaryMonth);
      graph.addNode(
        KnowledgeGraphNode(
          id: monthId,
          label: cluster.primaryMonth,
          kind: 'time',
          moduleId: sourceId,
          weight: 1.1,
        ),
      );
      graph.addEdge(affairId, monthId, '发生于');
    }

    for (final item in keywords) {
      final keywordId = _affairKeywordNodeId(item.key);
      graph.addNode(
        KnowledgeGraphNode(
          id: keywordId,
          label: item.key,
          kind: 'keyword',
          moduleId: sourceId,
          weight: _weight(item.value),
          metadata: {'出现次数': '${item.value}'},
        ),
      );
      graph.addEdge(affairId, keywordId, '关键词');
    }

    for (final item in evidence) {
      final evidenceId = _affairEvidenceNodeId(item.id);
      graph.addNode(
        KnowledgeGraphNode(
          id: evidenceId,
          label: item.label,
          kind: 'evidence',
          moduleId: sourceId,
          weight: 1.05,
          metadata: {
            '类型': item.kind,
            '来源': item.sourceLabel,
            if (item.time.isNotEmpty) '时间': item.time,
            ...item.metadata,
          },
        ),
      );
      graph.addEdge(affairId, evidenceId, '证据');
    }
    final foldedCount = cluster.evidenceCount - evidence.length;
    if (foldedCount > 0) {
      final foldedId = _affairFoldedEvidenceNodeId(cluster.key);
      graph.addNode(
        KnowledgeGraphNode(
          id: foldedId,
          label: '折叠 $foldedCount 封邮件',
          kind: 'evidence',
          moduleId: sourceId,
          weight: _weight(foldedCount),
          metadata: {
            '类型': '折叠证据',
            '折叠邮件': '$foldedCount',
            '说明': '同实体、同意图、同分类的邮件已合并显示',
          },
        ),
      );
      graph.addEdge(affairId, foldedId, '折叠');
    }
  }

  String _addTaxonomyPath(_KnowledgeGraphDraft graph, String taxonomyPath) {
    final path = taxonomyPath.trim().isEmpty ? '未分类' : taxonomyPath.trim();
    final parts = path
        .split('/')
        .map((part) => part.trim())
        .where((part) => part.isNotEmpty)
        .toList(growable: false);
    if (parts.isEmpty) {
      return knowledgeGraphRootId;
    }

    var parentId = knowledgeGraphRootId;
    var currentPath = '';
    for (var index = 0; index < parts.length; index += 1) {
      currentPath = currentPath.isEmpty
          ? parts[index]
          : '$currentPath/${parts[index]}';
      final nodeId = _taxonomyNodeId(currentPath);
      graph.addNode(
        KnowledgeGraphNode(
          id: nodeId,
          label: parts[index],
          kind: index == 0
              ? 'domain'
              : index == 1
              ? 'category'
              : 'subcategory',
          moduleId: sourceId,
          weight: math.max(1.05, 1.8 - index * 0.18),
          metadata: {'路径': currentPath},
        ),
      );
      graph.addEdge(parentId, nodeId, index == 0 ? '领域' : '分类');
      parentId = nodeId;
    }
    return parentId;
  }

  void _addAffairLinks(
    _KnowledgeGraphDraft graph,
    List<_AffairCluster> clusters,
  ) {
    var created = 0;
    for (var leftIndex = 0; leftIndex < clusters.length; leftIndex += 1) {
      for (
        var rightIndex = leftIndex + 1;
        rightIndex < clusters.length;
        rightIndex += 1
      ) {
        final left = clusters[leftIndex];
        final right = clusters[rightIndex];
        final relation = _affairRelation(left, right);
        if (relation.isEmpty) {
          continue;
        }
        graph.addEdge(
          _affairNodeId(left.key),
          _affairNodeId(right.key),
          relation,
        );
        created += 1;
        if (created >= _maxAffairLinks) {
          return;
        }
      }
    }
  }

  String _affairRelation(_AffairCluster left, _AffairCluster right) {
    if (left.primaryTaxonomy != right.primaryTaxonomy) {
      return '';
    }
    final leftEntity = left.primaryEntity?.key ?? '';
    final rightEntity = right.primaryEntity?.key ?? '';
    if (leftEntity.isNotEmpty && leftEntity == rightEntity) {
      return '同实体';
    }
    final sharedPeople = left.people.keys.toSet().intersection(
      right.people.keys.toSet(),
    );
    final sharedTerms = left.terms.keys.toSet().intersection(
      right.terms.keys.toSet(),
    );
    if (sharedPeople.length >= 2 && sharedTerms.isNotEmpty) {
      return '强相关';
    }
    if (sharedPeople.length >= 2) {
      return '同参与者';
    }
    if (sharedTerms.length >= 3) {
      return '同主题';
    }
    if (left.primaryMonth.isNotEmpty &&
        left.primaryMonth == right.primaryMonth &&
        sharedTerms.length >= 2) {
      return '同期同主题';
    }
    return '';
  }
}

class MailKnowledgeGraphDataSource implements KnowledgeGraphDataSource {
  const MailKnowledgeGraphDataSource();

  static const int _visibleMailLimit = 56;
  static const int _topSenderLimit = 18;
  static const int _topRecipientLimit = 10;
  static const int _topThreadLimit = 16;
  static const int _topFolderLimit = 8;
  static const int _topDomainLimit = 14;
  static const int _topMonthLimit = 10;
  static const int _topKeywordLimit = 16;

  @override
  String get sourceId => 'mail';

  @override
  String get label => '邮件事实输入';

  @override
  bool isEnabled(KnowledgeGraphContext context) =>
      context.emailAnalysisModuleSupported &&
      context.emailAnalysisModuleEnabled;

  @override
  KnowledgeGraphContribution build(KnowledgeGraphContext context) {
    final graph = _KnowledgeGraphDraft(sourceId);
    final stats = context.mailIndexStats;
    final documents = context.mailDocuments;
    graph.addNode(
      KnowledgeGraphNode(
        id: knowledgeGraphRootId,
        label: '邮件知识',
        kind: 'root',
        moduleId: sourceId,
        weight: 3,
        metadata: {
          '索引邮件': '${stats?.documentCount ?? documents.length}',
          '样本邮件': '${documents.length}',
        },
      ),
    );

    if (documents.isEmpty) {
      graph.addNode(
        KnowledgeGraphNode(
          id: 'mail:waiting',
          label: stats == null ? '等待邮件索引' : '${stats.documentCount} 封已索引',
          kind: 'index',
          moduleId: sourceId,
          weight: 1.5,
          metadata: {
            '状态': context.importingMacOSMail
                ? (context.mailImportPaused ? '导入暂停' : '导入中')
                : '等待索引样本',
          },
        ),
      );
      graph.addEdge(knowledgeGraphRootId, 'mail:waiting', '索引');
      return graph.toContribution(version: 'mail-docs-empty');
    }

    final facts = _MailGraphFacts(documents);
    final selectedDocs = documents.reversed.take(_visibleMailLimit).toList();
    final visibleNodeIds = <String>{knowledgeGraphRootId};
    _addAggregateNodes(graph, facts, visibleNodeIds);
    _addMailNodes(graph, selectedDocs, visibleNodeIds);
    _addMailRelationships(graph, selectedDocs, visibleNodeIds);
    _addAggregatePairRelationships(graph, facts, visibleNodeIds);

    return graph.toContribution(version: 'mail-docs-${documents.length}');
  }

  void _addAggregateNodes(
    _KnowledgeGraphDraft graph,
    _MailGraphFacts facts,
    Set<String> visibleNodeIds,
  ) {
    for (final item in facts.topSenders.take(_topSenderLimit)) {
      final nodeId = _personNodeId(item.key);
      visibleNodeIds.add(nodeId);
      graph.addNode(
        KnowledgeGraphNode(
          id: nodeId,
          label: item.value.label,
          kind: 'person',
          moduleId: sourceId,
          weight: _weight(item.value.count),
          metadata: {
            '邮箱': item.value.email,
            '角色': '发件人',
            '邮件数': '${item.value.count}',
          },
        ),
      );
      graph.addEdge(knowledgeGraphRootId, nodeId, '发件人');
    }

    for (final item in facts.topRecipients.take(_topRecipientLimit)) {
      final nodeId = _personNodeId(item.key);
      visibleNodeIds.add(nodeId);
      graph.addNode(
        KnowledgeGraphNode(
          id: nodeId,
          label: item.value.label,
          kind: 'person',
          moduleId: sourceId,
          weight: _weight(item.value.count),
          metadata: {
            '邮箱': item.value.email,
            '角色': '收件人',
            '邮件数': '${item.value.count}',
          },
        ),
      );
      graph.addEdge(knowledgeGraphRootId, nodeId, '收件人');
    }

    for (final item in facts.topDomains.take(_topDomainLimit)) {
      final nodeId = _domainNodeId(item.key);
      visibleNodeIds.add(nodeId);
      graph.addNode(
        KnowledgeGraphNode(
          id: nodeId,
          label: item.key,
          kind: 'domain',
          moduleId: sourceId,
          weight: _weight(item.value),
          metadata: {'邮件数': '${item.value}'},
        ),
      );
      graph.addEdge(knowledgeGraphRootId, nodeId, '域名');
    }

    for (final item in facts.topFolders.take(_topFolderLimit)) {
      final nodeId = _folderNodeId(item.key);
      visibleNodeIds.add(nodeId);
      graph.addNode(
        KnowledgeGraphNode(
          id: nodeId,
          label: item.key,
          kind: 'folder',
          moduleId: sourceId,
          weight: _weight(item.value),
          metadata: {'邮件数': '${item.value}'},
        ),
      );
      graph.addEdge(knowledgeGraphRootId, nodeId, '文件夹');
    }

    for (final item in facts.topMonths.take(_topMonthLimit)) {
      final nodeId = _monthNodeId(item.key);
      visibleNodeIds.add(nodeId);
      graph.addNode(
        KnowledgeGraphNode(
          id: nodeId,
          label: item.key,
          kind: 'time',
          moduleId: sourceId,
          weight: _weight(item.value),
          metadata: {'邮件数': '${item.value}'},
        ),
      );
      graph.addEdge(knowledgeGraphRootId, nodeId, '时间');
    }

    for (final item in facts.topThreads.take(_topThreadLimit)) {
      final nodeId = _threadNodeId(item.key);
      visibleNodeIds.add(nodeId);
      graph.addNode(
        KnowledgeGraphNode(
          id: nodeId,
          label: item.value.label,
          kind: 'thread',
          moduleId: sourceId,
          weight: _weight(item.value.count),
          metadata: {'相关邮件': '${item.value.count}'},
        ),
      );
      graph.addEdge(knowledgeGraphRootId, nodeId, '主题簇');
    }

    for (final item in facts.topKeywords.take(_topKeywordLimit)) {
      final nodeId = _keywordNodeId(item.key);
      visibleNodeIds.add(nodeId);
      graph.addNode(
        KnowledgeGraphNode(
          id: nodeId,
          label: item.key,
          kind: 'keyword',
          moduleId: sourceId,
          weight: _weight(item.value),
          metadata: {'出现': '${item.value}'},
        ),
      );
      graph.addEdge(knowledgeGraphRootId, nodeId, '关键词');
    }
  }

  void _addMailNodes(
    _KnowledgeGraphDraft graph,
    List<MailKnowledgeDocument> documents,
    Set<String> visibleNodeIds,
  ) {
    for (final document in documents) {
      final nodeId = _mailNodeId(document);
      visibleNodeIds.add(nodeId);
      graph.addNode(
        KnowledgeGraphNode(
          id: nodeId,
          label: document.subject.isEmpty
              ? document.fileName
              : document.subject,
          kind: 'mail',
          moduleId: sourceId,
          weight: 1.2,
          metadata: {
            '发件人': document.sender,
            '收件人': document.recipients,
            '文件夹': document.mailboxPath,
            '时间': document.dateReceived.isEmpty
                ? document.dateSent
                : document.dateReceived,
            '状态': document.status,
          },
        ),
      );
      graph.addEdge(knowledgeGraphRootId, nodeId, '邮件');
    }
  }

  void _addMailRelationships(
    _KnowledgeGraphDraft graph,
    List<MailKnowledgeDocument> documents,
    Set<String> visibleNodeIds,
  ) {
    final byThread = <String, List<String>>{};
    final bySender = <String, List<String>>{};
    for (final document in documents) {
      final mailId = _mailNodeId(document);
      final sender = _parseAddress(document.sender);
      if (sender.email.isNotEmpty) {
        final senderId = _personNodeId(sender.email);
        _ensurePerson(graph, sender, senderId, '发件人', visibleNodeIds);
        graph.addEdge(senderId, mailId, '发出');
        bySender.putIfAbsent(sender.email, () => <String>[]).add(mailId);
        if (sender.domain.isNotEmpty) {
          final domainId = _domainNodeId(sender.domain);
          _ensureDomain(graph, sender.domain, domainId, visibleNodeIds);
          graph.addEdge(senderId, domainId, '域名');
          graph.addEdge(mailId, domainId, '来源域');
        }
      }

      for (final recipient in _parseAddresses(document.recipients)) {
        if (recipient.email.isEmpty) {
          continue;
        }
        final recipientId = _personNodeId(recipient.email);
        _ensurePerson(graph, recipient, recipientId, '收件人', visibleNodeIds);
        graph.addEdge(mailId, recipientId, '发送给');
        if (sender.email.isNotEmpty) {
          graph.addEdge(_personNodeId(sender.email), recipientId, '通信');
        }
      }

      for (final recipient in _parseAddresses(document.cc)) {
        if (recipient.email.isEmpty) {
          continue;
        }
        final recipientId = _personNodeId(recipient.email);
        _ensurePerson(graph, recipient, recipientId, '抄送人', visibleNodeIds);
        graph.addEdge(mailId, recipientId, '抄送');
      }

      if (document.mailboxPath.isNotEmpty) {
        final folderId = _folderNodeId(document.mailboxPath);
        _ensureSimpleNode(
          graph,
          folderId,
          document.mailboxPath,
          'folder',
          visibleNodeIds,
        );
        graph.addEdge(mailId, folderId, '位于');
      }

      final month = _mailMonth(document);
      if (month.isNotEmpty) {
        final monthId = _monthNodeId(month);
        _ensureSimpleNode(graph, monthId, month, 'time', visibleNodeIds);
        graph.addEdge(mailId, monthId, '发生于');
      }

      final thread = _threadKey(document.subject);
      if (thread.isNotEmpty) {
        final threadId = _threadNodeId(thread);
        _ensureSimpleNode(
          graph,
          threadId,
          _threadLabel(document.subject),
          'thread',
          visibleNodeIds,
        );
        graph.addEdge(mailId, threadId, '同主题');
        byThread.putIfAbsent(thread, () => <String>[]).add(mailId);
      }

      for (final keyword in _subjectTerms(document.subject).take(4)) {
        final keywordId = _keywordNodeId(keyword);
        _ensureSimpleNode(graph, keywordId, keyword, 'keyword', visibleNodeIds);
        graph.addEdge(mailId, keywordId, '提到');
      }
    }

    _linkMailSiblings(graph, byThread, '同主题链');
    _linkMailSiblings(graph, bySender, '同发件人');
  }

  void _addAggregatePairRelationships(
    _KnowledgeGraphDraft graph,
    _MailGraphFacts facts,
    Set<String> visibleNodeIds,
  ) {
    for (final item in facts.topPairs.take(36)) {
      final parts = item.key.split('>');
      if (parts.length != 2) {
        continue;
      }
      final senderId = _personNodeId(parts[0]);
      final recipientId = _personNodeId(parts[1]);
      if (!visibleNodeIds.contains(senderId) ||
          !visibleNodeIds.contains(recipientId)) {
        continue;
      }
      graph.addEdge(senderId, recipientId, '${item.value} 封');
    }
  }

  void _ensurePerson(
    _KnowledgeGraphDraft graph,
    _MailAddress address,
    String nodeId,
    String role,
    Set<String> visibleNodeIds,
  ) {
    if (visibleNodeIds.add(nodeId)) {
      graph.addNode(
        KnowledgeGraphNode(
          id: nodeId,
          label: address.label,
          kind: 'person',
          moduleId: sourceId,
          weight: 1.15,
          metadata: {'邮箱': address.email, '角色': role},
        ),
      );
    }
  }

  void _ensureDomain(
    _KnowledgeGraphDraft graph,
    String domain,
    String nodeId,
    Set<String> visibleNodeIds,
  ) {
    if (visibleNodeIds.add(nodeId)) {
      graph.addNode(
        KnowledgeGraphNode(
          id: nodeId,
          label: domain,
          kind: 'domain',
          moduleId: sourceId,
          weight: 1.1,
        ),
      );
    }
  }

  void _ensureSimpleNode(
    _KnowledgeGraphDraft graph,
    String nodeId,
    String label,
    String kind,
    Set<String> visibleNodeIds,
  ) {
    if (visibleNodeIds.add(nodeId)) {
      graph.addNode(
        KnowledgeGraphNode(
          id: nodeId,
          label: label,
          kind: kind,
          moduleId: sourceId,
          weight: 1.1,
        ),
      );
    }
  }

  void _linkMailSiblings(
    _KnowledgeGraphDraft graph,
    Map<String, List<String>> groups,
    String label,
  ) {
    var created = 0;
    for (final ids in groups.values) {
      if (ids.length < 2) {
        continue;
      }
      for (var index = 0; index < ids.length - 1; index += 1) {
        graph.addEdge(ids[index], ids[index + 1], label);
        created += 1;
        if (created >= 32) {
          return;
        }
      }
    }
  }
}

class ResultKnowledgeGraphDataSource implements KnowledgeGraphDataSource {
  const ResultKnowledgeGraphDataSource();

  @override
  String get sourceId => 'result';

  @override
  String get label => '分析结果事实输入';

  @override
  bool isEnabled(KnowledgeGraphContext context) =>
      context.people.isNotEmpty || context.transactions.isNotEmpty;

  @override
  KnowledgeGraphContribution build(KnowledgeGraphContext context) {
    final graph = _KnowledgeGraphDraft(sourceId);
    graph.addNode(
      const KnowledgeGraphNode(
        id: 'result:knowledge',
        label: '分析结果',
        kind: 'root',
        moduleId: 'result',
        weight: 2.4,
      ),
    );

    final peopleByLabel = <String, String>{};
    for (final person in context.people.take(20)) {
      final label = _firstString(person, const [
        'name',
        'person',
        'email',
        'title',
        'id',
      ]);
      if (label.isEmpty) {
        continue;
      }
      final nodeId = 'result:person:${_stableKey(label)}';
      peopleByLabel[_normalizeLookup(label)] = nodeId;
      graph.addNode(
        KnowledgeGraphNode(
          id: nodeId,
          label: label,
          kind: 'person',
          moduleId: sourceId,
          weight: 1.3,
          metadata: _stringMetadata(person, const [
            'email',
            'role',
            'company',
            'organization',
            'phone',
          ]),
        ),
      );
      graph.addEdge('result:knowledge', nodeId, '人物');
    }

    for (final transaction in context.transactions.take(18)) {
      final label = _firstString(transaction, const [
        'title',
        'name',
        'summary',
        'description',
        'transactionId',
        'id',
      ]);
      final nodeId =
          'result:transaction:${_stableKey(label.isEmpty ? transaction.toString() : label)}';
      graph.addNode(
        KnowledgeGraphNode(
          id: nodeId,
          label: label.isEmpty ? '事务' : label,
          kind: 'transaction',
          moduleId: sourceId,
          weight: 1.4,
          metadata: _stringMetadata(transaction, const [
            'date',
            'time',
            'amount',
            'currency',
            'status',
            'source',
          ]),
        ),
      );
      graph.addEdge('result:knowledge', nodeId, '事务');

      for (final participant in _participants(transaction)) {
        final personId =
            peopleByLabel[_normalizeLookup(participant)] ??
            'result:person:${_stableKey(participant)}';
        graph.addNode(
          KnowledgeGraphNode(
            id: personId,
            label: participant,
            kind: 'person',
            moduleId: sourceId,
            weight: 1.1,
          ),
        );
        graph.addEdge(nodeId, personId, '参与');
      }
    }

    return graph.toContribution(version: 'result-v1');
  }
}

class _KnowledgeGraphDraft {
  _KnowledgeGraphDraft(this.sourceId);

  final String sourceId;
  final LinkedHashMap<String, KnowledgeGraphNode> _nodes =
      LinkedHashMap<String, KnowledgeGraphNode>();
  final LinkedHashMap<String, KnowledgeGraphEdge> _edges =
      LinkedHashMap<String, KnowledgeGraphEdge>();

  void addNode(KnowledgeGraphNode node) {
    _nodes[node.id] = _nodes[node.id]?.merge(node) ?? node;
  }

  void addEdge(String sourceId, String targetId, String label) {
    final id = '${this.sourceId}:$sourceId->$targetId:$label';
    _edges[id] = KnowledgeGraphEdge(
      id: id,
      sourceId: sourceId,
      targetId: targetId,
      label: label,
      moduleId: this.sourceId,
    );
  }

  KnowledgeGraphContribution toContribution({required String version}) {
    return KnowledgeGraphContribution(
      nodes: _nodes.values.toList(growable: false),
      edges: _edges.values.toList(growable: false),
      version: version,
    );
  }
}

class _AffairClusterer {
  _AffairClusterer(this._semanticSuggestions);

  final Map<String, MailKnowledgeSemanticSuggestion> _semanticSuggestions;
  final LinkedHashMap<String, _AffairCluster> _clusters =
      LinkedHashMap<String, _AffairCluster>();
  final List<_PendingMailAffairEvidence> _pendingMail = [];
  bool _pendingMailClustered = false;

  int evidenceCount = 0;
  int get clusterCount => _clusters.length;

  void addMail(MailKnowledgeDocument document) {
    final semantic =
        _semanticSuggestions[document.messageKey] ??
        _semanticSuggestions['doc:${document.docId}'];
    final title = document.subject.trim().isEmpty
        ? document.fileName.trim()
        : document.subject.trim();
    final label = _threadLabel(title);
    final terms = <String>{
      ..._subjectTerms(title),
      ...?semantic?.keywords.map(_normalizeLookup),
    }.where((item) => item.isNotEmpty).take(12).toList(growable: false);
    final people = <String, String>{};
    final sender = _parseAddress(document.sender);
    if (sender.email.isNotEmpty) {
      people[sender.email] = sender.label;
    }
    for (final recipient in _parseAddresses(document.recipients)) {
      people[recipient.email] = recipient.label;
    }
    for (final recipient in _parseAddresses(document.cc)) {
      people[recipient.email] = recipient.label;
    }
    final month = _mailMonth(document);
    final semanticTaxonomy = _usableSemanticTaxonomy(semantic?.taxonomyPath);
    final taxonomyPath = semanticTaxonomy.isNotEmpty
        ? semanticTaxonomy
        : document.taxonomyPath.trim().isNotEmpty &&
              document.taxonomyPath.trim() != '未分类'
        ? document.taxonomyPath.trim()
        : _AffairTaxonomy.classify(
            title: title,
            sender: document.sender,
            mailboxPath: document.mailboxPath,
            terms: terms,
          ).path;
    _pendingMail.add(
      _PendingMailAffairEvidence(
        title: title,
        label: label,
        sender: sender,
        terms: terms,
        people: people,
        month: month,
        taxonomyPath: taxonomyPath,
        semanticEntity: semantic?.entity ?? '',
        semanticIntent: semantic?.intent ?? '',
        evidence: _AffairEvidence(
          id: 'mail:${document.docId}',
          label: label,
          kind: '邮件',
          sourceLabel: 'Mail.app',
          taxonomyPath: taxonomyPath,
          time: document.dateReceived.isEmpty
              ? document.dateSent
              : document.dateReceived,
          metadata: {
            '发件人': document.sender,
            '收件人': document.recipients,
            if (document.cc.isNotEmpty) '抄送': document.cc,
            '文件夹': document.mailboxPath,
            '状态': document.status,
            if (taxonomyPath.isNotEmpty) '分类': taxonomyPath,
            if (semantic != null && semantic.provider.isNotEmpty)
              '语义增强': semantic.provider,
            if (semantic != null && semantic.keywords.isNotEmpty)
              '增强关键词': semantic.keywords.take(6).join('，'),
            if (semantic != null && semantic.entity.isNotEmpty)
              '增强实体': semantic.entity,
            if (semantic != null && semantic.intent.isNotEmpty)
              '增强意图': semantic.intent,
            'docId': '${document.docId}',
            '文件名': document.fileName,
            'messageKey': document.messageKey,
          },
        ),
      ),
    );
    evidenceCount += 1;
  }

  void addTransaction(Map<String, dynamic> transaction) {
    final label = _firstString(transaction, const [
      'title',
      'name',
      'summary',
      'description',
      'transactionId',
      'id',
    ]);
    if (label.isEmpty) {
      return;
    }
    final body = _firstString(transaction, const [
      'summary',
      'description',
      'content',
      'note',
    ]);
    final terms = <String>{
      ..._subjectTerms(label),
      ..._subjectTerms(body),
    }.take(8).toList(growable: false);
    final people = <String, String>{};
    for (final participant in _participants(transaction)) {
      final address = _parseAddress(participant);
      final key = address.email.isNotEmpty
          ? address.email
          : _normalizeLookup(participant);
      if (key.isNotEmpty) {
        people[key] = address.email.isNotEmpty ? address.label : participant;
      }
    }
    final month = _eventMonth(
      _firstString(transaction, const [
        'date',
        'time',
        'createdAt',
        'updatedAt',
        'timestamp',
      ]),
    );
    final taxonomyPath = _AffairTaxonomy.classify(
      title: label,
      sender: '',
      mailboxPath: _firstString(transaction, const [
        'source',
        'folder',
        'type',
      ]),
      terms: terms,
    ).path;
    final key = _affairKey(label, terms, people.keys, month, taxonomyPath);
    final cluster = _clusters.putIfAbsent(
      key,
      () => _AffairCluster(key: key, label: label),
    );
    cluster.addEvidence(
      _AffairEvidence(
        id: 'result:${_stableKey(label)}',
        label: label,
        kind: '分析事务',
        sourceLabel: 'AgentStudio',
        taxonomyPath: taxonomyPath,
        time: month,
        metadata: _stringMetadata(transaction, const [
          'status',
          'source',
          'amount',
          'currency',
          'summary',
          'description',
        ]),
      ),
      terms: terms,
      people: people,
      month: month,
    );
    evidenceCount += 1;
  }

  List<_AffairCluster> topClusters(int limit) {
    _clusterPendingMail();
    return _clusters.values.toList()
      ..sort((left, right) {
        final evidence = right.evidenceCount.compareTo(left.evidenceCount);
        if (evidence != 0) {
          return evidence;
        }
        final sources = right.sources.length.compareTo(left.sources.length);
        if (sources != 0) {
          return sources;
        }
        return left.label.compareTo(right.label);
      })
      ..length = math.min(limit, _clusters.length);
  }

  void _clusterPendingMail() {
    if (_pendingMailClustered) {
      return;
    }
    _pendingMailClustered = true;
    if (_pendingMail.isEmpty) {
      return;
    }

    final entityCounts = <String, _AffairEntityHit>{};
    for (final mail in _pendingMail) {
      for (final candidate in _entityCandidatesForMail(mail)) {
        final current = entityCounts[candidate.key];
        entityCounts[candidate.key] = _AffairEntityHit(
          key: candidate.key,
          label: current?.label ?? candidate.label,
          count: (current?.count ?? 0) + 1,
        );
      }
    }

    final threshold = _entityPromotionThreshold(_pendingMail.length);
    final promoted = {
      for (final item in entityCounts.values)
        if (item.count >= threshold) item.key: item,
    };

    for (final mail in _pendingMail) {
      final semanticEntity = mail.semanticEntity.trim();
      final semanticEntityKey = _stableEntityKey(semanticEntity);
      final semanticEntityHit = promoted[semanticEntityKey];
      final entity = semanticEntity.isNotEmpty && semanticEntityHit != null
          ? _AffairEntityHit(
              key: semanticEntityKey,
              label: semanticEntity,
              count: semanticEntityHit.count,
            )
          : _bestPromotedEntity(mail, promoted);
      final intent = _normalizeAffairIntent(
        mail.semanticIntent,
        title: mail.title,
        terms: mail.terms,
        taxonomyPath: mail.taxonomyPath,
      );
      final key = entity == null
          ? _affairKey(
              mail.label,
              mail.terms,
              mail.people.keys,
              mail.month,
              mail.taxonomyPath,
            )
          : _entityAffairKey(entity.key, intent, mail.taxonomyPath);
      final label = entity == null
          ? mail.label
          : _entityAffairLabel(entity.label, intent);
      final cluster = _clusters.putIfAbsent(
        key,
        () => _AffairCluster(key: key, label: label),
      );
      if (entity != null) {
        cluster.addEntity(entity, intent: intent, evidenceLabel: mail.label);
      }
      cluster.addEvidence(
        mail.evidence,
        terms: _affairTermsForMail(mail, entity, intent),
        people: mail.people,
        month: mail.month,
      );
    }
    _pendingMail.clear();
  }

  int _entityPromotionThreshold(int mailCount) {
    if (mailCount <= 0) {
      return 999999;
    }
    return math.max(3, math.min(12, (mailCount * 0.008).ceil()));
  }

  _AffairEntityHit? _bestPromotedEntity(
    _PendingMailAffairEvidence mail,
    Map<String, _AffairEntityHit> promoted,
  ) {
    _AffairEntityCandidate? bestCandidate;
    _AffairEntityHit? bestHit;
    for (final candidate in _entityCandidatesForMail(mail)) {
      final hit = promoted[candidate.key];
      if (hit == null) {
        continue;
      }
      if (bestCandidate == null ||
          hit.count > bestHit!.count ||
          (hit.count == bestHit.count &&
              candidate.score > bestCandidate.score)) {
        bestCandidate = candidate;
        bestHit = hit;
      }
    }
    return bestHit;
  }

  List<_AffairEntityCandidate> _entityCandidatesForMail(
    _PendingMailAffairEvidence mail,
  ) {
    final candidates = <String, _AffairEntityCandidate>{};
    void add(String key, String label, int score) {
      final normalizedKey = _stableEntityKey(key);
      final normalizedLabel = _cleanEntityLabel(label);
      if (normalizedKey.isEmpty || normalizedLabel.isEmpty) {
        return;
      }
      final current = candidates[normalizedKey];
      if (current == null || score > current.score) {
        candidates[normalizedKey] = _AffairEntityCandidate(
          key: normalizedKey,
          label: normalizedLabel,
          score: score,
        );
      }
    }

    if (mail.semanticEntity.trim().isNotEmpty) {
      add(mail.semanticEntity, mail.semanticEntity, 12);
    }

    final title = mail.title.toLowerCase();
    final senderText = '${mail.sender.label} ${mail.sender.email}'
        .toLowerCase();
    final haystack = '$title $senderText ${mail.terms.join(' ')}';
    for (final rule in _knownAffairEntityRules) {
      var matched = false;
      for (final domain in rule.domains) {
        final normalized = domain.toLowerCase();
        if (mail.sender.domain == normalized ||
            mail.sender.domain.endsWith('.$normalized') ||
            haystack.contains(normalized)) {
          add(rule.key, rule.label, 8);
          matched = true;
          break;
        }
      }
      if (matched) {
        continue;
      }
      for (final keyword in rule.keywords) {
        if (haystack.contains(keyword.toLowerCase())) {
          add(rule.key, rule.label, keyword.length >= 6 ? 7 : 6);
          break;
        }
      }
    }

    final domainEntity = _entityLabelFromDomain(mail.sender.domain);
    if (domainEntity.isNotEmpty) {
      add(domainEntity, domainEntity, 4);
    }
    final senderEntity = _entityLabelFromSender(mail.sender.label);
    if (senderEntity.isNotEmpty) {
      add(senderEntity, senderEntity, 5);
    }
    for (final term in mail.terms) {
      if (_isEntityTermCandidate(term)) {
        add(term, _titleCaseEntity(term), 3);
      }
    }
    return candidates.values.toList(growable: false);
  }

  List<String> _affairTermsForMail(
    _PendingMailAffairEvidence mail,
    _AffairEntityHit? entity,
    String intent,
  ) {
    final normalizedEntity = entity == null ? '' : _stableEntityKey(entity.key);
    final entityLabelTerms = entity == null
        ? const <String>{}
        : _subjectTerms(entity.label).map(_stableEntityKey).toSet();
    final terms = <String>[];
    if (entity != null) {
      terms.add(entity.key);
    }
    final intentTerm = _intentTerm(intent);
    if (intentTerm.isNotEmpty) {
      terms.add(intentTerm);
    }
    for (final term in mail.terms) {
      final normalized = _stableEntityKey(term);
      if (normalized.isEmpty ||
          normalized == normalizedEntity ||
          entityLabelTerms.contains(normalized) ||
          _affairGraphNoiseTerms.contains(normalized)) {
        continue;
      }
      terms.add(term);
      if (terms.length >= 8) {
        break;
      }
    }
    return terms.toSet().toList(growable: false);
  }
}

class _AffairCluster {
  _AffairCluster({required this.key, required this.label});

  final String key;
  String label;
  final List<_AffairEvidence> evidence = [];
  final Set<String> sources = {};
  final Map<String, _AffairPersonHit> people = {};
  final Map<String, int> terms = {};
  final Map<String, int> months = {};
  final Map<String, int> taxonomyPaths = {};
  final Map<String, _AffairEntityHit> entities = {};
  final Map<String, int> intents = {};
  final List<String> entityEvidenceLabels = [];

  int get evidenceCount => evidence.length;
  String get primaryMonth {
    final ordered = _topCounts(months);
    return ordered.isEmpty ? '' : ordered.first.key;
  }

  String get primaryTaxonomy {
    final ordered = _topCounts(taxonomyPaths);
    return ordered.isEmpty ? '未分类' : ordered.first.key;
  }

  _AffairEntityHit? get primaryEntity {
    final items = entities.values.toList()
      ..sort((left, right) {
        final count = right.count.compareTo(left.count);
        if (count != 0) {
          return count;
        }
        return left.label.compareTo(right.label);
      });
    return items.isEmpty ? null : items.first;
  }

  String get intent {
    final ordered = _topCounts(intents);
    return ordered.isEmpty ? '' : ordered.first.key;
  }

  void addEntity(
    _AffairEntityHit entity, {
    required String intent,
    required String evidenceLabel,
  }) {
    final current = entities[entity.key];
    entities[entity.key] = _AffairEntityHit(
      key: entity.key,
      label: current?.label ?? entity.label,
      count: math.max(current?.count ?? 0, entity.count).toInt(),
    );
    if (intent.isNotEmpty) {
      _bump(intents, intent);
    }
    if (entityEvidenceLabels.length < 10 &&
        evidenceLabel.trim().isNotEmpty &&
        !entityEvidenceLabels.contains(evidenceLabel)) {
      entityEvidenceLabels.add(evidenceLabel);
    }
  }

  void addEvidence(
    _AffairEvidence item, {
    required List<String> terms,
    required Map<String, String> people,
    required String month,
  }) {
    if (label.isEmpty || (item.kind == '分析事务' && item.label.length > 3)) {
      label = item.label;
    }
    evidence.add(item);
    sources.add(item.sourceLabel);
    if (item.taxonomyPath.isNotEmpty) {
      _bump(taxonomyPaths, item.taxonomyPath);
    }
    if (month.isNotEmpty) {
      _bump(months, month);
    }
    for (final term in terms) {
      _bump(this.terms, term);
    }
    for (final entry in people.entries) {
      final current = this.people[entry.key];
      this.people[entry.key] = _AffairPersonHit(
        key: entry.key,
        label: current?.label ?? entry.value,
        count: (current?.count ?? 0) + 1,
      );
    }
  }

  List<_AffairPersonHit> topPeople(int limit) {
    final items = people.values.toList()
      ..sort((left, right) {
        final count = right.count.compareTo(left.count);
        if (count != 0) {
          return count;
        }
        return left.label.compareTo(right.label);
      });
    return items.take(limit).toList(growable: false);
  }

  List<MapEntry<String, int>> topTerms(int limit) {
    return _topCounts(terms).take(limit).toList(growable: false);
  }
}

class _AffairEvidence {
  const _AffairEvidence({
    required this.id,
    required this.label,
    required this.kind,
    required this.sourceLabel,
    required this.taxonomyPath,
    required this.time,
    required this.metadata,
  });

  final String id;
  final String label;
  final String kind;
  final String sourceLabel;
  final String taxonomyPath;
  final String time;
  final Map<String, String> metadata;
}

class _PendingMailAffairEvidence {
  const _PendingMailAffairEvidence({
    required this.title,
    required this.label,
    required this.sender,
    required this.terms,
    required this.people,
    required this.month,
    required this.taxonomyPath,
    required this.semanticEntity,
    required this.semanticIntent,
    required this.evidence,
  });

  final String title;
  final String label;
  final _MailAddress sender;
  final List<String> terms;
  final Map<String, String> people;
  final String month;
  final String taxonomyPath;
  final String semanticEntity;
  final String semanticIntent;
  final _AffairEvidence evidence;
}

class _AffairPersonHit {
  const _AffairPersonHit({
    required this.key,
    required this.label,
    required this.count,
  });

  final String key;
  final String label;
  final int count;
}

class _AffairEntityHit {
  const _AffairEntityHit({
    required this.key,
    required this.label,
    required this.count,
  });

  final String key;
  final String label;
  final int count;
}

class _AffairEntityCandidate {
  const _AffairEntityCandidate({
    required this.key,
    required this.label,
    required this.score,
  });

  final String key;
  final String label;
  final int score;
}

class _AffairEntityRule {
  const _AffairEntityRule({
    required this.key,
    required this.label,
    required this.keywords,
    required this.domains,
  });

  final String key;
  final String label;
  final List<String> keywords;
  final List<String> domains;
}

class _AffairTaxonomyMatch {
  const _AffairTaxonomyMatch({required this.path, required this.score});

  final String path;
  final int score;
}

class _AffairTaxonomyRule {
  const _AffairTaxonomyRule({
    required this.path,
    required this.keywords,
    this.domains = const [],
  });

  final String path;
  final List<String> keywords;
  final List<String> domains;
}

class _AffairTaxonomy {
  static const List<_AffairTaxonomyRule> _rules = [
    _AffairTaxonomyRule(
      path: '开发/客户端/macOS',
      keywords: [
        'macos',
        'swift',
        'swiftui',
        'appkit',
        'xcode',
        'notarization',
        '签名',
      ],
    ),
    _AffairTaxonomyRule(
      path: '开发/客户端/iOS',
      keywords: [
        'ios',
        'iphone app',
        'ipad',
        'app store',
        'testflight',
        'swiftui',
      ],
    ),
    _AffairTaxonomyRule(
      path: '开发/前端/Web',
      keywords: [
        'frontend',
        'react',
        'nextjs',
        'vite',
        'typescript',
        'css',
        'html',
      ],
    ),
    _AffairTaxonomyRule(
      path: '开发/后端/API',
      keywords: [
        'backend',
        'server',
        'api',
        'database',
        'postgres',
        'redis',
        'docker',
      ],
    ),
    _AffairTaxonomyRule(
      path: '开发/AI/模型',
      keywords: ['openai', 'gpt', 'llm', 'embedding', 'rag', 'model', 'ai'],
      domains: ['openai.com', 'github.com'],
    ),
    _AffairTaxonomyRule(
      path: '测试/自动化/E2E',
      keywords: [
        'test',
        'testing',
        'playwright',
        'selenium',
        'e2e',
        '自动化',
        '测试',
      ],
    ),
    _AffairTaxonomyRule(
      path: '测试/质量/性能',
      keywords: [
        'performance',
        'benchmark',
        'latency',
        'profiling',
        '性能',
        '压测',
      ],
    ),
    _AffairTaxonomyRule(
      path: '交付/发布/上线',
      keywords: ['release', 'deploy', 'deployment', 'launch', '上线', '发布', '交付'],
    ),
    _AffairTaxonomyRule(
      path: '交付/作业/提交',
      keywords: [
        'assignment',
        'submission',
        'homework',
        'deadline',
        'coursework',
        '作业',
        '提交',
      ],
    ),
    _AffairTaxonomyRule(
      path: '运营/云服务/监控',
      keywords: [
        'cloud',
        'aws',
        'azure',
        'digitalocean',
        'monitoring',
        'alert',
        'incident',
      ],
      domains: ['digitalocean.com', 'amazonaws.com', 'microsoft.com'],
    ),
    _AffairTaxonomyRule(
      path: '购物/电子产品/手机',
      keywords: ['iphone', 'android phone', 'smartphone', '手机'],
      domains: ['apple.com', 'samsung.com'],
    ),
    _AffairTaxonomyRule(
      path: '购物/电子产品/电脑',
      keywords: ['macbook', 'laptop', 'surface', 'pc', 'computer', '电脑', '笔记本'],
      domains: ['apple.com', 'microsoftstoreemail.com'],
    ),
    _AffairTaxonomyRule(
      path: '购物/电子产品/游戏设备',
      keywords: [
        'xbox',
        'playstation',
        'controller',
        'gaming pc',
        'steam deck',
      ],
      domains: ['microsoftstoreemail.com', 'playstation.com'],
    ),
    _AffairTaxonomyRule(
      path: '购物/服装/运动鞋服',
      keywords: [
        'nike',
        'adidas',
        'jordan',
        'shoes',
        'sneaker',
        'ultraboost',
        'air max',
        '服装',
      ],
      domains: ['official.nike.com', 'uk-news.adidas.com'],
    ),
    _AffairTaxonomyRule(
      path: '购物/美妆/护肤',
      keywords: ['beauty', 'cosmetic', 'skincare', 'makeup', '美妆', '护肤'],
    ),
    _AffairTaxonomyRule(
      path: '购物/家电/厨房',
      keywords: [
        'appliance',
        'kitchen',
        'fridge',
        'washer',
        'vacuum',
        '家电',
        '厨房',
      ],
    ),
    _AffairTaxonomyRule(
      path: '购物/宠物/用品',
      keywords: ['pet', 'dog', 'cat', '宠物'],
    ),
    _AffairTaxonomyRule(
      path: '购物/乐器/音乐设备',
      keywords: [
        'guitar',
        'piano',
        'midi',
        'audio interface',
        'presonus',
        '乐器',
      ],
      domains: ['presonus.com'],
    ),
    _AffairTaxonomyRule(
      path: '账单/订阅/数字服务',
      keywords: [
        'subscription',
        'receipt',
        'invoice',
        'renewal',
        'billing',
        '账单',
        '订阅',
      ],
      domains: ['email.apple.com', 'netflix.com'],
    ),
    _AffairTaxonomyRule(
      path: '账单/支付/交易',
      keywords: [
        'payment',
        'purchase',
        'order',
        'paid',
        'transaction',
        '付款',
        '支付',
      ],
    ),
    _AffairTaxonomyRule(
      path: '广告/促销/折扣',
      keywords: [
        'sale',
        'discount',
        'offer',
        'coupon',
        'deal',
        'flash sale',
        '折扣',
        '促销',
      ],
    ),
    _AffairTaxonomyRule(
      path: '投资/金融/转账',
      keywords: [
        'bank',
        'finance',
        'investment',
        'stock',
        'crypto',
        'transfer',
        'western union',
        '投资',
        '转账',
      ],
      domains: ['westernunion.com'],
    ),
    _AffairTaxonomyRule(
      path: '学习/语言/课程',
      keywords: [
        'course',
        'lesson',
        'teacher',
        'learning',
        'italki',
        'language',
        '课程',
        '学习',
      ],
      domains: ['italki.com', 'sendgrid.net'],
    ),
    _AffairTaxonomyRule(
      path: '旅行/交通/票务',
      keywords: [
        'ticket',
        'train',
        'flight',
        'hotel',
        'travel',
        'holiday',
        '旅行',
        '机票',
        '火车',
      ],
      domains: ['thetrainline.com'],
    ),
    _AffairTaxonomyRule(
      path: '安全/账号/登录',
      keywords: [
        'security',
        'sign-in',
        'login',
        'verification',
        'password',
        'account',
        '安全',
        '验证',
        '登录',
      ],
      domains: [
        'accountprotection.microsoft.com',
        'accounts.google.com',
        'id.apple.com',
      ],
    ),
    _AffairTaxonomyRule(
      path: '娱乐/游戏/发行',
      keywords: [
        'game',
        'steam',
        'xbox',
        'play',
        'final fantasy',
        'elder scrolls',
        'blizzard',
        '游戏',
      ],
      domains: [
        'steampowered.com',
        'steamcommunity.com',
        'square-enix.com',
        'blizzard.com',
        'ea.com',
        'elderscrollsonline.com',
      ],
    ),
    _AffairTaxonomyRule(
      path: '娱乐/影视/流媒体',
      keywords: ['netflix', 'movie', 'series', 'watch', 'streaming', '影视'],
      domains: ['mailer.netflix.com', 'netflix.com'],
    ),
    _AffairTaxonomyRule(
      path: '生活/分享/日常',
      keywords: ['newsletter', 'weekly', 'photo', 'family', 'life', '生活', '分享'],
    ),
  ];

  static _AffairTaxonomyMatch classify({
    required String title,
    required String sender,
    required String mailboxPath,
    required Iterable<String> terms,
  }) {
    final haystack =
        '${title.toLowerCase()} ${sender.toLowerCase()} ${mailboxPath.toLowerCase()} ${terms.join(' ').toLowerCase()}';
    final domain = _emailMatch(sender).split('@').last.toLowerCase();
    var best = const _AffairTaxonomyMatch(path: '未分类', score: 0);
    for (final rule in _rules) {
      var score = 0;
      for (final keyword in rule.keywords) {
        if (haystack.contains(keyword.toLowerCase())) {
          score += keyword.length >= 6 ? 3 : 2;
        }
      }
      for (final ruleDomain in rule.domains) {
        final normalized = ruleDomain.toLowerCase();
        if (domain == normalized || domain.endsWith('.$normalized')) {
          score += 4;
        } else if (haystack.contains(normalized)) {
          score += 3;
        }
      }
      if (score > best.score) {
        best = _AffairTaxonomyMatch(path: rule.path, score: score);
      }
    }
    return best;
  }
}

class _MailGraphFacts {
  _MailGraphFacts(List<MailKnowledgeDocument> documents) {
    for (final document in documents) {
      final sender = _parseAddress(document.sender);
      if (sender.email.isNotEmpty) {
        _bumpPerson(senders, sender);
        if (sender.domain.isNotEmpty) {
          _bump(domains, sender.domain);
        }
      }
      for (final recipient in _parseAddresses(document.recipients)) {
        if (recipient.email.isEmpty) {
          continue;
        }
        _bumpPerson(recipients, recipient);
        if (sender.email.isNotEmpty) {
          _bump(pairs, '${sender.email}>${recipient.email}');
        }
      }
      if (document.mailboxPath.isNotEmpty) {
        _bump(folders, document.mailboxPath);
      }
      final month = _mailMonth(document);
      if (month.isNotEmpty) {
        _bump(months, month);
      }
      final thread = _threadKey(document.subject);
      if (thread.isNotEmpty) {
        final current = threads[thread];
        threads[thread] = _MailThreadCount(
          label: current?.label ?? _threadLabel(document.subject),
          count: (current?.count ?? 0) + 1,
        );
      }
      for (final keyword in _subjectTerms(document.subject)) {
        _bump(keywords, keyword);
      }
    }
  }

  final Map<String, _MailPersonCount> senders = {};
  final Map<String, _MailPersonCount> recipients = {};
  final Map<String, int> domains = {};
  final Map<String, int> folders = {};
  final Map<String, int> months = {};
  final Map<String, _MailThreadCount> threads = {};
  final Map<String, int> keywords = {};
  final Map<String, int> pairs = {};

  List<MapEntry<String, _MailPersonCount>> get topSenders =>
      _topPeople(senders);
  List<MapEntry<String, _MailPersonCount>> get topRecipients =>
      _topPeople(recipients);
  List<MapEntry<String, int>> get topDomains => _topCounts(domains);
  List<MapEntry<String, int>> get topFolders => _topCounts(folders);
  List<MapEntry<String, int>> get topMonths => _topCounts(months);
  List<MapEntry<String, _MailThreadCount>> get topThreads =>
      threads.entries.toList()..sort((left, right) {
        final count = right.value.count.compareTo(left.value.count);
        if (count != 0) {
          return count;
        }
        return left.value.label.compareTo(right.value.label);
      });
  List<MapEntry<String, int>> get topKeywords => _topCounts(keywords);
  List<MapEntry<String, int>> get topPairs => _topCounts(pairs);

  void _bumpPerson(Map<String, _MailPersonCount> counts, _MailAddress address) {
    final current = counts[address.email];
    counts[address.email] = _MailPersonCount(
      email: address.email,
      label: current?.label ?? address.label,
      count: (current?.count ?? 0) + 1,
    );
  }
}

class _MailPersonCount {
  const _MailPersonCount({
    required this.email,
    required this.label,
    required this.count,
  });

  final String email;
  final String label;
  final int count;
}

class _MailThreadCount {
  const _MailThreadCount({required this.label, required this.count});

  final String label;
  final int count;
}

class _MailAddress {
  const _MailAddress({
    required this.email,
    required this.label,
    required this.domain,
  });

  final String email;
  final String label;
  final String domain;
}

List<MapEntry<String, _MailPersonCount>> _topPeople(
  Map<String, _MailPersonCount> counts,
) {
  return counts.entries.toList()..sort((left, right) {
    final count = right.value.count.compareTo(left.value.count);
    if (count != 0) {
      return count;
    }
    return left.value.label.compareTo(right.value.label);
  });
}

List<MapEntry<String, int>> _topCounts(Map<String, int> counts) {
  return counts.entries.toList()..sort((left, right) {
    final count = right.value.compareTo(left.value);
    if (count != 0) {
      return count;
    }
    return left.key.compareTo(right.key);
  });
}

void _bump(Map<String, int> counts, String key) {
  final normalized = key.trim();
  if (normalized.isEmpty) {
    return;
  }
  counts[normalized] = (counts[normalized] ?? 0) + 1;
}

Iterable<String> _participants(Map<String, dynamic> transaction) sync* {
  for (final key in const [
    'participants',
    'counterparties',
    'people',
    'person',
    'from',
    'to',
  ]) {
    final value = transaction[key];
    if (value is List) {
      for (final item in value) {
        if (item is Map) {
          final label = _firstString(Map<String, dynamic>.from(item), const [
            'name',
            'person',
            'email',
            'id',
          ]);
          if (label.isNotEmpty) {
            yield label;
          }
        } else {
          final text = item.toString().trim();
          if (text.isNotEmpty) {
            yield text;
          }
        }
      }
    } else if (value != null) {
      final text = value.toString().trim();
      if (text.isNotEmpty) {
        yield text;
      }
    }
  }
}

_MailAddress _parseAddress(String value) {
  final trimmed = value.trim();
  final bracketMatch = RegExp(r'<([^>]+)>').firstMatch(trimmed);
  final rawEmail = bracketMatch?.group(1) ?? _emailMatch(trimmed);
  final email = rawEmail.trim().toLowerCase();
  final domain = email.contains('@') ? email.split('@').last : '';
  var label = trimmed;
  if (bracketMatch != null) {
    label = trimmed.substring(0, bracketMatch.start).trim();
  }
  label = label.replaceAll('"', '').trim();
  if (label.isEmpty) {
    label = email.isEmpty ? trimmed : email;
  }
  return _MailAddress(email: email, label: label, domain: domain);
}

Iterable<_MailAddress> _parseAddresses(String value) sync* {
  final normalized = value.replaceAll(';', ',');
  for (final part in normalized.split(',')) {
    final address = _parseAddress(part);
    if (address.email.isNotEmpty) {
      yield address;
    }
  }
}

String _emailMatch(String value) {
  final match = RegExp(
    r'[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}',
    caseSensitive: false,
  ).firstMatch(value);
  return match?.group(0) ?? '';
}

String _mailMonth(MailKnowledgeDocument document) {
  final raw = document.dateReceived.isEmpty
      ? document.dateSent
      : document.dateReceived;
  final year = RegExp(r'\b(19\d{2}|20\d{2})\b').firstMatch(raw)?.group(1);
  final month = _monthNumber(raw);
  if (year != null && month.isNotEmpty) {
    return '$year-$month';
  }
  if (document.lastSeenAt.length >= 7) {
    return document.lastSeenAt.substring(0, 7);
  }
  return '';
}

String _monthNumber(String value) {
  final lower = value.toLowerCase();
  const months = {
    'january': '01',
    'february': '02',
    'march': '03',
    'april': '04',
    'may': '05',
    'june': '06',
    'july': '07',
    'august': '08',
    'september': '09',
    'october': '10',
    'november': '11',
    'december': '12',
  };
  for (final entry in months.entries) {
    if (lower.contains(entry.key)) {
      return entry.value;
    }
  }
  final numeric = RegExp(r'\b(0?[1-9]|1[0-2])[/\-]').firstMatch(value);
  if (numeric != null) {
    return numeric.group(1)!.padLeft(2, '0');
  }
  return '';
}

String _threadKey(String subject) {
  final normalized = subject
      .toLowerCase()
      .replaceAll(RegExp(r'^\s*((re|fw|fwd|答复|回复)\s*[:：]\s*)+'), '')
      .replaceAll(RegExp(r'[\[\](){}<>「」『』"“”‘’!！?？,，.。:：;；/\\|]+'), ' ')
      .replaceAll(RegExp(r'\s+'), ' ')
      .trim();
  return normalized.length > 96 ? normalized.substring(0, 96) : normalized;
}

String _threadLabel(String subject) {
  final label = subject
      .replaceAll(
        RegExp(r'^\s*((re|fw|fwd|答复|回复)\s*[:：]\s*)+', caseSensitive: false),
        '',
      )
      .trim();
  if (label.isEmpty) {
    return '无主题';
  }
  return label.length > 48 ? '${label.substring(0, 48)}...' : label;
}

Iterable<String> _subjectTerms(String subject) sync* {
  final seen = <String>{};
  final lower = subject.toLowerCase();
  for (final match in RegExp(
    r'[a-z0-9]{3,}|[\u4e00-\u9fff]{2,}',
  ).allMatches(lower)) {
    final term = match.group(0)!.trim();
    if (_stopWords.contains(term) || !seen.add(term)) {
      continue;
    }
    yield term.length > 24 ? term.substring(0, 24) : term;
  }
}

const Set<String> _stopWords = {
  'the',
  'and',
  'for',
  'you',
  'your',
  'with',
  'from',
  'this',
  'that',
  'are',
  'our',
  'new',
  'off',
  'sale',
  'today',
};

const Set<String> _affairGraphNoiseTerms = {
  ..._stopWords,
  'extra',
  'save',
  'savings',
  'discount',
  'discounts',
  'offer',
  'offers',
  'deal',
  'deals',
  'flash',
  'final',
  'hurry',
  'weekend',
  'daily',
  'weekly',
  'newsletter',
  'inside',
  'online',
  'store',
  'stores',
  'account',
  'notification',
  'notifications',
  'message',
  'messages',
  'update',
  'updates',
  'welcome',
  '推荐',
  '优惠',
  '折扣',
  '促销',
  '特卖',
  '账户',
  '账号',
  '提醒',
  '通知',
};

const Set<String> _genericEntityTerms = {
  ..._affairGraphNoiseTerms,
  'support',
  'service',
  'services',
  'team',
  'official',
  'mailer',
  'email',
  'news',
  'noreply',
  'reply',
  'info',
  'hello',
  'customer',
  'customers',
  'purchase',
  'order',
  'payment',
  'receipt',
  'subscription',
  'verification',
  'security',
  'sign',
  'login',
  'games',
  'game',
};

const List<_AffairEntityRule> _knownAffairEntityRules = [
  _AffairEntityRule(
    key: 'steam',
    label: 'Steam',
    keywords: ['steam', 'steampowered', 'steam deck'],
    domains: ['steampowered.com', 'steamcommunity.com'],
  ),
  _AffairEntityRule(
    key: 'netflix',
    label: 'Netflix',
    keywords: ['netflix'],
    domains: ['netflix.com', 'mailer.netflix.com'],
  ),
  _AffairEntityRule(
    key: 'nike',
    label: 'Nike',
    keywords: ['nike', 'air max', 'air jordan'],
    domains: ['official.nike.com', 'nike.com'],
  ),
  _AffairEntityRule(
    key: 'adidas',
    label: 'adidas',
    keywords: ['adidas', 'ultraboost', 'alphabounce'],
    domains: ['adidas.com', 'uk-news.adidas.com'],
  ),
  _AffairEntityRule(
    key: 'apple',
    label: 'Apple',
    keywords: ['apple', 'icloud', 'apple id', 'app store'],
    domains: ['apple.com', 'email.apple.com', 'id.apple.com'],
  ),
  _AffairEntityRule(
    key: 'microsoft',
    label: 'Microsoft',
    keywords: ['microsoft', 'windows', 'surface', 'xbox'],
    domains: [
      'microsoft.com',
      'microsoftstoreemail.com',
      'accountprotection.microsoft.com',
    ],
  ),
  _AffairEntityRule(
    key: 'google',
    label: 'Google',
    keywords: ['google', 'gmail'],
    domains: ['google.com', 'accounts.google.com'],
  ),
  _AffairEntityRule(
    key: 'github',
    label: 'GitHub',
    keywords: ['github'],
    domains: ['github.com'],
  ),
  _AffairEntityRule(
    key: 'linkedin',
    label: 'LinkedIn',
    keywords: ['linkedin'],
    domains: ['linkedin.com'],
  ),
  _AffairEntityRule(
    key: 'tencent-cloud',
    label: '腾讯云',
    keywords: ['腾讯云', 'tencent cloud'],
    domains: ['cloud.tencent.com', 'tencent.com'],
  ),
  _AffairEntityRule(
    key: 'taobao',
    label: '淘宝',
    keywords: ['淘宝', 'taobao'],
    domains: ['taobao.com', 'tmall.com'],
  ),
  _AffairEntityRule(
    key: 'western-union',
    label: 'Western Union',
    keywords: ['western union'],
    domains: ['westernunion.com'],
  ),
  _AffairEntityRule(
    key: 'square-enix',
    label: 'SQUARE ENIX',
    keywords: ['square enix', 'final fantasy'],
    domains: ['square-enix.com'],
  ),
  _AffairEntityRule(
    key: 'ea',
    label: 'EA',
    keywords: ['ea', 'anthem', 'apex legends'],
    domains: ['ea.com'],
  ),
  _AffairEntityRule(
    key: 'blizzard',
    label: 'Blizzard',
    keywords: ['blizzard', 'overwatch'],
    domains: ['blizzard.com'],
  ),
  _AffairEntityRule(
    key: 'digitalocean',
    label: 'DigitalOcean',
    keywords: ['digitalocean'],
    domains: ['digitalocean.com'],
  ),
  _AffairEntityRule(
    key: 'daz-3d',
    label: 'Daz 3D',
    keywords: ['daz 3d', 'daz3d', 'genesis 8'],
    domains: ['daz3d.com', 'email.daz3d.com'],
  ),
  _AffairEntityRule(
    key: 'unidays',
    label: 'UNiDAYS',
    keywords: ['unidays'],
    domains: ['myunidays.com'],
  ),
  _AffairEntityRule(
    key: 'trainline',
    label: 'Trainline',
    keywords: ['trainline'],
    domains: ['thetrainline.com'],
  ),
  _AffairEntityRule(
    key: 'tesco',
    label: 'Tesco',
    keywords: ['tesco'],
    domains: ['tesco.com'],
  ),
  _AffairEntityRule(
    key: 'italki',
    label: 'italki',
    keywords: ['italki'],
    domains: ['italki.com'],
  ),
  _AffairEntityRule(
    key: 'zalando',
    label: 'Zalando',
    keywords: ['zalando'],
    domains: ['zalando.co.uk', 'zalando.com'],
  ),
  _AffairEntityRule(
    key: 'presonus',
    label: 'PreSonus',
    keywords: ['presonus'],
    domains: ['presonus.com'],
  ),
];

String _mailNodeId(MailKnowledgeDocument document) =>
    'mail:doc:${document.docId}';
String _personNodeId(String email) => 'mail:person:${_stableKey(email)}';
String _domainNodeId(String domain) => 'mail:domain:${_stableKey(domain)}';
String _folderNodeId(String folder) => 'mail:folder:${_stableKey(folder)}';
String _monthNodeId(String month) => 'mail:month:${_stableKey(month)}';
String _threadNodeId(String thread) => 'mail:thread:${_stableKey(thread)}';
String _keywordNodeId(String keyword) => 'mail:keyword:${_stableKey(keyword)}';
String _affairNodeId(String key) => 'affair:event:${_stableKey(key)}';
String _affairPersonNodeId(String key) => 'affair:person:${_stableKey(key)}';
String _affairTimeNodeId(String month) => 'affair:time:${_stableKey(month)}';
String _affairKeywordNodeId(String keyword) =>
    'affair:keyword:${_stableKey(keyword)}';
String _affairEntityNodeId(String key) => 'affair:entity:${_stableKey(key)}';
String _affairIntentNodeId(
  String entityKey,
  String intent,
  String taxonomyPath,
) =>
    'affair:intent:${_stableKey('${_stableEntityKey(entityKey)}|${_normalizeAffairIntent(intent, title: '', terms: const [], taxonomyPath: taxonomyPath)}|$taxonomyPath')}';
String _affairEvidenceNodeId(String id) => 'affair:evidence:${_stableKey(id)}';
String _affairFoldedEvidenceNodeId(String key) =>
    'affair:evidence-folded:${_stableKey(key)}';
String _taxonomyNodeId(String path) => 'affair:taxonomy:${_stableKey(path)}';

String _entityAffairKey(String entityKey, String intent, String taxonomyPath) {
  final taxonomy = taxonomyPath.trim().isEmpty ? '未分类' : taxonomyPath.trim();
  final normalizedIntent = intent.trim().isEmpty ? '综合动态' : intent.trim();
  return 'taxonomy:$taxonomy|entity:${_stableEntityKey(entityKey)}|intent:$normalizedIntent';
}

String _entityAffairLabel(String entityLabel, String intent) {
  final normalizedIntent = intent.trim().isEmpty ? '综合动态' : intent.trim();
  return '$entityLabel $normalizedIntent';
}

String _usableSemanticTaxonomy(String? taxonomyPath) {
  final normalized = (taxonomyPath ?? '').trim();
  if (normalized.isEmpty || normalized == '未分类') {
    return '';
  }
  return normalized;
}

String _normalizeAffairIntent(
  String intent, {
  required String title,
  required Iterable<String> terms,
  required String taxonomyPath,
}) {
  final raw = intent.trim();
  final text =
      '${raw.toLowerCase()} ${title.toLowerCase()} ${terms.join(' ').toLowerCase()} ${taxonomyPath.toLowerCase()}';
  if (_containsAny(text, const [
    'promotion',
    'promo',
    'marketing',
    'campaign',
    'sale',
    'discount',
    'deal',
    'offer',
    'coupon',
    'clearance',
    'flash',
    '促销',
    '折扣',
    '优惠',
    '特卖',
    '营销',
  ])) {
    return '促销折扣';
  }
  if (_containsAny(text, const [
    'security',
    'account',
    'verification',
    'verify',
    'login',
    'sign-in',
    'sign in',
    'password',
    'auth',
    '安全',
    '账号',
    '账户',
    '验证',
    '登录',
    '密码',
  ])) {
    return '账号安全';
  }
  if (_containsAny(text, const [
    'subscription',
    'renewal',
    'renew',
    'billing',
    'bill',
    'invoice',
    'domain',
    '订阅',
    '续费',
    '账单',
    '发票',
  ])) {
    return '订阅账单';
  }
  if (_containsAny(text, const [
    'purchase',
    'order',
    'payment',
    'receipt',
    'transaction',
    'paid',
    'bought',
    '购买',
    '订单',
    '支付',
    '付款',
    '交易',
    '收据',
  ])) {
    return '购买订单';
  }
  if (_containsAny(text, const [
    'release',
    'launch',
    'announcement',
    'available',
    'update',
    'arrived',
    'new',
    '发布',
    '上线',
    '更新',
    '上新',
    '新品',
  ])) {
    return '发布更新';
  }
  if (_containsAny(text, const [
    'social',
    'community',
    'message',
    'notification',
    'connection',
    'invite',
    'follower',
    'comment',
    'post',
    '消息',
    '通知',
    '动态',
    '邀请',
    '好友',
    '评论',
  ])) {
    return '社交通知';
  }
  if (_containsAny(text, const [
    'newsletter',
    'recommendation',
    'recommended',
    'digest',
    'recap',
    'suggestion',
    'content',
    'weekly',
    'daily',
    '推荐',
    '精选',
    '摘要',
    '资讯',
  ])) {
    return '内容推荐';
  }
  if (_containsAny(text, const [
    'travel',
    'flight',
    'train',
    'ticket',
    'hotel',
    'trip',
    '旅行',
    '航班',
    '火车',
    '票务',
    '酒店',
  ])) {
    return '旅行票务';
  }
  if (_containsAny(text, const [
    'course',
    'lesson',
    'teacher',
    'learning',
    'assignment',
    '课程',
    '学习',
    '老师',
    '作业',
  ])) {
    return '学习课程';
  }
  if (_containsAny(text, const [
    'survey',
    'feedback',
    'review',
    'rating',
    'opinion',
    '满意',
    '调研',
    '调查',
    '反馈',
    '评价',
    '评分',
    '意见',
  ])) {
    return '反馈调研';
  }
  return raw.isEmpty ? _mailIntent(title, terms) : raw;
}

String _mailIntent(String title, Iterable<String> terms) {
  final text = '${title.toLowerCase()} ${terms.join(' ').toLowerCase()}';
  if (_containsAny(text, const [
    'sale',
    'discount',
    'off',
    'save',
    'saving',
    'deal',
    'coupon',
    'flash',
    'clearance',
    '特卖',
    '折扣',
    '优惠',
    '促销',
    '减免',
  ])) {
    return '促销折扣';
  }
  if (_containsAny(text, const [
    'sign-in',
    'sign in',
    'login',
    'verification',
    'password',
    'security',
    '安全',
    '验证',
    '登录',
    '密码',
  ])) {
    return '账号安全';
  }
  if (_containsAny(text, const [
    'purchase',
    'order',
    'receipt',
    'payment',
    'transaction',
    'invoice',
    'bought',
    '购买',
    '订单',
    '支付',
    '付款',
    '发票',
  ])) {
    return '购买订单';
  }
  if (_containsAny(text, const [
    'subscription',
    'renewal',
    'billing',
    'bill',
    '订阅',
    '续费',
    '账单',
  ])) {
    return '订阅账单';
  }
  if (_containsAny(text, const [
    'release',
    'launch',
    'available',
    'update',
    'new',
    'arrived',
    '发布',
    '上线',
    '更新',
    '新品',
  ])) {
    return '发布更新';
  }
  if (_containsAny(text, const [
    'survey',
    'feedback',
    'review',
    'rating',
    '满意',
    '调研',
    '调查',
    '反馈',
    '评价',
  ])) {
    return '反馈调研';
  }
  return '综合动态';
}

String _intentTerm(String intent) {
  return switch (intent) {
    '促销折扣' => '促销',
    '账号安全' => '安全',
    '购买订单' => '订单',
    '订阅账单' => '账单',
    '发布更新' => '发布',
    '社交通知' => '社交',
    '内容推荐' => '推荐',
    '旅行票务' => '旅行',
    '学习课程' => '学习',
    '反馈调研' => '反馈',
    _ => '',
  };
}

bool _containsAny(String text, List<String> needles) {
  for (final needle in needles) {
    if (text.contains(needle)) {
      return true;
    }
  }
  return false;
}

String _stableEntityKey(String value) {
  final normalized = value.trim().toLowerCase();
  if (normalized.isEmpty) {
    return '';
  }
  return normalized
      .replaceAll(RegExp(r'[^a-z0-9\u4e00-\u9fff]+'), '-')
      .replaceAll(RegExp(r'-+'), '-')
      .replaceAll(RegExp(r'^-|-$'), '');
}

String _cleanEntityLabel(String label) {
  return label
      .replaceAll(RegExp(r'["“”‘’<>]'), '')
      .replaceAll(RegExp(r'\s+'), ' ')
      .trim();
}

String _entityLabelFromDomain(String domain) {
  final normalized = domain.toLowerCase();
  if (normalized.isEmpty) {
    return '';
  }
  final parts = normalized.split('.');
  if (parts.length < 2) {
    return '';
  }
  final registrable =
      parts.length >= 3 &&
          const {'co', 'com', 'net', 'org'}.contains(parts[parts.length - 2])
      ? parts[parts.length - 3]
      : parts[parts.length - 2];
  if (!_isEntityTermCandidate(registrable)) {
    return '';
  }
  return _titleCaseEntity(registrable);
}

String _entityLabelFromSender(String label) {
  final cleaned = _cleanEntityLabel(label)
      .replaceAll(
        RegExp(
          r'\b(newsletter|news|support|team|official|store|mail|mailer|no[- ]?reply|customer service)\b',
          caseSensitive: false,
        ),
        ' ',
      )
      .replaceAll(RegExp(r'\s+'), ' ')
      .trim();
  if (cleaned.length < 2 || cleaned.length > 34) {
    return '';
  }
  final key = _stableEntityKey(cleaned);
  if (key.isEmpty || _genericEntityTerms.contains(key)) {
    return '';
  }
  return cleaned;
}

bool _isEntityTermCandidate(String term) {
  final normalized = _stableEntityKey(term);
  if (normalized.isEmpty || _genericEntityTerms.contains(normalized)) {
    return false;
  }
  if (RegExp(r'^\d+$').hasMatch(normalized)) {
    return false;
  }
  if (RegExp(r'^[a-z0-9-]+$').hasMatch(normalized)) {
    return normalized.length >= 4;
  }
  return normalized.length >= 2;
}

String _titleCaseEntity(String value) {
  final cleaned = value.replaceAll('-', ' ').trim();
  if (cleaned.isEmpty) {
    return '';
  }
  if (!RegExp(r'^[a-z0-9 ]+$').hasMatch(cleaned)) {
    return cleaned;
  }
  return cleaned
      .split(RegExp(r'\s+'))
      .where((part) => part.isNotEmpty)
      .map(
        (part) => part.length <= 2
            ? part.toUpperCase()
            : '${part.substring(0, 1).toUpperCase()}${part.substring(1)}',
      )
      .join(' ');
}

String _affairKey(
  String label,
  Iterable<String> terms,
  Iterable<String> people,
  String month,
  String taxonomyPath,
) {
  final termPart =
      terms.where((term) => term.trim().isNotEmpty).toSet().toList()..sort();
  final peoplePart =
      people.where((person) => person.trim().isNotEmpty).toSet().toList()
        ..sort();
  final selectedTerms = termPart.take(3).join('-');
  final selectedPeople = peoplePart.take(2).join('-');
  final taxonomy = taxonomyPath.trim().isEmpty ? '未分类' : taxonomyPath.trim();
  if (selectedTerms.isNotEmpty && selectedPeople.isNotEmpty) {
    return 'taxonomy:$taxonomy|terms:$selectedTerms|people:$selectedPeople';
  }
  if (selectedTerms.isNotEmpty && month.isNotEmpty) {
    return 'taxonomy:$taxonomy|terms:$selectedTerms|month:$month';
  }
  if (peoplePart.length >= 2 && month.isNotEmpty) {
    return 'taxonomy:$taxonomy|people:$selectedPeople|month:$month';
  }
  if (selectedTerms.isNotEmpty) {
    return 'taxonomy:$taxonomy|terms:$selectedTerms';
  }
  return 'taxonomy:$taxonomy|label:${_threadKey(label)}';
}

String _eventMonth(String value) {
  final year = RegExp(r'\b(19\d{2}|20\d{2})\b').firstMatch(value)?.group(1);
  final month = _monthNumber(value);
  if (year != null && month.isNotEmpty) {
    return '$year-$month';
  }
  if (value.length >= 7 && RegExp(r'^\d{4}-\d{2}').hasMatch(value)) {
    return value.substring(0, 7);
  }
  return '';
}

double _weight(int count) => (1 + math.log(math.max(1, count)) / 2).clamp(1, 3);

String _firstString(Map<String, dynamic> item, List<String> keys) {
  for (final key in keys) {
    final direct = item[key];
    if (direct != null && direct.toString().trim().isNotEmpty) {
      return direct.toString().trim();
    }
    final snake = _toSnakeCase(key);
    if (snake != key) {
      final value = item[snake];
      if (value != null && value.toString().trim().isNotEmpty) {
        return value.toString().trim();
      }
    }
  }
  return '';
}

Map<String, String> _stringMetadata(
  Map<String, dynamic> item,
  List<String> keys,
) {
  final metadata = <String, String>{};
  for (final key in keys) {
    final value = item[key] ?? item[_toSnakeCase(key)];
    if (value == null) {
      continue;
    }
    final text = value.toString().trim();
    if (text.isNotEmpty) {
      metadata[displayDataKey(key)] = text.length > 72
          ? '${text.substring(0, 72)}...'
          : text;
    }
  }
  return metadata;
}

String _stableKey(String value) {
  final normalized = value.trim().toLowerCase();
  if (normalized.isEmpty) {
    return 'unknown';
  }
  final safe = normalized
      .replaceAll(RegExp(r'[^a-z0-9@\.\-_\u4e00-\u9fff]+'), '-')
      .replaceAll(RegExp(r'-+'), '-')
      .replaceAll(RegExp(r'^-|-$'), '');
  if (safe.isNotEmpty) {
    return safe.length <= 80 ? safe : safe.substring(0, 80);
  }
  return normalized.codeUnits
      .fold<int>(0, (sum, unit) => (sum + unit) & 0xFFFF)
      .toRadixString(16);
}

String _normalizeLookup(String value) {
  return value.trim().toLowerCase().replaceAll(RegExp(r'\s+'), ' ');
}

String _toSnakeCase(String value) {
  return value.replaceAllMapped(
    RegExp(r'[A-Z]'),
    (match) => '_${match.group(0)!.toLowerCase()}',
  );
}
