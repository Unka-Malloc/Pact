import 'package:uuid/uuid.dart';

class CheckpointFileRecord {
  CheckpointFileRecord({
    required this.label,
    required this.relativePath,
    required this.sha256,
    required this.byteSize,
  });

  final String label;
  final String relativePath;
  final String sha256;
  final int byteSize;

  factory CheckpointFileRecord.fromJson(Map<String, dynamic> json) {
    return CheckpointFileRecord(
      label: (json['label'] ?? '').toString(),
      relativePath: (json['relativePath'] ?? '').toString(),
      sha256: (json['sha256'] ?? '').toString(),
      byteSize: (json['byteSize'] as num?)?.toInt() ?? 0,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'label': label,
      'relativePath': relativePath,
      'sha256': sha256,
      'byteSize': byteSize,
    };
  }
}

class CheckpointLocalFile {
  CheckpointLocalFile({
    required this.path,
    required this.label,
    required this.relativePath,
    required this.sha256,
    required this.byteSize,
    required this.mediaType,
  });

  final String path;
  final String label;
  final String relativePath;
  final String sha256;
  final int byteSize;
  final String mediaType;

  factory CheckpointLocalFile.fromJson(Map<String, dynamic> json) {
    return CheckpointLocalFile(
      path: (json['path'] ?? '').toString(),
      label: (json['label'] ?? '').toString(),
      relativePath: (json['relativePath'] ?? '').toString(),
      sha256: (json['sha256'] ?? '').toString(),
      byteSize: (json['byteSize'] as num?)?.toInt() ?? 0,
      mediaType: (json['mediaType'] ?? 'application/octet-stream').toString(),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'path': path,
      'label': label,
      'relativePath': relativePath,
      'sha256': sha256,
      'byteSize': byteSize,
      'mediaType': mediaType,
    };
  }
}

class CheckpointManifest {
  CheckpointManifest({
    required this.inputDigest,
    required this.manifestDigest,
    required this.fileCount,
    required this.fileRecords,
    required this.summary,
  });

  final String inputDigest;
  final String manifestDigest;
  final int fileCount;
  final List<CheckpointFileRecord> fileRecords;
  final String summary;

  factory CheckpointManifest.fromJson(Map<String, dynamic> json) {
    final fileRecords = ((json['fileRecords'] ?? const []) as List)
        .whereType<Map>()
        .map(
          (item) =>
              CheckpointFileRecord.fromJson(Map<String, dynamic>.from(item)),
        )
        .toList();
    return CheckpointManifest(
      inputDigest: (json['inputDigest'] ?? '').toString(),
      manifestDigest: (json['manifestDigest'] ?? '').toString(),
      fileCount: (json['fileCount'] as num?)?.toInt() ?? fileRecords.length,
      fileRecords: fileRecords,
      summary: (json['summary'] ?? '').toString(),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'inputDigest': inputDigest,
      'manifestDigest': manifestDigest,
      'fileCount': fileCount,
      'fileRecords': fileRecords.map((item) => item.toJson()).toList(),
      'summary': summary,
    };
  }
}

enum CheckpointState {
  filesConfirmed('files-confirmed'),
  uploadVerified('upload-verified'),
  serverProcessing('server-processing'),
  networkInterrupted('network-interrupted'),
  manualStopped('manual-stopped'),
  serverCompleted('server-completed'),
  clientConfirmed('client-confirmed'),
  failed('failed'),
  abandoned('abandoned');

  const CheckpointState(this.apiValue);

  final String apiValue;

  static CheckpointState fromApiValue(String value) {
    return CheckpointState.values.firstWhere(
      (item) => item.apiValue == value,
      orElse: () => CheckpointState.filesConfirmed,
    );
  }
}

enum CheckpointMode {
  initial('initial'),
  resume('resume'),
  append('append'),
  branch('branch');

  const CheckpointMode(this.apiValue);

  final String apiValue;

  static CheckpointMode fromApiValue(String value) {
    return CheckpointMode.values.firstWhere(
      (item) => item.apiValue == value,
      orElse: () => CheckpointMode.initial,
    );
  }
}

