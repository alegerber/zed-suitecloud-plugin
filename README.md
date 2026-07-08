# SuiteCloud for Zed

NetSuite SuiteCloud/SDF support for the [Zed](https://zed.dev) editor:

- **SuiteScript snippets** — `nsue`, `nssl`, `nsmr`, `nsrl`, `nscs`, `nssch`, `nswa`, `nsmod`
  for JavaScript (JSDoc) and TypeScript, with correct `@NApiVersion`/`@NScriptType` headers.
- **SDF XML** — syntax highlighting and file detection for SDF object files,
  `deploy.xml`, and `manifest.xml`, plus snippets (`sdfdeploy`, `sdfmanifest`,
  `sdfmanifestapp`, `sdfrecord`, `sdffield`, `sdfdeployment`).
- **MCP server** — the bundled [`suitecloud-mcp`](./mcp-server) context server lets
  Zed's Agent Panel (or any MCP client) run the `suitecloud` CLI: deploy, validate,
  import objects and files, scaffold projects.

> Not affiliated with, endorsed by, or supported by Oracle or NetSuite.
> "NetSuite", "SuiteCloud", and "SuiteScript" are trademarks of Oracle.

## Prerequisites

| Requirement | Why |
|---|---|
| [Node.js](https://nodejs.org) ≥ 18 | runs the MCP server |
| `npm install -g @oracle/suitecloud-cli` | the CLI the MCP server wraps (needs Java 17+) |
| `suitecloud account:setup` (run once per project) | interactive browser login; the MCP server never handles credentials |

## SuiteScript autocomplete

Zed's built-in TypeScript language server provides full `N/*` module completions
once [`@hitc/netsuite-types`](https://www.npmjs.com/package/@hitc/netsuite-types)
is installed in your project. The fastest way: ask the agent to run the
`setup_project` tool, which scaffolds an SDF project **and** configures the types
(`tsconfig.json` for TypeScript, `jsconfig.json` for JavaScript with JSDoc).

For an existing project:

```bash
npm install --save-dev @hitc/netsuite-types
```

and add to `tsconfig.json`/`jsconfig.json`:

```json
{
  "compilerOptions": {
    "module": "amd",
    "moduleResolution": "node",
    "baseUrl": "node_modules/@hitc/netsuite-types",
    "paths": { "N": ["N"], "N/*": ["N/*"] }
  }
}
```

## MCP tools

`deploy` (supports `dryRun`), `validate`, `import_objects`, `list_objects`,
`upload_files`, `import_files`, `add_dependencies`, `list_auth`, `setup_project`.

Every project-scoped tool accepts `projectPath` and `authId` (switches the
project's `defaultAuthId` — useful for sandbox vs. production).

The server also works outside Zed:

```json
{
  "mcpServers": {
    "suitecloud": { "command": "npx", "args": ["-y", "suitecloud-mcp"] }
  }
}
```

## Classic tasks (without the agent)

Add to `.zed/tasks.json` in your project:

```json
[
  {
    "label": "suitecloud: validate",
    "command": "suitecloud",
    "args": ["project:validate"]
  },
  {
    "label": "suitecloud: deploy (dry run)",
    "command": "suitecloud",
    "args": ["project:deploy", "--dryrun"]
  },
  {
    "label": "suitecloud: deploy",
    "command": "suitecloud",
    "args": ["project:deploy"]
  }
]
```

## SDF XML detection

`deploy.xml` and `manifest.xml` are detected by name; object files are detected
by their first line (the typed root element, e.g. `<customrecordtype …`). If a
file is not picked up, map it manually in your Zed settings:

```json
{ "file_types": { "SDF XML": ["Objects/**/*.xml"] } }
```

## Development

```bash
npm test --prefix mcp-server        # MCP server tests (no NetSuite account needed)
cargo check --target wasm32-wasip2  # extension glue
```

Install locally via `zed: extensions` → "Install Dev Extension" → repo root.

## License

[MIT](./LICENSE)
