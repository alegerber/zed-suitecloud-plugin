import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { setupProject } from '../src/setup-project.js';

const here = dirname(fileURLToPath(import.meta.url));
const FAKE_CLI = join(here, 'fake-cli.mjs');

afterEach(() => {
  for (const key of Object.keys(process.env).filter((k) => k.startsWith('FAKE_CLI') || k.startsWith('SUITECLOUD_MCP'))) {
    delete process.env[key];
  }
});

function arrange() {
  process.env.SUITECLOUD_MCP_BIN = FAKE_CLI;
  process.env.SUITECLOUD_MCP_NPM_BIN = FAKE_CLI; // npm calls are faked too
  process.env.FAKE_CLI_MKDIR_FROM_PROJECTNAME = '1';
  return mkdtempSync(join(tmpdir(), 'suitecloud-setup-'));
}

describe('setupProject', () => {
  it('scaffolds a TypeScript ACP project with types and tsconfig', async () => {
    const parent = arrange();
    const summary = await setupProject({
      parentPath: parent,
      projectName: 'my-acp',
      type: 'ACP',
      language: 'ts',
    });
    const projectDir = join(parent, 'my-acp');
    expect(existsSync(join(projectDir, 'package.json'))).toBe(true);
    expect(existsSync(join(projectDir, 'tsconfig.json'))).toBe(true);
    expect(existsSync(join(projectDir, 'jsconfig.json'))).toBe(false);
    const tsconfig = JSON.parse(readFileSync(join(projectDir, 'tsconfig.json'), 'utf8'));
    expect(tsconfig.compilerOptions.paths['N/*']).toEqual(['N/*']);
    expect(summary).toContain('my-acp');
  });

  it('scaffolds a JavaScript project with jsconfig instead of tsconfig', async () => {
    const parent = arrange();
    await setupProject({ parentPath: parent, projectName: 'my-js', type: 'ACP', language: 'js' });
    const projectDir = join(parent, 'my-js');
    expect(existsSync(join(projectDir, 'jsconfig.json'))).toBe(true);
    expect(existsSync(join(projectDir, 'tsconfig.json'))).toBe(false);
  });

  it('requires publisherId, projectId and projectVersion for SuiteApps', async () => {
    const parent = arrange();
    await expect(
      setupProject({ parentPath: parent, projectName: 'app', type: 'SUITEAPP', language: 'ts' }),
    ).rejects.toThrow(/publisherId/);
  });

  it('fails with the CLI output when project:create fails', async () => {
    const parent = arrange();
    process.env.FAKE_CLI_EXIT = '1';
    process.env.FAKE_CLI_STDOUT = 'The project name is invalid.';
    await expect(
      setupProject({ parentPath: parent, projectName: 'bad name', type: 'ACP', language: 'ts' }),
    ).rejects.toThrow(/project name is invalid/);
  });
});
