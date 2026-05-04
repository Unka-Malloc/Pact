import 'package:flutter/material.dart';

class SplitAllColors {
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

ThemeData buildSplitAllTheme() {
  final base = ThemeData.light(useMaterial3: true);
  final textTheme = base.textTheme.apply(
    bodyColor: SplitAllColors.text,
    displayColor: SplitAllColors.text,
  );

  return base.copyWith(
    scaffoldBackgroundColor: SplitAllColors.background,
    textTheme: textTheme,
    colorScheme: const ColorScheme.light(
      surface: SplitAllColors.surface,
      primary: SplitAllColors.primary,
      onPrimary: Colors.white,
      secondary: SplitAllColors.primaryStrong,
      onSecondary: Colors.white,
      error: SplitAllColors.error,
      onError: Colors.white,
      onSurface: SplitAllColors.text,
      surfaceContainerHighest: SplitAllColors.surfaceHighest,
    ),
    cardTheme: CardThemeData(
      color: SplitAllColors.surface,
      elevation: 0,
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: const BorderSide(color: SplitAllColors.line),
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: SplitAllColors.surface,
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: const BorderSide(color: SplitAllColors.line),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: const BorderSide(color: SplitAllColors.line),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: const BorderSide(color: SplitAllColors.primary, width: 1.2),
      ),
    ),
  );
}
