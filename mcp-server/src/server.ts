import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { CliNotFoundError, cliTimeoutMs, runCli } from './cli.js';
import { authGuidance, NO_PROJECT_MESSAGE } from './errors.js';
import { findProjectRoot, setDefaultAuthId } from './project.js';
import { setupProject, setupProjectInputSchema, type SetupProjectParams } from './setup-project.js';
import { cliTools, type CliTool } from './tools.js';

const VERSION = '0.1.0';

function ok(textContent: string): CallToolResult {
  return { content: [{ type: 'text', text: textContent || '(no output)' }] };
}

function fail(textContent: string): CallToolResult {
  return { content: [{ type: 'text', text: textContent }], isError: true };
}

async function handleCliTool(tool: CliTool, params: Record<string, unknown>): Promise<CallToolResult> {
  const { projectPath, authId, ...rest } = params;
  const startDir = typeof projectPath === 'string' ? projectPath : process.cwd();

  let cwd = startDir;
  if (tool.requiresProject) {
    const root = findProjectRoot(startDir);
    if (!root) return fail(NO_PROJECT_MESSAGE);
    if (typeof authId === 'string' && authId.length > 0) setDefaultAuthId(root, authId);
    cwd = root;
  }

  try {
    const result = await runCli(tool.buildArgs(rest), cwd);
    if (result.timedOut) {
      return fail(
        `The suitecloud CLI did not finish within ${cliTimeoutMs()} ms and was killed. ` +
          'A deploy may still complete server-side — check the account before retrying. ' +
          'Raise SUITECLOUD_MCP_TIMEOUT_MS to allow more time.\n\nPartial output:\n' +
          result.output,
      );
    }
    if (result.exitCode !== 0) {
      const guidance = authGuidance(result.output);
      return fail((guidance ? guidance + '\n\n' : '') + result.output);
    }
    return ok(result.output);
  } catch (error) {
    if (error instanceof CliNotFoundError) return fail(error.message);
    throw error;
  }
}

export function createServer(): McpServer {
  const server = new McpServer({ name: 'suitecloud-mcp', version: VERSION });

  for (const tool of cliTools) {
    server.registerTool(
      tool.name,
      { title: tool.title, description: tool.description, inputSchema: tool.inputSchema },
      (async (args: Record<string, unknown>) => handleCliTool(tool, args ?? {})) as never,
    );
  }

  server.registerTool(
    'setup_project',
    {
      title: 'Create SDF project',
      description:
        'Create a new SuiteCloud SDF project (suitecloud project:create) and set up SuiteScript ' +
        'autocompletion: installs @hitc/netsuite-types and writes tsconfig.json (language=ts) or ' +
        'jsconfig.json (language=js). Purely local; nothing touches the NetSuite account.',
      inputSchema: setupProjectInputSchema,
    },
    (async (args: Record<string, unknown>) => {
      try {
        return ok(await setupProject(args as unknown as SetupProjectParams));
      } catch (error) {
        if (error instanceof Error) return fail(error.message);
        throw error;
      }
    }) as never,
  );

  return server;
}
