import 'dart:async';
import 'dart:convert';
import 'dart:math' as math;
import 'dart:ui' show ImageFilter;

import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:desktop_drop/desktop_drop.dart';

import '../controllers/app_controller.dart';
import '../models/app_models.dart';
import '../models/knowledge_graph_models.dart';
import '../models/transfer_models.dart';
import '../services/knowledge_graph_service.dart';
import '../services/macos_mail_importer.dart';
import 'theme.dart';

class ClientShell extends StatefulWidget {
  const ClientShell({super.key, required this.controller});

  final AppController controller;

  @override
  State<ClientShell> createState() => _ClientShellState();
}

class _ClientShellState extends State<ClientShell> {
  final ScrollController _bodyScrollController = ScrollController();
  final ScrollController _logsScrollController = ScrollController();
  final TextEditingController _knowledgeSearchController =
      TextEditingController();
  final TextEditingController _serverOperationSearchController =
      TextEditingController();
  final TextEditingController _serverPathController = TextEditingController(
    text: '/api/healthz',
  );
  final TextEditingController _serverBodyController = TextEditingController();
  Timer? _knowledgeSearchDebounce;
  String _serverHttpMethod = 'GET';
  String _selectedKnowledgeGraphNodeId = '';
  bool _showMailModuleSettings = false;
  AppController get controller => widget.controller;

  @override
  void dispose() {
    _knowledgeSearchDebounce?.cancel();
    _knowledgeSearchController.dispose();
    _serverOperationSearchController.dispose();
    _serverPathController.dispose();
    _serverBodyController.dispose();
    _bodyScrollController.dispose();
    _logsScrollController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final controller = widget.controller;
    return AnimatedBuilder(
      animation: controller,
      builder: (context, _) {
        return DropTarget(
          onDragDone: (details) async {
            if (details.files.isEmpty) {
              controller.reportDragStatus('拖拽事件未捕获到文件。', '拖拽未生效');
              return;
            }
            final paths = <String>[];
            for (final item in details.files) {
              final normalized = _normalizeDraggedPath(item.path);
              if (normalized.isNotEmpty) {
                paths.add(normalized);
              }
            }
            if (paths.isNotEmpty) {
              await controller.addDroppedPaths(paths);
            } else {
              controller.reportDragStatus('拖拽条目未解析出有效路径，已忽略。', '拖拽事件');
            }
          },
          child: Scaffold(
            body: SelectionArea(
              child: SafeArea(
                child: Column(
                  children: [
                    Expanded(
                      child: Row(
                        children: [
                          _buildSidebar(context),
                          Expanded(
                            child: Column(
                              children: [
                                _buildTopBar(context),
                                Expanded(
                                  child: LayoutBuilder(
                                    builder: (context, constraints) {
                                      return ScrollConfiguration(
                                        behavior: const MaterialScrollBehavior()
                                            .copyWith(scrollbars: true),
                                        child: Scrollbar(
                                          controller: _bodyScrollController,
                                          thumbVisibility: true,
                                          child: SingleChildScrollView(
                                            controller: _bodyScrollController,
                                            padding: const EdgeInsets.all(24),
                                            child: ConstrainedBox(
                                              constraints: BoxConstraints(
                                                minHeight:
                                                    constraints.maxHeight - 48,
                                              ),
                                              child: _buildCurrentCanvas(
                                                context,
                                                constraints.maxWidth - 48,
                                              ),
                                            ),
                                          ),
                                        ),
                                      );
                                    },
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
                    _buildStatusBar(context),
                  ],
                ),
              ),
            ),
          ),
        );
      },
    );
  }

  String _normalizeDraggedPath(String rawPath) {
    final trimmed = rawPath.trim();
    if (trimmed.isEmpty) {
      return '';
    }
    if (trimmed.startsWith('file://')) {
      try {
        return Uri.parse(trimmed).toFilePath();
      } catch (_) {
        return trimmed;
      }
    }
    return trimmed;
  }

  void _scheduleKnowledgeSearch(String value) {
    _knowledgeSearchDebounce?.cancel();
    _knowledgeSearchDebounce = Timer(const Duration(milliseconds: 320), () {
      if (!mounted) {
        return;
      }
      controller.searchKnowledgeGraph(value);
    });
  }

  Widget _buildSidebar(BuildContext context) {
    final items = [
      (AppSection.console, '输入', Icons.terminal_outlined),
      (AppSection.server, '服务', Icons.dns_outlined),
      (AppSection.modules, '模块', Icons.extension_outlined),
      (AppSection.dataConnectors, '数据源', Icons.hub_outlined),
      (AppSection.knowledgeGraph, '图谱', Icons.hub_outlined),
      (AppSection.export, '输出', Icons.outbox_outlined),
      (AppSection.localLogs, '日志', Icons.receipt_long_outlined),
    ];

    return Container(
      width: 184,
      decoration: const BoxDecoration(
        color: AgentStudioColors.surfaceLow,
        border: Border(right: BorderSide(color: AgentStudioColors.line)),
      ),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'AgentStudio',
              style: TextStyle(
                color: AgentStudioColors.primary,
                fontSize: 15,
                fontWeight: FontWeight.w800,
                letterSpacing: 1.2,
              ),
            ),
            const SizedBox(height: 20),
            for (final item in items) ...[
              _SidebarItem(
                label: item.$2,
                icon: item.$3,
                active: controller.currentSection == item.$1,
                onTap: () => controller.selectSection(item.$1),
              ),
              const SizedBox(height: 6),
            ],
            const Spacer(),
            _PrimaryActionButton(
              label: '设置',
              icon: Icons.tune_outlined,
              onPressed: () => controller.selectSection(AppSection.settings),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildTopBar(BuildContext context) {
    final (title, subtitle) = switch (controller.currentSection) {
      AppSection.console => ('输入', '当前任务输入、执行状态与结果摘要'),
      AppSection.queue => ('输入', '当前任务输入、执行状态与结果摘要'),
      AppSection.server => ('服务', '服务端接口、运行时、知识库和智能体能力'),
      AppSection.modules => ('模块', '本地能力开关与平台模块状态'),
      AppSection.dataConnectors => ('数据源', '跨应用本地镜像、授权和同步状态'),
      AppSection.knowledgeGraph => ('图谱', '跨模块事务关联视图'),
      AppSection.export => ('输出', '查看结果载荷、历史记录与输出实体数据'),
      AppSection.checkpoints => ('检查点', '查看检查点恢复状态'),
      AppSection.localLogs => ('日志', '查看本地操作日志'),
      AppSection.settings => ('设置', '配置引导地址和连接信息'),
    };

    return Container(
      constraints: const BoxConstraints(minHeight: 72),
      padding: const EdgeInsets.fromLTRB(24, 10, 24, 8),
      decoration: const BoxDecoration(
        color: AgentStudioColors.background,
        border: Border(bottom: BorderSide(color: AgentStudioColors.line)),
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Text(
                  title,
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w800,
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                const SizedBox(height: 4),
                Text(
                  subtitle,
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: AgentStudioColors.textMuted,
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ],
            ),
          ),
          const SizedBox(width: 16),
          IconButton(
            onPressed: () => _showHelpDialog(context),
            icon: const Icon(Icons.help_outline),
            color: AgentStudioColors.textMuted,
          ),
          Stack(
            children: [
              IconButton(
                onPressed: () => controller.selectSection(AppSection.localLogs),
                icon: const Icon(Icons.notifications_none),
                color: AgentStudioColors.textMuted,
              ),
              if (controller.alertCount > 0)
                const Positioned(
                  right: 10,
                  top: 10,
                  child: CircleAvatar(
                    radius: 4,
                    backgroundColor: AgentStudioColors.error,
                  ),
                ),
            ],
          ),
          const SizedBox(width: 4),
          const CircleAvatar(
            radius: 16,
            backgroundColor: AgentStudioColors.surfaceHighest,
            child: Icon(
              Icons.person_outline,
              color: AgentStudioColors.textMuted,
              size: 18,
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _showHelpDialog(BuildContext context) async {
    await showDialog<void>(
      context: context,
      builder: (dialogContext) {
        return AlertDialog(
          title: const Text('客户端帮助'),
          content: const SizedBox(
            width: 420,
            child: Text(
              '当前客户端已经接通引导连接、文件导入、检查点恢复、分块上传、任务轮询、结果导出和本地日志。你可以从这里快速跳转到设置、日志，或者直接打开本地数据目录与导出目录。',
            ),
          ),
          actions: [
            TextButton(
              onPressed: () {
                Navigator.of(dialogContext).pop();
                controller.selectSection(AppSection.settings);
              },
              child: const Text('前往设置'),
            ),
            TextButton(
              onPressed: () {
                Navigator.of(dialogContext).pop();
                controller.selectSection(AppSection.localLogs);
              },
              child: const Text('查看日志'),
            ),
            TextButton(
              onPressed: () {
                Navigator.of(dialogContext).pop();
                controller.openPortableDataDirectory();
              },
              child: const Text('打开数据目录'),
            ),
            FilledButton(
              onPressed: () {
                Navigator.of(dialogContext).pop();
                controller.openExportsDirectory();
              },
              child: const Text('打开导出目录'),
            ),
          ],
        );
      },
    );
  }

  Widget _buildCurrentCanvas(BuildContext context, double width) {
    return switch (controller.currentSection) {
      AppSection.console => _buildDashboardCanvas(context, width),
      AppSection.queue => _buildDashboardCanvas(context, width),
      AppSection.server => _buildServerCanvas(context, width),
      AppSection.modules => _buildModulesCanvas(context, width),
      AppSection.dataConnectors => _buildDataConnectorsCanvas(context, width),
      AppSection.knowledgeGraph => _buildKnowledgeGraphCanvas(context, width),
      AppSection.export => _buildExportCanvas(context, width),
      AppSection.checkpoints => _buildCheckpointsCanvas(context, width),
      AppSection.localLogs => _buildLocalLogsCanvas(context, width),
      AppSection.settings => _buildSettingsCanvas(context, width),
    };
  }

  double _knowledgeGraphHeightForWidth(double width) {
    return width >= 1280 ? 560.0 : 460.0;
  }

  Widget _buildDashboardCanvas(BuildContext context, double _) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _buildInputCard(context),
        const SizedBox(height: 20),
        _buildUploadWorkspaceCard(context),
        const SizedBox(height: 20),
        _buildOperationsCard(context),
      ],
    );
  }

  Widget _buildServerCanvas(BuildContext context, double width) {
    final split = width >= 1180;
    final query = _serverOperationSearchController.text;
    final filteredOperations = controller.serverOperations
        .where((operation) => operation.matches(query))
        .take(80)
        .toList(growable: false);
    final featureCounts = <String, int>{};
    for (final operation in controller.serverOperations) {
      featureCounts.update(
        operation.feature.isEmpty ? 'unknown' : operation.feature,
        (value) => value + 1,
        ifAbsent: () => 1,
      );
    }
    final topFeatures = featureCounts.entries.toList()
      ..sort((left, right) => right.value.compareTo(left.value));

    final overviewCard = _SectionCard(
      title: '服务端能力',
      subtitle: controller.connected ? controller.resolvedServiceUrl : '未连接',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: _MetricTile(
                  label: '接口',
                  value: '${controller.serverOperations.length}',
                  accent: AgentStudioColors.primary,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: _MetricTile(
                  label: '切面',
                  value: '${controller.serverFeatureCount}',
                  accent: AgentStudioColors.success,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: _MetricTile(
                  label: '写接口',
                  value: '${controller.serverWriteOperationCount}',
                  accent: AgentStudioColors.warning,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: _MetricTile(
                  label: '管理',
                  value: '${controller.serverAdminOperationCount}',
                  accent: AgentStudioColors.error,
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          Wrap(
            spacing: 10,
            runSpacing: 10,
            children: [
              _PrimaryActionButton(
                label: controller.refreshingServerCapabilities
                    ? '同步中...'
                    : '同步能力',
                icon: Icons.sync_outlined,
                onPressed: controller.refreshingServerCapabilities
                    ? null
                    : () => controller.refreshServerCapabilities(),
              ),
              _SecondaryActionButton(
                label: '同步知识',
                icon: Icons.library_books_outlined,
                onPressed: controller.connected
                    ? controller.syncKnowledgeMirrorFromServer
                    : null,
              ),
              _SecondaryActionButton(
                label: '同步智能体',
                icon: Icons.smart_toy_outlined,
                onPressed: controller.connected
                    ? controller.syncAgentRegistryFromServer
                    : null,
              ),
            ],
          ),
          const SizedBox(height: 16),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              _StatusPill(label: _serverOverviewLabel('health', '健康')),
              _StatusPill(label: _serverOverviewLabel('runtime', '运行时')),
              _StatusPill(label: _serverOverviewLabel('knowledge', '知识库')),
              _StatusPill(label: _serverOverviewLabel('agents', '智能体')),
            ],
          ),
          if (topFeatures.isNotEmpty) ...[
            const SizedBox(height: 16),
            Text(
              '主要切面',
              style: Theme.of(
                context,
              ).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w800),
            ),
            const SizedBox(height: 10),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                for (final entry in topFeatures.take(10))
                  _StatusPill(label: '${entry.key} ${entry.value}'),
              ],
            ),
          ],
        ],
      ),
    );

    final registryCard = _SectionCard(
      title: '接口注册表',
      subtitle: query.trim().isEmpty
          ? '${controller.serverOperations.length} 个接口'
          : '${filteredOperations.length} 个匹配',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          TextField(
            controller: _serverOperationSearchController,
            onChanged: (_) => setState(() {}),
            decoration: const InputDecoration(
              hintText: '搜索 feature、接口 ID、HTTP、RPC、权限',
              prefixIcon: Icon(Icons.search, size: 18),
            ),
          ),
          if (controller.serverOperationError.isNotEmpty) ...[
            const SizedBox(height: 12),
            Text(
              controller.serverOperationError,
              style: Theme.of(
                context,
              ).textTheme.bodySmall?.copyWith(color: AgentStudioColors.error),
            ),
          ],
          const SizedBox(height: 14),
          if (filteredOperations.isEmpty)
            const _EmptyPanel(label: '暂无服务端接口。请先连接并同步能力。')
          else
            for (final operation in filteredOperations) ...[
              _ServerOperationTile(
                operation: operation,
                onUse: () => _fillServerRequestFromOperation(operation),
              ),
              if (operation != filteredOperations.last)
                const SizedBox(height: 10),
            ],
        ],
      ),
    );

    final requestCard = _SectionCard(
      title: '通用调用',
      subtitle: controller.invokingServerRequest ? '调用中' : 'HTTP JSON',
      surfaceColor: AgentStudioColors.surfaceLow,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              SizedBox(
                width: 132,
                child: DropdownButtonFormField<String>(
                  initialValue: _serverHttpMethod,
                  decoration: const InputDecoration(labelText: '方法'),
                  items: const ['GET', 'POST', 'PUT', 'DELETE']
                      .map(
                        (method) => DropdownMenuItem(
                          value: method,
                          child: Text(method),
                        ),
                      )
                      .toList(growable: false),
                  onChanged: (value) {
                    if (value == null) {
                      return;
                    }
                    setState(() {
                      _serverHttpMethod = value;
                    });
                  },
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: TextField(
                  controller: _serverPathController,
                  decoration: const InputDecoration(
                    labelText: '路径',
                    hintText: '/api/runtime/info',
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Wrap(
            spacing: 10,
            runSpacing: 10,
            children: [
              _PrimaryActionButton(
                label: controller.invokingServerRequest ? '调用中...' : '调用',
                icon: Icons.play_arrow_outlined,
                onPressed: controller.invokingServerRequest
                    ? null
                    : () => controller.executeServerRequest(
                        method: _serverHttpMethod,
                        path: _serverPathController.text,
                        bodyText: _serverBodyController.text,
                      ),
              ),
              _SecondaryActionButton(
                label: '健康检查',
                icon: Icons.health_and_safety_outlined,
                onPressed: () {
                  setState(() {
                    _serverHttpMethod = 'GET';
                    _serverPathController.text = '/api/healthz';
                    _serverBodyController.clear();
                  });
                },
              ),
              _SecondaryActionButton(
                label: '运行时',
                icon: Icons.memory_outlined,
                onPressed: () {
                  setState(() {
                    _serverHttpMethod = 'GET';
                    _serverPathController.text = '/api/runtime/info';
                    _serverBodyController.clear();
                  });
                },
              ),
            ],
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _serverBodyController,
            minLines: 3,
            maxLines: 8,
            decoration: const InputDecoration(
              labelText: 'JSON Body',
              hintText: '{ "key": "value" }',
            ),
          ),
          const SizedBox(height: 14),
          Container(
            constraints: const BoxConstraints(minHeight: 180),
            width: double.infinity,
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: AgentStudioColors.surfaceHigh,
              borderRadius: BorderRadius.circular(8),
              border: Border.all(color: AgentStudioColors.line),
            ),
            child: controller.serverOperationResult == null
                ? const Text(
                    '调用结果会显示在这里。',
                    style: TextStyle(color: AgentStudioColors.textMuted),
                  )
                : SelectableText(
                    const JsonEncoder.withIndent(
                      '  ',
                    ).convert(controller.serverOperationResult),
                    style: const TextStyle(
                      fontFamily: 'monospace',
                      fontSize: 12,
                      height: 1.4,
                    ),
                  ),
          ),
        ],
      ),
    );

    if (split) {
      return Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            flex: 3,
            child: Column(
              children: [overviewCard, const SizedBox(height: 20), requestCard],
            ),
          ),
          const SizedBox(width: 20),
          Expanded(flex: 4, child: registryCard),
        ],
      );
    }

    return Column(
      children: [
        overviewCard,
        const SizedBox(height: 20),
        requestCard,
        const SizedBox(height: 20),
        registryCard,
      ],
    );
  }

  String _serverOverviewLabel(String key, String label) {
    final value = controller.serverOverview[key];
    if (value is! Map) {
      return '$label 未同步';
    }
    if (value['ok'] == false || value['error'] != null) {
      return '$label 异常';
    }
    return '$label 正常';
  }

  void _fillServerRequestFromOperation(ServerInterfaceOperation operation) {
    setState(() {
      _serverHttpMethod = operation.httpMethod.isEmpty
          ? 'GET'
          : operation.httpMethod;
      _serverPathController.text = operation.httpPath;
      _serverBodyController.clear();
    });
  }

  Widget _buildModulesCanvas(BuildContext context, double width) {
    final split = width >= 1000;
    final enabled = controller.emailAnalysisModuleEnabled;
    final supported = controller.localMailIndexAvailable;
    final startSyncDisabled =
        !enabled ||
        (controller.busy && !controller.syncingMacOSMailToCloud) ||
        (controller.importingMacOSMail &&
            !controller.syncingMacOSMailToCloud) ||
        controller.activatingMacOSMailAuthorization;
    final startSyncLabel =
        controller.importingMacOSMail && !controller.syncingMacOSMailToCloud
        ? '同步中...'
        : '开始同步';
    final showMailProgress =
        controller.importingMacOSMail ||
        controller.hasMacOSMailCloudSyncActivity;
    final moduleCard = _SectionCard(
      title: _showMailModuleSettings ? '邮箱分析设置' : '本地模块',
      subtitle: _showMailModuleSettings
          ? (supported ? 'macOS Mail' : '不可用')
          : enabled
          ? '1 个已启用'
          : '未启用',
      leading: _showMailModuleSettings
          ? IconButton(
              tooltip: '返回',
              onPressed: () => setState(() => _showMailModuleSettings = false),
              icon: const Icon(Icons.arrow_back),
              color: AgentStudioColors.textMuted,
              style: IconButton.styleFrom(
                tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                visualDensity: VisualDensity.compact,
              ),
            )
          : null,
      child: AnimatedSwitcher(
        duration: const Duration(milliseconds: 180),
        switchInCurve: Curves.easeOutCubic,
        switchOutCurve: Curves.easeInCubic,
        child: _showMailModuleSettings
            ? _buildMailModuleSettingsPanel(
                context,
                enabled: enabled,
                supported: supported,
              )
            : Column(
                key: const ValueKey('mail-module-main'),
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      CircleAvatar(
                        radius: 22,
                        backgroundColor: enabled
                            ? AgentStudioColors.primaryStrong
                            : AgentStudioColors.surfaceHighest,
                        child: const Icon(
                          Icons.mail_outline,
                          color: Colors.white,
                          size: 20,
                        ),
                      ),
                      const SizedBox(width: 14),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              '邮箱分析',
                              style: Theme.of(context).textTheme.titleSmall
                                  ?.copyWith(fontWeight: FontWeight.w800),
                            ),
                            const SizedBox(height: 6),
                            Text(
                              supported ? 'Mail.app 本地工作空间同步' : '当前平台不可用',
                              style: Theme.of(context).textTheme.bodySmall
                                  ?.copyWith(color: AgentStudioColors.textMuted),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(width: 14),
                      Switch.adaptive(
                        value: enabled,
                        onChanged: supported
                            ? controller.setEmailAnalysisModuleEnabled
                            : null,
                      ),
                    ],
                  ),
                  const SizedBox(height: 18),
                  Wrap(
                    spacing: 10,
                    runSpacing: 10,
                    children: [
                      _SecondaryActionButton(
                        label: '设置',
                        icon: Icons.settings_outlined,
                        onPressed: supported
                            ? () =>
                                  setState(() => _showMailModuleSettings = true)
                            : null,
                      ),
                      _SecondaryActionButton(
                        label: '工作空间',
                        icon: Icons.folder_open_outlined,
                        onPressed: controller.openMailWorkspaceDirectory,
                      ),
                      _SecondaryActionButton(
                        label: startSyncLabel,
                        icon: Icons.sync_outlined,
                        onPressed: startSyncDisabled
                            ? null
                            : controller.startMacOSMailSync,
                      ),
                      if (controller.importingMacOSMail)
                        _SecondaryActionButton(
                          label: controller.mailImportPaused ? '继续' : '暂停',
                          icon: controller.mailImportPaused
                              ? Icons.play_arrow_outlined
                              : Icons.pause_outlined,
                          onPressed: controller.mailImportPaused
                              ? controller.resumeMacOSMailImport
                              : controller.pauseMacOSMailImport,
                        ),
                    ],
                  ),
                  AnimatedSwitcher(
                    duration: const Duration(milliseconds: 220),
                    switchInCurve: Curves.easeOutCubic,
                    switchOutCurve: Curves.easeInCubic,
                    transitionBuilder: (child, animation) {
                      return SizeTransition(
                        sizeFactor: animation,
                        axisAlignment: -1,
                        child: FadeTransition(opacity: animation, child: child),
                      );
                    },
                    child: showMailProgress
                        ? _MailImportProgressPanel(
                            key: const ValueKey('mail-import-progress'),
                            title:
                                controller.syncingMacOSMailToCloud ||
                                    controller.hasMacOSMailCloudSyncActivity
                                ? '云端同步'
                                : '本地同步',
                            statusLabel:
                                controller.syncingMacOSMailToCloud ||
                                    controller.hasMacOSMailCloudSyncActivity
                                ? controller.mailCloudSyncProgressLabel
                                : controller.statusCaption,
                            queueLabel:
                                controller.syncingMacOSMailToCloud ||
                                    controller.hasMacOSMailCloudSyncActivity
                                ? controller.mailCloudSyncQueueLabel
                                : '',
                            progress: controller.mailImportProgressValue,
                            downloaded: controller.mailImportDownloadedCount,
                            total: controller.mailImportTotalCount,
                            uploadProgress: controller.syncingMacOSMailToCloud
                                ? controller.uploadProgress
                                : controller.mailCloudSyncProgressValue,
                          )
                        : const SizedBox.shrink(
                            key: ValueKey('mail-import-empty'),
                          ),
                  ),
                ],
              ),
      ),
    );

    final detailCard = _SectionCard(
      title: '模块状态',
      subtitle: supported ? 'macOS' : '不可用',
      surfaceColor: AgentStudioColors.surfaceLow,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _detailRow('邮箱分析', enabled ? '已启用' : '未启用'),
          _detailRow(
            '平台支持',
            supported ? controller.clientBackendCapabilityLabel : '当前平台不支持',
          ),
          _detailRow('客户端后台', controller.clientBackendStatusLabel),
          _detailRow('导入状态', controller.importingMacOSMail ? '正在导入' : '空闲'),
          _detailRow('云端同步', controller.mailCloudSyncStatusLabel),
          _detailRow('云端队列', controller.mailCloudSyncQueueLabel),
          _detailRow('索引状态', controller.mailIndexStatusLabel),
          _detailRow('专家词汇', controller.expertVocabularyStatusLabel),
          _detailRow('词汇校验', controller.expertVocabularyChecksumLabel),
          _detailRow('队列文件', '${controller.queueCount} 个'),
          const SizedBox(height: 12),
          Wrap(
            spacing: 10,
            runSpacing: 10,
            children: [
              _SecondaryActionButton(
                label: controller.pullingExpertVocabulary ? '拉取中...' : '拉取词汇',
                icon: Icons.download_outlined,
                onPressed:
                    controller.connected &&
                        !controller.pullingExpertVocabulary &&
                        !controller.applyingExpertVocabularyToMailIndex
                    ? () => controller.pullExpertVocabulary()
                    : null,
              ),
              _SecondaryActionButton(
                label: controller.refreshingMailIndexStats ? '刷新中...' : '刷新索引',
                icon: Icons.manage_search_outlined,
                onPressed: supported && !controller.refreshingMailIndexStats
                    ? () => controller.refreshMailIndexStats()
                    : null,
              ),
              _SecondaryActionButton(
                label: controller.rebuildingMailIndex ? '重建中...' : '重建索引',
                icon: Icons.repartition_outlined,
                onPressed:
                    supported &&
                        !controller.rebuildingMailIndex &&
                        !controller.importingMacOSMail
                    ? () => controller.rebuildMailIndex()
                    : null,
              ),
            ],
          ),
        ],
      ),
    );

