enum MacOSMailImportProgressKind {
  started,
  planned,
  processing,
  exported,
  skipped,
  failed,
  paused,
  resumed,
  completed,
  unknown;

  static MacOSMailImportProgressKind fromValue(String value) {
    return MacOSMailImportProgressKind.values.firstWhere(
      (item) => item.name == value,
      orElse: () => MacOSMailImportProgressKind.unknown,
    );
  }
}

class MacOSMailImportProgress {
  const MacOSMailImportProgress({
    required this.kind,
    required this.sequence,
    required this.exportedCount,
    required this.failedCount,
    required this.skippedCount,
    required this.totalCount,
    required this.title,
    required this.detail,
    required this.exportDirectory,
    required this.messageKey,
    required this.account,
    required this.mailboxPath,
    required this.sender,
    required this.recipients,
    required this.cc,
    required this.dateSent,
    required this.dateReceived,
    required this.fileName,
    required this.sourceHash,
    required this.byteSize,
    required this.error,
    required this.status,
  });

  final MacOSMailImportProgressKind kind;
  final int sequence;
  final int exportedCount;
  final int failedCount;
  final int skippedCount;
  final int totalCount;
  final String title;
  final String detail;
  final String exportDirectory;
  final String messageKey;
  final String account;
  final String mailboxPath;
  final String sender;
  final String recipients;
  final String cc;
  final String dateSent;
  final String dateReceived;
  final String fileName;
  final String sourceHash;
  final int byteSize;
  final String error;
  final String status;

  factory MacOSMailImportProgress.fromJson(Map<dynamic, dynamic> json) {
    return MacOSMailImportProgress(
      kind: MacOSMailImportProgressKind.fromValue(
        (json['kind'] ?? '').toString(),
      ),
      sequence: (json['sequence'] as num?)?.toInt() ?? 0,
      exportedCount: (json['exportedCount'] as num?)?.toInt() ?? 0,
      failedCount: (json['failedCount'] as num?)?.toInt() ?? 0,
      skippedCount: (json['skippedCount'] as num?)?.toInt() ?? 0,
      totalCount: (json['totalCount'] as num?)?.toInt() ?? 0,
      title: (json['title'] ?? '').toString(),
      detail: (json['detail'] ?? '').toString(),
      exportDirectory: (json['exportDirectory'] ?? '').toString(),
      messageKey: (json['messageKey'] ?? '').toString(),
      account: (json['account'] ?? '').toString(),
      mailboxPath: (json['mailboxPath'] ?? '').toString(),
      sender: (json['sender'] ?? '').toString(),
      recipients: (json['recipients'] ?? '').toString(),
      cc: (json['cc'] ?? '').toString(),
      dateSent: (json['dateSent'] ?? '').toString(),
      dateReceived: (json['dateReceived'] ?? '').toString(),
      fileName: (json['fileName'] ?? '').toString(),
      sourceHash: (json['sourceHash'] ?? '').toString(),
      byteSize: (json['byteSize'] as num?)?.toInt() ?? 0,
      error: (json['error'] ?? '').toString(),
      status: (json['status'] ?? '').toString(),
    );
  }
}

class MacOSMailExportResult {
  const MacOSMailExportResult({
    required this.exportDirectory,
    required this.exportedCount,
    required this.failedCount,
    required this.skippedCount,
    required this.fileCount,
    required this.scannedAccountCount,
    required this.scannedMailboxCount,
    required this.scannedMessageCount,
    required this.lastError,
  });

  final String exportDirectory;
  final int exportedCount;
  final int failedCount;
  final int skippedCount;
  final int fileCount;
  final int scannedAccountCount;
  final int scannedMailboxCount;
  final int scannedMessageCount;
  final String lastError;

