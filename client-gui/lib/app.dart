import 'package:flutter/material.dart';

import 'src/controllers/app_controller.dart';
import 'src/services/runtime_services.dart';
import 'src/ui/client_shell.dart';
import 'src/ui/theme.dart';

class AgentStudioApp extends StatefulWidget {
  const AgentStudioApp({super.key});

  @override
  State<AgentStudioApp> createState() => _AgentStudioAppState();
}

class _AgentStudioAppState extends State<AgentStudioApp> {
  late final AppController _controller;

  @override
  void initState() {
    super.initState();
    _controller = AppController(storage: PortableStorage())..initialize();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'AgentStudio 便携客户端',
      debugShowCheckedModeBanner: false,
      theme: buildAgentStudioTheme(),
      home: ClientShell(controller: _controller),
    );
  }
}