    if (split) {
      return Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(flex: 3, child: moduleCard),
          const SizedBox(width: 20),
          Expanded(flex: 2, child: detailCard),
        ],
      );
    }

    return Column(
      children: [moduleCard, const SizedBox(height: 20), detailCard],
    );
  }

  Widget _buildMailModuleSettingsPanel(
    BuildContext context, {
    required bool enabled,
    required bool supported,
  }) {
    return Column(
      key: const ValueKey('mail-module-settings'),
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Expanded(
              child: Text(
                '启用邮箱分析',
                style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                  fontWeight: FontWeight.w800,
                  color: AgentStudioColors.text,
                ),
              ),
            ),
            Switch.adaptive(
              value: enabled,
              onChanged: supported
                  ? controller.setEmailAnalysisModuleEnabled
                  : null,
            ),
          ],
        ),
        const SizedBox(height: 14),
        _BinaryCheckbox(
          label: '上传云端',
          value: controller.macOSMailUploadToCloudEnabled,
          disabled: !enabled || !supported,
          onChanged: (value) {
            unawaited(controller.setMacOSMailUploadToCloudEnabled(value));
          },
        ),
        const SizedBox(height: 18),
        _detailRow(
          '同步路径',
          controller.macOSMailUploadToCloudEnabled ? '本地工作空间 + 云端' : '仅本地工作空间',
        ),
        _detailRow(
          '服务地址',
          controller.resolvedServiceUrl.isNotEmpty
              ? controller.resolvedServiceUrl
              : '未配置',
        ),
        _detailRow('客户端后台', controller.clientBackendStatusLabel),
        _detailRow('索引状态', controller.mailIndexStatusLabel),
        _detailRow('专家词汇', controller.expertVocabularyStatusLabel),
        const SizedBox(height: 14),
        Wrap(
          spacing: 10,
          runSpacing: 10,
          children: [
            _SecondaryActionButton(
              label: controller.activatingMacOSMailAuthorization
                  ? '授权中...'
                  : '请求授权',
              icon: Icons.verified_user_outlined,
              onPressed:
                  supported &&
                      !controller.importingMacOSMail &&
                      !controller.syncingMacOSMailToCloud &&
                      !controller.activatingMacOSMailAuthorization
                  ? controller.activateMacOSMailAuthorization
                  : null,
            ),
            _SecondaryActionButton(
              label: controller.refreshingMailIndexStats ? '刷新中...' : '刷新索引',
              icon: Icons.manage_search_outlined,
              onPressed: supported && !controller.refreshingMailIndexStats
                  ? () => controller.refreshMailIndexStats()
                  : null,
            ),
            _SecondaryActionButton(
              label: controller.pullingExpertVocabulary ? '拉取中...' : '拉取词汇',
              icon: Icons.download_outlined,
              onPressed:
                  controller.connected &&
                      !controller.pullingExpertVocabulary &&
                      !controller.applyingExpertVocabularyToMailIndex
                  ? () => controller.pullExpertVocabulary()
                  : null,
            ),
          ],
        ),
      ],
    );
  }

  Widget _buildDataConnectorsCanvas(BuildContext context, double width) {
    final connectors = controller.dataConnectors;
    final installedCount = connectors
        .where((item) => item['installed'] == true)
        .length;
    final enabledCount = connectors.where((item) => item['enabled'] == true).length;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _SectionCard(
          title: '数据连接器',
          subtitle: '$enabledCount 启用 / $installedCount 已安装',
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  _PrimaryActionButton(
                    label: controller.refreshingDataConnectors ? '刷新中' : '刷新',
                    icon: Icons.refresh_outlined,
                    onPressed: controller.refreshingDataConnectors
                        ? null
                        : controller.refreshDataConnectors,
                  ),
                  const SizedBox(width: 10),
                  _SecondaryActionButton(
                    label: '打开数据目录',
                    icon: Icons.folder_open_outlined,
                    onPressed: controller.openPortableDataDirectory,
                  ),
                ],
              ),
              if (controller.dataConnectorError.isNotEmpty) ...[
                const SizedBox(height: 12),
                Text(
                  controller.dataConnectorError,
                  style: const TextStyle(
                    color: AgentStudioColors.error,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ],
              const SizedBox(height: 16),
              if (connectors.isEmpty)
                Text(
                  '本地后台尚未返回数据连接器清单。',
                  style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    color: AgentStudioColors.textMuted,
                  ),
                )
              else
                Column(
                  children: [
                    for (final connector in connectors) ...[
                      _DataConnectorTile(
                        connector: connector,
                        onToggle: (enabled) => controller.setDataConnectorEnabled(
                          (connector['providerId'] ?? '').toString(),
                          enabled,
                        ),
                        onAuth: () => controller.startDataConnectorAuth(
                          (connector['providerId'] ?? '').toString(),
                        ),
                        onSync: () => controller.syncDataConnector(
                          (connector['providerId'] ?? '').toString(),
                        ),
                      ),
                      const SizedBox(height: 10),
                    ],
                  ],
                ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildKnowledgeGraphCanvas(BuildContext context, double width) {
    final snapshot = controller.knowledgeGraph;
    final split = width >= 1120;
    final graphHeight = _knowledgeGraphHeightForWidth(width);
    final selectedNode = _selectedKnowledgeNode(snapshot);
    final selectedNodeId = selectedNode?.id ?? '';
    final topNodes = _topKnowledgeNodes(snapshot);
    bool isPrimaryNode(KnowledgeGraphNode node) {
      return node.id != knowledgeGraphRootId &&
          const {
            'domain',
            'category',
            'subcategory',
            'entity',
            'intent',
            'affair',
          }.contains(node.kind);
    }

    final visibleNodeCount = snapshot.nodes.where(isPrimaryNode).length;
    final visibleEdgeCount = snapshot.edges
        .where(
          (edge) =>
              edge.sourceId != knowledgeGraphRootId &&
              edge.targetId != knowledgeGraphRootId &&
              (edge.label == '分类' ||
                  edge.label == '实体' ||
                  edge.label == '意图' ||
                  edge.label == '事务'),
        )
        .length;
    final cloudSemanticCount =
        controller.mailKnowledgeSemanticSuggestions.length;
    final cloudCoverageLabel = controller.mailKnowledgeDocuments.isEmpty
        ? '云端语义 $cloudSemanticCount'
        : '云端语义 $cloudSemanticCount/${controller.mailKnowledgeDocuments.length}';
    final graphCard = _SectionCard(
      title: '事务知识图谱',
      subtitle: '$visibleNodeCount 节点 / $visibleEdgeCount 边',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            height: graphHeight,
            width: double.infinity,
            child: _KnowledgeGraphView(
              snapshot: snapshot,
              selectedNodeId: selectedNodeId,
              refreshing: controller.refreshingMailKnowledgeGraph,
              onRefresh: controller.refreshingMailKnowledgeGraph
                  ? null
                  : () => controller.refreshMailKnowledgeGraph(),
              onNodeSelected: (node) {
                setState(() {
                  _selectedKnowledgeGraphNodeId = node.id;
                });
              },
            ),
          ),
          const SizedBox(height: 14),
          Wrap(
            spacing: 10,
            runSpacing: 10,
            children: [
              _StatusPill(
                label: '事实输入 ${controller.knowledgeGraphActiveSourceCount}',
              ),
              _StatusPill(label: cloudCoverageLabel),
              _StatusPill(label: '节点 $visibleNodeCount'),
              _StatusPill(label: '边 $visibleEdgeCount'),
              _StatusPill(
                label: _formatDateTime(snapshot.updatedAt.toIso8601String()),
              ),
            ],
          ),
        ],
      ),
    );

    final sourcesCard = _SectionCard(
      title: '聚合输入',
      subtitle: '${snapshot.dataSources.length} 个入口',
      surfaceColor: AgentStudioColors.surfaceLow,
      child: snapshot.dataSources.isEmpty
          ? const _EmptyPanel(label: '暂无事实输入。')
          : Column(
              children: [
                for (final source in snapshot.dataSources) ...[
                  _KnowledgeGraphDataSourceTile(source: source),
                  if (source != snapshot.dataSources.last)
                    const SizedBox(height: 10),
                ],
              ],
            ),
    );

    final nodesCard = _SectionCard(
      title: '领域与事务',
      subtitle: '$visibleNodeCount 个',
      surfaceColor: AgentStudioColors.surfaceLow,
      child: snapshot.nodes.isEmpty
          ? const _EmptyPanel(label: '暂无节点。')
          : Column(
              children: [
                for (final node in topNodes.take(10)) ...[
                  _KnowledgeGraphNodeTile(
                    node: node,
                    selected: node.id == selectedNode?.id,
                    onTap: () {
                      setState(() {
                        _selectedKnowledgeGraphNodeId = node.id;
                      });
                    },
                  ),
                  if (node != topNodes.take(10).last)
                    const SizedBox(height: 10),
                ],
              ],
            ),
    );

    final searchCard = _buildKnowledgeSearchCard(context);
    final detailsCard = _buildKnowledgeGraphDetailsCard(
      context,
      snapshot,
      selectedNode,
    );

    if (split) {
      return Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(flex: 7, child: graphCard),
          const SizedBox(width: 20),
          Expanded(
            flex: 3,
            child: Column(
              children: [
                searchCard,
                const SizedBox(height: 20),
                sourcesCard,
                const SizedBox(height: 20),
                detailsCard,
                const SizedBox(height: 20),
                nodesCard,
              ],
            ),
          ),
        ],
      );
    }

    return Column(
      children: [
        graphCard,
        const SizedBox(height: 20),
        searchCard,
        const SizedBox(height: 20),
        detailsCard,
        const SizedBox(height: 20),
        sourcesCard,
        const SizedBox(height: 20),
        nodesCard,
      ],
    );
  }

  KnowledgeGraphNode? _selectedKnowledgeNode(KnowledgeGraphSnapshot snapshot) {
    if (_selectedKnowledgeGraphNodeId.isNotEmpty) {
      if (_selectedKnowledgeGraphNodeId == knowledgeGraphRootId) {
        return null;
      }
      for (final node in snapshot.nodes) {
        if (node.id == _selectedKnowledgeGraphNodeId) {
          return node;
        }
      }
    }
    return null;
  }

  Widget _buildKnowledgeSearchCard(BuildContext context) {
    final results = controller.knowledgeSearchResults;
    final hasQuery = controller.knowledgeSearchQuery.isNotEmpty;
    final subtitle = hasQuery
        ? '${controller.knowledgeSearchTotal} 个文档'
        : '离线知识库';
    return _SectionCard(
      title: '知识库搜索',
      subtitle: subtitle,
      surfaceColor: AgentStudioColors.surfaceLow,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          TextField(
            controller: _knowledgeSearchController,
            minLines: 1,
            maxLines: 1,
            onSubmitted: controller.searchKnowledgeGraph,
            onChanged: (value) {
              setState(() {});
              _scheduleKnowledgeSearch(value);
            },
            decoration: InputDecoration(
              hintText: '搜索知识文档、事务、联系人、文件',
              prefixIcon: const Icon(Icons.search, size: 18),
              suffixIcon: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (controller.searchingKnowledgeIndex)
                    const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    ),
                  if (_knowledgeSearchController.text.isNotEmpty)
                    IconButton(
                      tooltip: '清空',
                      icon: const Icon(Icons.close, size: 18),
                      onPressed: () {
                        _knowledgeSearchDebounce?.cancel();
                        _knowledgeSearchController.clear();
                        controller.clearKnowledgeSearch();
                      },
                    ),
                ],
              ),
            ),
          ),
          if (controller.knowledgeSearchError.isNotEmpty) ...[
            const SizedBox(height: 12),
            Text(
              controller.knowledgeSearchError,
              style: Theme.of(
                context,
              ).textTheme.bodySmall?.copyWith(color: AgentStudioColors.error),
            ),
          ] else if (hasQuery &&
              results.isEmpty &&
              !controller.searchingKnowledgeIndex) ...[
            const SizedBox(height: 12),
            const _EmptyPanel(label: '没有命中本地知识文档。'),
          ] else if (results.isNotEmpty) ...[
            const SizedBox(height: 12),
            for (final result in results.take(6)) ...[
              _KnowledgeSearchResultTile(
                result: result,
                onOpen: () => controller.openKnowledgeMailEvidence(
                  docId: result.docId,
                  messageKey: result.messageKey,
                  label: '搜索命中的知识文档',
                ),
              ),
              if (result != results.take(6).last) const SizedBox(height: 8),
            ],
          ],
        ],
      ),
    );
  }

  Widget _buildKnowledgeGraphDetailsCard(
    BuildContext context,
    KnowledgeGraphSnapshot snapshot,
    KnowledgeGraphNode? node,
  ) {
    final timeline = controller.knowledgeTimelineForNode(node);
    final nodeDocId = node == null ? null : _knowledgeNodeDocId(node);
    final nodeMessageKey = node?.metadata['messageKey'] ?? '';
    final canOpenEvidence =
        node?.kind == 'evidence' &&
        ((nodeDocId != null && nodeDocId > 0) || nodeMessageKey.isNotEmpty);
    final related = node == null
        ? const <KnowledgeGraphEdge>[]
        : snapshot.edges
              .where(
                (edge) => edge.sourceId == node.id || edge.targetId == node.id,
              )
              .take(12)
              .toList(growable: false);
    final nodeById = {for (final item in snapshot.nodes) item.id: item};
    return _SectionCard(
      title: '节点详情',
      subtitle: node == null ? '未选择' : node.kind,
      surfaceColor: AgentStudioColors.surfaceLow,
      child: node == null
          ? const _EmptyPanel(label: '未选择节点。')
          : Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Wrap(
                  spacing: 10,
                  runSpacing: 10,
                  children: [
                    _StatusPill(label: node.kind),
                    _StatusPill(label: node.moduleId),
                    _StatusPill(label: '关系 ${related.length}'),
                  ],
                ),
                const SizedBox(height: 14),
                _detailRow('名称', node.label),
                _detailRow('节点 ID', node.id),
                for (final entry in node.metadata.entries.take(10))
                  _detailRow(entry.key, entry.value),
                if (canOpenEvidence) ...[
                  const SizedBox(height: 2),
                  _SecondaryActionButton(
                    label: '打开原始邮件',
                    icon: Icons.open_in_new,
                    onPressed: () => controller.openKnowledgeMailEvidence(
                      docId: nodeDocId,
                      messageKey: nodeMessageKey,
                    ),
                  ),
                  const SizedBox(height: 14),
                ],
                if (!timeline.isEmpty) ...[
                  const SizedBox(height: 4),
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          '事情时间线',
                          style: Theme.of(context).textTheme.titleSmall
                              ?.copyWith(fontWeight: FontWeight.w800),
                        ),
                      ),
                      _StatusPill(label: '${timeline.events.length} 阶段'),
                      const SizedBox(width: 6),
                      _StatusPill(label: '${timeline.evidenceCount} 证据'),
                    ],
                  ),
                  const SizedBox(height: 10),
                  for (final event in timeline.events) ...[
                    _KnowledgeTimelineTile(
                      event: event,
                      onOpen: event.primaryEvidence == null
                          ? null
                          : () => controller.openKnowledgeMailEvidence(
                              docId: event.primaryEvidence!.docId,
                              messageKey: event.primaryEvidence!.messageKey,
                            ),
                    ),
                    if (event != timeline.events.last)
                      const SizedBox(height: 8),
                  ],
                ],
                if (related.isNotEmpty) ...[
                  const SizedBox(height: 4),
                  Text(
                    '相邻关系',
                    style: Theme.of(context).textTheme.titleSmall?.copyWith(
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  const SizedBox(height: 10),
                  for (final edge in related) ...[
                    _KnowledgeGraphRelationTile(
                      edge: edge,
                      selectedNodeId: node.id,
                      nodeById: nodeById,
                    ),
                    if (edge != related.last) const SizedBox(height: 8),
                  ],
                ],
              ],
            ),
    );
  }

  int? _knowledgeNodeDocId(KnowledgeGraphNode node) {
    final raw = node.metadata['docId'] ?? node.metadata['文档ID'] ?? '';
    final parsed = int.tryParse(raw.trim());
    if (parsed != null && parsed > 0) {
      return parsed;
    }
    final match = RegExp(r'mail:(\d+)').firstMatch(node.id);
    if (match == null) {
      return null;
    }
    return int.tryParse(match.group(1) ?? '');
  }

  List<KnowledgeGraphNode> _topKnowledgeNodes(KnowledgeGraphSnapshot snapshot) {
    return snapshot.nodes
        .where(
          (node) =>
              node.id != knowledgeGraphRootId &&
              const {
                'domain',
                'category',
                'subcategory',
                'entity',
                'intent',
                'affair',
              }.contains(node.kind),
        )
        .toList()
      ..sort((left, right) {
        final leftRank = _knowledgeNodeRank(left.kind);
        final rightRank = _knowledgeNodeRank(right.kind);
        if (leftRank != rightRank) {
          return leftRank.compareTo(rightRank);
        }
        final weight = right.weight.compareTo(left.weight);
        if (weight != 0) {
          return weight;
        }
        return left.label.compareTo(right.label);
      });
  }

  int _knowledgeNodeRank(String kind) {
    return switch (kind) {
      'domain' => 0,
      'category' => 1,
      'subcategory' => 2,
      'entity' => 3,
      'intent' => 4,
      'affair' => 5,
      _ => 6,
    };
  }

  Widget _buildInputCard(BuildContext context) {
    return _SectionCard(
      title: '输入处理',
      subtitle: controller.importingMacOSMail
          ? '正在导入 Mail.app'
          : controller.busy
          ? '正在打包任务'
          : '准备提交',
      child: Column(
        children: [
          TextField(
            controller: controller.inputController,
            minLines: 6,
            maxLines: 6,
            decoration: const InputDecoration(hintText: '在这里粘贴清单文本或原始数据片段...'),
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              _SecondaryActionButton(
                label: '添加文件',
                icon: Icons.upload_file_outlined,
                onPressed: controller.busy ? null : controller.pickFiles,
              ),
              const SizedBox(width: 10),
              _SecondaryActionButton(
                label: '导入文件夹',
                icon: Icons.cloud_outlined,
                onPressed: controller.busy ? null : controller.pickDirectory,
              ),
              const Spacer(),
              SizedBox(
                width: 170,
                child: _PrimaryActionButton(
                  label: controller.busy ? '执行中...' : '开始执行',
                  onPressed: controller.busy || controller.importingMacOSMail
                      ? null
                      : controller.executePayload,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildUploadWorkspaceCard(BuildContext context) {
    final hasUploadHistory = controller.uploadSessionEntries.isNotEmpty;
    final hasItemsToManage = hasUploadHistory
        ? true
        : controller.queuedFiles.isNotEmpty;
    return _SectionCard(
      title: '上传队列',
      subtitle: controller.uploadSessionEntries.isEmpty
          ? (controller.queuedFiles.isEmpty
                ? '暂无待上传文件'
                : '${controller.queuedFiles.length} 个待上传文件')
          : '${controller.uploadSessionEntries.length} 条上传记录',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Wrap(
            spacing: 10,
            runSpacing: 10,
            children: [
              _SecondaryActionButton(
                label: hasUploadHistory ? '清空上传记录' : '清空队列',
                icon: Icons.delete_sweep_outlined,
                onPressed: hasItemsToManage
                    ? () => hasUploadHistory
                          ? controller.clearUploadSessionHistory()
                          : controller.clearQueue()
                    : null,
              ),
            ],
          ),
          const SizedBox(height: 10),
          _buildUploadHistoryPanel(context),
        ],
      ),
    );
  }

  Widget _buildUploadHistoryPanel(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final paneHeight = constraints.maxWidth >= 1120 ? 560.0 : 480.0;
        return SizedBox(
          height: paneHeight,
          child: _buildUploadRecordsPane(context),
        );
      },
    );
  }

  Widget _buildOperationsCard(BuildContext context) {
    final primaryProgress = controller.activeJob == null
        ? controller.packagingProgress
        : controller.uploadProgress;
    return _SectionCard(
      title: '当前操作',
      subtitle: controller.activeJob == null
          ? '空闲'
          : displayJobStatus(controller.activeJob!.status),
      child: Column(
        children: [
          _ProgressRow(
            label: '核心处理',
            progress: primaryProgress,
            suffix: '${(primaryProgress * 100).toStringAsFixed(0)}%',
          ),
          const SizedBox(height: 16),
          _ProgressRow(
            label: '上传会话',
            progress: controller.packagingProgress,
            suffix: controller.queueBytesLabel,
          ),
          const SizedBox(height: 16),
          _ProgressRow(
            label: '事件与文件校验',
            progress: controller.connected ? 1 : 0,
            suffix: controller.connected ? '已连接' : '待连接',
          ),
          const SizedBox(height: 14),
          Align(
            alignment: Alignment.centerLeft,
            child: Text(
              controller.statusCaption,
              style: Theme.of(
                context,
              ).textTheme.bodySmall?.copyWith(color: AgentStudioColors.textMuted),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSummaryCard(BuildContext context) {
    return _SectionCard(
      title: '运行摘要',
      subtitle: '当前桌面会话',
      child: Row(
        children: [
          Expanded(
            child: _MetricTile(
              label: '已校验',
              value: '${controller.queueCount}',
              accent: AgentStudioColors.primary,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: _MetricTile(
              label: '原始数据',
              value: controller.queueBytesLabel,
              accent: AgentStudioColors.text,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: _MetricTile(
              label: '告警数',
              value: '${controller.alertCount}',
              accent: controller.alertCount > 0
                  ? AgentStudioColors.error
                  : AgentStudioColors.success,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: _MetricTile(
              label: '运行时长',
              value: controller.uptimeLabel,
              accent: AgentStudioColors.warning,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSafetyCard(BuildContext context) {
    return _SectionCard(
      title: '运行安全',
      subtitle: controller.connected ? '已连接' : '未连接',
      surfaceColor: AgentStudioColors.surfaceLow,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  controller.statusMessage,
                  style: Theme.of(
                    context,
                  ).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700),
                ),
                const SizedBox(height: 8),
                Text(
                  controller.connected
                      ? '已通过引导服务握手校验，当前处于安全连接状态。'
                      : '尚未配置引导地址，请先连接客户端再提交任务。',
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: AgentStudioColors.textMuted,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 16),
          CircleAvatar(
            radius: 18,
            backgroundColor: controller.connected
                ? AgentStudioColors.primaryStrong
                : AgentStudioColors.surfaceHighest,
            child: Icon(
              controller.connected ? Icons.verified : Icons.shield_outlined,
              color: Colors.white,
              size: 18,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildUploadRecordsPane(BuildContext context) {
    final selectedNode = controller.selectedUploadSessionNode;
    final selectedSession = controller.selectedUploadSession;
    final entries = controller.uploadSessionEntries;
    if (entries.isEmpty && controller.queuedFiles.isNotEmpty) {
      return _buildQueuedFilesPane(context);
    }

    final pageIndex = controller.uploadSessionPageIndex;
    final pageCount = controller.uploadSessionPageCount;
    final pageStart = pageIndex * AppController.uploadSessionPageSize;
    var safeStart = pageStart;
    if (safeStart < 0 || entries.isEmpty) {
      safeStart = 0;
    } else if (safeStart >= entries.length) {
      safeStart = (pageCount - 1) * AppController.uploadSessionPageSize;
      if (safeStart < 0) {
        safeStart = 0;
      }
    }
    final safeEnd =
        safeStart + AppController.uploadSessionPageSize > entries.length
        ? entries.length
        : safeStart + AppController.uploadSessionPageSize;
    final safePageIndex = entries.isEmpty
        ? 0
        : (safeStart / AppController.uploadSessionPageSize).floor();
    final pageEntries = entries.isEmpty
        ? const <CheckpointNode>[]
        : entries.sublist(safeStart, safeEnd);
    return Padding(
      padding: const EdgeInsets.fromLTRB(4, 4, 10, 4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          pageEntries.isEmpty
              ? const Align(
                  alignment: Alignment.topLeft,
                  child: _EmptyPanel(label: '当前还没有上传记录，请先执行一次上传任务。'),
                )
              : Column(
                  children: [
                    for (
                      var index = 0;
                      index < pageEntries.length;
                      index++
                    ) ...[
                      Builder(
                        builder: (context) {
                          final node = pageEntries[index];
                          final isSelected =
                              selectedNode?.uploadSessionId ==
                              node.uploadSessionId;
                          final session = isSelected ? selectedSession : null;
                          return _UploadSessionTile(
                            node: node,
                            files: _buildUploadSessionFilesFromNode(
                              node: node,
                              sessionFiles: session?.files,
                            ),
                            uploadedAt: _formatDateTime(
                              isSelected &&
                                      session != null &&
                                      session.createdAt.isNotEmpty
                                  ? session.createdAt
                                  : node.createdAt,
                            ),
                          );
                        },
                      ),
                      if (index < pageEntries.length - 1)
                        const SizedBox(height: 10),
                    ],
                    if (pageCount > 1) ...[
                      const SizedBox(height: 14),
                      Row(
                        children: [
                          _SecondaryActionButton(
                            label: '上一页',
                            icon: Icons.chevron_left,
                            onPressed: safePageIndex <= 0
                                ? null
                                : () => controller.setUploadSessionPage(
                                    safePageIndex - 1,
                                  ),
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Text(
                              '第 ${safePageIndex + 1} / $pageCount 页',
                              textAlign: TextAlign.center,
                              style: Theme.of(context).textTheme.bodySmall
                                  ?.copyWith(color: AgentStudioColors.textMuted),
                            ),
                          ),
                          const SizedBox(width: 10),
                          _SecondaryActionButton(
                            label: '下一页',
                            icon: Icons.chevron_right,
                            onPressed: safePageIndex >= pageCount - 1
                                ? null
                                : () => controller.setUploadSessionPage(
                                    safePageIndex + 1,
                                  ),
                          ),
                        ],
                      ),
                    ],
                  ],
                ),
        ],
      ),
    );
  }

  Widget _buildQueuedFilesPane(BuildContext context) {
    final files = controller.queuedFiles;
    final pageIndex = controller.uploadSessionPageIndex;
    final total = files.length;
    final pageCount = total == 0
        ? 0
        : (total + AppController.uploadSessionPageSize - 1) ~/
              AppController.uploadSessionPageSize;
    final pageStart = pageIndex * AppController.uploadSessionPageSize;
    var safeStart = pageStart;
    if (safeStart < 0 || total == 0) {
      safeStart = 0;
    } else if (safeStart >= total) {
      safeStart = (pageCount - 1) * AppController.uploadSessionPageSize;
      if (safeStart < 0) {
        safeStart = 0;
      }
    }
    final safeEnd = safeStart + AppController.uploadSessionPageSize > total
        ? total
        : safeStart + AppController.uploadSessionPageSize;
    final safePageIndex = total == 0
        ? 0
        : (safeStart / AppController.uploadSessionPageSize).floor();
    final pageEntries = files.sublist(safeStart, safeEnd);

    return Padding(
      padding: const EdgeInsets.fromLTRB(4, 4, 10, 4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (pageEntries.isEmpty)
            const Align(
              alignment: Alignment.topLeft,
              child: _EmptyPanel(label: '当前还没有待上传文件，请先拖拽文件。'),
            )
          else
            Column(
              children: [
                _QueuedFilesTree(files: pageEntries),
                if (pageCount > 1) ...[
                  const SizedBox(height: 14),
                  Row(
                    children: [
                      _SecondaryActionButton(
                        label: '上一页',
                        icon: Icons.chevron_left,
                        onPressed: safePageIndex <= 0
                            ? null
                            : () => controller.setUploadSessionPage(
                                safePageIndex - 1,
                              ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Text(
                          '第 ${safePageIndex + 1} / $pageCount 页',
                          textAlign: TextAlign.center,
                          style: Theme.of(context).textTheme.bodySmall
                              ?.copyWith(color: AgentStudioColors.textMuted),
                        ),
                      ),
                      const SizedBox(width: 10),
                      _SecondaryActionButton(
                        label: '下一页',
                        icon: Icons.chevron_right,
                        onPressed: safePageIndex >= pageCount - 1
                            ? null
                            : () => controller.setUploadSessionPage(
                                safePageIndex + 1,
                              ),
                      ),
                    ],
                  ),
                ],
              ],
            ),
        ],
      ),
    );
  }

  List<UploadSessionFileInfo> _buildUploadSessionFilesFromNode({
    required CheckpointNode node,
    List<UploadSessionFileInfo>? sessionFiles,
  }) {
    final fallbackRecords = [...node.fileRecords];
    final fallbackLocalFiles = [...node.localFiles];

    if (sessionFiles != null && sessionFiles.isNotEmpty) {
      return sessionFiles;
    }

    if (fallbackRecords.isEmpty && fallbackLocalFiles.isEmpty) {
      return const [];
    }

    if (fallbackLocalFiles.isNotEmpty) {
      return fallbackLocalFiles
          .asMap()
          .entries
          .map(
            (entry) => UploadSessionFileInfo(
              index: entry.key,
              name: entry.value.label.isEmpty
                  ? entry.value.path.split('/').last
                  : entry.value.label,
              relativePath: entry.value.relativePath,
              mediaType: entry.value.mediaType,
              sha256: entry.value.sha256,
              byteSize: entry.value.byteSize,
              receivedBytes: 0,
              completed: false,
              completedAt: '',
            ),
          )
          .toList();
    }

    return fallbackRecords
        .asMap()
        .entries
        .map(
          (entry) => UploadSessionFileInfo(
            index: entry.key,
            name: entry.value.label,
            relativePath: entry.value.relativePath,
            mediaType: 'application/octet-stream',
            sha256: entry.value.sha256,
            byteSize: entry.value.byteSize,
            receivedBytes: 0,
            completed: false,
            completedAt: '',
          ),
        )
        .toList();
  }

  Widget _buildLogsSectionCard(BuildContext context) {
    final logs = controller.logs;
    return _SectionCard(
      title: '日志',
      subtitle: '${logs.length} 条',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Wrap(
            spacing: 10,
            runSpacing: 10,
            children: [
              _SecondaryActionButton(
                label: '清空日志',
                icon: Icons.delete_sweep_outlined,
                onPressed: logs.isEmpty ? null : controller.clearLogs,
              ),
              _SecondaryActionButton(
                label: '复制日志',
                icon: Icons.copy_outlined,
                onPressed: logs.isEmpty ? null : controller.copyLogs,
              ),
              _SecondaryActionButton(
                label: '打开数据目录',
                icon: Icons.folder_open_outlined,
                onPressed: controller.openPortableDataDirectory,
              ),
            ],
          ),
          const SizedBox(height: 14),
          if (logs.isEmpty)
            const _EmptyPanel(label: '当前还没有日志记录。')
          else
            _buildLogsViewport(context, logs),
        ],
      ),
    );
  }

  Widget _buildLogsViewport(BuildContext context, List<String> logs) {
    return SelectionContainer.disabled(
      child: Container(
        height: 460,
        decoration: BoxDecoration(
          color: AgentStudioColors.surfaceLow,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: AgentStudioColors.surfaceHighest),
        ),
        clipBehavior: Clip.antiAlias,
        child: Scrollbar(
          controller: _logsScrollController,
          thumbVisibility: true,
          child: ListView.builder(
            controller: _logsScrollController,
            primary: false,
            itemExtent: 66,
            cacheExtent: 600,
            padding: EdgeInsets.zero,
            itemCount: logs.length,
            itemBuilder: (context, index) =>
                _LogLineTile(line: logs[index], newest: index == 0),
          ),
        ),
      ),
    );
  }

  Widget _buildLocalLogsCanvas(BuildContext context, double width) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [_buildLogsSectionCard(context)],
    );
  }

  Widget _buildSettingsCanvas(BuildContext context, double width) {
    final split = width >= 1120;
    final metricsSplit = width >= 1080;

    final connectCard = _SectionCard(
      title: '连接设置',
      subtitle: controller.connected ? '已连接' : '未连接',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          TextField(
            controller: controller.bootstrapController,
            decoration: const InputDecoration(
              hintText: 'https://agentstudio.io/bootstrap/v1',
              labelText: '引导地址',
            ),
            onSubmitted: (_) => controller.connect(),
          ),
          const SizedBox(height: 16),
          TextField(
            controller: controller.serviceUsernameController,
            decoration: const InputDecoration(
              hintText: 'owner',
              labelText: '服务端账号',
            ),
            onSubmitted: (_) => controller.connect(),
          ),
          const SizedBox(height: 16),
          TextField(
            controller: controller.servicePasswordController,
            decoration: const InputDecoration(
              hintText: '控制台密码',
              labelText: '服务端密码',
            ),
            obscureText: true,
            onSubmitted: (_) => controller.connect(),
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              SizedBox(
                width: 140,
                child: _PrimaryActionButton(
                  label: controller.connecting ? '连接中...' : '连接服务',
                  icon: Icons.link_outlined,
                  onPressed: controller.connecting ? null : controller.connect,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  controller.connected
                      ? '当前已连接到 ${controller.resolvedServiceUrl}'
                      : '保存并连接到引导地址后，客户端才会开始提交任务。',
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: AgentStudioColors.textMuted,
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );

    final statusCard = _SectionCard(
      title: '连接状态',
      subtitle: controller.connected ? '在线' : '待配置',
      surfaceColor: AgentStudioColors.surfaceLow,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _detailRow('当前状态', controller.connected ? '已建立安全连接' : '尚未连接引导服务'),
          _detailRow('状态说明', controller.statusMessage),
          _detailRow('阶段说明', controller.statusCaption),
          _detailRow(
            '服务地址',
            controller.connected ? controller.resolvedServiceUrl : '未分配',
          ),
          _detailRow(
            '认证状态',
            controller.serviceUsername.isNotEmpty ? '已配置账号密码' : '未配置',
          ),
        ],
      ),
    );

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (split)
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(flex: 3, child: connectCard),
              const SizedBox(width: 20),
              Expanded(flex: 2, child: statusCard),
            ],
          )
        else
          Column(
            children: [connectCard, const SizedBox(height: 20), statusCard],
          ),
        const SizedBox(height: 20),
        if (metricsSplit)
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(flex: 3, child: _buildSummaryCard(context)),
              const SizedBox(width: 20),
              Expanded(flex: 2, child: _buildSafetyCard(context)),
            ],
          )
        else
          Column(
            children: [
              _buildSummaryCard(context),
              const SizedBox(height: 20),
              _buildSafetyCard(context),
            ],
          ),
      ],
    );
  }

  Widget _buildTimelineSection(BuildContext context) {
    final selected = controller.selectedRun;
    final split = MediaQuery.of(context).size.width >= 1120;

    final historyCard = _SectionCard(
      title: '输出历史',
      subtitle: '${controller.recentRuns.length} 条记录',
      child: controller.recentRuns.isEmpty
          ? const _EmptyPanel(label: '当前还没有本地运行记录。')
          : Column(
              children: [
                for (final run in controller.recentRuns) ...[
                  _RunTile(
                    run: run,
                    active: selected?.jobId == run.jobId,
                    onTap: () => controller.selectRun(run.jobId),
                  ),
                  if (run != controller.recentRuns.last)
                    const SizedBox(height: 10),
                ],
              ],
            ),
    );

    final detailCard = _SectionCard(
      title: '历史详情',
      subtitle: selected == null ? '未选择' : _shortId(selected.jobId),
      child: selected == null
          ? const _EmptyPanel(label: '请先在左侧选择一条记录。')
          : Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Wrap(
                  spacing: 10,
                  runSpacing: 10,
                  children: [
                    _StatusPill(label: displayJobStatus(selected.status)),
                    _StatusPill(label: '${selected.fileCount} 个文件'),
                    _StatusPill(label: displayStageLabel(selected.stage)),
                  ],
                ),
                const SizedBox(height: 16),
                _detailRow('创建时间', _formatDate(selected.createdAt)),
                _detailRow('服务地址', selected.serviceUrl),
                _detailRow('输入内容', selected.inputPreview),
                if (selected.error.isNotEmpty)
                  _detailRow('错误信息', selected.error, danger: true),
              ],
            ),
    );

    return split
        ? Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(flex: 2, child: historyCard),
              const SizedBox(width: 20),
              Expanded(flex: 3, child: detailCard),
            ],
          )
        : Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [historyCard, const SizedBox(height: 20), detailCard],
          );
  }

  Widget _buildCheckpointsCanvas(BuildContext context, double width) {
    final selected = controller.selectedCheckpoint;
    final split = width >= 1120;

    final listCard = _SectionCard(
      title: '检查点',
      subtitle: '已保存 ${controller.checkpointEntries.length} 条',
      child: controller.checkpointEntries.isEmpty
          ? const _EmptyPanel(label: '当前还没有检查点链路记录。')
          : Column(
              children: [
                for (final node in controller.checkpointEntries) ...[
                  _CheckpointTile(
                    node: node,
                    active: selected?.checkpointId == node.checkpointId,
                    onTap: () => controller.selectCheckpoint(node.checkpointId),
                  ),
                  if (node != controller.checkpointEntries.last)
                    const SizedBox(height: 10),
                ],
              ],
            ),
    );

    final detailCard = _SectionCard(
      title: '检查点详情',
      subtitle: selected == null ? '未选择' : shortId(selected.checkpointId),
      child: selected == null
          ? const _EmptyPanel(label: '请先在左侧选择一个检查点。')
          : Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Wrap(
                  spacing: 10,
                  runSpacing: 10,
                  children: [
                    _StatusPill(label: checkpointStateLabel(selected.state)),
                    _StatusPill(label: checkpointModeLabel(selected.mode)),
                    _StatusPill(label: '${selected.fileCount} 个文件'),
                  ],
                ),
                const SizedBox(height: 16),
                Row(
                  children: [
                    _SecondaryActionButton(
                      label: '载入控制台',
                      icon: Icons.upload_file_outlined,
                      onPressed: controller.loadSelectedCheckpointIntoConsole,
                    ),
                    const SizedBox(width: 10),
                    _PrimaryActionButton(
                      label: controller.busy ? '恢复中...' : '恢复检查点',
                      icon: Icons.play_arrow_outlined,
                      onPressed:
                          controller.busy ||
                              !controller.canResumeSelectedCheckpoint
                          ? null
                          : controller.resumeSelectedCheckpoint,
                    ),
                  ],
                ),
                const SizedBox(height: 18),
                _detailRow(
                  '摘要',
                  selected.summary.isEmpty ? '无摘要' : selected.summary,
                ),
                _detailRow('更新时间', _formatDate(selected.updatedAt)),
                _detailRow(
                  '上传会话',
                  selected.uploadSessionId.isEmpty
                      ? '未创建'
                      : selected.uploadSessionId,
                ),
                _detailRow(
                  '服务端任务',
                  selected.serverJobId.isEmpty ? '未提交' : selected.serverJobId,
                ),
                _detailRow(
                  '服务地址',
                  selected.serverServiceUrl.isEmpty
                      ? '未记录'
                      : selected.serverServiceUrl,
                ),
                if (selected.lastError.isNotEmpty)
                  _detailRow('错误信息', selected.lastError, danger: true),
                if (selected.fileRecords.isNotEmpty) ...[
                  const SizedBox(height: 10),
                  Text(
                    '文件',
                    style: Theme.of(context).textTheme.titleSmall?.copyWith(
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(height: 10),
                  for (final file in selected.fileRecords.take(10)) ...[
                    _ProgressRow(
                      label: file.label,
                      progress: 1,
                      suffix: _humanBytes(file.byteSize),
                    ),
                    if (file != selected.fileRecords.take(10).last)
                      const SizedBox(height: 12),
                  ],
                ],
              ],
            ),
    );

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (split)
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(flex: 2, child: listCard),
              const SizedBox(width: 20),
              Expanded(flex: 3, child: detailCard),
            ],
          )
        else
          Column(children: [listCard, const SizedBox(height: 20), detailCard]),
      ],
    );
  }

  Widget _buildDataSectionCard(
    BuildContext context, {
    required String title,
    required List<Map<String, dynamic>> items,
    required String emptyLabel,
  }) {
    return _SectionCard(
      title: title,
      subtitle: '${items.length} 项',
      child: items.isEmpty
          ? _EmptyPanel(label: emptyLabel)
          : Column(
              children: [
                for (final item in items.take(12)) ...[
                  _DataRow(item: item),
                  if (item != items.take(12).last) const SizedBox(height: 10),
                ],
              ],
            ),
    );
  }

  Widget _buildExportCanvas(BuildContext context, double width) {
    final outputHasResult = controller.hasResult;
    final entitySplit = width >= 1240;

    final outputPanel = _SectionCard(
      title: '输出工作台',
      subtitle: outputHasResult ? '当前结果可导出' : '请先执行任务',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Wrap(
            spacing: 10,
            runSpacing: 10,
            children: [
              _ExportButton(
                label: '导出结构化数据',
                onPressed: outputHasResult
                    ? () => controller.exportResult(ExportKind.json)
                    : null,
              ),
              _ExportButton(
                label: '导出 DOCX 报告',
                onPressed: outputHasResult
                    ? () => controller.exportResult(ExportKind.docx)
                    : null,
              ),
              _ExportButton(
                label: '导出知识包 DOCX',
                onPressed: outputHasResult
                    ? () => controller.exportResult(ExportKind.knowledgeDocx)
                    : null,
              ),
              _ExportButton(
                label: '导出源日志',
                accent: true,
                onPressed: controller.logs.isNotEmpty
                    ? () => controller.exportResult(ExportKind.sourceLogs)
                    : null,
              ),
              _SecondaryActionButton(
                label: '复制结果',
                icon: Icons.copy_all_outlined,
                onPressed: outputHasResult
                    ? controller.copyResultPreview
                    : null,
              ),
              _SecondaryActionButton(
                label: '打开导出目录',
                icon: Icons.folder_open_outlined,
                onPressed: controller.openExportsDirectory,
              ),
            ],
          ),
          const SizedBox(height: 14),
          Wrap(
            spacing: 10,
            runSpacing: 10,
            children: [
              _StatusPill(label: outputHasResult ? '输出就绪' : '等待输出'),
              _StatusPill(label: '历史运行 ${controller.recentRuns.length} 条'),
              if (controller.selectedRun != null)
                _StatusPill(
                  label: '已选 ${_shortId(controller.selectedRun!.jobId)}',
                ),
              if (controller.logs.isNotEmpty)
                _StatusPill(label: '日志 ${controller.logs.length} 条'),
            ],
          ),
          const SizedBox(height: 14),
          Container(
            constraints: const BoxConstraints(minHeight: 260),
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: AgentStudioColors.surfaceLow,
              borderRadius: BorderRadius.circular(14),
            ),
            child: SelectableText(
              controller.resultPreview,
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                fontFamily: 'monospace',
                height: 1.45,
              ),
            ),
          ),
        ],
      ),
    );

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        outputPanel,
        const SizedBox(height: 20),
        _buildTimelineSection(context),
        const SizedBox(height: 20),
        if (entitySplit)
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: _buildDataSectionCard(
                  context,
                  title: '事务',
                  items: controller.transactionItems,
                  emptyLabel: '请先执行任务，再查看事务聚类。',
                ),
              ),
              const SizedBox(width: 20),
              Expanded(
                child: _buildDataSectionCard(
                  context,
                  title: '人物',
                  items: controller.peopleItems,
                  emptyLabel: '请先执行任务，再查看人物实体。',
                ),
              ),
            ],
          )
        else
          Column(
            children: [
              _buildDataSectionCard(
                context,
                title: '事务',
                items: controller.transactionItems,
                emptyLabel: '请先执行任务，再查看事务聚类。',
              ),
              const SizedBox(height: 20),
              _buildDataSectionCard(
                context,
                title: '人物',
                items: controller.peopleItems,
                emptyLabel: '请先执行任务，再查看人物实体。',
              ),
            ],
          ),
      ],
    );
  }

  Widget _detailRow(String label, String value, {bool danger = false}) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: const TextStyle(
              color: AgentStudioColors.textMuted,
              fontSize: 11,
              fontWeight: FontWeight.w700,
              letterSpacing: 0.6,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            value,
            style: TextStyle(
              color: danger ? AgentStudioColors.error : AgentStudioColors.text,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildStatusBar(BuildContext context) {
    return Container(
      height: 28,
      padding: const EdgeInsets.symmetric(horizontal: 20),
      decoration: const BoxDecoration(
        color: AgentStudioColors.surfaceLow,
        border: Border(top: BorderSide(color: AgentStudioColors.line)),
      ),
      child: Row(
        children: [
          Text(
            controller.connected
                ? '已连接到 ${controller.resolvedServiceUrl}'
                : '未连接',
            style: Theme.of(
              context,
            ).textTheme.bodySmall?.copyWith(color: AgentStudioColors.textMuted),
          ),
          const SizedBox(width: 18),
          Text(
            '队列 ${controller.queueCount}',
            style: Theme.of(
              context,
            ).textTheme.bodySmall?.copyWith(color: AgentStudioColors.textMuted),
          ),
          const SizedBox(width: 18),
          Text(
            '告警 ${controller.alertCount}',
            style: Theme.of(
              context,
            ).textTheme.bodySmall?.copyWith(color: AgentStudioColors.textMuted),
          ),
          const Spacer(),
          Text(
            'AgentStudio 企业版构建 2026.4',
            style: Theme.of(
              context,
            ).textTheme.bodySmall?.copyWith(color: AgentStudioColors.textMuted),
          ),
        ],
      ),
    );
  }

  String _formatDate(String value) {
    final parsed = DateTime.tryParse(value);
    if (parsed == null) {
      return value;
    }
    return '${parsed.year}-${parsed.month.toString().padLeft(2, '0')}-${parsed.day.toString().padLeft(2, '0')} ${parsed.hour.toString().padLeft(2, '0')}:${parsed.minute.toString().padLeft(2, '0')}';
  }

  String _formatDateTime(String value) {
    final parsed = DateTime.tryParse(value);
    if (parsed == null) {
      return value.isEmpty ? '—' : value;
    }
    return '${parsed.year}-${parsed.month.toString().padLeft(2, '0')}-${parsed.day.toString().padLeft(2, '0')} ${parsed.hour.toString().padLeft(2, '0')}:${parsed.minute.toString().padLeft(2, '0')}:${parsed.second.toString().padLeft(2, '0')}';
  }

  String _shortId(String id) {
    return id.length <= 8 ? id : id.substring(0, 8);
  }

  String _humanBytes(int bytes) {
    if (bytes >= 1024 * 1024 * 1024) {
      return '${(bytes / (1024 * 1024 * 1024)).toStringAsFixed(1)} GB';
    }
    if (bytes >= 1024 * 1024) {
      return '${(bytes / (1024 * 1024)).toStringAsFixed(1)} MB';
    }
    if (bytes >= 1024) {
      return '${(bytes / 1024).toStringAsFixed(1)} KB';
    }
    return '${(bytes / 1024).toStringAsFixed(1)} KB';
  }
}

class _ServerOperationTile extends StatelessWidget {
  const _ServerOperationTile({required this.operation, required this.onUse});

  final ServerInterfaceOperation operation;
  final VoidCallback onUse;

  @override
  Widget build(BuildContext context) {
    final risk = operation.risk.isEmpty ? 'unknown' : operation.risk;
    final riskColor = switch (risk) {
      'read_only' => AgentStudioColors.success,
      'safe_write' => AgentStudioColors.warning,
      'repair_write' => AgentStudioColors.error,
      _ => AgentStudioColors.textMuted,
    };
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AgentStudioColors.surfaceLow,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: AgentStudioColors.line),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 58,
            alignment: Alignment.center,
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
            decoration: BoxDecoration(
              color: AgentStudioColors.surfaceHigh,
              borderRadius: BorderRadius.circular(6),
            ),
            child: Text(
              operation.httpMethod.isEmpty ? 'API' : operation.httpMethod,
              style: const TextStyle(
                color: AgentStudioColors.text,
                fontSize: 11,
                fontWeight: FontWeight.w800,
              ),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  operation.label.isEmpty ? operation.id : operation.label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(
                    context,
                  ).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w800),
                ),
                const SizedBox(height: 4),
                Text(
                  operation.id,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: AgentStudioColors.textMuted,
                  ),
                ),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 6,
                  runSpacing: 6,
                  children: [
                    _CompactTag(label: operation.feature),
                    _CompactTag(label: operation.httpPath),
                    if (operation.rpc.isNotEmpty)
                      _CompactTag(label: operation.rpc),
                    _CompactTag(label: risk, color: riskColor),
                    if (operation.requiredScopes.isNotEmpty)
                      _CompactTag(label: operation.requiredScopes.join(', ')),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(width: 12),
          IconButton(
            tooltip: '填入调用',
            onPressed: onUse,
            icon: const Icon(Icons.input_outlined),
            color: AgentStudioColors.textMuted,
          ),
        ],
      ),
    );
  }
}

