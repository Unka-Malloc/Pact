# Email Rules Map

Primary files:

- `$PACT_SERVER_DATA_DIR/rules/email-rules.json`
- `new/server/email-rules.mjs`
- `new/server/domain/rules/index.mjs`
- `new/server/email-analysis.mjs`

Typical rule areas:

- report series
- synonyms
- department aliases
- person aliases
- stop words
- transaction merge thresholds
- stale and retrieval windows

Maintenance workflow:

1. Back up the current JSON.
2. Make a focused rule change.
3. Run a known mail sample through the server.
4. Compare transaction count, people count, associations, and warnings.
5. Keep a before/after result JSON when changing merge behavior.
