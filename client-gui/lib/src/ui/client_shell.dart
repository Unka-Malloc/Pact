import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:path/path.dart' as p;

import '../controllers/app_controller.dart';
import '../models/app_models.dart';
import '../services/runtime_services.dart';
import 'agents_canvas.dart';
import 'theme.dart';

class ClientShell extends StatefulWidget {
  const ClientShell({super.key, required this.controller});

  final AppController controller;

  @override
  State<ClientShell> createState() => _ClientShellState();
}

class _ClientShellState extends State<ClientShell> {
  late Future<_ActivitySnapshotState> _activityFuture;

  AppController get controller => widget.controller;

  @override
  void initState() {
    super.initState();
    _activityFuture = _loadActivitySnapshotState();
    if (controller.scannedTargets.isEmpty) {
      unawaited(controller.scanTargets());
    }
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: controller,
      builder: (context, _) {
        return Scaffold(
          body: SafeArea(
            child: Row(
              children: [
                _Sidebar(
                  current: controller.currentSection,
                  onSelect: controller.selectSection,
                ),
                Expanded(
                  child: Column(
                    children: [
                      _TopBar(section: controller.currentSection),
                      Expanded(
                        child: Padding(
                          padding: const EdgeInsets.all(20),
                          child: _sectionBody(context),
                        ),
                      ),
                      _StatusBar(controller: controller),
                    ],
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _sectionBody(BuildContext context) {
    return switch (controller.currentSection) {
      AppSection.agents => AgentsCanvas(controller: controller, width: 980),
      AppSection.mcpPlugins => _McpPluginsPanel(controller: controller),
      AppSection.skillHub => const _BoundaryPanel(
        title: 'Skill Hub',
        rows: [
          ('Pairing', '本机配对后可见'),
          ('Visibility', 'hidden / visible'),
          ('Protocol', 'protocol_deferred'),
        ],
      ),
      AppSection.modelForwarding => const _BoundaryPanel(
        title: 'Model Forwarding',
        rows: [
          ('Profiles', 'JSON state'),
          ('Forward', 'thin-forward'),
          ('Harness', 'not_supported'),
        ],
      ),
      AppSection.activity => FutureBuilder<_ActivitySnapshotState>(
        future: _activityFuture,
        builder: (context, snapshot) {
          return _ActivityPanel(
            state: snapshot.data ?? _ActivitySnapshotState.empty(),
            onRefresh: () {
              setState(() {
                _activityFuture = _loadActivitySnapshotState();
              });
            },
          );
        },
      ),
      AppSection.settings => _SettingsPanel(controller: controller),
    };
  }
}

class _Sidebar extends StatelessWidget {
  const _Sidebar({required this.current, required this.onSelect});

  final AppSection current;
  final ValueChanged<AppSection> onSelect;

  @override
  Widget build(BuildContext context) {
    const items = [
      (AppSection.agents, 'Agents', Icons.smart_toy_outlined),
      (AppSection.mcpPlugins, 'MCP Plugins', Icons.extension_outlined),
      (AppSection.skillHub, 'Skill Hub', Icons.library_books_outlined),
      (AppSection.modelForwarding, 'Model Forwarding', Icons.send_outlined),
      (AppSection.activity, 'Activity', Icons.history_outlined),
      (AppSection.settings, 'Settings', Icons.settings_outlined),
    ];
    return Container(
      width: 220,
      decoration: const BoxDecoration(
        color: PactColors.surfaceLow,
        border: Border(right: BorderSide(color: PactColors.line)),
      ),
      padding: const EdgeInsets.all(14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Padding(
            padding: EdgeInsets.fromLTRB(8, 8, 8, 18),
            child: Text(
              'Pact',
              style: TextStyle(
                color: PactColors.primary,
                fontSize: 16,
                fontWeight: FontWeight.w800,
              ),
            ),
          ),
          for (final item in items)
            _NavButton(
              selected: current == item.$1,
              icon: item.$3,
              label: item.$2,
              onPressed: () => onSelect(item.$1),
            ),
        ],
      ),
    );
  }
}

class _TopBar extends StatelessWidget {
  const _TopBar({required this.section});

  final AppSection section;

  @override
  Widget build(BuildContext context) {
    final title = switch (section) {
      AppSection.agents => 'Agents',
      AppSection.mcpPlugins => 'MCP Plugins',
      AppSection.skillHub => 'Skill Hub',
      AppSection.modelForwarding => 'Model Forwarding',
      AppSection.activity => 'Activity And Snapshots',
      AppSection.settings => 'Settings',
    };
    return Container(
      height: 64,
      alignment: Alignment.centerLeft,
      padding: const EdgeInsets.symmetric(horizontal: 24),
      decoration: const BoxDecoration(
        color: PactColors.background,
        border: Border(bottom: BorderSide(color: PactColors.line)),
      ),
      child: Text(
        title,
        style: Theme.of(
          context,
        ).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800),
      ),
    );
  }
}

class _NavButton extends StatelessWidget {
  const _NavButton({
    required this.selected,
    required this.icon,
    required this.label,
    required this.onPressed,
  });

  final bool selected;
  final IconData icon;
  final String label;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: TextButton.icon(
        onPressed: onPressed,
        icon: Icon(icon, size: 18),
        label: Align(alignment: Alignment.centerLeft, child: Text(label)),
        style: TextButton.styleFrom(
          alignment: Alignment.centerLeft,
          foregroundColor: selected ? PactColors.primary : PactColors.text,
          backgroundColor: selected
              ? PactColors.primaryFixed
              : Colors.transparent,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
          minimumSize: const Size.fromHeight(42),
        ),
      ),
    );
  }
}

class _McpPluginsPanel extends StatelessWidget {
  const _McpPluginsPanel({required this.controller});

  final AppController controller;

  @override
  Widget build(BuildContext context) {
    final targets = controller.scannedTargets;
    return _PanelFrame(
      child: ListView.separated(
        itemCount: targets.isEmpty ? 1 : targets.length,
        separatorBuilder: (context, index) => const Divider(height: 1),
        itemBuilder: (context, index) {
          if (targets.isEmpty) {
            return const ListTile(
              leading: Icon(Icons.extension_outlined),
              title: Text('Pact MCP'),
              subtitle: Text('target-native status pending scan'),
            );
          }
          final target = targets[index];
          return ListTile(
            leading: const Icon(Icons.extension_outlined),
            title: Text('${target.label} / Pact MCP'),
            subtitle: Text(target.configPath ?? target.detail ?? ''),
            trailing: Text(target.configured ? 'configured' : target.status),
          );
        },
      ),
    );
  }
}

class _BoundaryPanel extends StatelessWidget {
  const _BoundaryPanel({required this.title, required this.rows});

  final String title;
  final List<(String, String)> rows;

  @override
  Widget build(BuildContext context) {
    return _PanelFrame(
      child: ListView(
        children: [
          ListTile(
            leading: const Icon(Icons.layers_outlined),
            title: Text(title),
          ),
          const Divider(height: 1),
          for (final row in rows)
            ListTile(title: Text(row.$1), trailing: Text(row.$2)),
        ],
      ),
    );
  }
}

class _ActivityPanel extends StatelessWidget {
  const _ActivityPanel({required this.state, required this.onRefresh});

  final _ActivitySnapshotState state;
  final VoidCallback onRefresh;

  @override
  Widget build(BuildContext context) {
    return _PanelFrame(
      child: Column(
        children: [
          ListTile(
            leading: const Icon(Icons.history_outlined),
            title: const Text('Activity'),
            subtitle: Text(state.activityPath),
            trailing: IconButton(
              tooltip: 'Refresh',
              onPressed: onRefresh,
              icon: const Icon(Icons.refresh),
            ),
          ),
          const Divider(height: 1),
          Expanded(
            child: ListView(
              children: [
                for (final event in state.events)
                  ListTile(
                    dense: true,
                    title: Text((event['type'] ?? '').toString()),
                    subtitle: Text((event['createdAt'] ?? '').toString()),
                    trailing: Text((event['target'] ?? '').toString()),
                  ),
                const Divider(height: 1),
                for (final snapshot in state.snapshots)
                  ListTile(
                    dense: true,
                    leading: const Icon(Icons.restore_outlined),
                    title: Text((snapshot['snapshotId'] ?? '').toString()),
                    subtitle: Text((snapshot['sourcePath'] ?? '').toString()),
                    trailing: Text((snapshot['target'] ?? '').toString()),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _SettingsPanel extends StatelessWidget {
  const _SettingsPanel({required this.controller});

  final AppController controller;

  @override
  Widget build(BuildContext context) {
    return _PanelFrame(
      child: ListView(
        children: [
          ListTile(
            leading: const Icon(Icons.settings_outlined),
            title: const Text('Bootstrap URL'),
            subtitle: Text(controller.bootstrapController.text),
          ),
          ListTile(
            leading: const Icon(Icons.folder_outlined),
            title: const Text('Portable Data'),
            subtitle: Text(controller.backendRuntimeState?.dataDirectory ?? ''),
          ),
        ],
      ),
    );
  }
}

class _PanelFrame extends StatelessWidget {
  const _PanelFrame({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        color: PactColors.surface,
        border: Border.all(color: PactColors.line),
        borderRadius: BorderRadius.circular(8),
      ),
      child: child,
    );
  }
}

class _StatusBar extends StatelessWidget {
  const _StatusBar({required this.controller});

  final AppController controller;

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 36,
      padding: const EdgeInsets.symmetric(horizontal: 16),
      alignment: Alignment.centerLeft,
      decoration: const BoxDecoration(
        color: PactColors.surfaceLow,
        border: Border(top: BorderSide(color: PactColors.line)),
      ),
      child: Text(
        controller.statusMessage.isEmpty
            ? controller.statusCaption
            : controller.statusMessage,
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        style: Theme.of(context).textTheme.bodySmall,
      ),
    );
  }
}

class _ActivitySnapshotState {
  const _ActivitySnapshotState({
    required this.activityPath,
    required this.events,
    required this.snapshots,
  });

  final String activityPath;
  final List<Map<String, dynamic>> events;
  final List<Map<String, dynamic>> snapshots;

  factory _ActivitySnapshotState.empty() {
    return const _ActivitySnapshotState(
      activityPath: '',
      events: [],
      snapshots: [],
    );
  }
}

Future<_ActivitySnapshotState> _loadActivitySnapshotState() async {
  final dataDir = await PortableStorage().dataDirectory();
  final futureRoot = Directory(p.join(dataDir.path, 'future-client'));
  final activityFile = File(
    p.join(futureRoot.path, 'activity', 'activity.jsonl'),
  );
  final events = <Map<String, dynamic>>[];
  if (await activityFile.exists()) {
    final lines = await activityFile.readAsLines();
    for (final line in lines.reversed.take(80)) {
      final trimmed = line.trim();
      if (trimmed.isEmpty) {
        continue;
      }
      final decoded = jsonDecode(trimmed);
      if (decoded is Map<String, dynamic>) {
        events.add(decoded);
      }
    }
  }

  final snapshots = <Map<String, dynamic>>[];
  final snapshotDir = Directory(p.join(futureRoot.path, 'snapshots'));
  if (await snapshotDir.exists()) {
    await for (final entity in snapshotDir.list()) {
      if (entity is! File || !entity.path.endsWith('.json')) {
        continue;
      }
      final decoded = jsonDecode(await entity.readAsString());
      if (decoded is Map<String, dynamic>) {
        snapshots.add(decoded);
      }
    }
  }
  return _ActivitySnapshotState(
    activityPath: activityFile.path,
    events: events,
    snapshots: snapshots,
  );
}
