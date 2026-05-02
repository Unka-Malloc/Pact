class KnowledgeGraphNode {
  const KnowledgeGraphNode({
    required this.id,
    required this.label,
    required this.kind,
    required this.moduleId,
    this.weight = 1,
    this.metadata = const {},
  });

  final String id;
  final String label;
  final String kind;
  final String moduleId;
  final double weight;
  final Map<String, String> metadata;

  KnowledgeGraphNode merge(KnowledgeGraphNode other) {
    return KnowledgeGraphNode(
      id: id,
      label: label.isNotEmpty ? label : other.label,
      kind: kind.isNotEmpty ? kind : other.kind,
      moduleId: moduleId.isNotEmpty ? moduleId : other.moduleId,
      weight: weight >= other.weight ? weight : other.weight,
      metadata: {...metadata, ...other.metadata},
    );
  }
}

class KnowledgeGraphEdge {
  const KnowledgeGraphEdge({
    required this.id,
    required this.sourceId,
    required this.targetId,
    required this.label,
    required this.moduleId,
    this.weight = 1,
  });

  final String id;
  final String sourceId;
  final String targetId;
  final String label;
  final String moduleId;
  final double weight;
}

class KnowledgeGraphDataSourceStatus {
  const KnowledgeGraphDataSourceStatus({
    required this.sourceId,
    required this.label,
    required this.enabled,
    required this.nodeCount,
    required this.edgeCount,
    required this.version,
  });

  final String sourceId;
  final String label;
  final bool enabled;
  final int nodeCount;
  final int edgeCount;
  final String version;
}

class KnowledgeGraphSnapshot {
  const KnowledgeGraphSnapshot({
    required this.nodes,
    required this.edges,
    required this.dataSources,
    required this.updatedAt,
  });

  final List<KnowledgeGraphNode> nodes;
  final List<KnowledgeGraphEdge> edges;
  final List<KnowledgeGraphDataSourceStatus> dataSources;
  final DateTime updatedAt;

  static KnowledgeGraphSnapshot empty() {
    return KnowledgeGraphSnapshot(
      nodes: const [],
      edges: const [],
      dataSources: const [],
      updatedAt: DateTime.fromMillisecondsSinceEpoch(0),
    );
  }

  int get enabledDataSourceCount =>
      dataSources.where((source) => source.enabled).length;
}

class KnowledgeGraphContribution {
  const KnowledgeGraphContribution({
    required this.nodes,
    required this.edges,
    this.version = '1',
  });

  final List<KnowledgeGraphNode> nodes;
  final List<KnowledgeGraphEdge> edges;
  final String version;
}

class MailKnowledgeDocument {
  const MailKnowledgeDocument({
    required this.docId,
    required this.messageKey,
    required this.fileName,
    required this.subject,
    required this.sender,
    required this.recipients,
    required this.cc,
    required this.dateSent,
    required this.dateReceived,
    required this.account,
    required this.mailboxPath,
    required this.status,
    required this.lastSeenAt,
    required this.error,
    required this.sourceHash,
    required this.byteSize,
    this.taxonomyPath = '',
  });

  final int docId;
  final String messageKey;
  final String fileName;
  final String subject;
  final String sender;
  final String recipients;
  final String cc;
  final String dateSent;
  final String dateReceived;
  final String account;
  final String mailboxPath;
  final String status;
  final String lastSeenAt;
  final String error;
  final String sourceHash;
  final int byteSize;
  final String taxonomyPath;

  factory MailKnowledgeDocument.fromTsvLine(String line) {
    final parts = line.split('\t');
    return MailKnowledgeDocument(
      docId: parts.isNotEmpty ? int.tryParse(parts[0]) ?? 0 : 0,
      messageKey: _tsvPart(parts, 1),
      fileName: _tsvPart(parts, 2),
      subject: _tsvPart(parts, 3),
      sender: _tsvPart(parts, 4),
      recipients: _tsvPart(parts, 5),
      cc: _tsvPart(parts, 6),
      dateSent: _tsvPart(parts, 7),
      dateReceived: _tsvPart(parts, 8),
      account: _tsvPart(parts, 9),
      mailboxPath: _tsvPart(parts, 10),
      status: _tsvPart(parts, 11),
      lastSeenAt: _tsvPart(parts, 12),
      error: _tsvPart(parts, 13),
      sourceHash: _tsvPart(parts, 14),
      byteSize: int.tryParse(_tsvPart(parts, 15)) ?? 0,
      taxonomyPath: _tsvPart(parts, 16),
    );
  }

