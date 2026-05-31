import 'dart:async';

enum ModuleDaemonEventKind {
  registered,
  hotReloadRequested,
  taskCompleted,
  taskFailed,
  moduleEnabled,
  moduleDisabled,
  dataChanged,
}

class ModuleDaemonEvent {
  ModuleDaemonEvent({
    required this.kind,
    required this.moduleId,
    this.taskId = '',
    this.reason = '',
    this.error,
    DateTime? createdAt,
  }) : createdAt = createdAt ?? DateTime.now();

  final ModuleDaemonEventKind kind;
  final String moduleId;
  final String taskId;
  final String reason;
  final Object? error;
  final DateTime createdAt;
}

class ModuleDaemonTask {
  const ModuleDaemonTask({
    required this.id,
    required this.moduleId,
    required this.interval,
    required this.run,
    this.isEnabled,
    this.runOnStart = false,
  });

  final String id;
  final String moduleId;
  final Duration interval;
  final FutureOr<void> Function() run;
  final bool Function()? isEnabled;
  final bool runOnStart;
}

class ModuleDaemon {
  ModuleDaemon({
    required void Function(ModuleDaemonEvent event) onEvent,
    Duration tickInterval = const Duration(seconds: 5),
  }) : _onEvent = onEvent,
       _tickInterval = tickInterval;

  final void Function(ModuleDaemonEvent event) _onEvent;
  final Duration _tickInterval;
  final Map<String, _ModuleDaemonTaskState> _tasks = {};
  Timer? _timer;
  bool _running = false;

  void registerTask(ModuleDaemonTask task) {
    _tasks[task.id]?.pendingTimer?.cancel();
    _tasks[task.id] = _ModuleDaemonTaskState(task);
    _onEvent(
      ModuleDaemonEvent(
        kind: ModuleDaemonEventKind.registered,
        moduleId: task.moduleId,
        taskId: task.id,
      ),
    );
    if (_running && task.runOnStart) {
      requestTask(task.id);
    }
  }

  void start() {
    if (_running) {
      return;
    }
    _running = true;
    _timer = Timer.periodic(_tickInterval, (_) => _tick());
    for (final state in _tasks.values) {
      if (state.task.runOnStart) {
        requestTask(state.task.id);
      }
    }
  }

  void requestTask(String taskId, {Duration delay = Duration.zero}) {
    final state = _tasks[taskId];
    if (state == null || !_taskEnabled(state.task)) {
      return;
    }
    state.pendingTimer?.cancel();
    state.pendingTimer = Timer(delay, () {
      state.pendingTimer = null;
      unawaited(_runTask(state, reason: 'requested'));
    });
  }

  void requestHotReload(String moduleId) {
    _onEvent(
      ModuleDaemonEvent(
        kind: ModuleDaemonEventKind.hotReloadRequested,
        moduleId: moduleId,
      ),
    );
  }

  void emitModuleDataChanged(String moduleId, {String reason = ''}) {
    _onEvent(
      ModuleDaemonEvent(
        kind: ModuleDaemonEventKind.dataChanged,
        moduleId: moduleId,
        reason: reason,
      ),
    );
  }

  void emitModuleEnabled(String moduleId, {required bool enabled}) {
    _onEvent(
      ModuleDaemonEvent(
        kind: enabled
            ? ModuleDaemonEventKind.moduleEnabled
            : ModuleDaemonEventKind.moduleDisabled,
        moduleId: moduleId,
      ),
    );
  }

  void dispose() {
    _timer?.cancel();
    _timer = null;
    _running = false;
    for (final state in _tasks.values) {
      state.pendingTimer?.cancel();
      state.pendingTimer = null;
    }
  }

  void _tick() {
    final now = DateTime.now();
    for (final state in _tasks.values) {
      final task = state.task;
      if (!_taskEnabled(task) || state.pendingTimer != null) {
        continue;
      }
      if (now.difference(state.lastRunAt) >= task.interval) {
        unawaited(_runTask(state, reason: 'periodic'));
      }
    }
  }

  bool _taskEnabled(ModuleDaemonTask task) {
    final isEnabled = task.isEnabled;
    return isEnabled == null || isEnabled();
  }

