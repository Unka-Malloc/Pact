# AgentStudio MCP Connector

Release-packaged installer for connecting local AI agents to an AgentStudio MCP HTTP endpoint.

This package is the client-side connector only. It does not contain the AgentStudio server.

## Install

One command from GitHub Release:

```bash
/bin/sh -c "$(curl -fsSL https://github.com/Unka-Malloc/AgentStudio/releases/latest/download/agentstudio-mcp-install.sh)"
```

This downloads the portable connector zip, verifies its checksum, installs it under
`~/.agentstudio/mcp/connector`, registers the local AgentStudio MCP hub, then opens
the multi-select TUI.

For npm-based installs:

```bash
npx agentstudio-mcp-connector@latest register --url http://127.0.0.1:8787
```

This writes one local registry at `~/.agentstudio/mcp/servers.json`. It does not mutate any agent client config.

For one target:

```bash
agentstudio-mcp install
```

The interactive installer scans local clients and lets you choose one or more targets with the arrow keys and Space.

For scripts:

```bash
printf '%s\n' '<issued-token>' | npx agentstudio-mcp-connector@latest install \
  --url http://127.0.0.1:8787 \
  --target codex \
  --token-stdin
```

## Install Without Node.js

Use the portable zip release artifact instead of the npm package:

```bash
unzip agentstudio-mcp-connector-<version>-<platform>.zip
cd agentstudio-mcp-connector-<version>-<platform>
./agentstudio-mcp register --url http://127.0.0.1:8787
./agentstudio-mcp install
```

For scripts:

```bash
printf '%s\n' '<issued-token>' | ./agentstudio-mcp install \
  --url http://127.0.0.1:8787 \
  --target codex \
  --token-stdin
```

The portable zip package includes its own Node.js runtime. macOS users can open `install.command` and follow the prompts.

## Verify

```bash
AGENTSTUDIO_MCP_TOKEN='<issued-token>' npx agentstudio-mcp-connector@latest doctor \
  --url http://127.0.0.1:8787
```

## Discover Local Hub

```bash
npx agentstudio-mcp-connector@latest discover-local
```

Agents should use this command as the unified local discovery entrypoint.

## Scan Clients

```bash
npx agentstudio-mcp-connector@latest scan --json
```

## Uninstall

```bash
npx agentstudio-mcp-connector@latest uninstall --target codex
```

Supported targets: `codex`, `gemini-cli`, `kilo-code`, `copilot`, `openclaw`, `hermes`, `antigravity`.