  bool get isValid => docId > 0 && messageKey.trim().isNotEmpty;
}

class MailKnowledgeSemanticSuggestion {
  const MailKnowledgeSemanticSuggestion({
    required this.messageKey,
    this.docId = 0,
    this.taxonomyPath = '',
    this.keywords = const [],
    this.entity = '',
    this.intent = '',
    this.confidence = 0,
    this.provider = '',
    this.updatedAt = '',
  });

  final String messageKey;
  final int docId;
  final String taxonomyPath;
  final List<String> keywords;
  final String entity;
  final String intent;
  final double confidence;
  final String provider;
  final String updatedAt;

  bool get isUseful =>
      messageKey.trim().isNotEmpty &&
      (taxonomyPath.trim().isNotEmpty ||
          keywords.isNotEmpty ||
          entity.trim().isNotEmpty ||
          intent.trim().isNotEmpty);

  bool get isCloudEnhanced {
    final normalized = provider.trim().toLowerCase();
    return normalized.isNotEmpty && !normalized.startsWith('local');
  }

  factory MailKnowledgeSemanticSuggestion.fromJson(Map<dynamic, dynamic> json) {
    final rawKeywords = json['keywords'];
    return MailKnowledgeSemanticSuggestion(
      messageKey: (json['messageKey'] ?? json['id'] ?? '').toString(),
      docId: (json['docId'] as num?)?.toInt() ?? 0,
      taxonomyPath: (json['taxonomyPath'] ?? '').toString(),
      keywords: rawKeywords is List
          ? rawKeywords
                .map((item) => item.toString().trim())
                .where((item) => item.isNotEmpty)
                .take(12)
                .toList(growable: false)
          : const [],
      entity: (json['entity'] ?? '').toString(),
      intent: (json['intent'] ?? '').toString(),
      confidence: (json['confidence'] as num?)?.toDouble() ?? 0,
      provider: (json['provider'] ?? '').toString(),
      updatedAt: (json['updatedAt'] ?? '').toString(),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'messageKey': messageKey,
      'docId': docId,
      'taxonomyPath': taxonomyPath,
      'keywords': keywords,
      'entity': entity,
      'intent': intent,
      'confidence': confidence,
      'provider': provider,
      'updatedAt': updatedAt,
    };
  }
}

class KnowledgeTimeline {
  const KnowledgeTimeline({
    required this.nodeId,
    required this.title,
    required this.events,
    required this.evidenceCount,
    this.startAt,
    this.endAt,
  });

  final String nodeId;
  final String title;
  final List<KnowledgeTimelineEvent> events;
  final int evidenceCount;
  final DateTime? startAt;
  final DateTime? endAt;

  bool get isEmpty => events.isEmpty;

  static const empty = KnowledgeTimeline(
    nodeId: '',
    title: '',
    events: [],
    evidenceCount: 0,
  );
}

class KnowledgeTimelineEvent {
  const KnowledgeTimelineEvent({
    required this.stage,
    required this.title,
    required this.summary,
    required this.timestamp,
    required this.evidence,
    required this.evidenceCount,
    required this.participants,
    required this.score,
  });

  final String stage;
  final String title;
  final String summary;
  final DateTime timestamp;
  final List<MailKnowledgeDocument> evidence;
  final int evidenceCount;
  final List<String> participants;
  final int score;

  MailKnowledgeDocument? get primaryEvidence =>
      evidence.isEmpty ? null : evidence.first;
}

String _tsvPart(List<String> parts, int index) {
  return index < parts.length ? parts[index].trim() : '';
}
