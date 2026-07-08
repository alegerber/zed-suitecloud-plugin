import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { createServer } from '../src/server.js';

const here = dirname(fileURLToPath(import.meta.url));
const FAKE_CLI = join(here, 'fake-cli.mjs');

afterEach(() => {
  for (const key of Object.keys(process.env).filter((k) => k.startsWith('FAKE_CLI') || k.startsWith('SUITECLOUD_MCP'))) {
    delete process.env[key];
  }
});

async function connect() {
  const client = new Client({ name: 'test-client', version: '0.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([client.connect(clientTransport), createServer().connect(serverTransport)]);
  return client;
}

function makeProject(): string {
  const root = mkdtempSync(join(tmpdir(), 'suitecloud-int-'));
  writeFileSync(join(root, 'suitecloud.config.js'), 'module.exports = {};\n');
  return root;
}

function text(result: Awaited<ReturnType<Client['callTool']>>): string {
  const content = result.content as Array<{ type: string; text?: string }>;
  return content.map((c) => c.text ?? '').join('');
}

describe('suitecloud-mcp server', () => {
  it('lists all nine tools', async () => {
    const client = await connect();
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      'add_dependencies',
      'deploy',
      'import_files',
      'import_objects',
      'list_auth',
      'list_objects',
      'setup_project',
      'upload_files',
      'validate',
    ]);
  });

  it('runs deploy with dryRun against the project root and sets authId', async () => {
    process.env.SUITECLOUD_MCP_BIN = FAKE_CLI;
    const root = makeProject();
    const client = await connect();
    const result = await client.callTool({
      name: 'deploy',
      arguments: { projectPath: root, dryRun: true, authId: 'sandbox' },
    });
    expect(result.isError ?? false).toBe(false);
    expect(text(result)).toBe('ARGS:["project:deploy","--dryrun"]');
    expect(JSON.parse(readFileSync(join(root, 'project.json'), 'utf8')).defaultAuthId).toBe('sandbox');
  });

  it('returns a clear error when no project exists', async () => {
    process.env.SUITECLOUD_MCP_BIN = FAKE_CLI;
    const client = await connect();
    const result = await client.callTool({
      name: 'validate',
      arguments: { projectPath: mkdtempSync(join(tmpdir(), 'no-project-')) },
    });
    expect(result.isError).toBe(true);
    expect(text(result)).toContain('setup_project');
  });

  it('prepends auth guidance on auth failures', async () => {
    process.env.SUITECLOUD_MCP_BIN = FAKE_CLI;
    process.env.FAKE_CLI_EXIT = '1';
    process.env.FAKE_CLI_STDOUT = 'Error: No account has been set up. Run account:setup.';
    const root = makeProject();
    const client = await connect();
    const result = await client.callTool({ name: 'deploy', arguments: { projectPath: root } });
    expect(result.isError).toBe(true);
    expect(text(result)).toContain('suitecloud account:setup');
    expect(text(result)).toContain('No account has been set up');
  });

  it('reports a missing CLI as a tool error with install instructions', async () => {
    process.env.SUITECLOUD_MCP_BIN = '/nonexistent/suitecloud';
    const root = makeProject();
    const client = await connect();
    const result = await client.callTool({ name: 'validate', arguments: { projectPath: root } });
    expect(result.isError).toBe(true);
    expect(text(result)).toContain('@oracle/suitecloud-cli');
  });

  it('list_auth works without a project', async () => {
    process.env.SUITECLOUD_MCP_BIN = FAKE_CLI;
    const client = await connect();
    const result = await client.callTool({ name: 'list_auth', arguments: {} });
    expect(result.isError ?? false).toBe(false);
    expect(text(result)).toBe('ARGS:["account:manageauth","--list"]');
  });
});
