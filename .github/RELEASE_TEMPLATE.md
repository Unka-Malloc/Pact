# Pact v<VERSION>

This release brings [brief summary of the primary focus or theme of this release].

## Highlights
- **[Feature/Fix Name]:** [Brief description of the impact or what changed]
- **[Feature/Fix Name]:** [Brief description of the impact or what changed]

## Assets Included
- `pact-mcp-connector-<VERSION>.tgz` (Source package)
- `pact-mcp-connector-<VERSION>-macos-arm64.zip` (Portable runtime for macOS arm64)
- `pact-mcp-connector-<VERSION>-macos-arm64.tar.gz` (Portable runtime for macOS arm64)
- `pact-mcp-install.sh` (Bootstrap installer)
- `pact-mcp-uninstall.sh` (Uninstaller)
- `pact-mcp-release.json` (Release Manifest)
- `latest.json`

## Installation

Run the following command to automatically detect your environment, download the correct assets, and start the installer:

```bash
/bin/sh -c "$(curl -fsSL https://github.com/Unka-Malloc/Pact/releases/latest/download/pact-mcp-install.sh)"
```

## Uninstallation

To cleanly remove the connector and its configurations:

```bash
/bin/sh -c "$(curl -fsSL https://github.com/Unka-Malloc/Pact/releases/latest/download/pact-mcp-uninstall.sh)"
```