class _CompactTag extends StatelessWidget {
  const _CompactTag({required this.label, this.color});

  final String label;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    if (label.trim().isEmpty) {
      return const SizedBox.shrink();
    }
    return Container(
      constraints: const BoxConstraints(maxWidth: 260),
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: AgentStudioColors.surfaceHigh,
        borderRadius: BorderRadius.circular(6),
        border: Border.all(color: color ?? AgentStudioColors.line),
      ),
      child: Text(
        label,
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        style: TextStyle(
          color: color ?? AgentStudioColors.textMuted,
          fontSize: 11,
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }
}

class _KnowledgeGraphView extends StatefulWidget {
  const _KnowledgeGraphView({
    required this.snapshot,
    required this.selectedNodeId,
    required this.refreshing,
    required this.onRefresh,
    required this.onNodeSelected,
  });

  final KnowledgeGraphSnapshot snapshot;
  final String selectedNodeId;
  final bool refreshing;
  final VoidCallback? onRefresh;
  final ValueChanged<KnowledgeGraphNode> onNodeSelected;

  @override
  State<_KnowledgeGraphView> createState() => _KnowledgeGraphViewState();
}

class _KnowledgeGraphViewState extends State<_KnowledgeGraphView>
    with SingleTickerProviderStateMixin {
  static const double _minScale = 0.45;
  static const double _maxScale = 3.5;

  final TransformationController _transformController =
      TransformationController();
  late final AnimationController _focusAnimationController;
  Animation<Matrix4>? _focusAnimation;
  _KnowledgeGraphLayout? _cachedLayout;
  KnowledgeGraphSnapshot? _cachedSnapshot;
  String _cachedLayoutSelectedNodeId = '';
  Size _cachedLayoutSize = Size.zero;

  @override
  void initState() {
    super.initState();
    _focusAnimationController =
        AnimationController(
          vsync: this,
          duration: const Duration(milliseconds: 280),
        )..addListener(() {
          final animation = _focusAnimation;
          if (animation != null) {
            _transformController.value = animation.value;
          }
        });
  }

  @override
  void dispose() {
    _focusAnimationController.dispose();
    _transformController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(14),
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: AgentStudioColors.surfaceLow,
          border: Border.all(color: AgentStudioColors.line),
        ),
        child: widget.snapshot.nodes.isEmpty
            ? const Center(child: _EmptyPanel(label: '暂无图谱数据。'))
            : LayoutBuilder(
                builder: (context, constraints) {
                  final viewportSize = Size(
                    math.max(1.0, constraints.maxWidth),
                    math.max(1.0, constraints.maxHeight),
                  );
                  final layout = _layoutFor(viewportSize);
                  final selectedNode =
                      widget.selectedNodeId.isEmpty ||
                          widget.selectedNodeId == knowledgeGraphRootId
                      ? null
                      : layout.nodeById[widget.selectedNodeId];
                  return Listener(
                    onPointerSignal: _handlePointerSignal,
                    child: Stack(
                      children: [
                        Positioned.fill(
                          child: GestureDetector(
                            behavior: HitTestBehavior.opaque,
                            onTapUp: (details) => _selectNode(
                              details.localPosition,
                              viewportSize,
                            ),
                            onDoubleTapDown: (details) =>
                                _focusNode(details.localPosition, viewportSize),
                            child: InteractiveViewer(
                              transformationController: _transformController,
                              minScale: _minScale,
                              maxScale: _maxScale,
                              boundaryMargin: const EdgeInsets.all(320),
                              clipBehavior: Clip.none,
                              child: CustomPaint(
                                painter: _KnowledgeGraphPainter(
                                  layout: layout,
                                  selectedNodeId: widget.selectedNodeId,
                                ),
                                child: SizedBox(
                                  width: viewportSize.width,
                                  height: viewportSize.height,
                                ),
                              ),
                            ),
                          ),
                        ),
                        Positioned(
                          top: 10,
                          left: 10,
                          child: DecoratedBox(
                            decoration: BoxDecoration(
                              color: AgentStudioColors.surface.withValues(
                                alpha: 0.92,
                              ),
                              borderRadius: BorderRadius.circular(10),
                              border: Border.all(color: AgentStudioColors.line),
                            ),
                            child: Padding(
                              padding: const EdgeInsets.all(4),
                              child: Row(
                                children: [
                                  _graphControlButton(
                                    icon: Icons.remove,
                                    tooltip: '缩小',
                                    onPressed: () => _zoomAt(
                                      0.82,
                                      Offset(
                                        viewportSize.width / 2,
                                        viewportSize.height / 2,
                                      ),
                                    ),
                                  ),
                                  _graphControlButton(
                                    icon: Icons.add,
                                    tooltip: '放大',
                                    onPressed: () => _zoomAt(
                                      1.18,
                                      Offset(
                                        viewportSize.width / 2,
                                        viewportSize.height / 2,
                                      ),
                                    ),
                                  ),
                                  _graphControlButton(
                                    icon: Icons.center_focus_strong_outlined,
                                    tooltip: '复位',
                                    onPressed: _resetView,
                                  ),
                                  _graphControlButton(
                                    icon: widget.refreshing
                                        ? Icons.sync
                                        : Icons.sync_outlined,
                                    tooltip: '刷新事务',
                                    onPressed: widget.onRefresh,
                                  ),
                                ],
                              ),
                            ),
                          ),
                        ),
                        if (selectedNode != null)
                          Positioned(
                            top: 10,
                            right: 10,
                            child: _buildSelectedNodeOverlay(
                              selectedNode,
                              width: math.min(
                                260.0,
                                math.max(180.0, viewportSize.width * 0.26),
                              ),
                            ),
                          ),
                      ],
                    ),
                  );
                },
              ),
      ),
    );
  }

  Widget _graphControlButton({
    required IconData icon,
    required String tooltip,
    required VoidCallback? onPressed,
  }) {
    return SizedBox(
      width: 30,
      height: 30,
      child: IconButton(
        tooltip: tooltip,
        icon: Icon(icon, size: 16),
        padding: EdgeInsets.zero,
        visualDensity: VisualDensity.compact,
        style: IconButton.styleFrom(
          foregroundColor: AgentStudioColors.text,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
        ),
        onPressed: onPressed,
      ),
    );
  }

  Widget _buildSelectedNodeOverlay(
    KnowledgeGraphNode node, {
    required double width,
  }) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(12),
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 18, sigmaY: 18),
        child: ConstrainedBox(
          constraints: BoxConstraints(
            minWidth: math.min(width, 180),
            maxWidth: width,
          ),
          child: DecoratedBox(
            decoration: BoxDecoration(
              color: AgentStudioColors.surface.withValues(alpha: 0.48),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(
                color: AgentStudioColors.primaryStrong.withValues(alpha: 0.18),
              ),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withValues(alpha: 0.05),
                  blurRadius: 18,
                  offset: const Offset(0, 8),
                ),
              ],
            ),
            child: Padding(
              padding: const EdgeInsets.fromLTRB(10, 8, 10, 8),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    node.label,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(
                      color: AgentStudioColors.text.withValues(alpha: 0.88),
                      fontWeight: FontWeight.w800,
                      height: 1.16,
                    ),
                  ),
                  const SizedBox(height: 5),
                  Wrap(
                    spacing: 5,
                    runSpacing: 5,
                    children: [
                      _CompactGraphPill(label: node.kind),
                      if (node.moduleId.isNotEmpty)
                        _CompactGraphPill(label: node.moduleId),
                    ],
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  void _handlePointerSignal(PointerSignalEvent event) {
    if (event is! PointerScrollEvent) {
      return;
    }
    _zoomAt(event.scrollDelta.dy > 0 ? 0.88 : 1.12, event.localPosition);
  }

  void _zoomAt(double factor, Offset focalPoint) {
    _stopFocusAnimation();
    final currentScale = _transformController.value.getMaxScaleOnAxis();
    if (currentScale <= 0) {
      return;
    }
    final nextScale = (currentScale * factor)
        .clamp(_minScale, _maxScale)
        .toDouble();
    final sceneFocalPoint = _transformController.toScene(focalPoint);
    _transformController.value = Matrix4.identity()
      ..translateByDouble(
        focalPoint.dx - sceneFocalPoint.dx * nextScale,
        focalPoint.dy - sceneFocalPoint.dy * nextScale,
        0,
        1,
      )
      ..scaleByDouble(nextScale, nextScale, 1, 1);
  }

  void _resetView() {
    _stopFocusAnimation();
    _transformController.value = Matrix4.identity();
  }

  void _selectNode(Offset viewportPoint, Size viewportSize) {
    final scenePoint = _transformController.toScene(viewportPoint);
    final layout = _layoutFor(viewportSize);
    final node = layout.hitTest(scenePoint);
    if (node != null) {
      widget.onNodeSelected(node);
      final focusedLayout = _layoutFor(viewportSize, selectedNodeId: node.id);
      final target = _targetMatrixForNode(node.id, focusedLayout, viewportSize);
      if (target != null) {
        _animateTransform(target);
      }
    }
  }

  void _focusNode(Offset viewportPoint, Size viewportSize) {
    final scenePoint = _transformController.toScene(viewportPoint);
    final currentLayout = _layoutFor(viewportSize);
    final node = currentLayout.hitTest(scenePoint);
    if (node == null) {
      return;
    }

    widget.onNodeSelected(node);
    final focusedLayout = _layoutFor(viewportSize, selectedNodeId: node.id);
    final target = _targetMatrixForNode(node.id, focusedLayout, viewportSize);
    if (target != null) {
      _animateTransform(target);
    }
  }

  Matrix4? _targetMatrixForNode(
    String nodeId,
    _KnowledgeGraphLayout layout,
    Size viewportSize,
  ) {
    final nodePosition = layout.positions[nodeId];
    final node = layout.nodeById[nodeId];
    if (nodePosition == null) {
      return null;
    }
    final targetScale = node == null ? 1.65 : _focusScaleForNode(node);
    final scale = targetScale.clamp(_minScale, _maxScale).toDouble();
    final center = Offset(viewportSize.width / 2, viewportSize.height / 2);
    return Matrix4.identity()
      ..translateByDouble(
        center.dx - nodePosition.dx * scale,
        center.dy - nodePosition.dy * scale,
        0,
        1,
      )
      ..scaleByDouble(scale, scale, 1, 1);
  }

  double _focusScaleForNode(KnowledgeGraphNode node) {
    return switch (node.kind) {
      'affair' => 1.42,
      'evidence' || 'person' || 'keyword' || 'time' => 1.55,
      'domain' => 1.18,
      'category' || 'subcategory' => 1.28,
      'entity' => 1.38,
      'intent' => 1.46,
      _ => 1.35,
    };
  }

  void _animateTransform(Matrix4 target) {
    _focusAnimationController.stop();
    _focusAnimation =
        Matrix4Tween(
          begin: Matrix4.copy(_transformController.value),
          end: target,
        ).animate(
          CurvedAnimation(
            parent: _focusAnimationController,
            curve: Curves.easeOutCubic,
          ),
        );
    _focusAnimationController.forward(from: 0);
  }

  void _stopFocusAnimation() {
    if (_focusAnimationController.isAnimating) {
      _focusAnimationController.stop();
    }
    _focusAnimation = null;
  }

  _KnowledgeGraphLayout _layoutFor(
    Size viewportSize, {
    String? selectedNodeId,
  }) {
    final effectiveSelectedNodeId = selectedNodeId ?? widget.selectedNodeId;
    final cached = _cachedLayout;
    if (cached != null &&
        _cachedSnapshot == widget.snapshot &&
        _cachedLayoutSelectedNodeId == effectiveSelectedNodeId &&
        _cachedLayoutSize == viewportSize) {
      return cached;
    }

    final layout = _KnowledgeGraphLayout(
      widget.snapshot,
      viewportSize,
      selectedNodeId: effectiveSelectedNodeId,
    );
    _cachedLayout = layout;
    _cachedSnapshot = widget.snapshot;
    _cachedLayoutSelectedNodeId = effectiveSelectedNodeId;
    _cachedLayoutSize = viewportSize;
    return layout;
  }
}

