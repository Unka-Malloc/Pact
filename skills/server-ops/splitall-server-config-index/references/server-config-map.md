# Server Config Map

Primary files:

- `new/server/config.mjs`: default settings and environment variables.
- `$PACT_SERVER_DATA_DIR/settings.json`: persisted settings.
- `$PACT_SERVER_DATA_DIR/mount-modules.json`: mount module paths.
- `$PACT_SERVER_DATA_DIR/mount-routing.json`: route table.
- `$PACT_SERVER_DATA_DIR/rules/email-rules.json`: email analysis rules.

Important settings:

- `tikaJarPath`, `javaBinPath`
- `cloudParsingEnabled`, `cloudParsingProvider`
- `googleApiKey`, `googleModel`, `openAiModel`
- `cloudParsingMaxSources`, `cloudParsingMaxChars`
- `cloudParsingHttpHead`, `cloudParsingHttpBody`
- `analysisModuleId`
- `ocrEnabled`, `ocrPythonPath`, `ocrLanguage`
- `retrievalHalfLifeDays`, `staleAfterDays`, `transactionWindowDays`

Environment variables mirror the defaults with `SPLITALL_` prefixes, including `SPLITALL_TIKA_JAR_PATH`, `SPLITALL_JAVA_BIN_PATH`, `SPLITALL_GOOGLE_API_KEY`, `SPLITALL_OPENAI_MODEL`, `SPLITALL_OCR_PYTHON_PATH`, and retrieval window variables.
