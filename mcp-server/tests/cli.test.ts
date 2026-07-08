import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { CliNotFoundError, runCli, stripAnsi } from '../src/cli.js';

const here = dirname(fileURLToPath(import.meta.url));
export const FAKE_CLI = join(here, 'fake-cli.mjs');

const ENV_KEYS = [
  'SUITECLOUD_MCP_BIN',
  'SUITECLOUD_MCP_TIMEOUT_MS',
  'FAKE_CLI_STDOUT',
  'FAKE_CLI_STDERR',
  'FAKE_CLI_EXIT',
  'FAKE_CLI_SLEEP_MS',
];

afterEach(() => {
  for (const key of ENV_KEYS) delete process.env[key];
});

describe('stripAnsi', () => {
  it('removes color codes and spinner control sequences', () => {
    expect(stripAnsi('\u001b[32mOK\u001b[0m done')).toBe('OK done');
  });
});

describe('runCli', () => {
  it('returns combined output and exit code 0 on success', async () => {
    process.env.SUITECLOUD_MCP_BIN = FAKE_CLI;
    const result = await runCli(['project:deploy', '--dryrun'], process.cwd());
    expect(result.exitCode).toBe(0);
    expect(result.timedOut).toBe(false);
    expect(result.output).toBe('ARGS:["project:deploy","--dryrun"]');
  });

  it('captures stderr and non-zero exit codes', async () => {
    process.env.SUITECLOUD_MCP_BIN = FAKE_CLI;
    process.env.FAKE_CLI_STDOUT = 'partial ';
    process.env.FAKE_CLI_STDERR = 'boom';
    process.env.FAKE_CLI_EXIT = '2';
    const result = await runCli(['project:validate'], process.cwd());
    expect(result.exitCode).toBe(2);
    expect(result.output).toContain('partial');
    expect(result.output).toContain('boom');
  });

  it('throws CliNotFoundError when the binary does not exist', async () => {
    process.env.SUITECLOUD_MCP_BIN = '/nonexistent/suitecloud-binary';
    await expect(runCli(['project:deploy'], process.cwd())).rejects.toBeInstanceOf(CliNotFoundError);
  });

  it('kills the process and reports timedOut when the timeout elapses', async () => {
    process.env.SUITECLOUD_MCP_BIN = FAKE_CLI;
    process.env.FAKE_CLI_SLEEP_MS = '5000';
    process.env.SUITECLOUD_MCP_TIMEOUT_MS = '200';
    const result = await runCli(['project:deploy'], process.cwd());
    expect(result.timedOut).toBe(true);
  });
});