class _CompactGraphPill extends StatelessWidget {
  const _CompactGraphPill({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        color: AgentStudioColors.primary.withValues(alpha: 0.05),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(
          color: AgentStudioColors.primaryStrong.withValues(alpha: 0.12),
        ),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
        child: Text(
          label,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: Theme.of(context).textTheme.labelSmall?.copyWith(
            color: AgentStudioColors.textMuted,
            fontWeight: FontWeight.w700,
            height: 1,
          ),
        ),
      ),
    );
  }
}

class _KnowledgeGraphLayout {
  _KnowledgeGraphLayout(
    this.snapshot,
    this.size, {
    required this.selectedNodeId,
  });

  static const int _maxStructuralNodes = 96;
  static const int _maxEdges = 140;

  final KnowledgeGraphSnapshot snapshot;
  final Size size;
  final String selectedNodeId;

  late final List<KnowledgeGraphNode> nodes = _visibleNodes();
  late final Map<String, KnowledgeGraphNode> nodeById = {
    for (final node in nodes) node.id: node,
  };
  late final Set<String> _nodeIds = nodes.map((node) => node.id).toSet();
  late final List<KnowledgeGraphEdge> edges = _visibleEdges();
  late final Map<String, _KnowledgeGraphNodeMetrics> nodeMetrics =
      _buildNodeMetrics();
  late final Map<String, Offset> positions = _layout(nodes);