class CleanupPrompt {
  CleanupPrompt({
    required this.completedCheckpointId,
    required this.obsoleteCheckpointId,
    required this.obsoleteJobId,
    required this.obsoleteServiceUrl,
    required this.message,
  });

  final String completedCheckpointId;
  final String obsoleteCheckpointId;
  final String obsoleteJobId;
  final String obsoleteServiceUrl;
  final String message;

  factory CleanupPrompt.fromJson(Map<String, dynamic> json) {
    return CleanupPrompt(
      completedCheckpointId: (json['completedCheckpointId'] ?? '').toString(),
      obsoleteCheckpointId: (json['obsoleteCheckpointId'] ?? '').toString(),
      obsoleteJobId: (json['obsoleteJobId'] ?? '').toString(),
      obsoleteServiceUrl: (json['obsoleteServiceUrl'] ?? '').toString(),
      message: (json['message'] ?? '').toString(),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'completedCheckpointId': completedCheckpointId,
      'obsoleteCheckpointId': obsoleteCheckpointId,
      'obsoleteJobId': obsoleteJobId,
      'obsoleteServiceUrl': obsoleteServiceUrl,
      'message': message,
    };
  }
}

class CheckpointNode {
  CheckpointNode({
    required this.checkpointId,
    this.parentCheckpointId = '',
    this.treeRootId = '',
    this.branchRootId = '',
    this.mode = CheckpointMode.initial,
    this.state = CheckpointState.filesConfirmed,
    this.createdAt = '',
    this.updatedAt = '',
    this.inputDigest = '',
    this.inputText = '',
    this.manifestDigest = '',
    this.summary = '',
    this.fileCount = 0,
    this.fileRecords = const [],
    this.localFiles = const [],
    this.localVerifiedAt = '',
    this.uploadVerifiedAt = '',
    this.uploadSessionId = '',
    this.uploadSessionServiceUrl = '',
    this.serverProcessingAt = '',
    this.serverCompletedAt = '',
    this.clientConfirmedAt = '',
    this.networkInterruptedAt = '',
    this.manualStoppedAt = '',
    this.abandonedAt = '',
    this.serverJobId = '',
    this.serverServiceUrl = '',
    this.serverVerifiedManifestDigest = '',
    this.serverVerifiedFileCount = 0,
    this.lastError = '',
    this.supersedesCheckpointId = '',
    this.supersedesJobId = '',
    this.supersedesServiceUrl = '',
    this.resumeCount = 0,
  });

  String checkpointId;
  String parentCheckpointId;
  String treeRootId;
  String branchRootId;
  CheckpointMode mode;
  CheckpointState state;
  String createdAt;
  String updatedAt;
  String inputDigest;
  String inputText;
  String manifestDigest;
  String summary;
  int fileCount;
  List<CheckpointFileRecord> fileRecords;
  List<CheckpointLocalFile> localFiles;
  String localVerifiedAt;
  String uploadVerifiedAt;
  String uploadSessionId;
  String uploadSessionServiceUrl;
  String serverProcessingAt;
  String serverCompletedAt;
  String clientConfirmedAt;
  String networkInterruptedAt;
  String manualStoppedAt;
  String abandonedAt;
  String serverJobId;
  String serverServiceUrl;
  String serverVerifiedManifestDigest;
  int serverVerifiedFileCount;
  String lastError;
  String supersedesCheckpointId;
  String supersedesJobId;
  String supersedesServiceUrl;
  int resumeCount;

