# Pact Unified Test Framework

Pact has server runtime code, a Vue server console, a Flutter desktop client,
Rust native client binaries, platform adapters, and large mail fixtures. The test
framework is intentionally layered instead of tied to one language runner.

The single repository entrypoint is:

```sh
npm test
```

For release-grade regression:

```sh
npm run test:regression
```

The runner writes machine-readable reports to `build/test-reports/`, including
`build/test-reports/latest.json`.

## Design Principles

- One entrypoint: every repository-level check is registered in `tests/run.mjs`.
- Owned tests stay near owned code: Rust tests stay in `client-cli`, Flutter
  tests stay in `client-gui`, server verification stays in `server/scripts`.
- Profiles compose suites: developers run fast tests locally; CI and release
  workflows run standard, security, coverage, and platform profiles.
- Security is part of default regression: secret hygiene and production
  dependency audit run before broader integration work.
- Generated output stays under `build/`; root and source-tree hygiene tests
  reject misplaced artifacts.
- Every feature or refactor must update the smallest suite that can fail for
  the changed behavior, then any integration suite needed for the contract.

## Profiles

| Profile | Command | Purpose |
| --- | --- | --- |
| `fast` | `npm test` / `npm run test:fast` | Local pre-commit loop: repo hygiene, secret hygiene, destructive client gates, Flutter analyze/tests, Rust client tests. |
| `standard` | `npm run test:regression` / `npm run test:standard` | Full cross-layer regression: security, server console build, server runtime checks, client tests, hygiene after generated output. |
| `coverage` | `npm run test:coverage` | Flutter coverage plus Rust client tests. |
| `security` | `npm run test:security` | Secret scan, dependency audit, server smoke, client native tests. |
| `server` | `npm run test:server` | Server console and server runtime verification. |
| `client` | `npm run test:client` | Flutter and Rust client verification. |
| `changed` | `npm run test:changed` | Git-diff based selection for focused local checks. |
| `release` | `npm run test:full` | Standard regression plus Linux GUI and Ubuntu Docker verification. |

List all suites:

```sh
npm run test:list
```

Run a single suite:

```sh
node tests/run.mjs --suite client.native.test
```

Run all security-tagged suites:

```sh
node tests/run.mjs --tag security
```

## Test Layers

### Static and Hygiene

- `repo.hygiene.*`: validates repository layout and prevents generated output
  from leaking into source roots.
- `security.secret-hygiene`: scans source, docs, and tests for high-risk secret
  patterns such as private keys, cloud credentials, GitHub tokens, and API keys.
- `security.npm-audit`: fails on high-risk production dependency advisories.
- `client.flutter.analyze`: runs Flutter static analysis.

### Unit and Component

- Flutter unit/widget tests live under `client-gui/test`.
- Rust unit tests live beside `client-cli/src` code.
- Server module-level checks should be added to focused scripts under
  `server/scripts` or local test modules when a script would be too broad.

### Contract and Integration

- `client:verify:architecture` checks the destructive desktop-client boundary:
  only six product modules, future package profile, first target adapters, no
  default legacy daemon/connector/mail/graph/upload package, no old CLI main
  command set, and legacy code outside the default Rust source path.
- `client:verify:plan` checks that docs, package scripts, and `tests/run.mjs`
  agree on the client verifier set, and that deferred Skill Hub protocol work is
  not marked complete.
- `client:verify:state-store` covers the future local JSON/JSONL state,
  activity, and snapshot substrate.
- `client:verify:targets` covers target discovery, manual target addition, and
  first target adapter contracts.
- `client:verify:config-writes` covers structured target-native MCP config
  plan/apply/rollback writes.
- `client:verify:pairing-skill-cli` covers pairing, passive Skill Hub listing,
  hidden skill refusal, and `protocol_deferred` boundaries.
- `client:verify:mcp-plugins` covers peer MCP plugin status/update/rollback.
- `client:verify:thin-forwarding` covers model profiles and thin forwarding
  without a planner, session harness, or tool loop.
- `client.native.test` covers Rust future client unit and contract tests. Legacy
  daemon, connector, mail, upload queue, and server bridge tests live under
  `client-cli/legacy/dev-only/` and are not part of the default product gate.
- `server.headless` validates the server runtime without the GUI.
- `server.continuity`, `server.checkpoints`, `server.rebuild`, `server.ops`,
  and `server.knowledge` validate storage, upload, rebuild, and knowledge
  processing invariants.
- `server.web.build` ensures the Vue server console still compiles.

### Desktop GUI and Platform

- `client.linux.build` builds the Flutter Linux bundle.
- `client.linux.smoke` validates the generated Linux bundle and sidecar files.
- `client.linux.gui-smoke` launches the Flutter app under Xvfb, captures
  screenshots, verifies they are nonblank, and checks basic input stability.
- `client.ubuntu.verify` runs the Ubuntu Docker desktop verification path.

## Security Expectations

Security tests are not limited to dependency audit. New sensitive flows must add
tests for:

- secret and token storage boundaries;
- RPC token validation and protocol version rejection;
- path traversal rejection for shared workspace files;
- atomic write and partial-write recovery;
- untrusted file parsing failures;
- upload checkpoint replay and mismatch behavior;
- daemon lifecycle and stale state cleanup.

