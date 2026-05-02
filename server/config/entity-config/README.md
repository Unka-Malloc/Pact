# SplitAll Entity Configs

This directory stores human-maintainable configuration entities as folders and lightweight bundles.

- `tools/`: tool-management scopes, toolsets, and agent profiles.
- `skills/`: reusable skill bundles with manifests, instructions, and dependency declarations.
- `standards/`: human governance standards and golden-rule policy packages.
- `specs/`: protocol, import, source, and runtime configuration specs.

Large payloads should not be copied into these bundles. Use a manifest entry with a source locator, checksum, and expected loader instead.
