import 'package:flutter/material.dart';

class PactColors {
  static const background = Color(0xFFF9FAFB); // gray-50
  static const surface = Color(0xFFFFFFFF);    // gray-0
  static const surfaceLow = Color(0xFFF3F4F6); // gray-100
  static const surfaceHigh = Color(0xFFEFF6FF); // blue-50 (brand-subtle)
  static const surfaceHighest = Color(0xFFDBEAFE); // blue-100
  static const line = Color(0xFFE5E7EB);       // gray-200
  static const text = Color(0xFF111827);       // gray-900
  static const textMuted = Color(0xFF4B5563);  // gray-600
  static const primary = Color(0xFF2563EB);    // blue-600
  static const primaryStrong = Color(0xFF1D4ED8); // blue-700
  static const primaryFixed = Color(0xFFEFF6FF); // blue-50
  static const success = Color(0xFF16A34A);    // green-600
  static const warning = Color(0xFFD97706);    // amber-600
  static const error = Color(0xFFDC2626);      // red-600
}

ThemeData buildPactTheme() {
  final base = ThemeData.light(useMaterial3: true);
  final textTheme = base.textTheme.apply(
    bodyColor: PactColors.text,
    displayColor: PactColors.text,
  );

  return base.copyWith(
    scaffoldBackgroundColor: PactColors.background,
    textTheme: textTheme,
    colorScheme: const ColorScheme.light(
      surface: PactColors.surface,
      primary: PactColors.primary,
      onPrimary: Colors.white,
      secondary: PactColors.primaryStrong,
      onSecondary: Colors.white,
      error: PactColors.error,
      onError: Colors.white,
      onSurface: PactColors.text,
      surfaceContainerHighest: PactColors.surfaceHighest,
    ),
    cardTheme: CardThemeData(
      color: PactColors.surface,
      elevation: 0,
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: const BorderSide(color: PactColors.line),
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: PactColors.surface,
      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(8),
        borderSide: const BorderSide(color: PactColors.line),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(8),
        borderSide: const BorderSide(color: PactColors.line),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(8),
        borderSide: const BorderSide(color: PactColors.primary, width: 1.5),
      ),
    ),
  );
}
