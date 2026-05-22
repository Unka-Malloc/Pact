# AgentStudio MCP Connector

Release-packaged installer for connecting local AI agents to an AgentStudio MCP HTTP endpoint.

This package is the client-side connector only. It does not contain the AgentStudio server.

## Install

One command from GitHub Release:

```bash
/bin/sh -c "$(curl -fsSL https://github.com/Unka-Malloc/AgentStudio/releases/latest/download/agentstudio-mcp-install.sh)"
```

This downloads the connector from GitHub Releases, verifies its checksum,
installs it under `~/.agentstudio/mcp/connector`, then opens the multi-select TUI.
If Node.js 20+ is available, the installer uses the small source package. If
Node.js is missing, it falls back to the larger portable zip with an embedded
runtime.

The connector does not assume a default IP address. It scans local AgentStudio
candidates, fetches MCP discovery, then verifies the `/api/mcp/handshake`
Ed25519 signature before using the endpoint.

For npm-based installs:

```bash
npx agentstudio-mcp-connector@latest register
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
  --target codex \
  --token-stdin
```

## Server Config

Manage the local connector's server address profiles:

```bash
agentstudio-mcp server-config --set --url http://<host>:<port> --name local
agentstudio-mcp server-config --switch local
agentstudio-mcp server-config --refresh
agentstudio-mcp server-config --reset
agentstudio-mcp server-config --list
```

`--set`, `--switch`, and `--refresh` verify the server's signed MCP handshake.
`--reset` clears the local server address config so future installs must discover
or configure a server again.

## Install Without Node.js

Use the portable zip release artifact instead of the npm package:

```bash
unzip agentstudio-mcp-connector-<version>-<platform>.zip
cd agentstudio-mcp-connector-<version>-<platform>
./agentstudio-mcp install
```

For scripts:

```bash
printf '%s\n' '<issued-token>' | ./agentstudio-mcp install \
  --target codex \
  --token-stdin
```

The portable zip package includes its own Node.js runtime. macOS users can open `install.command` and follow the prompts.

## Verify

```bash
AGENTSTUDIO_MCP_TOKEN='<issued-token>' npx agentstudio-mcp-connector@latest doctor
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