  factory CheckpointNode.fromJson(Map<String, dynamic> json) {
    return CheckpointNode(
      checkpointId: (json['checkpointId'] ?? '').toString(),
      parentCheckpointId: (json['parentCheckpointId'] ?? '').toString(),
      treeRootId: (json['treeRootId'] ?? '').toString(),
      branchRootId: (json['branchRootId'] ?? '').toString(),
      mode: CheckpointMode.fromApiValue((json['mode'] ?? '').toString()),
      state: CheckpointState.fromApiValue((json['state'] ?? '').toString()),
      createdAt: (json['createdAt'] ?? '').toString(),
      updatedAt: (json['updatedAt'] ?? '').toString(),
      inputDigest: (json['inputDigest'] ?? '').toString(),
      inputText: (json['inputText'] ?? '').toString(),
      manifestDigest: (json['manifestDigest'] ?? '').toString(),
      summary: (json['summary'] ?? '').toString(),
      fileCount: (json['fileCount'] as num?)?.toInt() ?? 0,
      fileRecords: ((json['fileRecords'] ?? const []) as List)
          .whereType<Map>()
          .map(
            (item) =>
                CheckpointFileRecord.fromJson(Map<String, dynamic>.from(item)),
          )
          .toList(),
      localFiles: ((json['localFiles'] ?? const []) as List)
          .whereType<Map>()
          .map(
            (item) =>
                CheckpointLocalFile.fromJson(Map<String, dynamic>.from(item)),
          )
          .toList(),
      localVerifiedAt: (json['localVerifiedAt'] ?? '').toString(),
      uploadVerifiedAt: (json['uploadVerifiedAt'] ?? '').toString(),
      uploadSessionId: (json['uploadSessionId'] ?? '').toString(),
      uploadSessionServiceUrl: (json['uploadSessionServiceUrl'] ?? '')
          .toString(),
      serverProcessingAt: (json['serverProcessingAt'] ?? '').toString(),
      serverCompletedAt: (json['serverCompletedAt'] ?? '').toString(),
      clientConfirmedAt: (json['clientConfirmedAt'] ?? '').toString(),
      networkInterruptedAt: (json['networkInterruptedAt'] ?? '').toString(),
      manualStoppedAt: (json['manualStoppedAt'] ?? '').toString(),
      abandonedAt: (json['abandonedAt'] ?? '').toString(),
      serverJobId: (json['serverJobId'] ?? '').toString(),
      serverServiceUrl: (json['serverServiceUrl'] ?? '').toString(),
      serverVerifiedManifestDigest: (json['serverVerifiedManifestDigest'] ?? '')
          .toString(),
      serverVerifiedFileCount:
          (json['serverVerifiedFileCount'] as num?)?.toInt() ?? 0,
      lastError: (json['lastError'] ?? '').toString(),
      supersedesCheckpointId: (json['supersedesCheckpointId'] ?? '').toString(),
      supersedesJobId: (json['supersedesJobId'] ?? '').toString(),
      supersedesServiceUrl: (json['supersedesServiceUrl'] ?? '').toString(),
      resumeCount: (json['resumeCount'] as num?)?.toInt() ?? 0,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'checkpointId': checkpointId,
      'parentCheckpointId': parentCheckpointId,
      'treeRootId': treeRootId,
      'branchRootId': branchRootId,
      'mode': mode.apiValue,
      'state': state.apiValue,
      'createdAt': createdAt,
      'updatedAt': updatedAt,
      'inputDigest': inputDigest,
      'inputText': inputText,
      'manifestDigest': manifestDigest,
      'summary': summary,
      'fileCount': fileCount,
      'fileRecords': fileRecords.map((item) => item.toJson()).toList(),
      'localFiles': localFiles.map((item) => item.toJson()).toList(),
      'localVerifiedAt': localVerifiedAt,
      'uploadVerifiedAt': uploadVerifiedAt,
      'uploadSessionId': uploadSessionId,
      'uploadSessionServiceUrl': uploadSessionServiceUrl,
      'serverProcessingAt': serverProcessingAt,
      'serverCompletedAt': serverCompletedAt,
      'clientConfirmedAt': clientConfirmedAt,
      'networkInterruptedAt': networkInterruptedAt,
      'manualStoppedAt': manualStoppedAt,
      'abandonedAt': abandonedAt,
      'serverJobId': serverJobId,
      'serverServiceUrl': serverServiceUrl,
      'serverVerifiedManifestDigest': serverVerifiedManifestDigest,
      'serverVerifiedFileCount': serverVerifiedFileCount,
      'lastError': lastError,
      'supersedesCheckpointId': supersedesCheckpointId,
      'supersedesJobId': supersedesJobId,
      'supersedesServiceUrl': supersedesServiceUrl,
      'resumeCount': resumeCount,
    };
  }
}

