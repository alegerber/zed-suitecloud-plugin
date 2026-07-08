const AUTH_PATTERNS: RegExp[] = [
  /account:setup/i,
  /auth(entication)? ?id/i,
  /token .*(expired|revoked|invalid)/i,
  /not authenticated/i,
];

export function authGuidance(cliOutput: string): string | null {
  if (!AUTH_PATTERNS.some((pattern) => pattern.test(cliOutput))) return null;
  return (
    'Authentication is missing or expired. Run `suitecloud account:setup` in a terminal ' +
    'inside the project directory (it is an interactive browser login and cannot run through ' +
    'this MCP server). Use the `list_auth` tool to see which auth IDs are already configured.'
  );
}

export const NO_PROJECT_MESSAGE =
  'No SuiteCloud project found at or above the given path (looked for `suitecloud.config.js` ' +
  'or `src/manifest.xml`). Pass `projectPath` pointing into an SDF project, or create one with ' +
  'the `setup_project` tool.';
