# Pact Project Release Automation Skill

This skill defines the standard procedure for an AI agent to release a new version of the Pact MCP system.
It is explicitly prohibited from being exposed to downstream agents (`allowDownstream: false`) in the manifest.

## Prerequisites
- Working directory: The root of the Pact repository.
- GitHub CLI (`gh`) must be authenticated if generating a GitHub release.

## Release Procedure

When the user asks to release a new version (e.g. `v0.0.3`), the agent MUST follow these exact steps:

1. **Verify the Release Build:**
   Run `npm run server:verify:mcp-release` locally to ensure the build works and tests pass.

2. **Bump Versions in Code:**
   Update the version string to the new version (e.g. `0.0.3`) in the following files:
   - `package.json` (the root project)
   - `mcp-connector/package.json`
   - `server/platform/common/mcp/http-mcp-adapter.mjs` (variables `MCP_SERVER_VERSION` and `MCP_CONNECTOR_VERSION`)

3. **Commit and Tag:**
   Run the following terminal commands:
   ```bash
   git add package.json mcp-connector/package.json server/platform/common/mcp/http-mcp-adapter.mjs
   git commit -m "chore: bump version to <VERSION>"
   git tag v<VERSION>
   git push && git push --tags
   ```

4. **Generate Release Assets:**
   Run the release packaging script to generate the portable bundles and tarballs:
   ```bash
   npm run server:mcp:release
   ```
   This will output files to `build/release/mcp/`.

5. **Upload Assets to GitHub Release:**
   Use the GitHub CLI (`gh`) to upload the assets, ensuring you only upload the archive files and scripts (avoiding the unpacked directory).
   Before running this command, copy `.github/RELEASE_TEMPLATE.md` to a temporary file (e.g., `/tmp/release_notes.md`), fill in the highlights and details of the release, and then run:
   ```bash
   gh release create v<VERSION> build/release/mcp/*.zip build/release/mcp/*.tar.gz build/release/mcp/*.tgz build/release/mcp/*.sh build/release/mcp/*.json --title "v<VERSION>" -F /tmp/release_notes.md
   ```
