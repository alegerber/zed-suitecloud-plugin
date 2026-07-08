# Design: `suitecloud` — Zed extension for NetSuite SuiteCloud/SDF

**Date:** 2026-07-08
**Status:** Draft (approved section by section by the user)

## Goal

The first NetSuite extension for the Zed editor (as of July 2026 the
registry contains no extension matching "netsuite", "suitescript", or
"suitecloud"). It covers three areas:

1. **SuiteScript support** — autocomplete for JS+JSDoc and TypeScript
   workflows, solved via project scaffolding with `@hitc/netsuite-types`
   (Zed's built-in TypeScript language server does the actual work).
2. **SDF XML support** — language detection, syntax highlighting, and
   snippets for SDF object files, `deploy.xml`, and `manifest.xml`.
3. **suitecloud CLI workflow** — deploy, validate, import, etc. via a
   bundled MCP server for Zed's Agent Panel (and any other MCP client).

**Non-goals (v1):** semantic validation / autocomplete for SDF XML
(a dedicated language server is a v2 candidate), `project:package`,
interactive account authentication handled by the server.

## Naming

- Extension ID: `suitecloud`, display name "SuiteCloud"
- npm package for the MCP server: `suitecloud-mcp`
- The description references NetSuite/SDF/SuiteScript descriptively; the
  README carries a "not affiliated with Oracle/NetSuite" disclaimer
  (trademark law).

## Architecture & repo structure

Monorepo with two independently published artifacts:

```
zed-suitecloud-plugin/
├── extension.toml            # Zed extension manifest (id = "suitecloud")
├── Cargo.toml                # Rust/WASM extension
├── src/
│   └── lib.rs                # registers the MCP server (launch command)
├── languages/
│   └── sdf-xml/
│       ├── config.toml       # file detection (path_suffixes, first_line_pattern)
│       └── highlights.scm    # tree-sitter highlighting queries
├── snippets/
│   └── snippets.json         # SuiteScript & SDF XML snippets
├── mcp-server/               # standalone npm package "suitecloud-mcp"
│   ├── package.json
│   ├── src/                  # TypeScript, @modelcontextprotocol/sdk
│   └── tests/
└── README.md                 # setup, tasks.json examples, disclaimer
```

Decisions:

- The **Zed extension is deliberately thin** ("installer + manifest"):
  language, snippets, `[context_servers]` entry. It installs
  `suitecloud-mcp` at runtime via npm (capability `npm:install`).
- The **MCP server is a standalone npm package** and also works outside
  of Zed (Claude Code, Claude Desktop, Cursor, …).
- **No custom grammar:** `tree-sitter-xml` is referenced in
  `extension.toml`; we only contribute detection rules and queries.
- Runtime prerequisites on the user's machine: Node.js,
  `@oracle/suitecloud-cli` (global, requires Java). A missing CLI is
  reported by the MCP server as a tool error with install instructions.

## MCP server: tools

One tool per use case (not per CLI flag):

| Tool | Wraps | Purpose / parameters |
|---|---|---|
| `setup_project` | `project:create` + npm | Scaffold an SDF project, install `@hitc/netsuite-types`, create `tsconfig.json`/`jsconfig.json`. Parameters: `type: ACP\|SuiteApp`, `language: ts\|js` |
| `deploy` | `project:deploy` | Deploy; `dryRun: true` → `--dryrun` |
| `validate` | `project:validate` | locally or with `--server` |
| `import_objects` | `object:import` | import objects by type + script ID |
| `list_objects` | `object:list` | list objects in the account (filter: type) |
| `upload_files` | `file:upload` | upload files from `FileCabinet/` |
| `import_files` | `file:import` | pull File Cabinet files into the project |
| `add_dependencies` | `project:adddependencies` | add missing manifest.xml dependencies |
| `list_auth` | `account:manageauth --list` | show configured auth IDs |

- TypeScript, official `@modelcontextprotocol/sdk`, **stdio transport**.
- Every tool: optional `projectPath` (default: cwd) and `authId`
  pass-through (multi-account: sandbox vs. production).
- **Omitted:** `account:setup` (interactive browser OAuth — when auth is
  missing, the server responds with an instruction to run it in a
  terminal).
- `deploy` is the only writing/dangerous operation: its description
  instructs agents to use `dryRun` first unless the user explicitly
  confirmed a deploy.
- Tool descriptions carry the semantics ("descriptions are the API").

## Error handling & auth

**Core principle:** the server never holds credentials. Tokens live in
the suitecloud CLI's token store; the server only passes `--authid`
through.

| Situation | Behavior |
|---|---|
| CLI missing (`ENOENT`) | error with `npm i -g @oracle/suitecloud-cli` + Java note |
| Auth missing/expired | detect → instruct to run `suitecloud account:setup` + list existing auth IDs |
| No SDF project | upward search for `suitecloud.config.js`/`src/manifest.xml`; otherwise a clear error + pointer to `setup_project` |
| Validation/deploy errors | exit code ≠ 0 → `isError: true`, pass CLI output through unchanged (contains file + line) |
| Timeout | default 10 min, configurable via env var; message that the deploy may continue server-side |

- **No output parsing:** pass stdout/stderr through cleaned only of
  ANSI/spinner characters — the consumer is an LLM; CLI updates won't
  break us this way.
- **Non-interactive guarantee:** stdin is closed; interactive CLI prompts
  are answered via flags derived from tool parameters, or the tool aborts
  with an explanation.

## SDF XML language & snippets

Language "SDF XML" based on `tree-sitter-xml`. Detection must not hijack
generic XML — hence two-staged:

1. `path_suffixes`: exactly `deploy.xml`, `manifest.xml`.
2. `first_line_pattern`: regex on SDF root elements
   (`<customrecordtype`, `<clientscript`, `<usereventscript`,
   `<workflow`, `<savedsearch`, `<suitelet`, `<restlet`,
   `<mapreducescript`, …) — SDF object XML practically always starts
   directly with the root element including `scriptid=`.
3. Fallback in the README: manual mapping via Zed's `file_types` setting.

**Verified constraint (Zed source, July 2026):** `first_line_pattern` is a
last-resort fallback in Zed's language matching — it is only evaluated when
no registered language matches the path suffix, and it scores a hardcoded
minimum. Any installed extension claiming `path_suffixes = ["xml"]`
therefore always wins over first-line detection for object files, and this
cannot be fixed from within this extension. With a generic XML extension
installed, the user `file_types` setting (precedence tier `UserConfigured`,
beats all extension matches) is the reliable mechanism — the README
documents it as a regular setup step, not an edge case. `deploy.xml` and
`manifest.xml` are unaffected (name-based suffix match).

Highlighting: standard XML queries; additionally highlight `scriptid`
attributes and `[scriptid=...]` references.

### Snippets

**SuiteScript** (scope: JavaScript and TypeScript; the JS variant uses
JSDoc types, the TS variant imports from `@hitc/netsuite-types`; all with
a correct `@NApiVersion 2.1` / `@NScriptType` header and tab stops):

| Prefix | Template |
|---|---|
| `nsue` | UserEvent (beforeLoad/beforeSubmit/afterSubmit) |
| `nssl` | Suitelet (onRequest) |
| `nsmr` | Map/Reduce (getInputData/map/reduce/summarize) |
| `nsrl` | RESTlet (get/post/put/delete) |
| `nscs` | Client Script (pageInit, fieldChanged, saveRecord) |
| `nssch` | Scheduled Script (execute) |
| `nswa` | Workflow Action Script |
| `nsmod` | empty AMD module (`define([...])`) |

**SDF XML** (scope: SDF XML): skeletons for `deploy.xml`, `manifest.xml`
(ACP + SuiteApp), custom record, custom field, script deployment block.

## Testing

**MCP server (automated, CI):**
- Unit tests (Vitest): error classification, project root search, flag
  mapping — child process mocked.
- Integration tests against a **fake CLI** (test script emits defined
  stdout/exit codes) — full tool behavior without a NetSuite account and
  without Java in CI.
- Manual smoke test against a sandbox account before each release
  (checklist: `deploy dryRun`, `list_objects`, `import_objects`) —
  deliberately not in CI.

**Zed extension:**
- CI: `cargo build` against the WASM target required by the current
  `zed_extension_api` (wasip1/wasip2 — verify during implementation),
  validation of `extension.toml` and `snippets.json`.
- Manual checklist with fixture files (`deploy.xml`, a custom record, a
  non-SDF XML) via "Install Dev Extension": SDF files detected, plain XML
  untouched, snippets in the right scope.

## Release

1. **npm first:** publish `suitecloud-mcp` (the extension installs it at
   runtime).
2. **Zed registry:** PR against `zed-industries/extensions` (submodule +
   `extensions.toml` entry). Prerequisites: public GitHub repo, MIT
   license, README.
3. **Independent SemVer** for the extension and the npm package; the
   extension pins a minimum server version. Registry updates can be
   automated via `zed-extension-action`.
4. **README essentials:** setup (CLI + Java + `account:setup`),
   `tasks.json` examples for classic deploy tasks, MCP usage outside of
   Zed, Oracle disclaimer.
5. **CI (GitHub Actions):** Rust build, Vitest, lints; npm publish
   triggered by git tag.

## Open items / v2 candidates

- Dedicated language server for semantic SDF XML validation and field
  autocomplete (schemas would have to be extracted from the Oracle docs
  and maintained — a multi-month project).
- `project:package` and further CLI commands as needed.
- **Splitting `mcp-server/` into its own repository.** Deliberately kept in
  the monorepo for v1: the coupling surface is a single string (the npm
  package name in `src/lib.rs`), releases are already decoupled
  (independent SemVer, `mcp-v*`-tag-scoped npm publish), and one repo means
  one CI/issue tracker/README for a solo maintainer. Revisit when one of
  these triggers fires: (a) Zed's announced deprecation of MCP-server
  extensions in favor of the official MCP registry becomes concrete —
  the extension then shrinks to language + snippets and the server stands
  alone; (b) the server develops its own non-Zed audience (issues/PRs
  from Claude Code/Cursor/Claude Desktop users mixing into the tracker);
  (c) ownership diverges. The split stays cheap at any point:
  `git subtree split` (or `git filter-repo`) extracts `mcp-server/` with
  full history; afterwards only the `repository` field in package.json
  needs updating.
