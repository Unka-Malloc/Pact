# AgentStudio MCP Release Install

AgentStudio MCP is distributed as a GitHub Release connector package. A normal
user does not need to clone the AgentStudio repository. If Node.js 20+ is already
installed, the one-command installer uses the small source package; if Node.js is
missing, it falls back to the portable package with its own runtime.

## One Command

```bash
/bin/sh -c "$(curl -fsSL https://github.com/Unka-Malloc/AgentStudio/releases/latest/download/agentstudio-mcp-install.sh)"
```

The command downloads the latest connector from GitHub Releases, verifies its
SHA256 checksum, installs the connector under `~/.agentstudio/mcp/connector`,
and opens a multi-select TUI. On machines with Node.js 20+, this is the small
source tarball. On machines without Node.js, the script downloads the larger
portable zip that bundles Node.

The installer does not assume an IP address. Before it writes any agent config,
it scans local AgentStudio candidates, fetches MCP discovery, and verifies the
`/api/mcp/handshake` Ed25519 signature for the discovered server identity.
After a server is verified, the installer requests a local Tool Management grant
from AgentStudio and writes that token into the selected client configuration.
Users do not need to copy `AGENTSTUDIO_MCP_TOKEN` during normal install.

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

Use an explicit AgentStudio server URL only when automatic discovery cannot find
the intended service. The explicit URL still must pass signed handshake
verification:

```bash
AGENTSTUDIO_MCP_BASE_URL=http://<host>:<port> \
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

Manage local server address profiles:

```bash
~/.agentstudio/mcp/connector/current/agentstudio-mcp server-config --set --url http://<host>:<port> --name local
~/.agentstudio/mcp/connector/current/agentstudio-mcp server-config --switch local
~/.agentstudio/mcp/connector/current/agentstudio-mcp server-config --refresh
~/.agentstudio/mcp/connector/current/agentstudio-mcp server-config --reset
```

`--reset` clears the local connector server address config. The next install will
scan again and, if no signed AgentStudio service is found, offer
`skip, manually configure later`.

## Manual Portable Install

Download `agentstudio-mcp-connector-<version>-<platform>.zip` from GitHub
Releases, unzip it, then run:

```bash
./agentstudio-mcp install
```

The zip bundles its own Node.js runtime.

## Verify

```bash
~/.agentstudio/mcp/connector/current/agentstudio-mcp doctor
```

`doctor` can verify discovery without a token. To verify authenticated
`tools/list` and `tools/call`, use the token that was written for a client or
pass a pre-issued custom grant:

```bash
AGENTSTUDIO_MCP_TOKEN='<issued-token>' \
  ~/.agentstudio/mcp/connector/current/agentstudio-mcp doctor
```
