import 'package:flutter/material.dart';

import 'src/controllers/app_controller.dart';
import 'src/services/runtime_services.dart';
import 'src/ui/client_shell.dart';
import 'src/ui/theme.dart';

class PactApp extends StatefulWidget {
  const PactApp({super.key});

  @override
  State<PactApp> createState() => _PactAppState();
}

class _PactAppState extends State<PactApp> {
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
      title: 'Pact 便携客户端',
      debugShowCheckedModeBanner: false,
      theme: buildPactTheme(),
      home: ClientShell(controller: _controller),
    );
  }
}
