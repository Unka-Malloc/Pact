# Knowledge Taxonomy Configuration

SplitAll knowledge classification vocabulary is data, not code.

## Runtime Files

- `build/server-data/rules/knowledge-taxonomy.json`
  - Active knowledge taxonomy.
  - Used as the base taxonomy for `KnowledgeCore` search intent gating and local taxonomy enhancement.
  - Loaded with an mtime cache, so edits are picked up without changing code.
- `build/server-data/rules/expert-vocabulary.json`
  - Editable expert vocabulary used by the console.
  - Seeded from the bundled taxonomy when missing.
  - Compiled into runtime guidance; active entries can add/extend taxonomy paths, keywords, domains, and intent triggers.
- `build/server-data/rules/email-rules.json`
  - Editable mail analysis rules.
  - Compiled into runtime guidance; report series, synonyms, department aliases, and stop words participate in classification and retrieval.

## Runtime Guidance

`KnowledgeCore` does not read only one taxonomy file. At runtime it compiles:

1. `knowledge-taxonomy.json`
2. `expert-vocabulary.json`
3. `email-rules.json`

into one guidance bundle. The bundle is hot-loaded from file mtimes and exposed in KnowledgeCore health/capabilities. This keeps expert edits and agent-generated rule suggestions on the JSON/config path instead of requiring `.mjs` code changes.

## Bundled Seeds

- `server/config/default-knowledge-taxonomy.json`
- `server/config/default-email-rules.json`

These files are importable seed configs. They are not the long-term authority after a workspace has its own runtime rules.

## Evolution Boundary

Agents and maintainers should submit JSON patches or full JSON replacements through the config files/API. They should not edit `.mjs` files to add vocabulary, synonyms, taxonomy paths, query triggers, negative terms, or prompt guidance.

Code is limited to schema normalization, validation, scoring, versioning, hot loading, and rollback support.