class CheckpointStore {
  CheckpointStore({
    this.schemaVersion = 1,
    this.activeCheckpointId = '',
    this.networkResumeCheckpointId = '',
    this.manualBranchAnchorId = '',
    this.pendingCleanup,
    List<CheckpointNode>? nodes,
  }) : nodes = nodes ?? <CheckpointNode>[];

  int schemaVersion;
  String activeCheckpointId;
  String networkResumeCheckpointId;
  String manualBranchAnchorId;
  CleanupPrompt? pendingCleanup;
  List<CheckpointNode> nodes;

  factory CheckpointStore.fromJson(Map<String, dynamic> json) {
    return CheckpointStore(
      schemaVersion: (json['schemaVersion'] as num?)?.toInt() ?? 1,
      activeCheckpointId: (json['activeCheckpointId'] ?? '').toString(),
      networkResumeCheckpointId: (json['networkResumeCheckpointId'] ?? '')
          .toString(),
      manualBranchAnchorId: (json['manualBranchAnchorId'] ?? '').toString(),
      pendingCleanup: json['pendingCleanup'] is Map
          ? CleanupPrompt.fromJson(
              Map<String, dynamic>.from(json['pendingCleanup'] as Map),
            )
          : null,
      nodes: ((json['nodes'] ?? const []) as List)
          .whereType<Map>()
          .map(
            (item) => CheckpointNode.fromJson(Map<String, dynamic>.from(item)),
          )
          .toList(),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'schemaVersion': schemaVersion,
      'activeCheckpointId': activeCheckpointId,
      'networkResumeCheckpointId': networkResumeCheckpointId,
      'manualBranchAnchorId': manualBranchAnchorId,
      'pendingCleanup': pendingCleanup?.toJson(),
      'nodes': nodes.map((item) => item.toJson()).toList(),
    };
  }

  CheckpointNode? findNode(String checkpointId) {
    for (final node in nodes) {
      if (node.checkpointId == checkpointId) {
        return node;
      }
    }
    return null;
  }

  CheckpointNode? findNodeByUploadSessionId(String uploadSessionId) {
    for (final node in nodes) {
      if (node.uploadSessionId == uploadSessionId) {
        return node;
      }
    }
    return null;
  }

  String beginSubmission(
    CheckpointManifest manifest, {
    String? forcedCheckpointId,
  }) {
    final candidateId =
        forcedCheckpointId ?? _findNetworkResumeCandidate(manifest);
    if (candidateId != null && candidateId.isNotEmpty) {
      final node = findNode(candidateId);
      if (node != null) {
        node.mode = CheckpointMode.resume;
        node.state = node.serverJobId.isEmpty
            ? CheckpointState.filesConfirmed
            : CheckpointState.serverProcessing;
        node.updatedAt = nowIsoString();
        node.lastError = '';
        node.resumeCount += 1;
        activeCheckpointId = node.checkpointId;
        return node.checkpointId;
      }
    }

    final parentCheckpointId = manualBranchAnchorId.isNotEmpty
        ? manualBranchAnchorId
        : activeCheckpointId;
    final parent = findNode(parentCheckpointId);
    final checkpointId = forcedCheckpointId?.trim().isNotEmpty == true
        ? forcedCheckpointId!.trim()
        : const Uuid().v4();
    final now = nowIsoString();
    final treeRootId = parent?.treeRootId.isNotEmpty == true
        ? parent!.treeRootId
        : checkpointId;
    final branchRootId = manualBranchAnchorId.isNotEmpty
        ? checkpointId
        : (parent?.branchRootId.isNotEmpty == true
              ? parent!.branchRootId
              : checkpointId);
    final mode = manualBranchAnchorId.isNotEmpty
        ? CheckpointMode.branch
        : (networkResumeCheckpointId.isNotEmpty || parent != null)
        ? CheckpointMode.append
        : CheckpointMode.initial;
    final supersedesCheckpointId = manualBranchAnchorId.isNotEmpty
        ? manualBranchAnchorId
        : '';

    nodes.add(
      CheckpointNode(
        checkpointId: checkpointId,
        parentCheckpointId: parentCheckpointId,
        treeRootId: treeRootId,
        branchRootId: branchRootId,
        mode: mode,
        state: CheckpointState.filesConfirmed,
        createdAt: now,
        updatedAt: now,
        inputDigest: manifest.inputDigest,
        manifestDigest: manifest.manifestDigest,
        summary: manifest.summary,
        fileCount: manifest.fileCount,
        fileRecords: manifest.fileRecords,
        localVerifiedAt: now,
        supersedesCheckpointId: supersedesCheckpointId,
        supersedesJobId: manualBranchAnchorId.isNotEmpty
            ? (parent?.serverJobId ?? '')
            : '',
        supersedesServiceUrl: manualBranchAnchorId.isNotEmpty
            ? (parent?.serverServiceUrl ?? '')
            : '',
      ),
    );

    activeCheckpointId = checkpointId;
    networkResumeCheckpointId = '';
    manualBranchAnchorId = '';
    return checkpointId;
  }

