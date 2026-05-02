import 'package:flutter/material.dart';

import 'src/controllers/app_controller.dart';
import 'src/services/runtime_services.dart';
import 'src/ui/client_shell.dart';
import 'src/ui/theme.dart';

class SplitAllApp extends StatefulWidget {
  const SplitAllApp({super.key});

  @override
  State<SplitAllApp> createState() => _SplitAllAppState();
}

class _SplitAllAppState extends State<SplitAllApp> {
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
      title: 'SplitAll 便携客户端',
      debugShowCheckedModeBanner: false,
      theme: buildSplitAllTheme(),
      home: ClientShell(controller: _controller),
    );
  }
}
