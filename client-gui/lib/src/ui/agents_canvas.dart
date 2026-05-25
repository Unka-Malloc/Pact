import 'package:flutter/material.dart';
import '../controllers/app_controller.dart';
import 'theme.dart';
import '../services/agent_service.dart';

class AgentsCanvas extends StatefulWidget {
  final AppController controller;
  final double width;

  const AgentsCanvas({
    super.key,
    required this.controller,
    required this.width,
  });

  @override
  State<AgentsCanvas> createState() => _AgentsCanvasState();
}

class _AgentsCanvasState extends State<AgentsCanvas> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      widget.controller.scanTargets();
    });
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: widget.controller,
      builder: (context, _) {
        final scanning = widget.controller.isScanningTargets;
        final targets = widget.controller.scannedTargets;

        return Scaffold(
          backgroundColor: PactColors.background,
          body: Padding(
            padding: const EdgeInsets.all(32.0),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(
                      'Agents',
                      style: Theme.of(context).textTheme.headlineMedium
                          ?.copyWith(
                            fontWeight: FontWeight.bold,
                            color: PactColors.text,
                          ),
                    ),
                    FilledButton.icon(
                      onPressed: scanning
                          ? null
                          : widget.controller.scanTargets,
                      icon: scanning
                          ? const SizedBox(
                              width: 16,
                              height: 16,
                              child: CircularProgressIndicator(
                                strokeWidth: 2,
                                color: Colors.white,
                              ),
                            )
                          : const Icon(Icons.refresh, size: 18),
                      label: Text(scanning ? 'Scanning...' : 'Rescan'),
                      style: FilledButton.styleFrom(
                        backgroundColor: PactColors.primary,
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(8),
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                Text(
                  'Manage target adapters and MCP configuration plans for local IDEs and AI tools.',
                  style: TextStyle(color: PactColors.textMuted, fontSize: 14),
                ),
                const SizedBox(height: 32),
                if (targets.isEmpty && !scanning)
                  Center(
                    child: Padding(
                      padding: const EdgeInsets.only(top: 64.0),
                      child: Text(
                        'No supported targets detected.',
                        style: TextStyle(color: PactColors.textMuted),
                      ),
                    ),
                  )
                else
                  Expanded(
                    child: GridView.builder(
                      gridDelegate:
                          const SliverGridDelegateWithMaxCrossAxisExtent(
                            maxCrossAxisExtent: 400,
                            crossAxisSpacing: 16,
                            mainAxisSpacing: 16,
                            childAspectRatio: 2.2,
                          ),
                      itemCount: targets.length,
                      itemBuilder: (context, index) {
                        return _buildTargetCard(targets[index]);
                      },
                    ),
                  ),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _buildTargetCard(TargetCandidate target) {
    final configured = target.configured;
    return Card(
      elevation: 0,
      color: PactColors.surface,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: const BorderSide(color: PactColors.line),
      ),
      child: Padding(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  width: 40,
                  height: 40,
                  decoration: BoxDecoration(
                    color: PactColors.surfaceLow,
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Icon(
                    Icons.smart_toy_outlined,
                    color: PactColors.primary,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        target.label,
                        style: const TextStyle(
                          fontWeight: FontWeight.bold,
                          fontSize: 16,
                        ),
                      ),
                      Row(
                        children: [
                          Container(
                            width: 8,
                            height: 8,
                            decoration: BoxDecoration(
                              shape: BoxShape.circle,
                              color: configured
                                  ? PactColors.success
                                  : PactColors.textMuted,
                            ),
                          ),
                          const SizedBox(width: 6),
                          Text(
                            configured ? 'Configured' : 'Not configured',
                            style: TextStyle(
                              color: configured
                                  ? PactColors.success
                                  : PactColors.textMuted,
                              fontSize: 12,
                              fontWeight: FontWeight.w500,
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const Spacer(),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  _targetStatusLabel(target),
                  style: TextStyle(color: PactColors.textMuted, fontSize: 12),
                ),
                Row(
                  children: [
                    TextButton(
                      onPressed: () =>
                          widget.controller.inspectTarget(target.target),
                      child: const Text('Inspect'),
                    ),
                    const SizedBox(width: 8),
                    FilledButton(
                      onPressed: () =>
                          widget.controller.planTargetConfig(target.target),
                      style: FilledButton.styleFrom(
                        backgroundColor: PactColors.primary,
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(6),
                        ),
                        minimumSize: const Size(80, 32),
                      ),
                      child: const Text('Plan', style: TextStyle(fontSize: 13)),
                    ),
                  ],
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  String _targetStatusLabel(TargetCandidate target) {
    return switch (target.status) {
      'configured' => 'Configured',
      'detected' => 'Detected',
      _ => 'Not detected',
    };
  }
}