  void bindLocalPayload(
    String checkpointId,
    String inputText,
    List<CheckpointLocalFile> localFiles,
  ) {
    final node = findNode(checkpointId);
    if (node == null) {
      return;
    }

    node.updatedAt = nowIsoString();
    node.inputText = inputText;
    node.localFiles = localFiles;
  }

  void bindUploadSession(
    String checkpointId,
    String uploadSessionId,
    String uploadSessionServiceUrl,
  ) {
    final node = findNode(checkpointId);
    if (node == null) {
      return;
    }

    node.updatedAt = nowIsoString();
    node.uploadSessionId = uploadSessionId;
    node.uploadSessionServiceUrl = uploadSessionServiceUrl;
    node.lastError = '';
  }

  void markUploadVerified(
    String checkpointId,
    String serverJobId,
    String serverServiceUrl,
    String serverManifestDigest,
    int serverFileCount,
  ) {
    final node = findNode(checkpointId);
    if (node == null) {
      return;
    }

    final now = nowIsoString();
    node.state = CheckpointState.uploadVerified;
    node.updatedAt = now;
    node.uploadVerifiedAt = now;
    node.serverProcessingAt = now;
    node.serverJobId = serverJobId;
    node.serverServiceUrl = serverServiceUrl;
    node.serverVerifiedManifestDigest = serverManifestDigest;
    node.serverVerifiedFileCount = serverFileCount;
    node.lastError = '';
    activeCheckpointId = checkpointId;
    networkResumeCheckpointId = '';
  }

  void markServerProcessing(String checkpointId) {
    final node = findNode(checkpointId);
    if (node == null) {
      return;
    }

    final now = nowIsoString();
    node.state = CheckpointState.serverProcessing;
    node.updatedAt = now;
    if (node.serverProcessingAt.isEmpty) {
      node.serverProcessingAt = now;
    }
    node.lastError = '';
    activeCheckpointId = checkpointId;
    networkResumeCheckpointId = '';
  }

  void markNetworkInterrupted(String checkpointId, String error) {
    final node = findNode(checkpointId);
    if (node == null) {
      return;
    }

    final now = nowIsoString();
    node.state = CheckpointState.networkInterrupted;
    node.updatedAt = now;
    node.networkInterruptedAt = now;
    node.lastError = error;
    networkResumeCheckpointId = checkpointId;
    activeCheckpointId = checkpointId;
  }

  void markManualStopped(String checkpointId) {
    final node = findNode(checkpointId);
    if (node == null) {
      return;
    }

    final now = nowIsoString();
    node.state = CheckpointState.manualStopped;
    node.updatedAt = now;
    node.manualStoppedAt = now;
    node.lastError = '用户手动停止了当前链路。';
    manualBranchAnchorId = checkpointId;
    networkResumeCheckpointId = '';
    activeCheckpointId = checkpointId;
  }