  KnowledgeGraphNode? hitTest(Offset point) {
    for (final node in nodes.reversed) {
      final position = positions[node.id];
      if (position == null) {
        continue;
      }
      if ((position - point).distance <= nodeRadius(node) + 8) {
        return node;
      }
    }
    return null;
  }

  double nodeRadius(KnowledgeGraphNode node) {
    if (node.kind == 'root') {
      return 19;
    }
    if (node.kind == 'module') {
      return 16;
    }
    final heat = math.sqrt(nodeHeatScore(node));
    final base = switch (node.kind) {
      'domain' => 15.0,
      'category' => 12.5,
      'subcategory' => 10.5,
      'entity' => 10.5,
      'intent' => 9.4,
      'affair' => 8.5,
      'person' || 'keyword' || 'time' => 6.8,
      'evidence' => 6.4,
      'mail' || 'thread' || 'folder' => 7.2,
      _ => 8.0,
    };
    final growth = switch (node.kind) {
      'domain' => 4.0,
      'category' => 3.5,
      'subcategory' => 3.0,
      'entity' => 4.2,
      'intent' => 3.4,
      'affair' => 3.2,
      'person' || 'keyword' || 'time' => 2.0,
      'evidence' => 1.2,
      _ => 2.1,
    };
    final maxRadius = switch (node.kind) {
      'domain' => 27.0,
      'category' => 23.0,
      'subcategory' => 20.0,
      'entity' => 24.0,
      'intent' => 19.0,
      'affair' => 18.0,
      'person' || 'keyword' || 'time' => 13.0,
      'evidence' => 10.0,
      _ => 15.0,
    };
    return (base + heat * growth).clamp(base, maxRadius).toDouble();
  }

  List<KnowledgeGraphNode> _visibleNodes() {
    final visibleIds = <String>{};
    final nodesById = {for (final node in snapshot.nodes) node.id: node};
    if (selectedNodeId.isNotEmpty && selectedNodeId != knowledgeGraphRootId) {
      final focused = _focusedVisibleNodes(nodesById);
      if (focused.isNotEmpty) {
        return focused;
      }
    }

    final structural =
        snapshot.nodes
            .where(
              (node) =>
                  node.id != knowledgeGraphRootId &&
                  const {
                    'domain',
                    'category',
                    'subcategory',
                    'entity',
                    'intent',
                    'affair',
                    'index',
                  }.contains(node.kind),
            )
            .toList()
          ..sort((left, right) {
            final leftRank = _kindRank(left.kind);
            final rightRank = _kindRank(right.kind);
            if (leftRank != rightRank) {
              return leftRank.compareTo(rightRank);
            }
            final weight = right.weight.compareTo(left.weight);
            if (weight != 0) {
              return weight;
            }
            return left.label.compareTo(right.label);
          });

    for (final node in structural.take(_maxStructuralNodes)) {
      visibleIds.add(node.id);
    }

    if (selectedNodeId.isNotEmpty && selectedNodeId != knowledgeGraphRootId) {
      visibleIds.add(selectedNodeId);
      for (final edge in snapshot.edges) {
        if (edge.sourceId == selectedNodeId) {
          final target = nodesById[edge.targetId];
          if (target != null && _isExpandableSatellite(target.kind)) {
            visibleIds.add(target.id);
          }
        } else if (edge.targetId == selectedNodeId) {
          final source = nodesById[edge.sourceId];
          if (source != null && _isExpandableSatellite(source.kind)) {
            visibleIds.add(source.id);
          }
        }
      }
    }

    return visibleIds
        .map((id) => nodesById[id])
        .whereType<KnowledgeGraphNode>()
        .toList(growable: false);
  }

  List<KnowledgeGraphEdge> _visibleEdges() {
    final filtered = snapshot.edges
        .where(
          (edge) =>
              (edge.sourceId == knowledgeGraphRootId ||
                  _nodeIds.contains(edge.sourceId)) &&
              _nodeIds.contains(edge.targetId),
        )
        .toList();
    if (selectedNodeId.isNotEmpty && selectedNodeId != knowledgeGraphRootId) {
      filtered.sort((left, right) {
        final leftFocus = _focusEdgeRank(left);
        final rightFocus = _focusEdgeRank(right);
        if (leftFocus != rightFocus) {
          return leftFocus.compareTo(rightFocus);
        }
        final leftStructural = _isStructuralEdge(left) ? 0 : 1;
        final rightStructural = _isStructuralEdge(right) ? 0 : 1;
        if (leftStructural != rightStructural) {
          return leftStructural.compareTo(rightStructural);
        }
        return right.weight.compareTo(left.weight);
      });
    }
    return filtered.take(_maxEdges).toList(growable: false);
  }

  int _focusEdgeRank(KnowledgeGraphEdge edge) {
    if (edge.sourceId == selectedNodeId || edge.targetId == selectedNodeId) {
      return 0;
    }
    if (edge.sourceId == knowledgeGraphRootId ||
        edge.targetId == knowledgeGraphRootId) {
      return 3;
    }
    return 1;
  }

  bool _isStructuralEdge(KnowledgeGraphEdge edge) {
    return edge.label == '领域' ||
        edge.label == '分类' ||
        edge.label == '实体' ||
        edge.label == '意图' ||
        edge.label == '事务';
  }

  List<KnowledgeGraphNode> _focusedVisibleNodes(
    Map<String, KnowledgeGraphNode> nodesById,
  ) {
    final selected = nodesById[selectedNodeId];
    if (selected == null) {
      return const [];
    }

    final visibleIds = <String>{selected.id};
    final direct = <String, _FocusCandidate>{};
    for (final edge in snapshot.edges) {
      if (edge.sourceId == knowledgeGraphRootId ||
          edge.targetId == knowledgeGraphRootId) {
        continue;
      }
      if (edge.sourceId == selected.id) {
        _addFocusCandidate(direct, edge.targetId, edge, nodesById);
      } else if (edge.targetId == selected.id) {
        _addFocusCandidate(direct, edge.sourceId, edge, nodesById);
      }
    }

    final directNodes = _sortedFocusCandidates(
      direct,
    ).take(52).map((candidate) => candidate.node).toList(growable: false);
    for (final node in directNodes) {
      visibleIds.add(node.id);
    }

    final secondHop = <String, _FocusCandidate>{};
    for (final directNode in directNodes.take(28)) {
      for (final edge in snapshot.edges) {
        if (edge.sourceId == knowledgeGraphRootId ||
            edge.targetId == knowledgeGraphRootId) {
          continue;
        }
        if (edge.sourceId == directNode.id &&
            edge.targetId != selected.id &&
            !visibleIds.contains(edge.targetId)) {
          _addFocusCandidate(secondHop, edge.targetId, edge, nodesById);
        } else if (edge.targetId == directNode.id &&
            edge.sourceId != selected.id &&
            !visibleIds.contains(edge.sourceId)) {
          _addFocusCandidate(secondHop, edge.sourceId, edge, nodesById);
        }
      }
    }

    for (final candidate in _sortedFocusCandidates(secondHop).take(44)) {
      visibleIds.add(candidate.node.id);
    }

    return visibleIds
        .map((id) => nodesById[id])
        .whereType<KnowledgeGraphNode>()
        .toList(growable: false);
  }

  void _addFocusCandidate(
    Map<String, _FocusCandidate> candidates,
    String nodeId,
    KnowledgeGraphEdge edge,
    Map<String, KnowledgeGraphNode> nodesById,
  ) {
    final node = nodesById[nodeId];
    if (node == null || node.id == knowledgeGraphRootId) {
      return;
    }
    final existing = candidates[node.id];
    if (existing == null || edge.weight > existing.edge.weight) {
      candidates[node.id] = _FocusCandidate(node: node, edge: edge);
    }
  }

  List<_FocusCandidate> _sortedFocusCandidates(
    Map<String, _FocusCandidate> candidates,
  ) {
    return candidates.values.toList()..sort((left, right) {
      final rank = _focusKindRank(
        left.node.kind,
      ).compareTo(_focusKindRank(right.node.kind));
      if (rank != 0) {
        return rank;
      }
      final count = _metadataCountSignal(
        right.node,
      ).compareTo(_metadataCountSignal(left.node));
      if (count != 0) {
        return count;
      }
      final weight = right.node.weight.compareTo(left.node.weight);
      if (weight != 0) {
        return weight;
      }
      return left.node.label.compareTo(right.node.label);
    });
  }

  int _focusKindRank(String kind) {
    return switch (kind) {
      'affair' => 0,
      'intent' => 1,
      'entity' => 2,
      'category' || 'subcategory' || 'domain' => 3,
      'person' => 4,
      'keyword' || 'time' => 5,
      'evidence' || 'mail' || 'thread' || 'folder' => 6,
      _ => 7,
    };
  }

  bool _isExpandableSatellite(String kind) {
    return const {
      'person',
      'evidence',
      'keyword',
      'time',
      'affair',
    }.contains(kind);
  }

  int _kindRank(String kind) {
    return switch (kind) {
      'domain' => 0,
      'category' => 1,
      'subcategory' => 2,
      'entity' => 3,
      'intent' => 4,
      'affair' => 5,
      'person' => 6,
      'keyword' => 7,
      'time' => 8,
      'evidence' => 9,
      _ => 10,
    };
  }

  _KnowledgeGraphNodeMetrics metricsFor(KnowledgeGraphNode node) {
    return nodeMetrics[node.id] ?? const _KnowledgeGraphNodeMetrics();
  }

  double nodeHeatScore(KnowledgeGraphNode node) {
    final metrics = metricsFor(node);
    final weightSignal = math.max(0, node.weight - 1) * 1.45;
    final degreeSignal = math.log(metrics.degree + 1) * 1.25;
    final countSignal = metrics.count <= 0
        ? 0.0
        : math.log(metrics.count + 1) * 0.95;
    final edgeSignal = math.log(metrics.edgeWeight + 1) * 0.72;
    return (weightSignal + degreeSignal + countSignal + edgeSignal)
        .clamp(0, 9)
        .toDouble();
  }

  double nodeHeat(KnowledgeGraphNode node) {
    return (nodeHeatScore(node) / 9).clamp(0, 1).toDouble();
  }

  Map<String, _KnowledgeGraphNodeMetrics> _buildNodeMetrics() {
    final mutable = <String, _MutableKnowledgeGraphNodeMetrics>{
      for (final node in nodes)
        node.id: _MutableKnowledgeGraphNodeMetrics(
          count: _metadataCountSignal(node),
        ),
    };
    for (final edge in snapshot.edges) {
      if (edge.sourceId == knowledgeGraphRootId ||
          edge.targetId == knowledgeGraphRootId) {
        continue;
      }
      final source = mutable[edge.sourceId];
      if (source != null) {
        source.degree += 1;
        source.edgeWeight += edge.weight;
      }
      final target = mutable[edge.targetId];
      if (target != null) {
        target.degree += 1;
        target.edgeWeight += edge.weight;
      }
    }
    return {
      for (final entry in mutable.entries)
        entry.key: _KnowledgeGraphNodeMetrics(
          degree: entry.value.degree,
          edgeWeight: entry.value.edgeWeight,
          count: entry.value.count,
        ),
    };
  }

  int _metadataCountSignal(KnowledgeGraphNode node) {
    const signalKeys = {
      '出现',
      '出现次数',
      '证据数',
      '折叠邮件',
      '邮件数',
      '相关邮件',
      '文档数',
      '关系数',
      '命中数',
    };
    var best = 0;
    for (final entry in node.metadata.entries) {
      if (!signalKeys.contains(entry.key)) {
        continue;
      }
      final match = RegExp(r'\d+').firstMatch(entry.value);
      if (match == null) {
        continue;
      }
      final value = int.tryParse(match.group(0) ?? '') ?? 0;
      if (value > best) {
        best = value;
      }
    }
    return best;
  }

  Rect _layoutBounds() {
    final shortest = math.min(size.width, size.height);
    final margin = math.max(42.0, shortest * 0.075);
    return Rect.fromLTRB(
      margin,
      margin,
      math.max(margin + 1, size.width - margin),
      math.max(margin + 1, size.height - margin),
    );
  }

  Offset _clampToBounds(Offset point, Rect bounds) {
    return Offset(
      point.dx.clamp(bounds.left, bounds.right).toDouble(),
      point.dy.clamp(bounds.top, bounds.bottom).toDouble(),
    );
  }

  double _stableUnit(String value) {
    var hash = 0x811c9dc5;
    for (final unit in value.codeUnits) {
      hash ^= unit;
      hash = (hash * 0x01000193) & 0x7fffffff;
    }
    return (hash % 1000003) / 1000003.0;
  }

  double _stableSigned(String value) => _stableUnit(value) * 2 - 1;

  double _minimumNodeDistance(
    KnowledgeGraphNode left,
    KnowledgeGraphNode right,
  ) {
    final structural =
        const {
          'domain',
          'category',
          'subcategory',
          'entity',
          'intent',
          'affair',
        }.contains(left.kind) ||
        const {
          'domain',
          'category',
          'subcategory',
          'entity',
          'intent',
          'affair',
        }.contains(right.kind);
    final labelRoom = structural ? 28.0 : 12.0;
    final sameLayer = left.kind == right.kind ? 8.0 : 0.0;
    return nodeRadius(left) + nodeRadius(right) + labelRoom + sameLayer;
  }

  double _layoutMobility(KnowledgeGraphNode node) {
    if (node.id == selectedNodeId && selectedNodeId != knowledgeGraphRootId) {
      return 0.05;
    }
    return switch (node.kind) {
      'domain' => 0.28,
      'category' => 0.55,
      'subcategory' => 0.72,
      'entity' => 0.9,
      'intent' => 0.96,
      _ => 1.0,
    };
  }

  void _relaxPositions(
    Map<String, Offset> positions,
    List<KnowledgeGraphNode> nodes,
    Rect bounds,
  ) {
    final positioned = nodes
        .where((node) => positions.containsKey(node.id))
        .toList(growable: false);
    for (var iteration = 0; iteration < 34; iteration += 1) {
      var moved = false;
      for (var leftIndex = 0; leftIndex < positioned.length; leftIndex += 1) {
        final left = positioned[leftIndex];
        final leftPosition = positions[left.id];
        if (leftPosition == null) {
          continue;
        }
        for (
          var rightIndex = leftIndex + 1;
          rightIndex < positioned.length;
          rightIndex += 1
        ) {
          final right = positioned[rightIndex];
          final rightPosition = positions[right.id];
          if (rightPosition == null) {
            continue;
          }
          final delta = rightPosition - leftPosition;
          final distance = delta.distance;
          final minimumDistance = _minimumNodeDistance(left, right);
          if (distance >= minimumDistance) {
            continue;
          }
          final fallbackAngle =
              _stableUnit('${left.id}:${right.id}:repel') * math.pi * 2;
          final direction = distance < 0.01
              ? Offset(math.cos(fallbackAngle), math.sin(fallbackAngle))
              : Offset(delta.dx / distance, delta.dy / distance);
          final gap = (minimumDistance - distance) * 0.52;
          final leftMobility = _layoutMobility(left);
          final rightMobility = _layoutMobility(right);
          final mobilitySum = leftMobility + rightMobility;
          positions[left.id] = _clampToBounds(
            leftPosition - direction * gap * (leftMobility / mobilitySum),
            bounds,
          );
          positions[right.id] = _clampToBounds(
            rightPosition + direction * gap * (rightMobility / mobilitySum),
            bounds,
          );
          moved = true;
        }
      }
      if (!moved) {
        break;
      }
    }
  }

