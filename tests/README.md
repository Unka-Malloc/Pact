# SplitAll Tests

This directory stores repository-level test assets.

- `tests/run.mjs`: unified test runner for repository profiles, tagged suites,
  platform gates, and JSON reports.
- `tests/verify-secret-hygiene.mjs`: source, docs, and test secret scan.
- `tests/server`: server verification mounts and mock modules.
- `tests/fixtures`: large sample mailboxes and imported message fixtures.

Package-local tests remain with their owning implementation:

- `client-cli/tests`
- `client-gui/test`

Generated test output must still go under `build/`; `tests/` is for reusable
fixtures, mock modules, and source-controlled test code.

See `docs/TEST-FRAMEWORK.md` for the full framework contract.