  void markServerCompleted(String checkpointId) {
    final node = findNode(checkpointId);
    if (node == null) {
      return;
    }

    final now = nowIsoString();
    node.state = CheckpointState.serverCompleted;
    node.updatedAt = now;
    node.serverCompletedAt = now;
    node.lastError = '';
    activeCheckpointId = checkpointId;
    networkResumeCheckpointId = '';
  }

  void markClientConfirmed(String checkpointId) {
    final node = findNode(checkpointId);
    if (node == null) {
      return;
    }

    final now = nowIsoString();
    node.state = CheckpointState.clientConfirmed;
    node.updatedAt = now;
    node.clientConfirmedAt = now;
    node.lastError = '';

    if (node.supersedesCheckpointId.isNotEmpty) {
      pendingCleanup = CleanupPrompt(
        completedCheckpointId: node.checkpointId,
        obsoleteCheckpointId: node.supersedesCheckpointId,
        obsoleteJobId: node.supersedesJobId,
        obsoleteServiceUrl: node.supersedesServiceUrl,
        message:
            '新链路 ${shortId(node.checkpointId)} 已完成，是否移除旧链路 ${shortId(node.supersedesCheckpointId)}？',
      );
    } else {
      pendingCleanup = null;
    }

    activeCheckpointId = checkpointId;
    networkResumeCheckpointId = '';
    manualBranchAnchorId = '';
  }

  void markFailed(String checkpointId, String error) {
    final node = findNode(checkpointId);
    if (node == null) {
      return;
    }

    node.state = CheckpointState.failed;
    node.updatedAt = nowIsoString();
    node.lastError = error;
  }

  void markAbandoned(String checkpointId) {
    final node = findNode(checkpointId);
    if (node == null) {
      return;
    }

    final now = nowIsoString();
    node.state = CheckpointState.abandoned;
    node.updatedAt = now;
    node.abandonedAt = now;

    if (activeCheckpointId == checkpointId) {
      activeCheckpointId = '';
    }
    if (networkResumeCheckpointId == checkpointId) {
      networkResumeCheckpointId = '';
    }
    if (manualBranchAnchorId == checkpointId) {
      manualBranchAnchorId = '';
    }
  }

  void clearPendingCleanup() {
    pendingCleanup = null;
  }

  void armNetworkResume(String checkpointId) {
    if (checkpointId.isEmpty) {
      return;
    }
    networkResumeCheckpointId = checkpointId;
    activeCheckpointId = checkpointId;
  }

  String? autoResumeCandidateId() {
    final preferred = [networkResumeCheckpointId, activeCheckpointId];
    for (final checkpointId in preferred) {
      if (checkpointId.isEmpty) {
        continue;
      }
      final node = findNode(checkpointId);
      if (node != null && isResumableState(node.state)) {
        return node.checkpointId;
      }
    }

    final candidates = [...nodes]
      ..sort((left, right) {
        final updated = right.updatedAt.compareTo(left.updatedAt);
        if (updated != 0) {
          return updated;
        }
        final created = right.createdAt.compareTo(left.createdAt);
        if (created != 0) {
          return created;
        }
        return right.checkpointId.compareTo(left.checkpointId);
      });

    for (final node in candidates) {
      if (isResumableState(node.state)) {
        return node.checkpointId;
      }
    }
    return null;
  }

  String? _findNetworkResumeCandidate(CheckpointManifest manifest) {
    if (networkResumeCheckpointId.isEmpty) {
      return null;
    }
    final node = findNode(networkResumeCheckpointId);
    if (node == null) {
      return null;
    }
    if (node.manifestDigest == manifest.manifestDigest &&
        node.inputDigest == manifest.inputDigest) {
      return node.checkpointId;
    }
    return null;
  }
}

class UploadSessionFileInfo {
  UploadSessionFileInfo({
    required this.index,
    required this.name,
    required this.relativePath,
    required this.mediaType,
    required this.sha256,
    required this.byteSize,
    required this.receivedBytes,
    required this.completed,
    required this.completedAt,
  });

  final int index;
  final String name;
  final String relativePath;
  final String mediaType;
  final String sha256;
  final int byteSize;
  final int receivedBytes;
  final bool completed;
  final String completedAt;