  Map<String, Offset> _layout(List<KnowledgeGraphNode> nodes) {
    final canvasCenter = Offset(size.width / 2, size.height / 2);
    final bounds = _layoutBounds();
    final shortest = math.min(size.width, size.height);
    final islandRadius = math.max(92.0, shortest * 0.23);
    final positions = <String, Offset>{};
    final angles = <String, double>{};
    final nodeById = {for (final node in nodes) node.id: node};
    final structuralChildren = <String, List<KnowledgeGraphNode>>{};
    final satellitesByAffair = <String, List<KnowledgeGraphNode>>{};
    for (final edge in edges) {
      final source = nodeById[edge.sourceId];
      final target = nodeById[edge.targetId];
      if (source == null || target == null) {
        continue;
      }
      if (edge.label == '领域' ||
          edge.label == '分类' ||
          edge.label == '实体' ||
          edge.label == '意图' ||
          edge.label == '事务') {
        structuralChildren
            .putIfAbsent(edge.sourceId, () => <KnowledgeGraphNode>[])
            .add(target);
      } else if (source.kind == 'affair' &&
          const {
            'person',
            'evidence',
            'keyword',
            'time',
          }.contains(target.kind)) {
        satellitesByAffair
            .putIfAbsent(source.id, () => <KnowledgeGraphNode>[])
            .add(target);
      }
    }

    List<KnowledgeGraphNode> sortForFocus(List<KnowledgeGraphNode> group) {
      return [...group]..sort((left, right) {
        final rank = _focusKindRank(
          left.kind,
        ).compareTo(_focusKindRank(right.kind));
        if (rank != 0) {
          return rank;
        }
        final heat = nodeHeatScore(right).compareTo(nodeHeatScore(left));
        if (heat != 0) {
          return heat;
        }
        return left.label.compareTo(right.label);
      });
    }

    void placeFocusRing(
      List<KnowledgeGraphNode> group, {
      required double baseRadius,
      required double ringGap,
      required int maxPerRing,
      required double startAngle,
    }) {
      final sorted = sortForFocus(group);
      for (var index = 0; index < sorted.length; index += 1) {
        final node = sorted[index];
        final ringIndex = index ~/ maxPerRing;
        final firstIndexInRing = ringIndex * maxPerRing;
        final countOnRing = math.min(
          maxPerRing,
          sorted.length - firstIndexInRing,
        );
        final indexOnRing = index - firstIndexInRing;
        final angle =
            startAngle +
            math.pi * 2 * (indexOnRing / math.max(1, countOnRing)) +
            _stableSigned('focus:$selectedNodeId:${node.id}') * 0.08;
        final radius =
            baseRadius +
            ringIndex * ringGap +
            _stableUnit('focus-ring:$selectedNodeId:${node.id}') *
                ringGap *
                0.12;
        positions[node.id] = _clampToBounds(
          Offset(
            canvasCenter.dx + math.cos(angle) * radius,
            canvasCenter.dy + math.sin(angle) * radius,
          ),
          bounds,
        );
        angles[node.id] = angle;
      }
    }

    bool placeFocusedEgoLayout() {
      if (selectedNodeId.isEmpty || selectedNodeId == knowledgeGraphRootId) {
        return false;
      }
      final selected = nodeById[selectedNodeId];
      if (selected == null) {
        return false;
      }
      positions[selected.id] = canvasCenter;
      angles[selected.id] = -math.pi / 2;

      final directIds = <String>{};
      for (final edge in edges) {
        if (edge.sourceId == selected.id &&
            nodeById.containsKey(edge.targetId)) {
          directIds.add(edge.targetId);
        } else if (edge.targetId == selected.id &&
            nodeById.containsKey(edge.sourceId)) {
          directIds.add(edge.sourceId);
        }
      }
      final direct = directIds
          .map((id) => nodeById[id])
          .whereType<KnowledgeGraphNode>()
          .toList(growable: false);
      final second = nodes
          .where(
            (node) => node.id != selected.id && !directIds.contains(node.id),
          )
          .toList(growable: false);

      final innerRadius = math
          .min(math.max(112.0, shortest * 0.22), shortest * 0.34)
          .toDouble();
      final outerRadius = math
          .min(math.max(innerRadius + 88, shortest * 0.38), shortest * 0.47)
          .toDouble();
      placeFocusRing(
        direct,
        baseRadius: innerRadius,
        ringGap: 62,
        maxPerRing: 16,
        startAngle: -math.pi / 2,
      );
      placeFocusRing(
        second,
        baseRadius: outerRadius,
        ringGap: 54,
        maxPerRing: 24,
        startAngle: -math.pi / 2 + math.pi / 24,
      );
      _relaxPositions(positions, nodes, bounds);
      return true;
    }

    if (placeFocusedEgoLayout()) {
      return positions;
    }

    void placeSparseNodes(
      List<KnowledgeGraphNode> group,
      String parentId,
      Offset origin,
      int depth, {
      required double baseRing,
      required double ringGap,
      int? limit,
    }) {
      final sorted = [...group]
        ..sort((left, right) {
          final rank = _kindRank(left.kind).compareTo(_kindRank(right.kind));
          if (rank != 0) {
            return rank;
          }
          final weight = right.weight.compareTo(left.weight);
          if (weight != 0) {
            return weight;
          }
          return left.label.compareTo(right.label);
        });
      final selected = limit == null ? sorted : sorted.take(limit).toList();
      final startAngle = _stableUnit('$parentId:angle') * math.pi * 2;
      const goldenAngle = math.pi * (3 - 2.23606797749979);
      for (var index = 0; index < selected.length; index += 1) {
        final node = selected[index];
        final ringIndex = math.sqrt(index).floor();
        final angle =
            startAngle +
            index * goldenAngle +
            _stableSigned('$parentId:${node.id}:angle') * 0.46;
        final ring =
            baseRing +
            ringIndex * ringGap +
            _stableUnit('$parentId:${node.id}:ring') * ringGap * 0.38;
        final localOrigin = Offset(
          origin.dx + _stableSigned('$parentId:$depth:x') * 8,
          origin.dy + _stableSigned('$parentId:$depth:y') * 8,
        );
        positions[node.id] = _clampToBounds(
          Offset(
            localOrigin.dx + math.cos(angle) * ring,
            localOrigin.dy + math.sin(angle) * ring,
          ),
          bounds,
        );
        angles[node.id] = angle;
      }
    }

    void placeBranch(
      String parentId,
      double baseAngle,
      int depth,
      Offset origin,
    ) {
      final children = structuralChildren[parentId] ?? const [];
      final taxonomyChildren = children
          .where(
            (node) =>
                node.kind == 'category' ||
                node.kind == 'subcategory' ||
                node.kind == 'domain' ||
                node.kind == 'entity' ||
                node.kind == 'intent',
          )
          .toList();
      if (taxonomyChildren.isNotEmpty) {
        final baseRing =
            math.min(islandRadius * (0.42 + depth * 0.20), shortest * 0.32) +
            math.sqrt(taxonomyChildren.length) * 9;
        placeSparseNodes(
          taxonomyChildren,
          parentId,
          origin,
          depth,
          baseRing: baseRing,
          ringGap: 34 + depth * 8,
        );
        for (final child in taxonomyChildren) {
          placeBranch(
            child.id,
            angles[child.id] ?? baseAngle,
            depth + 1,
            positions[child.id] ?? origin,
          );
        }
      }

      final affairs = children.where((node) => node.kind == 'affair').toList()
        ..sort((left, right) {
          final weight = right.weight.compareTo(left.weight);
          if (weight != 0) {
            return weight;
          }
          return left.label.compareTo(right.label);
        });
      if (affairs.isNotEmpty) {
        placeSparseNodes(
          affairs,
          parentId,
          origin,
          depth,
          baseRing: math.min(
            islandRadius * (0.64 + depth * 0.12) +
                math.sqrt(affairs.length) * 12,
            shortest * 0.38,
          ),
          ringGap: 32,
          limit: 22,
        );
      }
    }

    var domains =
        (structuralChildren[knowledgeGraphRootId] ?? const [])
            .where((node) => node.kind == 'domain')
            .toList()
          ..sort((left, right) => left.label.compareTo(right.label));
    if (domains.isEmpty) {
      domains = nodes.where((node) => node.kind == 'domain').toList()
        ..sort((left, right) => left.label.compareTo(right.label));
    }
    if (domains.isNotEmpty) {
      final columns = math.max(
        1,
        math.min(4, math.sqrt(domains.length).ceil()),
      );
      final rows = (domains.length / columns).ceil();
      final cellWidth = size.width / columns;
      final cellHeight = size.height / rows;
      for (var index = 0; index < domains.length; index += 1) {
        final column = index % columns;
        final row = index ~/ columns;
        final domain = domains[index];
        final origin = Offset(
          cellWidth * (column + 0.5) +
              _stableSigned('${domain.id}:grid-x') * cellWidth * 0.18,
          cellHeight * (row + 0.5) +
              _stableSigned('${domain.id}:grid-y') * cellHeight * 0.18,
        );
        positions[domain.id] = _clampToBounds(origin, bounds);
        angles[domain.id] = _stableUnit('${domain.id}:root') * math.pi * 2;
        placeBranch(domain.id, angles[domain.id] ?? -math.pi / 2, 1, origin);
      }
    }

    for (final entry in satellitesByAffair.entries) {
      final origin = positions[entry.key];
      if (origin == null) {
        continue;
      }
      final satellites = entry.value
          .where((node) => !positions.containsKey(node.id))
          .take(5)
          .toList();
      for (var index = 0; index < satellites.length; index += 1) {
        final baseAngle = angles[entry.key] ?? -math.pi / 2;
        final angle =
            baseAngle -
            math.pi / 3 +
            (math.pi * 2 / 3) * ((index + 1) / (satellites.length + 1));
        final localRadius = 38.0 + (index.isEven ? 0 : 14);
        positions[satellites[index].id] = _clampToBounds(
          Offset(
            origin.dx + math.cos(angle) * localRadius,
            origin.dy + math.sin(angle) * localRadius,
          ),
          bounds,
        );
      }
    }

    final remaining =
        nodes.where((node) => !positions.containsKey(node.id)).toList()
          ..sort((left, right) {
            final weight = right.weight.compareTo(left.weight);
            if (weight != 0) {
              return weight;
            }
            return left.label.compareTo(right.label);
          });
    if (remaining.isNotEmpty) {
      placeSparseNodes(
        remaining,
        'remaining',
        canvasCenter,
        1,
        baseRing: islandRadius * 0.72,
        ringGap: 38,
      );
    }

    _relaxPositions(positions, nodes, bounds);
    return positions;
  }
}

class _KnowledgeGraphNodeMetrics {
  const _KnowledgeGraphNodeMetrics({
    this.degree = 0,
    this.edgeWeight = 0,
    this.count = 0,
  });

  final int degree;
  final double edgeWeight;
  final int count;
}

class _MutableKnowledgeGraphNodeMetrics {
  _MutableKnowledgeGraphNodeMetrics({required this.count});

  int degree = 0;
  double edgeWeight = 0;
  final int count;
}

class _FocusCandidate {
  const _FocusCandidate({required this.node, required this.edge});

  final KnowledgeGraphNode node;
  final KnowledgeGraphEdge edge;
}

class _KnowledgeGraphPainter extends CustomPainter {
  _KnowledgeGraphPainter({required this.layout, required this.selectedNodeId});

  final _KnowledgeGraphLayout layout;
  final String selectedNodeId;

  @override
  void paint(Canvas canvas, Size size) {
    if (layout.nodes.isEmpty || size.isEmpty) {
      return;
    }

    _paintEdges(canvas, layout.positions, layout.edges);
    _paintNodes(canvas, layout.positions, layout.nodes, layout, size);
  }

  void _paintEdges(
    Canvas canvas,
    Map<String, Offset> positions,
    List<KnowledgeGraphEdge> edges,
  ) {
    final paint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.2;
    for (final edge in edges) {
      if (edge.sourceId == knowledgeGraphRootId ||
          edge.targetId == knowledgeGraphRootId) {
        continue;
      }
      final source = positions[edge.sourceId];
      final target = positions[edge.targetId];
      if (source == null || target == null) {
        continue;
      }
      final structural =
          edge.label == '分类' ||
          edge.label == '实体' ||
          edge.label == '意图' ||
          edge.label == '事务';
      final selectedEdge =
          edge.sourceId == selectedNodeId || edge.targetId == selectedNodeId;
      final relation = !(structural || edge.label == '领域');
      if (relation && !selectedEdge) {
        continue;
      }
      final edgeColor = structural
          ? const Color(0xFF94A3B8)
          : _softenGraphColor(_moduleColor(edge.moduleId), 0.42);
      paint
        ..strokeWidth = selectedEdge
            ? 1.35
            : structural
            ? 0.9
            : 0.8
        ..color = edgeColor.withValues(alpha: selectedEdge ? 0.46 : 0.24);
      final mid = Offset(
        (source.dx + target.dx) / 2,
        (source.dy + target.dy) / 2,
      );
      final control = Offset(
        mid.dx + (target.dy - source.dy) * 0.06,
        mid.dy - (target.dx - source.dx) * 0.06,
      );
      final path = Path()
        ..moveTo(source.dx, source.dy)
        ..quadraticBezierTo(control.dx, control.dy, target.dx, target.dy);
      canvas.drawPath(path, paint);
    }
  }

  void _paintNodes(
    Canvas canvas,
    Map<String, Offset> positions,
    List<KnowledgeGraphNode> nodes,
    _KnowledgeGraphLayout layout,
    Size size,
  ) {
    final fill = Paint()..style = PaintingStyle.fill;
    final border = Paint()..style = PaintingStyle.stroke;
    final selectedRing = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2;

    final labelRects = <Rect>[];
    final sortedNodes = [...nodes]
      ..sort((left, right) {
        final rank = _paintRank(left.kind).compareTo(_paintRank(right.kind));
        if (rank != 0) {
          return rank;
        }
        return left.label.compareTo(right.label);
      });

    for (final node in sortedNodes) {
      final offset = positions[node.id];
      if (offset == null) {
        continue;
      }
      final radius = layout.nodeRadius(node);
      final heat = layout.nodeHeat(node);
      final baseColor = _nodeBaseColor(node);
      final selected = node.id == selectedNodeId;
      final fillColor = _nodeFillColor(node, heat, selected: selected);
      final strokeColor = _nodeStrokeColor(node, heat, selected: selected);
      final shadowAlpha = selected ? 0.07 : 0.035 + heat * 0.018;
      final shadowOffset = selected
          ? const Offset(0, 2.5)
          : const Offset(0, 1.5);
      canvas.drawCircle(
        offset + shadowOffset,
        radius + (selected ? 1.2 : 0.8),
        Paint()..color = Colors.black.withValues(alpha: shadowAlpha),
      );
      if (node.id == selectedNodeId) {
        selectedRing.color = baseColor.withValues(alpha: 0.62);
        canvas.drawCircle(offset, radius + 5, selectedRing);
      }
      fill.color = fillColor;
      canvas.drawCircle(offset, radius, fill);
      border
        ..strokeWidth = selected ? 1.55 : 1.05 + heat * 0.22
        ..color = strokeColor;
      canvas.drawCircle(offset, radius, border);
      _paintLabel(
        canvas,
        node,
        offset.translate(0, radius + 5),
        radius,
        heat,
        selected,
        labelRects,
        size,
      );
    }
  }

  int _paintRank(String kind) {
    return switch (kind) {
      'domain' => 0,
      'category' => 1,
      'subcategory' => 2,
      'entity' => 3,
      'intent' => 4,
      'affair' => 5,
      _ => 6,
    };
  }

  void _paintLabel(
    Canvas canvas,
    KnowledgeGraphNode node,
    Offset offset,
    double radius,
    double heat,
    bool selected,
    List<Rect> labelRects,
    Size size,
  ) {
    final showLabel =
        selected ||
        const {
          'domain',
          'category',
          'subcategory',
          'entity',
          'intent',
        }.contains(node.kind) ||
        (node.kind == 'affair' && (node.weight >= 1.65 || heat >= 0.32)) ||
        (const {'person', 'keyword', 'time'}.contains(node.kind) &&
            heat >= 0.5);
    if (!showLabel) {
      return;
    }
    final bonusChars = (heat * 6).round();
    final maxChars = node.kind == 'domain'
        ? 12 + bonusChars
        : node.kind == 'entity'
        ? 16 + bonusChars
        : node.kind == 'intent'
        ? 14 + bonusChars
        : node.kind == 'affair'
        ? 18 + bonusChars
        : 14 + bonusChars;
    final label = node.label.length > maxChars
        ? '${node.label.substring(0, maxChars)}...'
        : node.label;
    final painter =
        TextPainter(
          text: TextSpan(
            text: label,
            style: TextStyle(
              color: node.kind == 'root'
                  ? AgentStudioColors.primary
                  : AgentStudioColors.text.withValues(
                      alpha: selected ? 0.94 : 0.68 + heat * 0.18,
                    ),
              fontSize: node.kind == 'domain'
                  ? 12 + heat * 0.75
                  : node.kind == 'entity'
                  ? 11 + heat * 0.8
                  : node.kind == 'intent'
                  ? 10.4 + heat * 0.7
                  : node.kind == 'affair'
                  ? 9.6 + heat * 0.7
                  : 10 + heat * 0.6,
              fontWeight:
                  node.kind == 'domain' ||
                      node.kind == 'category' ||
                      node.kind == 'subcategory' ||
                      node.kind == 'entity' ||
                      node.kind == 'intent'
                  ? FontWeight.w700
                  : FontWeight.w600,
            ),
          ),
          textDirection: TextDirection.ltr,
          maxLines: 1,
          ellipsis: '...',
        )..layout(
          maxWidth: node.kind == 'affair'
              ? 96 + heat * 32
              : node.kind == 'intent'
              ? 92 + heat * 28
              : node.kind == 'entity'
              ? 104 + heat * 34
              : 112 + heat * 28,
        );
    var labelOffset = Offset(offset.dx - painter.width / 2, offset.dy);
    final rect = labelOffset & Size(painter.width, painter.height);
    if (rect.left < 0 ||
        rect.right > size.width ||
        rect.top < 0 ||
        rect.bottom > size.height) {
      return;
    }
    if (labelRects.any((existing) => existing.inflate(4).overlaps(rect))) {
      return;
    }
    labelRects.add(rect);
    painter.paint(canvas, labelOffset);
  }

  Color _nodeBaseColor(KnowledgeGraphNode node) {
    return switch (node.kind) {
      'root' => const Color(0xFF4F46E5),
      'module' => _moduleColor(node.moduleId),
      'affair' => const Color(0xFF9A6A2F),
      'domain' => const Color(0xFF6D5D9C),
      'category' => const Color(0xFF4F74A8),
      'subcategory' => const Color(0xFF4B837C),
      'entity' => const Color(0xFF3F7F8F),
      'intent' => const Color(0xFF6F6BA7),
      'evidence' => const Color(0xFF64748B),
      'person' => const Color(0xFF4F846B),
      'keyword' => const Color(0xFF8A6684),
      'time' => const Color(0xFF6870A4),
      'mail' || 'thread' || 'folder' => const Color(0xFF475569),
      'transaction' => const Color(0xFF9A6A2F),
      'checkpoint' => const Color(0xFF6D5D9C),
      'run' => const Color(0xFF4F74A8),
      'file' => const Color(0xFF64748B),
      'index' || 'documentCount' || 'segmentCount' => const Color(0xFF4F846B),
      'import' => const Color(0xFFA67836),
      _ => _moduleColor(node.moduleId),
    };
  }

  Color _nodeFillColor(
    KnowledgeGraphNode node,
    double heat, {
    required bool selected,
  }) {
    final base = _nodeBaseColor(node);
    final tint = selected ? 0.34 : 0.16 + heat * 0.12;
    final opacity = selected ? 0.92 : 0.74 + heat * 0.12;
    return Color.lerp(
      Colors.white,
      base,
      tint,
    )!.withValues(alpha: opacity.clamp(0.68, 0.92).toDouble());
  }

  Color _nodeStrokeColor(
    KnowledgeGraphNode node,
    double heat, {
    required bool selected,
  }) {
    final base = _nodeBaseColor(node);
    final opacity = selected ? 0.68 : 0.34 + heat * 0.2;
    return base.withValues(alpha: opacity.clamp(0.3, 0.7).toDouble());
  }

  Color _softenGraphColor(Color color, double amount) {
    return Color.lerp(const Color(0xFF64748B), color, amount) ?? color;
  }

  Color _moduleColor(String moduleId) {
    return switch (moduleId) {
      'mail' => const Color(0xFF4F846B),
      'affair' => const Color(0xFF9A6A2F),
      'runtime' => const Color(0xFF4F74A8),
      _ => const Color(0xFF6D5D9C),
    };
  }

  @override
  bool shouldRepaint(covariant _KnowledgeGraphPainter oldDelegate) {
    return oldDelegate.layout != layout ||
        oldDelegate.selectedNodeId != selectedNodeId;
  }
}

class _KnowledgeGraphDataSourceTile extends StatelessWidget {
  const _KnowledgeGraphDataSourceTile({required this.source});

  final KnowledgeGraphDataSourceStatus source;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AgentStudioColors.surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AgentStudioColors.line),
      ),
      child: Row(
        children: [
          Icon(
            source.enabled
                ? Icons.power_settings_new
                : Icons.power_off_outlined,
            color: source.enabled
                ? AgentStudioColors.success
                : AgentStudioColors.textMuted,
            size: 18,
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  source.label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(
                    context,
                  ).textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w800),
                ),
                const SizedBox(height: 4),
                Text(
                  '${source.nodeCount} 节点 / ${source.edgeCount} 边',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: AgentStudioColors.textMuted,
                  ),
                ),
              ],
            ),
          ),
          _StatusPill(label: source.enabled ? '已接入' : '停用'),
        ],
      ),
    );
  }
}

class _KnowledgeGraphNodeTile extends StatelessWidget {
  const _KnowledgeGraphNodeTile({
    required this.node,
    required this.selected,
    required this.onTap,
  });

  final KnowledgeGraphNode node;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: selected
                ? AgentStudioColors.surfaceHigh
                : AgentStudioColors.surface,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(
              color: selected
                  ? AgentStudioColors.primaryStrong
                  : AgentStudioColors.line,
            ),
          ),
          child: Row(
            children: [
              Icon(
                _nodeIcon(node.kind),
                color: AgentStudioColors.primary,
                size: 18,
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      node.label,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      '${node.kind} · ${node.moduleId}',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: AgentStudioColors.textMuted,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  IconData _nodeIcon(String kind) {
    return switch (kind) {
      'mail' => Icons.mail_outline,
      'affair' => Icons.workspaces_outline,
      'evidence' => Icons.article_outlined,
      'person' => Icons.person_outline,
      'folder' => Icons.folder_outlined,
      'domain' => Icons.category_outlined,
      'category' => Icons.account_tree_outlined,
      'subcategory' => Icons.label_outline,
      'month' => Icons.calendar_month_outlined,
      'keyword' => Icons.tag_outlined,
      'thread' => Icons.forum_outlined,
      'transaction' => Icons.swap_horiz_outlined,
      'checkpoint' => Icons.account_tree_outlined,
      'run' => Icons.play_circle_outline,
      'file' => Icons.description_outlined,
      'module' => Icons.extension_outlined,
      'index' || 'documentCount' || 'segmentCount' => Icons.storage_outlined,
      _ => Icons.circle_outlined,
    };
  }
}

class _KnowledgeGraphRelationTile extends StatelessWidget {
  const _KnowledgeGraphRelationTile({
    required this.edge,
    required this.selectedNodeId,
    required this.nodeById,
  });

  final KnowledgeGraphEdge edge;
  final String selectedNodeId;
  final Map<String, KnowledgeGraphNode> nodeById;

  @override
  Widget build(BuildContext context) {
    final outgoing = edge.sourceId == selectedNodeId;
    final relatedNodeId = outgoing ? edge.targetId : edge.sourceId;
    final relatedNode = nodeById[relatedNodeId];
    final relatedLabel = relatedNode?.label ?? relatedNodeId;
    final relatedKind = relatedNode?.kind ?? 'unknown';
    return Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: AgentStudioColors.surface,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: AgentStudioColors.line),
      ),
      child: Row(
        children: [
          Icon(
            outgoing ? Icons.arrow_forward : Icons.arrow_back,
            color: AgentStudioColors.primary,
            size: 16,
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  edge.label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(
                    context,
                  ).textTheme.bodySmall?.copyWith(fontWeight: FontWeight.w800),
                ),
                const SizedBox(height: 3),
                Text(
                  '$relatedLabel · $relatedKind',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: AgentStudioColors.textMuted,
                  ),
                ),
              ],
            ),
          ),
          if (edge.weight > 1)
            _StatusPill(label: edge.weight.toStringAsFixed(1)),
        ],
      ),
    );
  }
}

class _KnowledgeTimelineTile extends StatelessWidget {
  const _KnowledgeTimelineTile({required this.event, required this.onOpen});

  final KnowledgeTimelineEvent event;
  final VoidCallback? onOpen;

