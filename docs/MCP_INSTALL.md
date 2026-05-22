# AgentStudio MCP Release Install

AgentStudio MCP is distributed as a GitHub Release connector package. A normal
user does not need to clone the AgentStudio repository or install Node.js.

## One Command

```bash
/bin/sh -c "$(curl -fsSL https://github.com/Unka-Malloc/AgentStudio/releases/latest/download/agentstudio-mcp-install.sh)"
```

The command downloads the latest portable zip from GitHub Releases, verifies its
SHA256 checksum, installs the connector under `~/.agentstudio/mcp/connector`,
registers the local AgentStudio MCP hub, and opens a multi-select TUI.

In the TUI:

- Use Up/Down or `j`/`k` to move.
- Press Space to select or clear a client.
- Press `a` to select or clear all detected clients.
- Press Enter to install the selected clients.
- Press `q` to cancel.

Supported targets are `codex`, `gemini-cli`, `kilo-code`, `copilot`,
`openclaw`, `hermes`, and `antigravity`. OpenClaw-compatible OrbStack agents such
as IronClaw or ZeroClaw are discovered through the same Claw-compatible scan.

## Options

Use a non-default AgentStudio server URL:

```bash
AGENTSTUDIO_MCP_BASE_URL=http://127.0.0.1:8787 \
  /bin/sh -c "$(curl -fsSL https://github.com/Unka-Malloc/AgentStudio/releases/latest/download/agentstudio-mcp-install.sh)"
```

Use a custom local install directory:

```bash
AGENTSTUDIO_MCP_INSTALL_DIR="$HOME/.local/share/agentstudio-mcp" \
  /bin/sh -c "$(curl -fsSL https://github.com/Unka-Malloc/AgentStudio/releases/latest/download/agentstudio-mcp-install.sh)"
```

Pass connector install flags after the shell command:

```bash
/bin/sh -c "$(curl -fsSL https://github.com/Unka-Malloc/AgentStudio/releases/latest/download/agentstudio-mcp-install.sh)" -- --no-verify
```

## Manual Portable Install

Download `agentstudio-mcp-connector-<version>-<platform>.zip` from GitHub
Releases, unzip it, then run:

```bash
./agentstudio-mcp install --url http://127.0.0.1:8787
```

The zip bundles its own Node.js runtime.

## Verify

```bash
~/.agentstudio/mcp/connector/current/agentstudio-mcp doctor --url http://127.0.0.1:8787
```

If an MCP token is available:

```bash
AGENTSTUDIO_MCP_TOKEN='<issued-token>' \
  ~/.agentstudio/mcp/connector/current/agentstudio-mcp doctor --url http://127.0.0.1:8787
```
