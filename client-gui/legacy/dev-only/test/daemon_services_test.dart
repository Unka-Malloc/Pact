import 'dart:async';

import 'package:flutter_client/src/services/daemon_services.dart';
import 'package:flutter_test/flutter_test.dart';

Future<void> waitUntil(
  bool Function() condition, {
  Duration timeout = const Duration(seconds: 2),
}) async {
  final deadline = DateTime.now().add(timeout);
  while (DateTime.now().isBefore(deadline)) {
    if (condition()) {
      return;
    }
    await Future<void>.delayed(const Duration(milliseconds: 20));
  }
  fail('condition was not met within $timeout');
}

void main() {
  test(
    'module daemon runs runOnStart tasks and emits lifecycle events',
    () async {
      final events = <ModuleDaemonEvent>[];
      var runCount = 0;
      final daemon = ModuleDaemon(
        onEvent: events.add,
        tickInterval: const Duration(milliseconds: 50),
      );
      addTearDown(daemon.dispose);

      daemon.registerTask(
        ModuleDaemonTask(
          id: 'mail.index-stats',
          moduleId: 'mail',
          interval: const Duration(seconds: 10),
          runOnStart: true,
          run: () async {
            runCount += 1;
          },
        ),
      );
      daemon.start();

      await waitUntil(
        () => events.any(
          (event) => event.kind == ModuleDaemonEventKind.taskCompleted,
        ),
      );
      expect(runCount, 1);
      expect(events.first.kind, ModuleDaemonEventKind.registered);
      expect(events.last.taskId, 'mail.index-stats');
      expect(events.last.reason, 'requested');
    },
  );

  test('module daemon skips disabled tasks until they are enabled', () async {
    final events = <ModuleDaemonEvent>[];
    var enabled = false;
    var runCount = 0;
    final daemon = ModuleDaemon(
      onEvent: events.add,
      tickInterval: const Duration(milliseconds: 20),
    );
    addTearDown(daemon.dispose);

    daemon.registerTask(
      ModuleDaemonTask(
        id: 'mail.disabled',
        moduleId: 'mail',
        interval: const Duration(milliseconds: 20),
        isEnabled: () => enabled,
        run: () async {
          runCount += 1;
        },
      ),
    );
    daemon.start();
    daemon.requestTask('mail.disabled');
    await Future<void>.delayed(const Duration(milliseconds: 80));
    expect(runCount, 0);

    enabled = true;
    daemon.requestTask('mail.disabled');
    await waitUntil(() => runCount >= 1);
    expect(
      events.where(
        (event) => event.kind == ModuleDaemonEventKind.taskCompleted,
      ),
      isNotEmpty,
    );
  });

  test(
    'module daemon reports task failures without stopping the daemon',
    () async {
      final events = <ModuleDaemonEvent>[];
      final daemon = ModuleDaemon(
        onEvent: events.add,
        tickInterval: const Duration(milliseconds: 20),
      );
      addTearDown(daemon.dispose);

      daemon.registerTask(
        ModuleDaemonTask(
          id: 'failing',
          moduleId: 'mail',
          interval: const Duration(seconds: 10),
          run: () async {
            throw StateError('broken');
          },
        ),
      );
      daemon.start();
      daemon.requestTask('failing');

      await waitUntil(
        () => events.any(
          (event) => event.kind == ModuleDaemonEventKind.taskFailed,
        ),
      );
      final failed = events.last;
      expect(failed.kind, ModuleDaemonEventKind.taskFailed);
      expect(failed.error, isA<StateError>());
    },
  );

  test(
    'module daemon queues a rerun when requested during an active run',
    () async {
      final events = <ModuleDaemonEvent>[];
      final firstRunMayFinish = Completer<void>();
      var runCount = 0;
      final daemon = ModuleDaemon(
        onEvent: events.add,
        tickInterval: const Duration(milliseconds: 20),
      );
      addTearDown(daemon.dispose);

      daemon.registerTask(
        ModuleDaemonTask(
          id: 'coalesced',
          moduleId: 'mail',
          interval: const Duration(seconds: 10),
          run: () async {
            runCount += 1;
            if (runCount == 1) {
              await firstRunMayFinish.future;
            }
          },
        ),
      );
      daemon.start();
      daemon.requestTask('coalesced');
      await waitUntil(() => runCount == 1);
      daemon.requestTask('coalesced');
      firstRunMayFinish.complete();

      await waitUntil(() => runCount == 2, timeout: const Duration(seconds: 3));
      expect(
        events
            .where((event) => event.kind == ModuleDaemonEventKind.taskCompleted)
            .length,
        2,
      );
    },
  );

  test(
    'knowledge daemon debounces rapid refresh notifications to the latest event',
    () async {
      final events = <KnowledgeDaemonEvent>[];
      final daemon = KnowledgeDaemon(onRefresh: events.add);
      addTearDown(daemon.dispose);
      daemon.start();

      daemon.notify(
        KnowledgeDaemonEvent(
          kind: KnowledgeDaemonEventKind.moduleDataChanged,
          sourceId: 'mail',
          reason: 'first',
        ),
        delay: const Duration(milliseconds: 40),
      );
      daemon.notify(
        KnowledgeDaemonEvent(
          kind: KnowledgeDaemonEventKind.resultChanged,
          sourceId: 'job',
          reason: 'second',
        ),
        delay: const Duration(milliseconds: 40),
      );

      await waitUntil(() => events.length == 1);
      expect(events.single.kind, KnowledgeDaemonEventKind.resultChanged);
      expect(events.single.reason, 'second');
    },
  );

  test('knowledge daemon ignores notifications while disabled', () async {
    final events = <KnowledgeDaemonEvent>[];
    final daemon = KnowledgeDaemon(
      isEnabled: () => false,
      onRefresh: events.add,
      periodicInterval: const Duration(milliseconds: 20),
    );
    addTearDown(daemon.dispose);
    daemon.start();
    daemon.notify(
      KnowledgeDaemonEvent(
        kind: KnowledgeDaemonEventKind.manualRefresh,
        reason: 'manual',
      ),
      delay: Duration.zero,
    );

    await Future<void>.delayed(const Duration(milliseconds: 80));
    expect(events, isEmpty);
  });

  test(
    'knowledge daemon schedules a follow-up refresh after an in-flight run',
    () async {
      final events = <KnowledgeDaemonEvent>[];
      final firstRunMayFinish = Completer<void>();
      final daemon = KnowledgeDaemon(
        onRefresh: (event) async {
          events.add(event);
          if (events.length == 1) {
            await firstRunMayFinish.future;
          }
        },
      );
      addTearDown(daemon.dispose);
      daemon.start();

      daemon.notify(
        KnowledgeDaemonEvent(
          kind: KnowledgeDaemonEventKind.manualRefresh,
          reason: 'first',
        ),
        delay: Duration.zero,
      );
      await waitUntil(() => events.length == 1);
      daemon.notify(
        KnowledgeDaemonEvent(
          kind: KnowledgeDaemonEventKind.resultChanged,
          reason: 'second',
        ),
        delay: Duration.zero,
      );
      firstRunMayFinish.complete();

      await waitUntil(
        () => events.length == 2,
        timeout: const Duration(seconds: 3),
      );
      expect(events.last.kind, KnowledgeDaemonEventKind.resultChanged);
      expect(events.last.reason, 'second');
    },
  );
}
