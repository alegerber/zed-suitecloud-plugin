# Manual release checklist

Run before every release. Automated tests cover the MCP server; these checks
cover what CI cannot: Zed integration and a real NetSuite sandbox.

## Zed integration (no account needed)

- [ ] `zed: extensions` → Install Dev Extension → repo root installs without errors
- [ ] `tests/fixtures/deploy.xml` opens as "SDF XML" with highlighting
- [ ] `tests/fixtures/customrecord_example.xml` opens as "SDF XML"
- [ ] `tests/fixtures/not-sdf.xml` does NOT open as "SDF XML"
- [ ] `nsue` expands in a `.js` buffer; `nsue` expands (with imports) in a `.ts` buffer
- [ ] `sdfrecord` expands in an SDF XML buffer
- [ ] Agent Panel lists the "SuiteCloud" context server as running (check `zed: open log` otherwise)

## Against a sandbox account (requires `suitecloud account:setup` done)

- [ ] `list_auth` returns the configured auth IDs
- [ ] `list_objects` with type filter returns objects
- [ ] `import_objects` pulls a known object into the project
- [ ] `deploy` with `dryRun=true` returns a preview and changes nothing
- [ ] `validate` with `server=true` succeeds

## Release steps

- [ ] `npm test --prefix mcp-server` green
- [ ] `cargo check --target wasm32-wasip2` green
- [ ] repository URL in extension.toml and package.json points at the real GitHub repo
- [ ] tag `mcp-vX.Y.Z` → npm publish workflow succeeds
- [ ] bump `version` in extension.toml, PR to zed-industries/extensions
