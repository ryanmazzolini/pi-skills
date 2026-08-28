# Firefox tab triage setup

This skill uses two local [Browser Control MCP](https://github.com/eyalzh/browser-control-mcp) servers so it can manage personal and secondary Firefox profiles independently.

## Security implications

Browser Control MCP can inspect and change real browser state. Tab titles and URLs—and browser history when requested—are sent to the active model and stored in Pi session data. The Firefox extension requires domain permission to read page content and per-tab authorization to capture screenshots. Those permissions do not protect tab titles or URLs.

Invoking this skill by name reduces accidental use; it is not a security boundary. Review the upstream server and extension before installing them. Check the extension's permissions, enabled tools, and audit log. Keep the secret files and your copied `.mcp.json` out of Git; the tracked example configuration contains no secrets. Do not reuse either profile's secret elsewhere.

Routine triage uses tab titles and URLs only. It does not read page content unless the request requires it.

## Prerequisites

- Pi with [pi-mcp-adapter](https://github.com/nicobailon/pi-mcp-adapter) installed
- Node.js 22 or newer
- Firefox with two profiles
- The authenticated GitHub CLI for pull request cleanup

Install the MCP adapter and restart Pi:

```bash
pi install npm:pi-mcp-adapter
```

## Build the local server

Use a dedicated local directory. Add the ignore rules before creating local configuration or secrets:

```bash
mkdir -p firefox-tabs
cd firefox-tabs
cat >> .gitignore <<'EOF'
.mcp.json
.secrets/
browser-control-mcp/
EOF

git clone https://github.com/eyalzh/browser-control-mcp.git
cd browser-control-mcp
npm install
npm run build
cd ..
```

Copy [the example MCP configuration](assets/mcp.example.json) to `.mcp.json` in this directory. If you cloned `pi-skills`, for example:

```bash
cp /path/to/pi-skills/skills/firefox-tab-triage/assets/mcp.example.json .mcp.json
```

Launch Pi from this directory so it discovers the project-local `.mcp.json`.

## Connect Firefox

1. Install [Browser Control MCP](https://addons.mozilla.org/en-US/firefox/addon/browser-control-mcp/) in both Firefox profiles.
2. In the personal profile's extension settings, use port `8089`.
3. In the secondary profile's extension settings, use port `8090`.
4. Save each extension's generated secret without putting it in shell history:

   ```bash
   install -d -m 700 .secrets
   bash -c 'read -rsp "Personal profile secret: " secret; printf "\n"; umask 077; printf "%s" "$secret" > .secrets/browser-control-personal'
   bash -c 'read -rsp "Secondary profile secret: " secret; printf "\n"; umask 077; printf "%s" "$secret" > .secrets/browser-control-secondary'
   chmod 600 .secrets/browser-control-*
   ```

5. Run `/reload` in Pi.
6. Open `/mcp` and verify that `browser-control-personal` and `browser-control-secondary` can connect.

The adapter reads each secret file only when it starts that profile's local server. Keep the Firefox extension settings and secret files aligned if you rotate a secret or change a port.