Use OWASP ASVS as the external vocabulary for security control requirements, but
map those requirements to Pact-owned suites instead of adding disconnected
checklists.

## Change Rules

When changing `server/`:

```sh
npm run test:server
```

When changing `client-cli/`:

```sh
node tests/run.mjs --suite client.native.test
```

When changing `client-gui/`:

```sh
npm run test:client
```

When changing shared protocols, portable data, RPC, upload checkpoints, or expert
vocabulary hot update behavior:

```sh
npm run test:regression
```

When changing Linux packaging, GUI startup, or sidecar bundling:

```sh
npm run test:full
```

If a change intentionally updates behavior, update the matching unit or contract
test in the same patch. If no existing suite represents the behavior, add a new
suite to `tests/run.mjs` and document it here.

## CI Recommendation

Use staged CI jobs:

1. `npm test` on every push and pull request.
2. `npm run test:security` on every pull request.
3. `npm run test:regression` before merge to protected branches.
4. `npm run test:full` on release branches and nightly schedules with Docker
   available.

Keep report artifacts from `build/test-reports/` for all CI jobs. Keep GUI
screenshots from `build/artifacts/ubuntu-client-gui/` only for release and failed
GUI jobs.

## Pipeline Gate Capability Registry

Use this checklist as the source of truth when adding or reviewing CI gate
coverage for product capabilities. A capability is only marked checked when it
has an executable verifier and is included in the appropriate CI profile or
workflow job. If a requested capability is missing, add the smallest verifier
that can fail for that contract, wire it into `tests/run.mjs` or a release gate,
then update this list in the same patch.

- [x] `repository-hygiene`: enforced by `repo.hygiene.pre`,
  `repo.hygiene.post`, and `npm run repo:hygiene`; blocks generated output and
  misplaced artifacts from leaking into source roots.
- [x] `secret-hygiene`: enforced by `security.secret-hygiene` and
  `npm run security:hygiene`; blocks high-risk secrets in source, docs, and
  tests.
- [x] `production-dependency-audit`: enforced by `security.npm-audit` in
  security, standard, prebuild, and release profiles.
- [x] `typescript-typecheck`: enforced by the CI `typecheck` job with
  `npx tsc --noEmit`.
- [x] `renderer-build`: enforced by `server.web.build`,
  `npm run build:renderer:raw`, and the CI `build-renderer` job.
- [x] `server-runtime-regression`: enforced by the `standard`, `server`,
  `prebuild`, and `release` profiles across headless runtime, MCP HTTP,
  continuity, checkpoints, rebuild, ops, knowledge, policy, trace, logging, and
  business scenario suites.
- [x] `external-service-api-registration`: enforced by
  `server.external-service-api-registration`,
  `npm run server:verify:external-service-api-registration`, and the production
  readiness external-service gate; requires every `external-services/*`
  capability to register through `external.*` operations and mediated
  `/api/external/*` APIs, and rejects Tool Management exposure of platform
  internal algorithm operations such as `knowledge.distillation.*`.
- [x] `capability-kernel-api-capability`: enforced by
  `npm run server:verify:authorization-capabilities` and the production
  readiness Capability Kernel gate; verifies every `SERVER_API_OPERATIONS`
  entry and Tool Catalog entry has a known kernel Capability and that
  Capability-only authorization allow/deny behavior works.
- [x] `key-management-storage-distribution`: enforced by the production
  readiness key-management gate, `npm run server:verify:secret-init`,
  `npm run server:verify:opaque-capability-key`,
  `npm run server:verify:tool-management`, and `npm run server:verify:mcp-http`;
  covers key initialization, opaque key storage/verification, grant
  rotate/revoke storage, and MCP local grant delivery.
- [x] `permission-management-auth-config`: enforced by the production readiness
  tool-permission gate, `npm run server:verify:console-auth`,
  `npm run server:verify:2-3-5-security-model`,
  `npm run server:verify:tool-management`, and
  `npm run server:verify:authorization-governance`; covers client identity,
  role/policy/governance configuration, tool grants, and authorization audit.
- [x] `mcp-gateway-client-push`: enforced by the production readiness MCP
  gateway gate, `npm run server:verify:mcp-http`,
  `npm run server:verify:mcp-release`, `npm run client:verify:mcp-plugins`,
  and `npm run server:verify:client-runtime-bootstrap`; covers MCP discovery,
  `notifications/tools/list_changed`, connector version packaging, client MCP
  config update/rollback, and key grant delivery to downstream clients.
- [x] `client-native-and-flutter`: enforced by the `fast`, `client`,
  `standard`, `prebuild`, and `release` profiles across Rust native tests,
  client architecture gates, target/config contracts, Flutter analyze, and
  Flutter tests.
- [x] `smoke-runtime-memory-cli`: enforced by `npm run test:smoke`; covers
  server lifecycle, bounded source evidence memory behavior, and client CLI
  smoke.
- [x] `docker-image-build`: enforced by the CI `docker-build` job.
- [x] `release-readiness`: enforced on release branches, version tags, and
  manual runs by `npm run test:full`, `npm run server:verify:v001`, and
  `npm run server:verify:production-readiness`; uploads release and production
  readiness reports.