  double get progress => byteSize <= 0 ? 1 : receivedBytes / byteSize;

  factory UploadSessionFileInfo.fromJson(Map<String, dynamic> json) {
    return UploadSessionFileInfo(
      index: (json['index'] as num?)?.toInt() ?? 0,
      name: (json['name'] ?? '').toString(),
      relativePath: (json['relativePath'] ?? '').toString(),
      mediaType: (json['mediaType'] ?? 'application/octet-stream').toString(),
      sha256: (json['sha256'] ?? '').toString(),
      byteSize: (json['byteSize'] as num?)?.toInt() ?? 0,
      receivedBytes: (json['receivedBytes'] as num?)?.toInt() ?? 0,
      completed: json['completed'] == true,
      completedAt: (json['completedAt'] ?? '').toString(),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'index': index,
      'name': name,
      'relativePath': relativePath,
      'mediaType': mediaType,
      'sha256': sha256,
      'byteSize': byteSize,
      'receivedBytes': receivedBytes,
      'completed': completed,
      'completedAt': completedAt,
    };
  }
}

class UploadSessionInfo {
  UploadSessionInfo({
    required this.sessionId,
    required this.checkpointId,
    required this.manifestDigest,
    required this.inputDigest,
    required this.status,
    required this.createdAt,
    required this.updatedAt,
    required this.files,
  });

  final String sessionId;
  final String checkpointId;
  final String manifestDigest;
  final String inputDigest;
  final String status;
  final String createdAt;
  final String updatedAt;
  final List<UploadSessionFileInfo> files;

  bool get isComplete => status == 'complete';

  int get totalBytes => files.fold<int>(0, (sum, file) => sum + file.byteSize);

  int get receivedBytes =>
      files.fold<int>(0, (sum, file) => sum + file.receivedBytes);

  double get progress => totalBytes <= 0 ? 1 : receivedBytes / totalBytes;

  factory UploadSessionInfo.fromJson(Map<String, dynamic> json) {
    return UploadSessionInfo(
      sessionId: (json['sessionId'] ?? '').toString(),
      checkpointId: (json['checkpointId'] ?? '').toString(),
      manifestDigest: (json['manifestDigest'] ?? '').toString(),
      inputDigest: (json['inputDigest'] ?? '').toString(),
      status: (json['status'] ?? '').toString(),
      createdAt: (json['createdAt'] ?? '').toString(),
      updatedAt: (json['updatedAt'] ?? '').toString(),
      files: ((json['files'] ?? const []) as List)
          .whereType<Map>()
          .map(
            (item) =>
                UploadSessionFileInfo.fromJson(Map<String, dynamic>.from(item)),
          )
          .toList(),
    );
  }
}

bool isResumableState(CheckpointState state) {
  return switch (state) {
    CheckpointState.filesConfirmed ||
    CheckpointState.uploadVerified ||
    CheckpointState.serverProcessing ||
    CheckpointState.networkInterrupted ||
    CheckpointState.serverCompleted => true,
    _ => false,
  };
}

String nowIsoString() => DateTime.now().toUtc().toIso8601String();

String shortId(String value) =>
    value.length <= 8 ? value : value.substring(0, 8);

String checkpointStateLabel(CheckpointState state) {
  return switch (state) {
    CheckpointState.filesConfirmed => '文件已校验',
    CheckpointState.uploadVerified => '上传已校验',
    CheckpointState.serverProcessing => '服务端处理中',
    CheckpointState.networkInterrupted => '网络中断',
    CheckpointState.manualStopped => '已手动停止',
    CheckpointState.serverCompleted => '服务端已完成',
    CheckpointState.clientConfirmed => '客户端已确认',
    CheckpointState.failed => '失败',
    CheckpointState.abandoned => '已废弃',
  };
}

String checkpointModeLabel(CheckpointMode mode) {
  return switch (mode) {
    CheckpointMode.initial => '初始提交',
    CheckpointMode.resume => '断点续传',
    CheckpointMode.append => '追加新链路',
    CheckpointMode.branch => '分支接续',
  };
}
