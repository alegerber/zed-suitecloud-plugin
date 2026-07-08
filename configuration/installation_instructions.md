The SuiteCloud context server wraps the `suitecloud` CLI. Prerequisites:

1. Install the CLI: `npm install -g @oracle/suitecloud-cli` (requires Java 17+).
2. Connect an account once: run `suitecloud account:setup` in a terminal inside
   your SDF project (interactive browser login).

No further settings are required. The server runs the CLI in your project
directory; use the `list_auth` tool to check which accounts are configured.