  @override
  Widget build(BuildContext context) {
    final date = event.timestamp.year <= 1970
        ? ''
        : '${event.timestamp.year}-${event.timestamp.month.toString().padLeft(2, '0')}-${event.timestamp.day.toString().padLeft(2, '0')}';
    final meta = [
      if (date.isNotEmpty) date,
      if (event.participants.isNotEmpty) event.participants.join(' / '),
      if (event.evidenceCount > 1) '${event.evidenceCount} 封证据',
    ].where((item) => item.trim().isNotEmpty).join(' · ');

    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onOpen,
        borderRadius: BorderRadius.circular(10),
        child: Container(
          padding: const EdgeInsets.all(10),
          decoration: BoxDecoration(
            color: AgentStudioColors.surface,
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: AgentStudioColors.line),
          ),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Padding(
                padding: const EdgeInsets.only(top: 4),
                child: Container(
                  width: 10,
                  height: 10,
                  decoration: const BoxDecoration(
                    color: AgentStudioColors.primary,
                    shape: BoxShape.circle,
                  ),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        _StatusPill(label: event.stage),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            event.title,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: Theme.of(context).textTheme.bodySmall
                                ?.copyWith(fontWeight: FontWeight.w800),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 6),
                    Text(
                      event.summary,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: AgentStudioColors.text,
                      ),
                    ),
                    if (meta.isNotEmpty) ...[
                      const SizedBox(height: 5),
                      Text(
                        meta,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: Theme.of(context).textTheme.bodySmall?.copyWith(
                          color: AgentStudioColors.textMuted,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
              if (onOpen != null) ...[
                const SizedBox(width: 8),
                const Padding(
                  padding: EdgeInsets.only(top: 3),
                  child: Icon(
                    Icons.open_in_new,
                    color: AgentStudioColors.textMuted,
                    size: 15,
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _KnowledgeSearchResultTile extends StatelessWidget {
  const _KnowledgeSearchResultTile({
    required this.result,
    required this.onOpen,
  });

  final MacOSMailIndexSearchResult result;
  final VoidCallback onOpen;

  @override
  Widget build(BuildContext context) {
    final title = result.subject.trim().isEmpty
        ? result.fileName
        : result.subject.trim();
    final meta = [
      result.sender,
      result.mailboxPath,
      _compactDate(
        result.dateReceived.isEmpty ? result.dateSent : result.dateReceived,
      ),
    ].where((item) => item.trim().isNotEmpty).join(' · ');

    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onOpen,
        borderRadius: BorderRadius.circular(10),
        child: Container(
          padding: const EdgeInsets.all(10),
          decoration: BoxDecoration(
            color: AgentStudioColors.surface,
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: AgentStudioColors.line),
          ),
          child: Row(
            children: [
              const Icon(
                Icons.mail_outline,
                color: AgentStudioColors.primary,
                size: 16,
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    if (meta.isNotEmpty) ...[
                      const SizedBox(height: 3),
                      Text(
                        meta,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: Theme.of(context).textTheme.bodySmall?.copyWith(
                          color: AgentStudioColors.textMuted,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
              const SizedBox(width: 8),
              const Icon(
                Icons.open_in_new,
                color: AgentStudioColors.textMuted,
                size: 15,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

String _compactDate(String value) {
  final trimmed = value.trim();
  if (trimmed.isEmpty) {
    return '';
  }
  final parsed = DateTime.tryParse(trimmed);
  if (parsed != null) {
    return '${parsed.year}-${parsed.month.toString().padLeft(2, '0')}-${parsed.day.toString().padLeft(2, '0')}';
  }
  return trimmed.length > 36 ? trimmed.substring(0, 36) : trimmed;
}

class _SectionCard extends StatelessWidget {
  const _SectionCard({
    required this.title,
    required this.subtitle,
    required this.child,
    this.leading,
    this.surfaceColor = AgentStudioColors.surface,
  });

  final String title;
  final String subtitle;
  final Widget child;
  final Widget? leading;
  final Color surfaceColor;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: surfaceColor,
        borderRadius: BorderRadius.circular(18),
        border: const Border.fromBorderSide(
          BorderSide(color: AgentStudioColors.line),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              if (leading != null) ...[leading!, const SizedBox(width: 8)],
              Text(
                title,
                style: Theme.of(context).textTheme.titleSmall?.copyWith(
                  fontWeight: FontWeight.w800,
                  letterSpacing: 0.3,
                ),
              ),
              const Spacer(),
              Text(
                subtitle,
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                  color: AgentStudioColors.textMuted,
                ),
              ),
            ],
          ),
          const SizedBox(height: 18),
          child,
        ],
      ),
    );
  }
}

class _LogLineTile extends StatelessWidget {
  const _LogLineTile({required this.line, required this.newest});

  final String line;
  final bool newest;

  @override
  Widget build(BuildContext context) {
    final separatorIndex = line.indexOf('  ');
    final timestamp = separatorIndex > 0
        ? line.substring(0, separatorIndex)
        : '';
    final message = separatorIndex > 0
        ? line.substring(separatorIndex + 2).trimLeft()
        : line;
    final textTheme = Theme.of(context).textTheme;

    return RepaintBoundary(
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: newest ? AgentStudioColors.surfaceHigh : Colors.transparent,
          border: const Border(bottom: BorderSide(color: AgentStudioColors.line)),
        ),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                timestamp,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: textTheme.labelSmall?.copyWith(
                  color: AgentStudioColors.textMuted,
                  fontFamily: 'monospace',
                  fontFeatures: const [FontFeature.tabularFigures()],
                ),
              ),
              const SizedBox(height: 4),
              Text(
                message,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: textTheme.bodySmall?.copyWith(
                  color: AgentStudioColors.text,
                  fontFamily: 'monospace',
                  height: 1.25,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _MailImportProgressPanel extends StatelessWidget {
  const _MailImportProgressPanel({
    super.key,
    required this.title,
    required this.statusLabel,
    required this.queueLabel,
    required this.progress,
    required this.downloaded,
    required this.total,
    required this.uploadProgress,
  });

  final String title;
  final String statusLabel;
  final String queueLabel;
  final double? progress;
  final int downloaded;
  final int total;
  final double? uploadProgress;

  @override
  Widget build(BuildContext context) {
    final progressText = total > 0 ? '$downloaded/$total' : '$downloaded/-';
    return Padding(
      padding: const EdgeInsets.only(top: 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  title,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: AgentStudioColors.text,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
              if (queueLabel.isNotEmpty) ...[
                const SizedBox(width: 10),
                Flexible(
                  child: Text(
                    queueLabel,
                    textAlign: TextAlign.right,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(
                      color: AgentStudioColors.textMuted,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
              ],
            ],
          ),
          if (statusLabel.isNotEmpty) ...[
            const SizedBox(height: 6),
            Text(
              statusLabel,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: Theme.of(
                context,
              ).textTheme.bodySmall?.copyWith(color: AgentStudioColors.textMuted),
            ),
          ],
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(
                child: _MailSyncProgressBar(
                  localProgress: progress,
                  cloudProgress: uploadProgress,
                ),
              ),
              const SizedBox(width: 10),
              ConstrainedBox(
                constraints: const BoxConstraints(minWidth: 104),
                child: Text(
                  progressText,
                  textAlign: TextAlign.right,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: AgentStudioColors.textMuted,
                    fontFeatures: const [FontFeature.tabularFigures()],
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _MailSyncProgressBar extends StatelessWidget {
  const _MailSyncProgressBar({
    required this.localProgress,
    required this.cloudProgress,
  });

  final double? localProgress;
  final double? cloudProgress;

  @override
  Widget build(BuildContext context) {
    final local = localProgress?.clamp(0.0, 1.0).toDouble();
    if (local == null) {
      return ClipRRect(
        borderRadius: BorderRadius.circular(999),
        child: const LinearProgressIndicator(
          minHeight: 4,
          backgroundColor: AgentStudioColors.surfaceHighest,
          valueColor: AlwaysStoppedAnimation<Color>(AgentStudioColors.warning),
        ),
      );
    }
    final cloud = cloudProgress == null
        ? 0.0
        : math.min(local, cloudProgress!.clamp(0.0, 1.0).toDouble());
    return ClipRRect(
      borderRadius: BorderRadius.circular(999),
      child: SizedBox(
        height: 4,
        child: Stack(
          fit: StackFit.expand,
          children: [
            const ColoredBox(color: AgentStudioColors.surfaceHighest),
            FractionallySizedBox(
              alignment: Alignment.centerLeft,
              widthFactor: local,
              child: const SizedBox.expand(
                child: ColoredBox(color: AgentStudioColors.warning),
              ),
            ),
            FractionallySizedBox(
              alignment: Alignment.centerLeft,
              widthFactor: cloud,
              child: const SizedBox.expand(
                child: ColoredBox(color: AgentStudioColors.primaryStrong),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _SidebarItem extends StatelessWidget {
  const _SidebarItem({
    required this.label,
    required this.icon,
    required this.active,
    required this.onTap,
  });

  final String label;
  final IconData icon;
  final bool active;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
        decoration: BoxDecoration(
          color: active ? AgentStudioColors.surface : Colors.transparent,
          borderRadius: BorderRadius.circular(12),
        ),
        child: Row(
          children: [
            Icon(
              icon,
              size: 18,
              color: active ? AgentStudioColors.primary : AgentStudioColors.textMuted,
            ),
            const SizedBox(width: 10),
            Text(
              label,
              style: TextStyle(
                color: active
                    ? AgentStudioColors.primary
                    : AgentStudioColors.textMuted,
                fontWeight: active ? FontWeight.w700 : FontWeight.w600,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _DataConnectorTile extends StatelessWidget {
  const _DataConnectorTile({
    required this.connector,
    required this.onToggle,
    required this.onAuth,
    required this.onSync,
  });

  final Map<String, dynamic> connector;
  final ValueChanged<bool> onToggle;
  final VoidCallback onAuth;
  final VoidCallback onSync;

  @override
  Widget build(BuildContext context) {
    final providerId = (connector['providerId'] ?? '').toString();
    final displayName = (connector['displayName'] ?? providerId).toString();
    final sourceType = (connector['sourceType'] ?? '').toString();
    final installed = connector['installed'] == true;
    final enabled = connector['enabled'] == true;
    final auth = connector['auth'] is Map
        ? Map<String, dynamic>.from(connector['auth'] as Map)
        : const <String, dynamic>{};
    final authStatus = (auth['status'] ?? 'unknown').toString();
    final lastSync = connector['lastSync'] is Map
        ? Map<String, dynamic>.from(connector['lastSync'] as Map)
        : const <String, dynamic>{};
    final syncStatus = (lastSync['status'] ?? '未同步').toString();
    final itemCount = (lastSync['itemCount'] as num?)?.toInt();
    final canAuth = authStatus != 'not_required';
    final canSync = installed && enabled;
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AgentStudioColors.surfaceHigh,
        borderRadius: BorderRadius.circular(12),
        border: const Border.fromBorderSide(
          BorderSide(color: AgentStudioColors.line),
        ),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          CircleAvatar(
            radius: 20,
            backgroundColor: enabled
                ? AgentStudioColors.primaryStrong
                : AgentStudioColors.surfaceHighest,
            child: Icon(
              _connectorIcon(sourceType),
              size: 19,
              color: enabled ? Colors.white : AgentStudioColors.textMuted,
            ),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        displayName,
                        style: Theme.of(context).textTheme.titleSmall
                            ?.copyWith(fontWeight: FontWeight.w800),
                      ),
                    ),
                    _StatusPill(label: enabled ? '启用' : installed ? '停用' : '可安装'),
                  ],
                ),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    _StatusPill(label: providerId),
                    _StatusPill(label: sourceType),
                    _StatusPill(label: '授权 $authStatus'),
                    _StatusPill(
                      label: itemCount == null
                          ? '同步 $syncStatus'
                          : '同步 $syncStatus · $itemCount',
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    _SecondaryActionButton(
                      label: canAuth ? '授权' : '无需授权',
                      icon: Icons.key_outlined,
                      onPressed: canAuth ? onAuth : null,
                    ),
                    _SecondaryActionButton(
                      label: '同步',
                      icon: Icons.sync_outlined,
                      onPressed: canSync ? onSync : null,
                    ),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(width: 12),
          Switch.adaptive(value: enabled, onChanged: onToggle),
        ],
      ),
    );
  }

  static IconData _connectorIcon(String sourceType) {
    return switch (sourceType) {
      'chat' => Icons.forum_outlined,
      'mail' => Icons.mail_outline,
      'file' => Icons.folder_copy_outlined,
      'knowledge' => Icons.menu_book_outlined,
      _ => Icons.hub_outlined,
    };
  }
}

class _PrimaryActionButton extends StatelessWidget {
  const _PrimaryActionButton({required this.label, this.icon, this.onPressed});

  final String label;
  final IconData? icon;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    final baseStyle = FilledButton.styleFrom(
      backgroundColor: AgentStudioColors.primary,
      foregroundColor: Colors.white,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
    );

    if (icon == null) {
      return FilledButton(
        onPressed: onPressed,
        style: baseStyle,
        child: Text(label),
      );
    }

    return FilledButton.icon(
      onPressed: onPressed,
      style: baseStyle,
      icon: Icon(icon, size: 18),
      label: Text(label),
    );
  }
}

class _BinaryCheckbox extends StatefulWidget {
  const _BinaryCheckbox({
    required this.label,
    required this.value,
    required this.onChanged,
    this.disabled = false,
  });

  final String label;
  final bool value;
  final ValueChanged<bool> onChanged;
  final bool disabled;

  @override
  State<_BinaryCheckbox> createState() => _BinaryCheckboxState();
}

class _BinaryCheckboxState extends State<_BinaryCheckbox> {
  bool _hovered = false;
  bool _focused = false;

  @override
  Widget build(BuildContext context) {
    final interactive = !widget.disabled;
    final highlighted = interactive && (_hovered || _focused);
    final checked = widget.value;
    final labelColor = widget.disabled
        ? AgentStudioColors.textMuted
        : checked || highlighted
        ? AgentStudioColors.primaryStrong
        : AgentStudioColors.text;

    return Semantics(
      checked: checked,
      button: true,
      label: widget.label,
      child: FocusableActionDetector(
        enabled: interactive,
        onShowFocusHighlight: (focused) {
          if (_focused != focused) {
            setState(() => _focused = focused);
          }
        },
        onShowHoverHighlight: (hovered) {
          if (_hovered != hovered) {
            setState(() => _hovered = hovered);
          }
        },
        child: Material(
          color: Colors.transparent,
          child: InkWell(
            onTap: interactive ? () => widget.onChanged(!checked) : null,
            borderRadius: BorderRadius.circular(8),
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 120),
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
              decoration: BoxDecoration(
                color: highlighted
                    ? const Color(0xffeff6ff)
                    : Colors.transparent,
                borderRadius: BorderRadius.circular(8),
                border: Border.all(
                  color: highlighted
                      ? AgentStudioColors.primaryStrong.withValues(alpha: 0.32)
                      : Colors.transparent,
                ),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  AnimatedContainer(
                    duration: const Duration(milliseconds: 120),
                    width: 16,
                    height: 16,
                    decoration: BoxDecoration(
                      color: checked && !widget.disabled
                          ? AgentStudioColors.primaryStrong
                          : Colors.transparent,
                      borderRadius: BorderRadius.circular(4),
                      border: Border.all(
                        color: checked && !widget.disabled
                            ? AgentStudioColors.primaryStrong
                            : AgentStudioColors.line,
                      ),
                    ),
                    child: checked
                        ? const Icon(Icons.check, size: 12, color: Colors.white)
                        : const SizedBox.shrink(),
                  ),
                  SizedBox(
                    width:
                        DefaultTextStyle.of(
                          context,
                        ).style.fontSize?.clamp(10, 18).toDouble() ??
                        14,
                  ),
                  Text(
                    widget.label,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(
                      color: labelColor,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _SecondaryActionButton extends StatelessWidget {
  const _SecondaryActionButton({
    required this.label,
    required this.icon,
    this.onPressed,
  });

  final String label;
  final IconData icon;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    return OutlinedButton.icon(
      onPressed: onPressed,
      style: OutlinedButton.styleFrom(
        backgroundColor: AgentStudioColors.surfaceHigh,
        foregroundColor: AgentStudioColors.textMuted,
        side: const BorderSide(color: AgentStudioColors.line),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
      icon: Icon(icon, size: 16),
      label: Text(label),
    );
  }
}

class _ExportButton extends StatelessWidget {
  const _ExportButton({
    required this.label,
    this.onPressed,
    this.accent = false,
  });

  final String label;
  final VoidCallback? onPressed;
  final bool accent;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: double.infinity,
      child: FilledButton(
        onPressed: onPressed,
        style: FilledButton.styleFrom(
          backgroundColor: accent
              ? AgentStudioColors.primaryStrong
              : AgentStudioColors.surfaceLow,
          foregroundColor: accent ? Colors.white : AgentStudioColors.text,
          disabledBackgroundColor: AgentStudioColors.surfaceHighest,
          disabledForegroundColor: AgentStudioColors.textMuted,
          elevation: 0,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
            side: const BorderSide(color: AgentStudioColors.line),
          ),
          padding: const EdgeInsets.symmetric(vertical: 14),
        ),
        child: Text(label),
      ),
    );
  }
}

class _RunTile extends StatelessWidget {
  const _RunTile({
    required this.run,
    required this.active,
    required this.onTap,
  });

  final RecentRun run;
  final bool active;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(14),
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: active
              ? AgentStudioColors.surface
              : AgentStudioColors.surfaceHighest,
          borderRadius: BorderRadius.circular(14),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    run.inputPreview,
                    style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                      fontWeight: FontWeight.w700,
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                const SizedBox(width: 8),
                _StatusPill(label: displayJobStatus(run.status)),
              ],
            ),
            const SizedBox(height: 8),
            Text(
              '${run.fileCount} 个文件 • ${displayStageLabel(run.stage)}',
              style: Theme.of(
                context,
              ).textTheme.bodySmall?.copyWith(color: AgentStudioColors.textMuted),
            ),
          ],
        ),
      ),
    );
  }
}

class _CheckpointTile extends StatelessWidget {
  const _CheckpointTile({
    required this.node,
    required this.active,
    required this.onTap,
  });

  final CheckpointNode node;
  final bool active;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(14),
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: active
              ? AgentStudioColors.surface
              : AgentStudioColors.surfaceHighest,
          borderRadius: BorderRadius.circular(14),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    node.summary.isEmpty
                        ? shortId(node.checkpointId)
                        : node.summary,
                    style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                      fontWeight: FontWeight.w700,
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                const SizedBox(width: 8),
                _StatusPill(label: checkpointStateLabel(node.state)),
              ],
            ),
            const SizedBox(height: 8),
            Text(
              '${checkpointModeLabel(node.mode)} • ${node.fileCount} 个文件 • ${shortId(node.checkpointId)}',
              style: Theme.of(
                context,
              ).textTheme.bodySmall?.copyWith(color: AgentStudioColors.textMuted),
            ),
          ],
        ),
      ),
    );
  }
}

class _UploadSessionTile extends StatefulWidget {
  const _UploadSessionTile({
    required this.node,
    required this.uploadedAt,
    this.files = const [],
  });

  final CheckpointNode node;
  final String uploadedAt;
  final List<UploadSessionFileInfo> files;

  @override
  State<_UploadSessionTile> createState() => _UploadSessionTileState();
}

class _UploadSessionTileState extends State<_UploadSessionTile> {
  final Set<String> _expandedFolders = <String>{};

  @override
  void initState() {
    super.initState();
    _syncFolderExpansionState(forceExpandAll: false);
  }

  @override
  void didUpdateWidget(covariant _UploadSessionTile oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.files != widget.files) {
      _syncFolderExpansionState(forceExpandAll: false);
    }
  }

  void _syncFolderExpansionState({required bool forceExpandAll}) {
    final root = _buildUploadSessionFolderTree(widget.files);
    final folderPaths = _collectFolderPaths(root);
    if (forceExpandAll || _expandedFolders.isEmpty) {
      _expandedFolders
        ..clear()
        ..addAll(folderPaths);
      return;
    }
    _expandedFolders.retainWhere(folderPaths.contains);
  }

  void _toggleFolder(String path) {
    setState(() {
      if (_expandedFolders.contains(path)) {
        _expandedFolders.remove(path);
      } else {
        _expandedFolders.add(path);
      }
    });
  }

  List<Widget> _buildFolderTreeWidgets({
    required _UploadSessionFolderNode parent,
    required CheckpointState sessionState,
    required double leftPadding,
  }) {
    final items = <Widget>[];
    final folders = parent.folders.values.toList()
      ..sort((left, right) => left.name.compareTo(right.name));
    final files = parent.files.toList()
      ..sort((left, right) {
        final leftName = left.name.toLowerCase();
        final rightName = right.name.toLowerCase();
        return leftName.compareTo(rightName);
      });

    for (var i = 0; i < folders.length; i++) {
      final folder = folders[i];
      final hasChildren = folder.files.isNotEmpty || folder.folders.isNotEmpty;
      final isExpanded = _expandedFolders.contains(folder.path);
      items.add(
        Padding(
          padding: EdgeInsets.only(left: leftPadding),
          child: _UploadSessionFolderCard(
            node: folder,
            expanded: isExpanded,
            hasChildren: hasChildren,
            onToggle: hasChildren ? () => _toggleFolder(folder.path) : null,
          ),
        ),
      );
      if (isExpanded && hasChildren) {
        final children = _buildFolderTreeWidgets(
          parent: folder,
          sessionState: sessionState,
          leftPadding: leftPadding + 16,
        );
        if (children.isNotEmpty) {
          items.add(
            Padding(
              padding: EdgeInsets.only(left: leftPadding + 12),
              child: Container(
                padding: const EdgeInsets.only(left: 10),
                decoration: const BoxDecoration(
                  border: Border(
                    left: BorderSide(color: AgentStudioColors.surfaceHighest),
                  ),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: children,
                ),
              ),
            ),
          );
        }
      }
      if (i < folders.length - 1 || files.isNotEmpty) {
        items.add(const SizedBox(height: 8));
      }
    }

    for (var i = 0; i < files.length; i++) {
      final file = _fileForSessionDisplay(files[i], sessionState);
      items.add(
        _UploadSessionFileLineCard(
          prefix: _treePrefix(parent.depth),
          file: file,
          depth: parent.depth,
          statusLabel: _uploadFileStatus(file, sessionState),
          uploadedAt: file.completedAt,
          fallbackUploadedAt: widget.uploadedAt,
          leftPadding: leftPadding,
        ),
      );
      if (i < files.length - 1) {
        items.add(const SizedBox(height: 8));
      }
    }
    return items;
  }

  Set<String> _collectFolderPaths(_UploadSessionFolderNode node) {
    final paths = <String>{};
    for (final child in node.folders.values) {
      paths.add(child.path);
      paths.addAll(_collectFolderPaths(child));
    }
    return paths;
  }

  String _treePrefix(int depth) {
    if (depth <= 0) {
      return '';
    }
    return '${'  ' * (depth - 1)}└─ ';
  }

  _UploadSessionFolderNode _buildUploadSessionFolderTree(
    List<UploadSessionFileInfo> sessionFiles,
  ) {
    final root = _UploadSessionFolderNode(name: '', depth: 0, path: '');
    if (sessionFiles.isEmpty) {
      return root;
    }

    final sortedFiles = [...sessionFiles]
      ..sort((left, right) {
        final leftPath = _normalizeFilePath(left).toLowerCase();
        final rightPath = _normalizeFilePath(right).toLowerCase();
        return leftPath.compareTo(rightPath);
      });

    for (final file in sortedFiles) {
      var current = root;
      var currentPath = '';
      final segments = _normalizeFilePath(
        file,
      ).split('/').where((item) => item.isNotEmpty).toList();
      final fileName = segments.isNotEmpty ? segments.last : file.name;
      final dirs = segments.length > 1
          ? segments.sublist(0, segments.length - 1)
          : [];
      for (final dir in dirs) {
        currentPath = currentPath.isEmpty ? dir : '$currentPath/$dir';
        current = current.folders.putIfAbsent(
          currentPath,
          () => _UploadSessionFolderNode(
            name: dir,
            depth: current.depth + 1,
            path: currentPath,
          ),
        );
      }
      final updated = UploadSessionFileInfo(
        index: file.index,
        name: fileName,
        relativePath: _normalizeFilePath(file),
        mediaType: file.mediaType,
        sha256: file.sha256,
        byteSize: file.byteSize,
        receivedBytes: file.receivedBytes,
        completed: file.completed,
        completedAt: file.completedAt,
      );
      current.files.add(updated);
    }

    return root;
  }

  String _normalizeFilePath(UploadSessionFileInfo file) {
    final raw = file.relativePath.isNotEmpty ? file.relativePath : file.name;
    return raw.replaceAll('\\', '/');
  }

  String _uploadFileStatus(
    UploadSessionFileInfo file,
    CheckpointState sessionState,
  ) {
    if (sessionState == CheckpointState.networkInterrupted) {
      return checkpointStateLabel(sessionState);
    }
    if (sessionState == CheckpointState.failed) {
      return checkpointStateLabel(sessionState);
    }
    if (sessionState == CheckpointState.manualStopped) {
      return checkpointStateLabel(sessionState);
    }
    if (_isUploadCompleteSessionState(sessionState)) {
      return '已完成';
    }
    if (file.completed ||
        file.receivedBytes >= file.byteSize && file.byteSize > 0) {
      return '已完成';
    }
    if (file.receivedBytes > 0) {
      return '上传中';
    }
    return '等待上传';
  }

  UploadSessionFileInfo _fileForSessionDisplay(
    UploadSessionFileInfo file,
    CheckpointState sessionState,
  ) {
    if (!_isUploadCompleteSessionState(sessionState) ||
        file.completed ||
        file.receivedBytes > 0 ||
        file.byteSize <= 0) {
      return file;
    }
    return UploadSessionFileInfo(
      index: file.index,
      name: file.name,
      relativePath: file.relativePath,
      mediaType: file.mediaType,
      sha256: file.sha256,
      byteSize: file.byteSize,
      receivedBytes: file.byteSize,
      completed: true,
      completedAt: file.completedAt,
    );
  }

  bool _isUploadCompleteSessionState(CheckpointState state) {
    return switch (state) {
      CheckpointState.uploadVerified ||
      CheckpointState.serverProcessing ||
      CheckpointState.serverCompleted ||
      CheckpointState.clientConfirmed => true,
      _ => false,
    };
  }

  @override
  Widget build(BuildContext context) {
    final root = _buildUploadSessionFolderTree(widget.files);
    final treeWidgets = _buildFolderTreeWidgets(
      parent: root,
      sessionState: widget.node.state,
      leftPadding: 0,
    );
    if (treeWidgets.isEmpty) {
      return const _EmptyPanel(label: '当前上传记录没有可显示的文件。');
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: treeWidgets,
    );
  }
}

class _UploadSessionFolderNode {
  _UploadSessionFolderNode({
    required this.name,
    required this.depth,
    required this.path,
  });

  final String name;
  final int depth;
  final String path;
  final Map<String, _UploadSessionFolderNode> folders = {};
  final List<UploadSessionFileInfo> files = [];
}

class _QueuedFolderNode {
  _QueuedFolderNode({
    required this.name,
    required this.depth,
    required this.path,
  });

  final String name;
  final int depth;
  final String path;
  final Map<String, _QueuedFolderNode> folders = {};
  final List<QueuedFile> files = [];
}

class _QueuedFilesTree extends StatefulWidget {
  const _QueuedFilesTree({required this.files});

  final List<QueuedFile> files;

  @override
  State<_QueuedFilesTree> createState() => _QueuedFilesTreeState();
}

class _QueuedFilesTreeState extends State<_QueuedFilesTree> {
  final Set<String> _expandedFolders = <String>{};

  @override
  void initState() {
    super.initState();
    _syncFolderExpansionState(forceExpandAll: false);
  }

  @override
  void didUpdateWidget(covariant _QueuedFilesTree oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.files != widget.files) {
      _syncFolderExpansionState(forceExpandAll: false);
    }
  }

  void _syncFolderExpansionState({required bool forceExpandAll}) {
    final root = _buildQueuedFolderTree(widget.files);
    final folderPaths = _collectQueuedFolderPaths(root);
    if (forceExpandAll || _expandedFolders.isEmpty) {
      _expandedFolders
        ..clear()
        ..addAll(folderPaths.where((path) => !path.contains('/')).toList());
      return;
    }
    _expandedFolders.retainWhere(folderPaths.contains);
  }

  void _toggleFolder(String path) {
    setState(() {
      if (_expandedFolders.contains(path)) {
        _expandedFolders.remove(path);
      } else {
        _expandedFolders.add(path);
      }
    });
  }

  List<Widget> _buildQueuedFolderTreeWidgets({
    required _QueuedFolderNode parent,
    required double leftPadding,
  }) {
    final items = <Widget>[];
    final folders = parent.folders.values.toList()
      ..sort((left, right) => left.name.compareTo(right.name));
    final files = parent.files.toList()
      ..sort((left, right) {
        final leftPath = _normalizeQueuedPath(left).toLowerCase();
        final rightPath = _normalizeQueuedPath(right).toLowerCase();
        return leftPath.compareTo(rightPath);
      });

    for (var i = 0; i < folders.length; i++) {
      final folder = folders[i];
      final hasChildren = folder.files.isNotEmpty || folder.folders.isNotEmpty;
      final isExpanded = _expandedFolders.contains(folder.path);
      items.add(
        Padding(
          padding: EdgeInsets.only(left: leftPadding),
          child: _UploadSessionFolderCard(
            node: _UploadSessionFolderNode(
              name: folder.name,
              depth: folder.depth,
              path: folder.path,
            ),
            expanded: isExpanded,
            hasChildren: hasChildren,
            onToggle: hasChildren ? () => _toggleFolder(folder.path) : null,
          ),
        ),
      );
      if (isExpanded && hasChildren) {
        final children = _buildQueuedFolderTreeWidgets(
          parent: folder,
          leftPadding: leftPadding + 16,
        );
        if (children.isNotEmpty) {
          items.add(
            Padding(
              padding: EdgeInsets.only(left: leftPadding + 12),
              child: Container(
                padding: const EdgeInsets.only(left: 10),
                decoration: const BoxDecoration(
                  border: Border(
                    left: BorderSide(color: AgentStudioColors.surfaceHighest),
                  ),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: children,
                ),
              ),
            ),
          );
        }
      }
      if (i < folders.length - 1 || files.isNotEmpty) {
        items.add(const SizedBox(height: 8));
      }
    }

    for (var i = 0; i < files.length; i++) {
      final file = files[i];
      final normalizedPath = _normalizeQueuedPath(file);
      final safePath = normalizedPath.isNotEmpty ? normalizedPath : file.name;
      final nameSegments = safePath
          .split('/')
          .where((item) => item.isNotEmpty)
          .toList();
      final displayName = nameSegments.isNotEmpty
          ? nameSegments.last
          : file.name;
      final fake = UploadSessionFileInfo(
        index: i,
        name: displayName,
        relativePath: safePath,
        mediaType: file.mediaType,
        sha256: '',
        byteSize: file.byteSize,
        receivedBytes: 0,
        completed: false,
        completedAt: '',
      );

      items.add(
        _UploadSessionFileLineCard(
          file: fake,
          depth: parent.depth,
          statusLabel: '等待上传',
          prefix: _queuedTreePrefix(parent.depth),
          uploadedAt: '',
          leftPadding: leftPadding,
        ),
      );
      if (i < files.length - 1) {
        items.add(const SizedBox(height: 8));
      }
    }
    return items;
  }

  _QueuedFolderNode _buildQueuedFolderTree(List<QueuedFile> files) {
    final root = _QueuedFolderNode(name: '', depth: 0, path: '');
    if (files.isEmpty) {
      return root;
    }
    final sortedFiles = [...files]
      ..sort((left, right) {
        final leftPath = _normalizeQueuedPath(left).toLowerCase();
        final rightPath = _normalizeQueuedPath(right).toLowerCase();
        return leftPath.compareTo(rightPath);
      });

    for (final file in sortedFiles) {
      var current = root;
      var currentPath = '';
      final normalized = _normalizeQueuedPath(file);
      final safePath = normalized.isNotEmpty ? normalized : file.name;
      final segments = safePath
          .split('/')
          .where((item) => item.isNotEmpty)
          .toList();
      final dirs = segments.length > 1
          ? segments.sublist(0, segments.length - 1)
          : [];
      for (final dir in dirs) {
        currentPath = currentPath.isEmpty ? dir : '$currentPath/$dir';
        current = current.folders.putIfAbsent(
          currentPath,
          () => _QueuedFolderNode(
            name: dir,
            depth: current.depth + 1,
            path: currentPath,
          ),
        );
      }
      current.files.add(file);
    }
    return root;
  }

  Set<String> _collectQueuedFolderPaths(_QueuedFolderNode node) {
    final paths = <String>{};
    for (final child in node.folders.values) {
      paths.add(child.path);
      paths.addAll(_collectQueuedFolderPaths(child));
    }
    return paths;
  }

  String _normalizeQueuedPath(QueuedFile file) {
    final raw = file.relativePath.isNotEmpty ? file.relativePath : file.name;
    return _normalizeRelativePath(raw, fallbackFileName: file.name);
  }

  String _normalizeRelativePath(String path, {String fallbackFileName = ''}) {
    var normalized = path.replaceAll('\\', '/').trim();
    if (normalized.isEmpty) {
      return fallbackFileName;
    }
    if (normalized.startsWith('/')) {
      normalized = normalized.replaceFirst(RegExp(r'^/+'), '');
    }
    final isWindowsDrivePath = RegExp(r'^[A-Za-z]:/').hasMatch(normalized);
    final isUncPath = normalized.startsWith('//');
    if ((isWindowsDrivePath || isUncPath) && normalized.contains('/')) {
      return fallbackFileName;
    }
    if (normalized.contains('/') && normalized.startsWith('../')) {
      normalized = normalized.replaceAll(RegExp(r'^(\.\.\/)+'), '');
    }
    return normalized;
  }

  String _queuedTreePrefix(int depth) {
    if (depth <= 0) {
      return '';
    }
    return '${'  ' * (depth - 1)}└─ ';
  }

  @override
  Widget build(BuildContext context) {
    final root = _buildQueuedFolderTree(widget.files);
    final treeWidgets = _buildQueuedFolderTreeWidgets(
      parent: root,
      leftPadding: 0,
    );
    if (treeWidgets.isEmpty) {
      return const _EmptyPanel(label: '当前还没有待上传文件，请先拖拽文件。');
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: treeWidgets,
    );
  }
}

class _UploadSessionFolderCard extends StatelessWidget {
  const _UploadSessionFolderCard({
    required this.node,
    required this.expanded,
    required this.hasChildren,
    this.onToggle,
  });

  final _UploadSessionFolderNode node;
  final bool expanded;
  final bool hasChildren;
  final VoidCallback? onToggle;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onToggle,
      borderRadius: BorderRadius.circular(12),
      child: Container(
        decoration: BoxDecoration(
          color: AgentStudioColors.surfaceLow,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: AgentStudioColors.primary.withValues(alpha: 0.2),
          ),
        ),
        padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 10),
        child: Row(
          children: [
            Icon(
              expanded
                  ? Icons.folder_open_outlined
                  : Icons.folder_copy_outlined,
              size: 18,
              color: AgentStudioColors.primary,
            ),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                node.name.isEmpty ? '未命名文件夹' : node.name,
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                  color: AgentStudioColors.primary,
                  fontWeight: FontWeight.w700,
                ),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ),
            if (hasChildren)
              Icon(
                expanded ? Icons.expand_less : Icons.chevron_right,
                color: AgentStudioColors.textMuted,
              ),
          ],
        ),
      ),
    );
  }
}

class _UploadSessionFileLineCard extends StatelessWidget {
  const _UploadSessionFileLineCard({
    required this.file,
    required this.depth,
    required this.statusLabel,
    required this.prefix,
    required this.uploadedAt,
    this.fallbackUploadedAt = '',
    this.leftPadding = 0,
  });

  final UploadSessionFileInfo file;
  final int depth;
  final String statusLabel;
  final String prefix;
  final String uploadedAt;
  final String fallbackUploadedAt;
  final double leftPadding;

  @override
  Widget build(BuildContext context) {
    final progress = file.byteSize <= 0
        ? 0.0
        : (file.receivedBytes / file.byteSize).clamp(0.0, 1.0);
    final dataText =
        '${_humanBytes(file.receivedBytes)} / ${_humanBytes(file.byteSize)}';
    final uploadTimeSource = uploadedAt.isNotEmpty
        ? uploadedAt
        : fallbackUploadedAt;
    final uploadTime = uploadTimeSource.isEmpty
        ? '—'
        : _formatDisplayDateTime(uploadTimeSource);
    return Container(
      margin: EdgeInsets.only(left: leftPadding),
      decoration: BoxDecoration(
        color: AgentStudioColors.surfaceLow,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AgentStudioColors.surfaceHighest),
      ),
      padding: const EdgeInsets.all(10),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Padding(
                          padding: EdgeInsets.only(top: 1),
                          child: Icon(
                            Icons.insert_drive_file_outlined,
                            size: 18,
                            color: AgentStudioColors.textMuted,
                          ),
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              SelectableText(
                                '$prefix${file.name.isEmpty ? '未命名文件' : file.name}',
                                style: Theme.of(context).textTheme.bodySmall
                                    ?.copyWith(
                                      color: AgentStudioColors.text,
                                      fontWeight: FontWeight.w700,
                                    ),
                                maxLines: 1,
                              ),
                              const SizedBox(height: 4),
                              SelectableText(
                                uploadTime,
                                style: Theme.of(context).textTheme.bodySmall
                                    ?.copyWith(
                                      color: AgentStudioColors.textMuted,
                                      height: 1.4,
                                    ),
                                maxLines: 1,
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(width: 8),
                        _StatusPill(label: statusLabel),
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Align(
            alignment: Alignment.centerRight,
            child: _ProgressBarRow(progress: progress, dataText: dataText),
          ),
        ],
      ),
    );
  }

  String _humanBytes(int bytes) {
    if (bytes >= 1024 * 1024 * 1024) {
      return '${(bytes / (1024 * 1024 * 1024)).toStringAsFixed(1)} GB';
    }
    if (bytes >= 1024 * 1024) {
      return '${(bytes / (1024 * 1024)).toStringAsFixed(1)} MB';
    }
    if (bytes >= 1024) {
      return '${(bytes / 1024).toStringAsFixed(1)} KB';
    }
    return '$bytes B';
  }
}

class _ProgressRow extends StatelessWidget {
  const _ProgressRow({
    required this.label,
    required this.progress,
    required this.suffix,
  });

  final String label;
  final double progress;
  final String suffix;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Expanded(
              child: Text(
                label,
                style: Theme.of(
                  context,
                ).textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w700),
              ),
            ),
            Text(
              suffix,
              style: Theme.of(
                context,
              ).textTheme.bodySmall?.copyWith(color: AgentStudioColors.textMuted),
            ),
          ],
        ),
        const SizedBox(height: 8),
        ClipRRect(
          borderRadius: BorderRadius.circular(999),
          child: LinearProgressIndicator(
            value: progress.clamp(0, 1),
            minHeight: 6,
            backgroundColor: AgentStudioColors.surfaceHighest,
            valueColor: const AlwaysStoppedAnimation<Color>(
              AgentStudioColors.primaryStrong,
            ),
          ),
        ),
      ],
    );
  }
}

String _formatDisplayDateTime(String value) {
  final parsed = DateTime.tryParse(value);
  if (parsed == null) {
    return value;
  }
  return '${parsed.year}-${parsed.month.toString().padLeft(2, '0')}-${parsed.day.toString().padLeft(2, '0')} ${parsed.hour.toString().padLeft(2, '0')}:${parsed.minute.toString().padLeft(2, '0')}:${parsed.second.toString().padLeft(2, '0')}';
}

class _ProgressBarRow extends StatelessWidget {
  const _ProgressBarRow({required this.progress, required this.dataText});

  final double progress;
  final String dataText;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        Expanded(
          child: ClipRRect(
            borderRadius: BorderRadius.circular(999),
            child: LinearProgressIndicator(
              value: progress.clamp(0, 1),
              minHeight: 6,
              backgroundColor: AgentStudioColors.surfaceHighest,
              valueColor: const AlwaysStoppedAnimation<Color>(
                AgentStudioColors.primaryStrong,
              ),
            ),
          ),
        ),
        const SizedBox(width: 10),
        Text(
          dataText,
          style: Theme.of(
            context,
          ).textTheme.bodySmall?.copyWith(color: AgentStudioColors.textMuted),
        ),
      ],
    );
  }
}

class _MetricTile extends StatelessWidget {
  const _MetricTile({
    required this.label,
    required this.value,
    required this.accent,
  });

