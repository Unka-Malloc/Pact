# Server Skills

`server/skills` stores server-side skill orchestration that composes application
services and loaded modules into named capabilities.

Keep this layer thin:

- `server/application` owns use-case coordination and service entrypoints.
- `server/modules` owns high-coupling optional modules and external runtimes.
- `server/skills` owns reusable capability wiring, prompts, and skill-level
  policies that call application services rather than bypassing them.
- Protocol contracts for external callers stay under the owning layer's
  `protocols` tree. Server-owned upstream contracts stay under
  `server/protocols`.

Skill code must not write into module runtime directories directly. It should
request work through application services or module public APIs so modules can
still be loaded, unloaded, and packaged independently.