  Future<void> _runTask(
    _ModuleDaemonTaskState state, {
    required String reason,
  }) async {
    if (state.running) {
      state.runAgain = true;
      return;
    }
    if (!_taskEnabled(state.task)) {
      return;
    }
    state.running = true;
    try {
      await state.task.run();
      state.lastRunAt = DateTime.now();
      _onEvent(
        ModuleDaemonEvent(
          kind: ModuleDaemonEventKind.taskCompleted,
          moduleId: state.task.moduleId,
          taskId: state.task.id,
          reason: reason,
        ),
      );
    } catch (error) {
      _onEvent(
        ModuleDaemonEvent(
          kind: ModuleDaemonEventKind.taskFailed,
          moduleId: state.task.moduleId,
          taskId: state.task.id,
          reason: reason,
          error: error,
        ),
      );
    } finally {
      state.running = false;
      if (state.runAgain) {
        state.runAgain = false;
        requestTask(state.task.id, delay: const Duration(milliseconds: 120));
      }
    }
  }
}

class _ModuleDaemonTaskState {
  _ModuleDaemonTaskState(this.task);

  final ModuleDaemonTask task;
  Timer? pendingTimer;
  DateTime lastRunAt = DateTime.fromMillisecondsSinceEpoch(0);
  bool running = false;
  bool runAgain = false;
}

enum KnowledgeDaemonEventKind {
  boot,
  periodicRefresh,
  moduleEvent,
  moduleDataChanged,
  dataSourceChanged,
  resultChanged,
  manualRefresh,
}

class KnowledgeDaemonEvent {
  KnowledgeDaemonEvent({
    required this.kind,
    this.sourceId = '',
    this.reason = '',
    DateTime? createdAt,
  }) : createdAt = createdAt ?? DateTime.now();

  final KnowledgeDaemonEventKind kind;
  final String sourceId;
  final String reason;
  final DateTime createdAt;
}

class KnowledgeDaemon {
  KnowledgeDaemon({
    required FutureOr<void> Function(KnowledgeDaemonEvent event) onRefresh,
    bool Function()? isEnabled,
    Duration periodicInterval = const Duration(minutes: 5),
  }) : _onRefresh = onRefresh,
       _isEnabled = isEnabled,
       _periodicInterval = periodicInterval;

  final FutureOr<void> Function(KnowledgeDaemonEvent event) _onRefresh;
  final bool Function()? _isEnabled;
  final Duration _periodicInterval;
  Timer? _periodicTimer;
  Timer? _debounceTimer;
  KnowledgeDaemonEvent? _pendingEvent;
  bool _running = false;
  bool _started = false;

  void start() {
    if (_started) {
      return;
    }
    _started = true;
    _periodicTimer = Timer.periodic(_periodicInterval, (_) {
      notify(
        KnowledgeDaemonEvent(
          kind: KnowledgeDaemonEventKind.periodicRefresh,
          reason: 'periodic',
        ),
        delay: const Duration(seconds: 3),
      );
    });
  }

  void notify(
    KnowledgeDaemonEvent event, {
    Duration delay = const Duration(milliseconds: 500),
  }) {
    if (!_enabled()) {
      return;
    }
    _pendingEvent = event;
    _debounceTimer?.cancel();
    _debounceTimer = Timer(delay, _flush);
  }

  void dispose() {
    _periodicTimer?.cancel();
    _periodicTimer = null;
    _debounceTimer?.cancel();
    _debounceTimer = null;
    _pendingEvent = null;
    _started = false;
  }

  bool _enabled() {
    final isEnabled = _isEnabled;
    return isEnabled == null || isEnabled();
  }

  void _flush() {
    _debounceTimer = null;
    final event = _pendingEvent;
    _pendingEvent = null;
    if (event == null || !_enabled()) {
      return;
    }
    unawaited(_run(event));
  }

  Future<void> _run(KnowledgeDaemonEvent event) async {
    if (_running) {
      _pendingEvent = event;
      _debounceTimer?.cancel();
      _debounceTimer = Timer(const Duration(milliseconds: 600), _flush);
      return;
    }
    _running = true;
    try {
      await _onRefresh(event);
    } finally {
      _running = false;
      if (_pendingEvent != null && _enabled()) {
        _debounceTimer?.cancel();
        _debounceTimer = Timer(const Duration(milliseconds: 600), _flush);
      }
    }
  }
}
