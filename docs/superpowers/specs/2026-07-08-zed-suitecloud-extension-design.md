# Design: `suitecloud` — Zed-Extension für NetSuite SuiteCloud/SDF

**Datum:** 2026-07-08
**Status:** Entwurf (vom User abschnittsweise genehmigt)

## Ziel

Die erste NetSuite-Extension für den Zed-Editor (die Registry enthält Stand
Juli 2026 keine Extension zu „netsuite", „suitescript" oder „suitecloud").
Sie deckt drei Bereiche ab:

1. **SuiteScript-Unterstützung** — Autocomplete für JS+JSDoc- und
   TypeScript-Workflows, gelöst über Projekt-Scaffolding mit
   `@hitc/netsuite-types` (Zeds eingebauter TS-Language-Server übernimmt
   die eigentliche Arbeit).
2. **SDF-XML-Support** — Spracherkennung, Syntax-Highlighting und Snippets
   für SDF-Objektdateien, `deploy.xml` und `manifest.xml`.
3. **suitecloud-CLI-Workflow** — deploy, validate, import etc. über einen
   mitgelieferten MCP-Server für Zeds Agent-Panel (und jeden anderen
   MCP-Client).

**Nicht-Ziele (v1):** semantische Validierung / Autocomplete für SDF-XML
(eigener Language Server = v2-Kandidat), `project:package`, interaktive
Account-Authentifizierung durch den Server.

## Namensgebung

- Extension-ID: `suitecloud`, Anzeigename „SuiteCloud"
- npm-Paket des MCP-Servers: `suitecloud-mcp`
- Beschreibung nennt NetSuite/SDF/SuiteScript beschreibend; README trägt
  einen Disclaimer „not affiliated with Oracle/NetSuite" (Markenrecht).

## Architektur & Repo-Struktur

Monorepo mit zwei getrennt veröffentlichten Artefakten:

```
zed-suitecloud-plugin/
├── extension.toml            # Zed-Extension-Manifest (id = "suitecloud")
├── Cargo.toml                # Rust/WASM-Extension
├── src/
│   └── lib.rs                # registriert den MCP-Server (Startkommando)
├── languages/
│   └── sdf-xml/
│       ├── config.toml       # Dateierkennung (path_suffixes, first_line_pattern)
│       └── highlights.scm    # Tree-sitter-Highlighting-Queries
├── snippets/
│   └── snippets.json         # SuiteScript- & SDF-XML-Snippets
├── mcp-server/               # eigenständiges npm-Paket "suitecloud-mcp"
│   ├── package.json
│   ├── src/                  # TypeScript, @modelcontextprotocol/sdk
│   └── tests/
└── README.md                 # Setup, tasks.json-Beispiele, Disclaimer
```

Entscheidungen:

- Die **Zed-Extension ist bewusst dünn** („Installer + Manifest"): Sprache,
  Snippets, `[context_servers]`-Eintrag. Sie installiert `suitecloud-mcp`
  zur Laufzeit via npm (Capability `npm:install`).
- Der **MCP-Server ist ein eigenständiges npm-Paket** und funktioniert auch
  außerhalb von Zed (Claude Code, Claude Desktop, Cursor, …).
- **Keine eigene Grammatik:** `tree-sitter-xml` wird im `extension.toml`
  referenziert; wir liefern nur Erkennungsregeln und Queries.
- Laufzeit-Voraussetzungen beim Nutzer: Node.js, `@oracle/suitecloud-cli`
  (global, benötigt Java). Fehlende CLI meldet der MCP-Server als
  Tool-Fehler mit Installationshinweis.

## MCP-Server: Tools

Ein Tool pro Anwendungsfall (nicht pro CLI-Flag):

| Tool | Wrappt | Zweck / Parameter |
|---|---|---|
| `setup_project` | `project:create` + npm | SDF-Projekt scaffolden, `@hitc/netsuite-types` installieren, `tsconfig.json`/`jsconfig.json` anlegen. Parameter: `type: ACP\|SuiteApp`, `language: ts\|js` |
| `deploy` | `project:deploy` | Deploy; `dryRun: true` → `--dryrun` |
| `validate` | `project:validate` | lokal oder `--server` |
| `import_objects` | `object:import` | Objekte per Typ + Script-ID importieren |
| `list_objects` | `object:list` | Objekte im Account auflisten (Filter: Typ) |
| `upload_files` | `file:upload` | Dateien aus `FileCabinet/` hochladen |
| `import_files` | `file:import` | File-Cabinet-Dateien ins Projekt holen |
| `add_dependencies` | `project:adddependencies` | manifest.xml-Abhängigkeiten ergänzen |
| `list_auth` | `account:manageauth --list` | konfigurierte Auth-IDs anzeigen |

- TypeScript, offizielles `@modelcontextprotocol/sdk`, **stdio-Transport**.
- Jedes Tool: optional `projectPath` (Default: cwd) und `authId`-Durchreichung
  (Multi-Account: Sandbox vs. Production).
- **Ausgelassen:** `account:setup` (interaktiver Browser-OAuth — Server
  antwortet bei fehlender Auth mit Anweisung, es im Terminal auszuführen).
- `deploy` ist die einzige schreibende/gefährliche Operation: Description
  weist Agents an, ohne explizite Nutzerbestätigung zuerst `dryRun` zu
  nutzen.
- Tool-Descriptions tragen die Semantik („Descriptions sind das API").

## Fehlerbehandlung & Auth

**Grundprinzip:** Der Server hält niemals Credentials. Tokens leben im
Token-Store der suitecloud-CLI; der Server reicht nur `--authid` durch.

| Situation | Verhalten |
|---|---|
| CLI fehlt (`ENOENT`) | Fehler mit `npm i -g @oracle/suitecloud-cli` + Java-Hinweis |
| Auth fehlt/abgelaufen | erkennen → Anweisung `suitecloud account:setup` + vorhandene Auth-IDs nennen |
| Kein SDF-Projekt | Aufwärtssuche nach `suitecloud.config.js`/`src/manifest.xml`; sonst klarer Fehler + Hinweis auf `setup_project` |
| Validierungs-/Deploy-Fehler | Exit-Code ≠ 0 → `isError: true`, CLI-Output unverändert durchreichen (enthält Datei+Zeile) |
| Timeout | Default 10 min, per Env-Var konfigurierbar; Meldung, dass der Deploy serverseitig weiterlaufen kann |

- **Kein Output-Parsing:** stdout/stderr nur von ANSI-/Spinner-Zeichen
  bereinigt durchreichen — der Konsument ist ein LLM; CLI-Updates brechen
  uns so nicht.
- **Non-Interactive-Garantie:** stdin gekappt; interaktive CLI-Rückfragen
  werden über Flags aus Tool-Parametern beantwortet oder das Tool bricht
  mit Erklärung ab.

## SDF-XML-Sprache & Snippets

Sprache „SDF XML" auf Basis `tree-sitter-xml`. Erkennung darf generisches
XML nicht kapern — daher zweistufig:

1. `path_suffixes`: exakt `deploy.xml`, `manifest.xml`.
2. `first_line_pattern`: Regex auf SDF-Root-Elemente
   (`<customrecordtype`, `<clientscript`, `<usereventscript`, `<workflow`,
   `<savedsearch`, `<suitelet`, `<restlet`, `<mapreducescript`, …) —
   SDF-Objekt-XML beginnt praktisch immer direkt mit dem Root-Element
   inkl. `scriptid=`.
3. Fallback im README: manuelle Zuordnung über Zed-Setting `file_types`.

Highlighting: Standard-XML-Queries; zusätzlich `scriptid`-Attribute und
`[scriptid=...]`-Referenzen hervorheben.

### Snippets

**SuiteScript** (Scope: JavaScript und TypeScript; JS-Variante mit
JSDoc-Typen, TS-Variante mit Imports aus `@hitc/netsuite-types`; alle mit
korrektem `@NApiVersion 2.1` / `@NScriptType`-Header und Tabstops):

| Präfix | Template |
|---|---|
| `nsue` | UserEvent (beforeLoad/beforeSubmit/afterSubmit) |
| `nssl` | Suitelet (onRequest) |
| `nsmr` | Map/Reduce (getInputData/map/reduce/summarize) |
| `nsrl` | RESTlet (get/post/put/delete) |
| `nscs` | Client Script (pageInit, fieldChanged, saveRecord) |
| `nssch` | Scheduled Script (execute) |
| `nswa` | Workflow Action Script |
| `nsmod` | leeres AMD-Modul (`define([...])`) |

**SDF XML** (Scope: SDF XML): Skelette für `deploy.xml`, `manifest.xml`
(ACP + SuiteApp), Custom Record, Custom Field, Script-Deployment-Block.

## Testing

**MCP-Server (automatisiert, CI):**
- Unit-Tests (Vitest): Fehlerklassifizierung, Projekt-Root-Suche,
  Flag-Mapping — Kindprozess gemockt.
- Integrationstests gegen eine **Fake-CLI** (Testskript gibt definierte
  stdout/Exit-Codes) — komplettes Tool-Verhalten ohne NetSuite-Account
  und ohne Java in der CI.
- Manueller Smoke-Test gegen Sandbox-Account vor Release (Checkliste:
  `deploy dryRun`, `list_objects`, `import_objects`) — bewusst nicht in CI.

**Zed-Extension:**
- CI: `cargo build` gegen das von der aktuellen `zed_extension_api`
  geforderte WASM-Target (wasip1/wasip2 — bei Implementierung prüfen),
  Validierung von `extension.toml` und `snippets.json`.
- Manuelle Checkliste mit Fixture-Dateien (`deploy.xml`, Custom Record,
  ein Nicht-SDF-XML) über „Install Dev Extension": SDF-Dateien erkannt,
  normales XML unberührt, Snippets im richtigen Scope.

## Release

1. **npm zuerst:** `suitecloud-mcp` publishen (Extension installiert es
   zur Laufzeit).
2. **Zed-Registry:** PR gegen `zed-industries/extensions` (Submodule +
   `extensions.toml`-Eintrag). Voraussetzungen: öffentliches GitHub-Repo,
   MIT-Lizenz, README.
3. **Unabhängige SemVer** für Extension und npm-Paket; Extension pinnt
   Minimum-Version des Servers. Updates der Registry per
   `zed-extension-action` automatisierbar.
4. **README-Pflichtteile:** Setup (CLI + Java + `account:setup`),
   `tasks.json`-Beispiele für klassische Deploy-Tasks, MCP-Nutzung
   außerhalb von Zed, Oracle-Disclaimer.
5. **CI (GitHub Actions):** Rust-Build, Vitest, Lints; npm-Publish per
   Git-Tag.

## Offene Punkte / v2-Kandidaten

- Eigener Language Server für semantische SDF-XML-Validierung und
  Feld-Autocomplete (Schemata müssten aus der Oracle-Doku extrahiert und
  gepflegt werden — Mehrmonatsprojekt).
- `project:package` und weitere CLI-Kommandos nach Bedarf.