  factory MacOSMailExportResult.fromJson(Map<dynamic, dynamic> json) {
    return MacOSMailExportResult(
      exportDirectory: (json['exportDirectory'] ?? '').toString(),
      exportedCount: (json['exportedCount'] as num?)?.toInt() ?? 0,
      failedCount: (json['failedCount'] as num?)?.toInt() ?? 0,
      skippedCount: (json['skippedCount'] as num?)?.toInt() ?? 0,
      fileCount: (json['fileCount'] as num?)?.toInt() ?? 0,
      scannedAccountCount: (json['scannedAccountCount'] as num?)?.toInt() ?? 0,
      scannedMailboxCount: (json['scannedMailboxCount'] as num?)?.toInt() ?? 0,
      scannedMessageCount: (json['scannedMessageCount'] as num?)?.toInt() ?? 0,
      lastError: (json['lastError'] ?? '').toString(),
    );
  }
}

class MacOSMailAuthorizationResult {
  const MacOSMailAuthorizationResult({
    required this.authorized,
    required this.accountCount,
  });

  final bool authorized;
  final int accountCount;

  factory MacOSMailAuthorizationResult.fromJson(Map<dynamic, dynamic> json) {
    return MacOSMailAuthorizationResult(
      authorized: json['authorized'] == true,
      accountCount: (json['accountCount'] as num?)?.toInt() ?? 0,
    );
  }
}

class MacOSMailIndexStats {
  const MacOSMailIndexStats({
    required this.documentCount,
    required this.segmentCount,
    required this.pendingCount,
    required this.lastUpdatedAt,
    required this.indexDirectory,
  });

  final int documentCount;
  final int segmentCount;
  final int pendingCount;
  final String lastUpdatedAt;
  final String indexDirectory;

  factory MacOSMailIndexStats.fromJson(Map<dynamic, dynamic> json) {
    return MacOSMailIndexStats(
      documentCount: (json['documentCount'] as num?)?.toInt() ?? 0,
      segmentCount: (json['segmentCount'] as num?)?.toInt() ?? 0,
      pendingCount: (json['pendingCount'] as num?)?.toInt() ?? 0,
      lastUpdatedAt: (json['lastUpdatedAt'] ?? '').toString(),
      indexDirectory: (json['indexDirectory'] ?? '').toString(),
    );
  }
}

class MacOSMailIndexSearchResult {
  const MacOSMailIndexSearchResult({
    required this.docId,
    required this.messageKey,
    required this.fileName,
    required this.path,
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
  });

  final int docId;
  final String messageKey;
  final String fileName;
  final String path;
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

  factory MacOSMailIndexSearchResult.fromJson(Map<dynamic, dynamic> json) {
    return MacOSMailIndexSearchResult(
      docId: (json['docId'] as num?)?.toInt() ?? 0,
      messageKey: (json['messageKey'] ?? '').toString(),
      fileName: (json['fileName'] ?? '').toString(),
      path: (json['path'] ?? '').toString(),
      subject: (json['subject'] ?? '').toString(),
      sender: (json['sender'] ?? '').toString(),
      recipients: (json['recipients'] ?? '').toString(),
      cc: (json['cc'] ?? '').toString(),
      dateSent: (json['dateSent'] ?? '').toString(),
      dateReceived: (json['dateReceived'] ?? '').toString(),
      account: (json['account'] ?? '').toString(),
      mailboxPath: (json['mailboxPath'] ?? '').toString(),
      status: (json['status'] ?? '').toString(),
      lastSeenAt: (json['lastSeenAt'] ?? '').toString(),
      error: (json['error'] ?? '').toString(),
    );
  }
}

class MacOSMailIndexSearchResponse {
  const MacOSMailIndexSearchResponse({
    required this.total,
    required this.results,
  });

  final int total;
  final List<MacOSMailIndexSearchResult> results;

  factory MacOSMailIndexSearchResponse.fromJson(Map<dynamic, dynamic> json) {
    final rawResults = json['results'];
    return MacOSMailIndexSearchResponse(
      total: (json['total'] as num?)?.toInt() ?? 0,
      results: rawResults is List
          ? rawResults
                .whereType<Map>()
                .map(MacOSMailIndexSearchResult.fromJson)
                .toList()
          : const [],
    );
  }
}