  final String label;
  final String value;
  final Color accent;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AgentStudioColors.surfaceLow,
        borderRadius: BorderRadius.circular(14),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: Theme.of(context).textTheme.bodySmall?.copyWith(
              color: AgentStudioColors.textMuted,
              fontWeight: FontWeight.w700,
              letterSpacing: 0.4,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            value,
            style: Theme.of(context).textTheme.titleMedium?.copyWith(
              color: accent,
              fontWeight: FontWeight.w800,
            ),
          ),
        ],
      ),
    );
  }
}

class _StatusPill extends StatelessWidget {
  const _StatusPill({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    final normalized = label.toLowerCase();
    final background = switch (normalized) {
      'completed' ||
      'linked' ||
      '已完成' ||
      '已接入' ||
      '已连接' ||
      '客户端已确认' => const Color(0xFFE5F8EF),
      'running' ||
      'processing' ||
      'queued' ||
      '运行中' ||
      '服务端处理中' ||
      '排队中' ||
      '上传中' => const Color(0xFFDDE1FF),
      'failed' || 'error' || '失败' || '网络中断' => const Color(0xFFFFDAD6),
      _ => AgentStudioColors.surfaceHighest,
    };
    final foreground = switch (normalized) {
      'completed' ||
      'linked' ||
      '已完成' ||
      '已接入' ||
      '已连接' ||
      '客户端已确认' => AgentStudioColors.success,
      'running' ||
      'processing' ||
      'queued' ||
      '运行中' ||
      '服务端处理中' ||
      '排队中' ||
      '上传中' => AgentStudioColors.primary,
      'failed' || 'error' || '失败' || '网络中断' => AgentStudioColors.error,
      _ => AgentStudioColors.textMuted,
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: background,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        label,
        style: TextStyle(
          color: foreground,
          fontSize: 11,
          fontWeight: FontWeight.w800,
        ),
      ),
    );
  }
}

class _DataRow extends StatelessWidget {
  const _DataRow({required this.item});

  final Map<String, dynamic> item;

  @override
  Widget build(BuildContext context) {
    final title = [item['title'], item['name'], item['subject'], item['id']]
        .whereType<Object>()
        .map((e) => e.toString())
        .firstWhere((value) => value.trim().isNotEmpty, orElse: () => '未命名条目');
    final detail = item.entries
        .where(
          (entry) =>
              entry.value != null && entry.value.toString().trim().isNotEmpty,
        )
        .take(3)
        .map(
          (entry) =>
              '${displayDataKey(entry.key)}: ${_displayDataValue(entry.value)}',
        )
        .join('  |  ');

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AgentStudioColors.surfaceLow,
        borderRadius: BorderRadius.circular(14),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: Theme.of(
              context,
            ).textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w700),
          ),
          if (detail.isNotEmpty) ...[
            const SizedBox(height: 6),
            Text(
              detail,
              style: Theme.of(
                context,
              ).textTheme.bodySmall?.copyWith(color: AgentStudioColors.textMuted),
            ),
          ],
        ],
      ),
    );
  }

  String _displayDataValue(Object? value) {
    if (value is bool) {
      return value ? '是' : '否';
    }
    if (value is List) {
      return value.map((item) => _displayDataValue(item)).join('、');
    }
    if (value is Map) {
      return '结构化内容';
    }
    return value?.toString() ?? '';
  }
}

class _EmptyPanel extends StatelessWidget {
  const _EmptyPanel({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: AgentStudioColors.surfaceLow,
        borderRadius: BorderRadius.circular(14),
      ),
      child: Text(
        label,
        style: Theme.of(
          context,
        ).textTheme.bodyMedium?.copyWith(color: AgentStudioColors.textMuted),
      ),
    );
  }
}
