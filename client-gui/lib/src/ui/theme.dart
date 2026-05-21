import 'package:flutter/material.dart';

class AgentStudioColors {
  static const background = Color(0xFFF8F9FF);
  static const surface = Color(0xFFFFFFFF);
  static const surfaceLow = Color(0xFFEEF4FF);
  static const surfaceHigh = Color(0xFFDFE9FA);
  static const surfaceHighest = Color(0xFFD9E3F4);
  static const line = Color(0xFFC4C5D9);
  static const text = Color(0xFF121C28);
  static const textMuted = Color(0xFF434656);
  static const primary = Color(0xFF0040E0);
  static const primaryStrong = Color(0xFF2E5BFF);
  static const primaryFixed = Color(0xFFDDE1FF);
  static const success = Color(0xFF118050);
  static const warning = Color(0xFFC24100);
  static const error = Color(0xFFBA1A1A);
}

ThemeData buildAgentStudioTheme() {
  final base = ThemeData.light(useMaterial3: true);
  final textTheme = base.textTheme.apply(
    bodyColor: AgentStudioColors.text,
    displayColor: AgentStudioColors.text,
  );

  return base.copyWith(
    scaffoldBackgroundColor: AgentStudioColors.background,
    textTheme: textTheme,
    colorScheme: const ColorScheme.light(
      surface: AgentStudioColors.surface,
      primary: AgentStudioColors.primary,
      onPrimary: Colors.white,
      secondary: AgentStudioColors.primaryStrong,
      onSecondary: Colors.white,
      error: AgentStudioColors.error,
      onError: Colors.white,
      onSurface: AgentStudioColors.text,
      surfaceContainerHighest: AgentStudioColors.surfaceHighest,
    ),
    cardTheme: CardThemeData(
      color: AgentStudioColors.surface,
      elevation: 0,
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: const BorderSide(color: AgentStudioColors.line),
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: AgentStudioColors.surface,
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: const BorderSide(color: AgentStudioColors.line),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: const BorderSide(color: AgentStudioColors.line),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: const BorderSide(color: AgentStudioColors.primary, width: 1.2),
      ),
    ),
  );
}
