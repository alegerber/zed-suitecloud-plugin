# SuiteCloud Zed Extension Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the `suitecloud` Zed extension (SDF XML language, SuiteScript snippets, MCP context server) plus the standalone `suitecloud-mcp` npm package that wraps the NetSuite `suitecloud` CLI.

**Architecture:** Monorepo with two artifacts. `mcp-server/` is a standalone TypeScript ESM npm package (`suitecloud-mcp`) exposing 9 MCP tools over stdio; it shells out to the `suitecloud` CLI and passes output through un-parsed. The repo root is a thin Rust→WASM Zed extension that declares the SDF XML language, snippets, and a `[context_servers]` entry whose Rust code npm-installs `suitecloud-mcp` at runtime.

**Tech Stack:** TypeScript 5 / Node ≥18 / `@modelcontextprotocol/sdk` v1 / zod v4 / Vitest; Rust (edition 2021) with `zed_extension_api = "0.7.0"`; `tree-sitter-xml` grammar (referenced, not vendored).

**Spec:** `docs/superpowers/specs/2026-07-08-zed-suitecloud-extension-design.md`

## Global Constraints

- All artifacts (code, comments, docs, commit messages) in **English**. Commit messages imperative.
- License: **MIT**, copyright "2026 Alexander Gerber".
- npm package name: `suitecloud-mcp`, version starts at `0.1.0`. Extension ID: `suitecloud`, version `0.1.0`.
- MCP SDK: `@modelcontextprotocol/sdk` **^1.29.0** (v1 — do NOT use the v2 beta packages `@modelcontextprotocol/server`/`client`). zod **^4.0.0**. Import paths need the `.js` suffix (`@modelcontextprotocol/sdk/server/mcp.js`).
- `mcp-server/` is ESM (`"type": "module"`, tsconfig `module: "Node16"`) — relative imports inside `src/` must use `.js` suffixes (`./cli.js`).
- Rust: `zed_extension_api = "0.7.0"`, `crate-type = ["cdylib"]`, target `wasm32-wasip2` (Zed builds the WASM itself on "Install Dev Extension"; CI builds it to catch compile errors). Rust must be installed via rustup.
- suitecloud CLI reference version: **3.1.3** (flags verified against `--help` output on 2026-07-08). The CLI has **no `--authid` flag**; auth selection works by writing `defaultAuthId` into `project.json` at the project root.
- The MCP server never stores or logs credentials. All CLI calls are non-interactive (stdin ignored, never pass `-i`).
- Env vars understood by the server: `SUITECLOUD_MCP_BIN` (CLI binary override, used by tests), `SUITECLOUD_MCP_NPM_BIN` (npm override, used by tests), `SUITECLOUD_MCP_TIMEOUT_MS` (default `600000`).
- GitHub repository URL: run `git remote get-url origin` and use that. If no remote exists yet, use `https://github.com/agerber/zed-suitecloud-plugin` and flag it in the task's commit message footer as `TODO(repo-url)` — it must be corrected before the registry PR (Task 10 re-checks).
- Run all commands from the repo root unless the step says otherwise. Tests: `npm test --prefix mcp-server` (equals `vitest run`).

---

### Task 1: Repo hygiene + MCP package scaffold + CLI process runner

**Files:**
- Create: `.gitignore`, `LICENSE`
- Create: `mcp-server/package.json`, `mcp-server/tsconfig.json`, `mcp-server/vitest.config.ts`
- Create: `mcp-server/src/cli.ts`
- Create: `mcp-server/tests/fake-cli.mjs`
- Test: `mcp-server/tests/cli.test.ts`

**Interfaces:**
- Consumes: nothing (first task).
- Produces (used by Tasks 2–5):
  - `runCli(args: string[], cwd: string): Promise<CliResult>` — spawns the suitecloud CLI.
  - `runProcess(command: string, args: string[], cwd: string): Promise<CliResult>` — generic runner (Task 4 uses it for npm).
  - `interface CliResult { exitCode: number; output: string; timedOut: boolean }` — `output` is combined stdout+stderr, ANSI-stripped.
  - `class CliNotFoundError extends Error` — thrown when the binary is missing (ENOENT).
  - `stripAnsi(text: string): string`, `cliBinary(): string`, `npmBinary(): string`, `cliTimeoutMs(): number`.
  - `tests/fake-cli.mjs` — fake CLI controlled via env vars `FAKE_CLI_STDOUT`, `FAKE_CLI_STDERR`, `FAKE_CLI_EXIT`, `FAKE_CLI_SLEEP_MS`, `FAKE_CLI_MKDIR_FROM_PROJECTNAME`. Default stdout is `ARGS:<json of argv>` so tests can assert forwarded flags.

- [ ] **Step 1: Create repo hygiene files**

`.gitignore`:

```gitignore
node_modules/
dist/
target/
*.log
.DS_Store
```

`LICENSE` (full MIT text):

```text
MIT License

Copyright (c) 2026 Alexander Gerber

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

- [ ] **Step 2: Create the package scaffold**

`mcp-server/package.json`:

```json
{
  "name": "suitecloud-mcp",
  "version": "0.1.0",
  "description": "MCP server for the NetSuite SuiteCloud (SDF) CLI: deploy, validate, import objects and files from any MCP client. Not affiliated with Oracle or NetSuite.",
  "type": "module",
  "bin": { "suitecloud-mcp": "dist/index.js" },
  "files": ["dist"],
  "engines": { "node": ">=18" },
  "license": "MIT",
  "keywords": ["mcp", "netsuite", "suitecloud", "sdf", "suitescript"],
  "scripts": {
    "build": "tsc && node -e \"require('node:fs').chmodSync('dist/index.js', 0o755)\"",
    "prepare": "npm run build",
    "test": "vitest run"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.29.0",
    "zod": "^4.0.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "typescript": "^5.6.0",
    "vitest": "^3.0.0"
  }
}
```

`mcp-server/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "skipLibCheck": true
  },
  "include": ["src"]
}
```

`mcp-server/vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    testTimeout: 15_000,
  },
});
```

Note: `src/index.ts` does not exist yet, so `npm run build` fails until Task 5 — that is expected; `prepare` only matters at publish time. Create an empty placeholder to keep `npm ci`/`prepare` from failing during development:

`mcp-server/src/index.ts`:

```typescript
#!/usr/bin/env node
// Entry point — wired up in the server task.
```

Run: `npm install --prefix mcp-server` (creates `package-lock.json` — commit it).

- [ ] **Step 3: Create the fake CLI test helper**

`mcp-server/tests/fake-cli.mjs`:

```javascript
#!/usr/bin/env node
// Fake suitecloud/npm binary for tests. Behavior is controlled via env vars.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);

const sleepMs = Number(process.env.FAKE_CLI_SLEEP_MS ?? 0);
if (sleepMs > 0) {
  await new Promise((resolve) => setTimeout(resolve, sleepMs));
}

// Simulate `suitecloud project:create`: create the project folder like the real CLI.
if (process.env.FAKE_CLI_MKDIR_FROM_PROJECTNAME === '1') {
  const i = args.indexOf('--projectname');
  if (i !== -1 && args[i + 1]) {
    const dir = join(process.cwd(), args[i + 1], 'src');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'manifest.xml'), '<manifest projecttype="ACCOUNTCUSTOMIZATION"/>\n');
  }
}

process.stdout.write(process.env.FAKE_CLI_STDOUT ?? `ARGS:${JSON.stringify(args)}`);
if (process.env.FAKE_CLI_STDERR) process.stderr.write(process.env.FAKE_CLI_STDERR);
process.exit(Number(process.env.FAKE_CLI_EXIT ?? 0));
```

Run: `chmod +x mcp-server/tests/fake-cli.mjs` (the shebang + exec bit let `spawn()` run it directly as `SUITECLOUD_MCP_BIN`).

- [ ] **Step 4: Write the failing tests for the process runner**

`mcp-server/tests/cli.test.ts`:

```typescript
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
```

- [ ] **Step 5: Run tests to verify they fail**

Run: `npm test --prefix mcp-server`
Expected: FAIL — `Cannot find module '../src/cli.js'` (or equivalent resolution error).

- [ ] **Step 6: Implement the process runner**

`mcp-server/src/cli.ts`:

```typescript
import { spawn } from 'node:child_process';

export interface CliResult {
  exitCode: number;
  output: string;
  timedOut: boolean;
}

export class CliNotFoundError extends Error {
  constructor(binary: string) {
    super(
      `Command \`${binary}\` was not found on PATH. Install the SuiteCloud CLI with ` +
        '`npm install -g @oracle/suitecloud-cli` (requires a Java 17+ runtime). ' +
        'See https://github.com/oracle/netsuite-suitecloud-sdk for details.',
    );
    this.name = 'CliNotFoundError';
  }
}

// CSI sequences (colors, cursor movement) and OSC sequences (terminal titles).
const ANSI_PATTERN = /\u001b\[[0-9;?]*[A-Za-z]|\u001b\][^\u0007]*(\u0007|\u001b\\)?/g;

export function stripAnsi(text: string): string {
  return text.replace(ANSI_PATTERN, '');
}

export function cliBinary(): string {
  return process.env.SUITECLOUD_MCP_BIN ?? 'suitecloud';
}

export function npmBinary(): string {
  return process.env.SUITECLOUD_MCP_NPM_BIN ?? 'npm';
}

export function cliTimeoutMs(): number {
  const parsed = Number(process.env.SUITECLOUD_MCP_TIMEOUT_MS);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 600_000;
}

export function runProcess(command: string, args: string[], cwd: string): Promise<CliResult> {
  return new Promise((resolve, reject) => {
    // stdin is 'ignore': the CLI must never wait for interactive input.
    const child = spawn(command, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, cliTimeoutMs());

    child.stdout.on('data', (chunk: Buffer) => (output += chunk.toString()));
    child.stderr.on('data', (chunk: Buffer) => (output += chunk.toString()));

    child.on('error', (err: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      if (err.code === 'ENOENT') reject(new CliNotFoundError(command));
      else reject(err);
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ exitCode: code ?? 1, output: stripAnsi(output), timedOut });
    });
  });
}

export function runCli(args: string[], cwd: string): Promise<CliResult> {
  return runProcess(cliBinary(), args, cwd);
}
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npm test --prefix mcp-server`
Expected: PASS (5 tests).

- [ ] **Step 8: Commit**

```bash
git add .gitignore LICENSE mcp-server
git commit -m "Add MCP server scaffold with suitecloud CLI process runner"
```

---

### Task 2: Project root discovery, auth-ID handling, failure interpretation

**Files:**
- Create: `mcp-server/src/project.ts`, `mcp-server/src/errors.ts`
- Test: `mcp-server/tests/project.test.ts`, `mcp-server/tests/errors.test.ts`

**Interfaces:**
- Consumes: nothing from Task 1 (pure fs/string logic).
- Produces (used by Tasks 3–5):
  - `findProjectRoot(startDir: string): string | null` — walks upward; a directory is a project root if it contains `suitecloud.config.js` OR `src/manifest.xml`.
  - `setDefaultAuthId(projectRoot: string, authId: string): void` — merges `{"defaultAuthId": ...}` into `<root>/project.json` (creates the file if missing).
  - `readDefaultAuthId(projectRoot: string): string | null`
  - `authGuidance(cliOutput: string): string | null` — returns remediation text if the output looks like an auth failure, else null.
  - `NO_PROJECT_MESSAGE: string` — error text pointing at `setup_project`.

- [ ] **Step 1: Write the failing tests**

`mcp-server/tests/project.test.ts`:

```typescript
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { findProjectRoot, readDefaultAuthId, setDefaultAuthId } from '../src/project.js';

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), 'suitecloud-mcp-'));
}

describe('findProjectRoot', () => {
  it('finds the root via suitecloud.config.js from a nested dir', () => {
    const root = tempDir();
    writeFileSync(join(root, 'suitecloud.config.js'), 'module.exports = {};\n');
    const nested = join(root, 'src', 'FileCabinet', 'SuiteScripts');
    mkdirSync(nested, { recursive: true });
    expect(findProjectRoot(nested)).toBe(root);
  });

  it('finds the root via src/manifest.xml', () => {
    const root = tempDir();
    mkdirSync(join(root, 'src'), { recursive: true });
    writeFileSync(join(root, 'src', 'manifest.xml'), '<manifest/>\n');
    expect(findProjectRoot(root)).toBe(root);
  });

  it('returns null when no project markers exist', () => {
    expect(findProjectRoot(tempDir())).toBeNull();
  });
});

describe('setDefaultAuthId / readDefaultAuthId', () => {
  it('creates project.json when missing', () => {
    const root = tempDir();
    setDefaultAuthId(root, 'sandbox');
    expect(JSON.parse(readFileSync(join(root, 'project.json'), 'utf8'))).toEqual({
      defaultAuthId: 'sandbox',
    });
  });

  it('merges into existing project.json without dropping other keys', () => {
    const root = tempDir();
    writeFileSync(join(root, 'project.json'), JSON.stringify({ defaultAuthId: 'old', other: 1 }));
    setDefaultAuthId(root, 'prod');
    expect(JSON.parse(readFileSync(join(root, 'project.json'), 'utf8'))).toEqual({
      defaultAuthId: 'prod',
      other: 1,
    });
    expect(readDefaultAuthId(root)).toBe('prod');
  });

  it('readDefaultAuthId returns null for missing or corrupt files', () => {
    const root = tempDir();
    expect(readDefaultAuthId(root)).toBeNull();
    writeFileSync(join(root, 'project.json'), '{not json');
    expect(readDefaultAuthId(root)).toBeNull();
  });
});
```

`mcp-server/tests/errors.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { authGuidance, NO_PROJECT_MESSAGE } from '../src/errors.js';

describe('authGuidance', () => {
  it.each([
    'Run "suitecloud account:setup" to configure an account.',
    'The authentication ID (authid) "prod" does not exist.',
    'Error: The token has expired or been revoked.',
    'You are not authenticated. Please log in.',
  ])('detects auth problems in: %s', (output) => {
    expect(authGuidance(output)).toContain('suitecloud account:setup');
  });

  it('returns null for ordinary validation errors', () => {
    expect(authGuidance('Validation failed: Objects/customrecord_x.xml line 12: invalid field')).toBeNull();
  });
});

describe('NO_PROJECT_MESSAGE', () => {
  it('points the caller at setup_project', () => {
    expect(NO_PROJECT_MESSAGE).toContain('setup_project');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test --prefix mcp-server`
Expected: FAIL — cannot resolve `../src/project.js` / `../src/errors.js`.

- [ ] **Step 3: Implement**

`mcp-server/src/project.ts`:

```typescript
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

export function findProjectRoot(startDir: string): string | null {
  let dir = resolve(startDir);
  for (;;) {
    if (existsSync(join(dir, 'suitecloud.config.js')) || existsSync(join(dir, 'src', 'manifest.xml'))) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

export function setDefaultAuthId(projectRoot: string, authId: string): void {
  const file = join(projectRoot, 'project.json');
  let data: Record<string, unknown> = {};
  if (existsSync(file)) {
    try {
      data = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
    } catch {
      // Corrupt file: rewrite it with just the auth ID.
    }
  }
  data.defaultAuthId = authId;
  writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
}

export function readDefaultAuthId(projectRoot: string): string | null {
  const file = join(projectRoot, 'project.json');
  if (!existsSync(file)) return null;
  try {
    const data = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
    return typeof data.defaultAuthId === 'string' ? data.defaultAuthId : null;
  } catch {
    return null;
  }
}
```

`mcp-server/src/errors.ts`:

```typescript
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test --prefix mcp-server`
Expected: PASS (all tests from Tasks 1–2).

- [ ] **Step 5: Commit**

```bash
git add mcp-server/src/project.ts mcp-server/src/errors.ts mcp-server/tests/project.test.ts mcp-server/tests/errors.test.ts
git commit -m "Add project root discovery, auth-ID handling, and failure interpretation"
```

---

### Task 3: CLI tool definitions (8 CLI-wrapping tools)

**Files:**
- Create: `mcp-server/src/tools.ts`
- Test: `mcp-server/tests/tools.test.ts`

**Interfaces:**
- Consumes: nothing at runtime (pure definitions; zod for schemas).
- Produces (used by Task 5):
  - `interface CliTool { name: string; title: string; description: string; requiresProject: boolean; inputSchema: Record<string, z.ZodType>; buildArgs(params: Record<string, unknown>): string[] }`
  - `const cliTools: CliTool[]` — 8 entries: `deploy`, `validate`, `import_objects`, `list_objects`, `upload_files`, `import_files`, `add_dependencies`, `list_auth`.
  - `const COMMON_INPUTS` — `{ projectPath: z.string().optional(), authId: z.string().optional() }` shape merged into every project-scoped tool (Task 5 relies on params named exactly `projectPath` and `authId`).

- [ ] **Step 1: Write the failing tests**

`mcp-server/tests/tools.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { cliTools } from '../src/tools.js';

function tool(name: string) {
  const found = cliTools.find((t) => t.name === name);
  if (!found) throw new Error(`tool ${name} not defined`);
  return found;
}

describe('tool inventory', () => {
  it('defines exactly the 8 CLI-wrapping tools', () => {
    expect(cliTools.map((t) => t.name).sort()).toEqual([
      'add_dependencies',
      'deploy',
      'import_files',
      'import_objects',
      'list_auth',
      'list_objects',
      'upload_files',
      'validate',
    ]);
  });

  it('every project-scoped tool accepts projectPath and authId', () => {
    for (const t of cliTools.filter((t) => t.requiresProject)) {
      expect(Object.keys(t.inputSchema)).toEqual(expect.arrayContaining(['projectPath', 'authId']));
    }
  });

  it('list_auth does not require a project', () => {
    expect(tool('list_auth').requiresProject).toBe(false);
  });

  it('deploy description tells agents to dry-run first', () => {
    expect(tool('deploy').description.toLowerCase()).toContain('dryrun');
  });
});

describe('buildArgs', () => {
  it('deploy maps dryRun and accountSpecificValues', () => {
    expect(tool('deploy').buildArgs({ dryRun: true, accountSpecificValues: 'WARNING' })).toEqual([
      'project:deploy',
      '--dryrun',
      '--accountspecificvalues',
      'WARNING',
    ]);
    expect(tool('deploy').buildArgs({})).toEqual(['project:deploy']);
  });

  it('validate maps server flag', () => {
    expect(tool('validate').buildArgs({ server: true })).toEqual(['project:validate', '--server']);
    expect(tool('validate').buildArgs({})).toEqual(['project:validate']);
  });

  it('import_objects maps type, scriptIds, destination folder default', () => {
    expect(
      tool('import_objects').buildArgs({ type: 'customrecordtype', scriptIds: ['customrecord_a', 'customrecord_b'] }),
    ).toEqual([
      'object:import',
      '--type',
      'customrecordtype',
      '--scriptid',
      'customrecord_a',
      'customrecord_b',
      '--destinationfolder',
      '/Objects',
    ]);
    expect(
      tool('import_objects').buildArgs({
        type: 'ALL',
        scriptIds: ['ALL'],
        destinationFolder: '/Objects/Imported',
        excludeFiles: true,
        appId: 'com.example.app',
      }),
    ).toEqual([
      'object:import',
      '--type',
      'ALL',
      '--scriptid',
      'ALL',
      '--destinationfolder',
      '/Objects/Imported',
      '--excludefiles',
      '--appid',
      'com.example.app',
    ]);
  });

  it('list_objects maps optional filters', () => {
    expect(tool('list_objects').buildArgs({})).toEqual(['object:list']);
    expect(tool('list_objects').buildArgs({ types: ['workflow', 'savedsearch'], scriptId: 'x' })).toEqual([
      'object:list',
      '--type',
      'workflow',
      'savedsearch',
      '--scriptid',
      'x',
    ]);
  });

  it('upload_files and import_files map paths', () => {
    expect(tool('upload_files').buildArgs({ paths: ['/SuiteScripts/a.js'] })).toEqual([
      'file:upload',
      '--paths',
      '/SuiteScripts/a.js',
    ]);
    expect(tool('import_files').buildArgs({ paths: ['/SuiteScripts/a.js'], excludeProperties: true })).toEqual([
      'file:import',
      '--paths',
      '/SuiteScripts/a.js',
      '--excludeproperties',
    ]);
  });

  it('add_dependencies and list_auth take no CLI flags', () => {
    expect(tool('add_dependencies').buildArgs({})).toEqual(['project:adddependencies']);
    expect(tool('list_auth').buildArgs({})).toEqual(['account:manageauth', '--list']);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test --prefix mcp-server`
Expected: FAIL — cannot resolve `../src/tools.js`.

- [ ] **Step 3: Implement the tool definitions**

`mcp-server/src/tools.ts`:

```typescript
import { z } from 'zod';

export interface CliTool {
  name: string;
  title: string;
  description: string;
  requiresProject: boolean;
  inputSchema: Record<string, z.ZodType>;
  buildArgs(params: Record<string, unknown>): string[];
}

export const COMMON_INPUTS = {
  projectPath: z
    .string()
    .optional()
    .describe('Path inside the SDF project. Defaults to the current working directory.'),
  authId: z
    .string()
    .optional()
    .describe(
      'SuiteCloud authentication ID to use. Sets defaultAuthId in project.json before running ' +
        '(the CLI has no per-command auth flag). Use list_auth to see available IDs.',
    ),
};

const accountSpecificValues = z
  .enum(['WARNING', 'ERROR'])
  .optional()
  .describe('How to treat account-specific values in ACP projects. Default (CLI): ERROR.');

export const cliTools: CliTool[] = [
  {
    name: 'deploy',
    title: 'Deploy project',
    description:
      'Deploy the SDF project to the connected NetSuite account (suitecloud project:deploy). ' +
      'THIS WRITES TO THE ACCOUNT. Unless the user has explicitly confirmed a real deploy, ' +
      'run with dryRun=true first and show the preview. Ask before deploying to production auth IDs.',
    requiresProject: true,
    inputSchema: {
      ...COMMON_INPUTS,
      dryRun: z.boolean().optional().describe('Preview the deploy without applying it (--dryrun).'),
      accountSpecificValues,
      applyInstallPrefs: z
        .boolean()
        .optional()
        .describe('Apply hiding.xml/locking.xml/overwriting.xml settings (SuiteApps only).'),
    },
    buildArgs(p) {
      const args = ['project:deploy'];
      if (p.dryRun) args.push('--dryrun');
      if (p.accountSpecificValues) args.push('--accountspecificvalues', String(p.accountSpecificValues));
      if (p.applyInstallPrefs) args.push('--applyinstallprefs');
      return args;
    },
  },
  {
    name: 'validate',
    title: 'Validate project',
    description:
      'Validate the SDF project (suitecloud project:validate). Read-only. ' +
      'Set server=true for a server-side validation against the account.',
    requiresProject: true,
    inputSchema: {
      ...COMMON_INPUTS,
      server: z.boolean().optional().describe('Validate on the NetSuite server instead of locally.'),
      accountSpecificValues,
    },
    buildArgs(p) {
      const args = ['project:validate'];
      if (p.server) args.push('--server');
      if (p.accountSpecificValues) args.push('--accountspecificvalues', String(p.accountSpecificValues));
      return args;
    },
  },
  {
    name: 'import_objects',
    title: 'Import objects',
    description:
      'Import custom objects from the NetSuite account into the project (suitecloud object:import). '
      + 'Overwrites local object files that already exist. Use list_objects first to discover types and script IDs.',
    requiresProject: true,
    inputSchema: {
      ...COMMON_INPUTS,
      type: z.string().describe('SDF object type (e.g. customrecordtype, workflow) or "ALL".'),
      scriptIds: z.array(z.string()).min(1).describe('Script IDs to import, or ["ALL"].'),
      destinationFolder: z
        .string()
        .optional()
        .describe('Folder inside /Objects to store the files. Default: /Objects.'),
      excludeFiles: z.boolean().optional().describe('Do not import referenced SuiteScript files (ACP only).'),
      appId: z.string().optional().describe('Application ID filter (SuiteApp objects).'),
    },
    buildArgs(p) {
      const args = [
        'object:import',
        '--type',
        String(p.type),
        '--scriptid',
        ...(p.scriptIds as string[]),
        '--destinationfolder',
        String(p.destinationFolder ?? '/Objects'),
      ];
      if (p.excludeFiles) args.push('--excludefiles');
      if (p.appId) args.push('--appid', String(p.appId));
      return args;
    },
  },
  {
    name: 'list_objects',
    title: 'List account objects',
    description: 'List custom objects deployed in the NetSuite account (suitecloud object:list). Read-only.',
    requiresProject: true,
    inputSchema: {
      ...COMMON_INPUTS,
      types: z.array(z.string()).optional().describe('Filter by SDF object types.'),
      scriptId: z.string().optional().describe('Filter by script ID substring.'),
      appId: z.string().optional().describe('Application ID filter.'),
    },
    buildArgs(p) {
      const args = ['object:list'];
      if (Array.isArray(p.types) && p.types.length > 0) args.push('--type', ...(p.types as string[]));
      if (p.scriptId) args.push('--scriptid', String(p.scriptId));
      if (p.appId) args.push('--appid', String(p.appId));
      return args;
    },
  },
  {
    name: 'upload_files',
    title: 'Upload files',
    description:
      'Upload files from the project FileCabinet folder to the NetSuite account (suitecloud file:upload). ' +
      'THIS OVERWRITES the files in the account.',
    requiresProject: true,
    inputSchema: {
      ...COMMON_INPUTS,
      paths: z
        .array(z.string())
        .min(1)
        .describe('File Cabinet paths, e.g. ["/SuiteScripts/my_script.js"].'),
    },
    buildArgs(p) {
      return ['file:upload', '--paths', ...(p.paths as string[])];
    },
  },
  {
    name: 'import_files',
    title: 'Import files',
    description:
      'Import File Cabinet files from the account into the project (suitecloud file:import; ACP only). ' +
      'Overwrites local copies.',
    requiresProject: true,
    inputSchema: {
      ...COMMON_INPUTS,
      paths: z.array(z.string()).min(1).describe('File Cabinet paths to import.'),
      excludeProperties: z.boolean().optional().describe('Skip .attributes property folders.'),
    },
    buildArgs(p) {
      const args = ['file:import', '--paths', ...(p.paths as string[])];
      if (p.excludeProperties) args.push('--excludeproperties');
      return args;
    },
  },
  {
    name: 'add_dependencies',
    title: 'Add manifest dependencies',
    description: 'Add missing dependencies to manifest.xml (suitecloud project:adddependencies). Modifies manifest.xml only.',
    requiresProject: true,
    inputSchema: { ...COMMON_INPUTS },
    buildArgs() {
      return ['project:adddependencies'];
    },
  },
  {
    name: 'list_auth',
    title: 'List auth IDs',
    description:
      'List the SuiteCloud authentication IDs configured on this machine (suitecloud account:manageauth --list). ' +
      'Read-only. To add one, the user must run `suitecloud account:setup` in a terminal.',
    requiresProject: false,
    inputSchema: {
      projectPath: COMMON_INPUTS.projectPath,
    },
    buildArgs() {
      return ['account:manageauth', '--list'];
    },
  },
];
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test --prefix mcp-server`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add mcp-server/src/tools.ts mcp-server/tests/tools.test.ts
git commit -m "Define the eight CLI-wrapping MCP tools with flag mapping"
```

---

### Task 4: `setup_project` tool

**Files:**
- Create: `mcp-server/src/setup-project.ts`
- Test: `mcp-server/tests/setup-project.test.ts`

**Interfaces:**
- Consumes: `runCli`, `runProcess`, `npmBinary` from `./cli.js` (Task 1).
- Produces (used by Task 5):
  - `setupProject(params: SetupProjectParams): Promise<string>` — returns a human-readable summary; throws `Error` with a descriptive message on any failed step.
  - `const setupProjectInputSchema: Record<string, z.ZodType>` — zod raw shape.
  - `interface SetupProjectParams { parentPath?: string; projectName: string; type: 'ACP' | 'SUITEAPP'; language: 'ts' | 'js'; publisherId?: string; projectId?: string; projectVersion?: string }`

- [ ] **Step 1: Write the failing tests**

`mcp-server/tests/setup-project.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test --prefix mcp-server`
Expected: FAIL — cannot resolve `../src/setup-project.js`.

- [ ] **Step 3: Implement**

`mcp-server/src/setup-project.ts`:

```typescript
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { npmBinary, runCli, runProcess } from './cli.js';

export interface SetupProjectParams {
  parentPath?: string;
  projectName: string;
  type: 'ACP' | 'SUITEAPP';
  language: 'ts' | 'js';
  publisherId?: string;
  projectId?: string;
  projectVersion?: string;
}

export const setupProjectInputSchema: Record<string, z.ZodType> = {
  parentPath: z.string().optional().describe('Directory to create the project in. Defaults to cwd.'),
  projectName: z.string().describe('Name of the project folder to create.'),
  type: z.enum(['ACP', 'SUITEAPP']).describe('ACP = account customization project.'),
  language: z.enum(['ts', 'js']).describe('ts: tsconfig + typescript; js: jsconfig for JSDoc completions.'),
  publisherId: z.string().optional().describe('SuiteApp only, e.g. com.example.'),
  projectId: z.string().optional().describe('SuiteApp only.'),
  projectVersion: z.string().optional().describe('SuiteApp only, e.g. 1.0.0.'),
};

const TSCONFIG = {
  compilerOptions: {
    module: 'amd',
    target: 'es2019',
    moduleResolution: 'node',
    strict: true,
    esModuleInterop: false,
    baseUrl: 'node_modules/@hitc/netsuite-types',
    paths: { N: ['N'], 'N/*': ['N/*'] },
    outDir: 'src/FileCabinet/SuiteScripts',
  },
  include: ['src/TypeScript/**/*.ts'],
};

const JSCONFIG = {
  compilerOptions: {
    module: 'amd',
    target: 'es2019',
    moduleResolution: 'node',
    baseUrl: 'node_modules/@hitc/netsuite-types',
    paths: { N: ['N'], 'N/*': ['N/*'] },
  },
  include: ['src/FileCabinet/**/*.js'],
};

export async function setupProject(params: SetupProjectParams): Promise<string> {
  const parent = params.parentPath ?? process.cwd();

  const createArgs = [
    'project:create',
    '--type',
    params.type === 'ACP' ? 'ACCOUNTCUSTOMIZATION' : 'SUITEAPP',
    '--projectname',
    params.projectName,
  ];
  if (params.type === 'SUITEAPP') {
    if (!params.publisherId || !params.projectId || !params.projectVersion) {
      throw new Error('SuiteApp projects require publisherId, projectId, and projectVersion.');
    }
    createArgs.push(
      '--publisherid', params.publisherId,
      '--projectid', params.projectId,
      '--projectversion', params.projectVersion,
    );
  }

  const created = await runCli(createArgs, parent);
  if (created.exitCode !== 0) {
    throw new Error(`suitecloud project:create failed:\n${created.output}`);
  }

  // The CLI names SuiteApp folders after publisherid.projectid; ACP folders after projectname.
  const acpDir = join(parent, params.projectName);
  const suiteAppDir = params.type === 'SUITEAPP' ? join(parent, `${params.publisherId}.${params.projectId}`) : null;
  const projectDir = suiteAppDir && existsSync(suiteAppDir) ? suiteAppDir : acpDir;
  if (!existsSync(projectDir)) {
    throw new Error(`project:create reported success but the project folder was not found near ${acpDir}.`);
  }

  writeFileSync(
    join(projectDir, 'package.json'),
    JSON.stringify({ name: params.projectName, private: true, version: '0.0.0' }, null, 2) + '\n',
  );

  const npmPackages = ['@hitc/netsuite-types', ...(params.language === 'ts' ? ['typescript'] : [])];
  const installed = await runProcess(npmBinary(), ['install', '--save-dev', ...npmPackages], projectDir);
  if (installed.exitCode !== 0) {
    throw new Error(`npm install failed:\n${installed.output}`);
  }

  const configName = params.language === 'ts' ? 'tsconfig.json' : 'jsconfig.json';
  const config = params.language === 'ts' ? TSCONFIG : JSCONFIG;
  writeFileSync(join(projectDir, configName), JSON.stringify(config, null, 2) + '\n');

  return [
    `Created ${params.type} project "${params.projectName}" at ${projectDir}.`,
    `Installed ${npmPackages.join(', ')} and wrote ${configName} (SuiteScript N/* module completions).`,
    'Next step: run `suitecloud account:setup` in a terminal inside the project to connect a NetSuite account.',
  ].join('\n');
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test --prefix mcp-server`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add mcp-server/src/setup-project.ts mcp-server/tests/setup-project.test.ts
git commit -m "Add setup_project tool: scaffold SDF project with NetSuite types"
```

---

### Task 5: Server wiring + integration tests

**Files:**
- Create: `mcp-server/src/server.ts`
- Modify: `mcp-server/src/index.ts` (replace placeholder)
- Test: `mcp-server/tests/integration.test.ts`

**Interfaces:**
- Consumes: `cliTools`, `CliTool` (Task 3), `setupProject`, `setupProjectInputSchema` (Task 4), `runCli`, `CliNotFoundError`, `cliTimeoutMs` (Task 1), `findProjectRoot`, `setDefaultAuthId` (Task 2), `authGuidance`, `NO_PROJECT_MESSAGE` (Task 2).
- Produces:
  - `createServer(): McpServer` — fully wired server (exported for in-process tests).
  - `dist/index.js` — the published stdio entry (`bin` target).

- [ ] **Step 1: Write the failing integration tests**

`mcp-server/tests/integration.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test --prefix mcp-server`
Expected: FAIL — cannot resolve `../src/server.js`.

- [ ] **Step 3: Implement the server**

`mcp-server/src/server.ts`:

```typescript
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
      async (args: Record<string, unknown>) => handleCliTool(tool, args ?? {}),
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
    async (args: Record<string, unknown>) => {
      try {
        return ok(await setupProject(args as unknown as SetupProjectParams));
      } catch (error) {
        if (error instanceof Error) return fail(error.message);
        throw error;
      }
    },
  );

  return server;
}
```

Note on types: `registerTool`'s generic inference can fight the runtime-variable `tool.inputSchema` shape. If `tsc` rejects the callback signature, cast the callback (`as never` on the config or `as Parameters<typeof server.registerTool>[2]` on the handler) rather than loosening the `CliTool` interface — the runtime shape is already validated by the SDK.

`mcp-server/src/index.ts` (replace the placeholder):

```typescript
#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './server.js';

const transport = new StdioServerTransport();
await createServer().connect(transport);
```

- [ ] **Step 4: Run all tests and the build**

Run: `npm test --prefix mcp-server && npm run build --prefix mcp-server`
Expected: all tests PASS; `tsc` emits `dist/index.js` with the shebang preserved and executable bit set.

- [ ] **Step 5: Commit**

```bash
git add mcp-server/src mcp-server/tests/integration.test.ts
git commit -m "Wire MCP server entry point with stdio transport and integration tests"
```

---

### Task 6: Zed extension crate (manifest + Rust glue)

**Files:**
- Create: `extension.toml`, `Cargo.toml`, `src/lib.rs`
- Create: `configuration/installation_instructions.md`

**Interfaces:**
- Consumes: the published npm package name `suitecloud-mcp` with `bin`-relative entry `node_modules/suitecloud-mcp/dist/index.js` (Task 5's build output).
- Produces: the installable Zed extension; Task 7 adds `[grammars.xml]` usage, Task 8 adds the `snippets` key (both files are created here so later tasks only add content).

- [ ] **Step 1: Write extension.toml**

Determine the repository URL first: `git remote get-url origin` (see Global Constraints).

`extension.toml`:

```toml
id = "suitecloud"
name = "SuiteCloud"
version = "0.1.0"
schema_version = 1
authors = ["Alexander Gerber <alex.gerber90@gmail.com>"]
description = "NetSuite SuiteCloud/SDF support: SuiteScript snippets, SDF XML syntax highlighting, and a suitecloud CLI MCP server. Not affiliated with Oracle or NetSuite."
repository = "https://github.com/agerber/zed-suitecloud-plugin"

snippets = ["./snippets/javascript.json", "./snippets/typescript.json", "./snippets/sdfxml.json"]

[grammars.xml]
repository = "https://github.com/tree-sitter-grammars/tree-sitter-xml"
rev = "5000ae8f22d11fbe93939b05c1e37cf21117162d"
path = "xml"

[context_servers.suitecloud]
name = "SuiteCloud"
```

(The three snippet files and the `languages/` dir arrive in Tasks 7–8; Zed only reads the manifest at install time, so the dangling references are fine within this branch — but do not tag a release before Task 8.)

- [ ] **Step 2: Write Cargo.toml**

```toml
[package]
name = "zed-suitecloud"
version = "0.1.0"
edition = "2021"
license = "MIT"

[lib]
crate-type = ["cdylib"]

[dependencies]
zed_extension_api = "0.7.0"
```

- [ ] **Step 3: Write the extension glue**

`src/lib.rs`:

```rust
use zed_extension_api::{self as zed, Command, ContextServerId, Project, Result};

const PACKAGE_NAME: &str = "suitecloud-mcp";
const SERVER_PATH: &str = "node_modules/suitecloud-mcp/dist/index.js";

struct SuiteCloudExtension;

impl zed::Extension for SuiteCloudExtension {
    fn new() -> Self {
        Self
    }

    fn context_server_command(
        &mut self,
        _context_server_id: &ContextServerId,
        _project: &Project,
    ) -> Result<Command> {
        let latest_version = zed::npm_package_latest_version(PACKAGE_NAME)?;
        let installed_version = zed::npm_package_installed_version(PACKAGE_NAME)?;
        if installed_version.as_deref() != Some(latest_version.as_str()) {
            zed::npm_install_package(PACKAGE_NAME, &latest_version)?;
        }

        let server_path = std::env::current_dir()
            .map_err(|err| err.to_string())?
            .join(SERVER_PATH)
            .to_string_lossy()
            .to_string();

        Ok(Command {
            command: zed::node_binary_path()?,
            args: vec![server_path],
            env: vec![],
        })
    }
}

zed::register_extension!(SuiteCloudExtension);
```

- [ ] **Step 4: Write the installation instructions shown in Zed's server config UI**

`configuration/installation_instructions.md`:

```markdown
The SuiteCloud context server wraps the `suitecloud` CLI. Prerequisites:

1. Install the CLI: `npm install -g @oracle/suitecloud-cli` (requires Java 17+).
2. Connect an account once: run `suitecloud account:setup` in a terminal inside
   your SDF project (interactive browser login).

No further settings are required. The server runs the CLI in your project
directory; use the `list_auth` tool to check which accounts are configured.
```

- [ ] **Step 5: Verify the crate compiles for the WASM target**

Run:

```bash
rustup target add wasm32-wasip2
cargo check --target wasm32-wasip2
```

Expected: `Finished` with no errors. If `zed_extension_api 0.7.0` compilation fails on API names (`npm_package_latest_version`, `npm_package_installed_version`, `npm_install_package`, `node_binary_path`), check https://docs.rs/zed_extension_api/0.7.0 for the exact free-function names and adjust — these four exist in 0.7.0 per the postgres-context-server reference extension.

- [ ] **Step 6: Commit**

```bash
git add extension.toml Cargo.toml Cargo.lock src/ configuration/
git commit -m "Add Zed extension manifest and context server glue"
```

---

### Task 7: SDF XML language definition

**Files:**
- Create: `languages/sdf-xml/config.toml`, `languages/sdf-xml/highlights.scm`
- Create: `tests/fixtures/deploy.xml`, `tests/fixtures/customrecord_example.xml`, `tests/fixtures/not-sdf.xml`

**Interfaces:**
- Consumes: `[grammars.xml]` from Task 6's extension.toml.
- Produces: language named exactly `SDF XML` (Task 8's snippet file name derives from it).

- [ ] **Step 1: Write the language config**

`languages/sdf-xml/config.toml`:

```toml
name = "SDF XML"
grammar = "xml"
path_suffixes = ["deploy.xml", "manifest.xml"]
first_line_pattern = '^<(customrecordtype|customlist|customsegment|customtransactiontype|clientscript|usereventscript|suitelet|restlet|mapreducescript|scheduledscript|massupdatescript|workflowactionscript|bundleinstallationscript|sdfinstallationscript|portlet|workflow|savedsearch|savedcsvimport|crmcustomfield|entitycustomfield|itemcustomfield|itemnumbercustomfield|itemoptioncustomfield|othercustomfield|transactionbodycustomfield|transactioncolumncustomfield|emailtemplate|advancedpdftemplate|centercategory|centerlink|centertab|dataset|kpiscorecard|plugintype|pluginimplementation|promotioncode|publisheddashboard|role|sspapplication|sublist|subtab|translationcollection)[ >]'
tab_size = 2

[[brackets]]
start = "<"
end = ">"
close = true
newline = false

[[brackets]]
start = "\""
end = "\""
close = true
newline = false
```

Rationale recorded in the spec: exact filenames catch `deploy.xml`/`manifest.xml`; the first-line regex catches object files (SDF object XML starts directly with its typed root element), so generic `.xml` files stay with whatever XML extension the user has.

- [ ] **Step 2: Fetch the canonical highlight queries for the grammar**

Run:

```bash
curl -fsS -o languages/sdf-xml/highlights.scm https://raw.githubusercontent.com/tree-sitter-grammars/tree-sitter-xml/5000ae8f22d11fbe93939b05c1e37cf21117162d/queries/xml/highlights.scm
cat languages/sdf-xml/highlights.scm
```

Expected: a non-empty `.scm` file with captures like `@tag`, `@string`, `@comment`. (Pin to the same rev as `extension.toml` so query node names match the compiled grammar.) If the path 404s, list the repo's `queries/` directory via `https://api.github.com/repos/tree-sitter-grammars/tree-sitter-xml/contents/queries?ref=5000ae8f22d11fbe93939b05c1e37cf21117162d` and fetch the xml highlights file found there.

- [ ] **Step 2b: Append the scriptid emphasis query (spec requirement)**

Append to `languages/sdf-xml/highlights.scm`:

```scheme
; SDF: emphasize scriptid attributes — the navigation anchors of an SDF project.
((Attribute
  (Name) @attribute.special
  (AttValue) @string.special)
 (#eq? @attribute.special "scriptid"))
```

The node names `Attribute`/`Name`/`AttValue` are taken from the tree-sitter-xml grammar; verify them against the canonical highlights file fetched in Step 2 (it references the same nodes). If the capture nodes differ there, mirror the names the canonical file uses. Final verification happens visually in Step 4 — if the query makes highlighting error out (check `zed: open log`), delete this block; it is an enhancement, not a functional requirement.

- [ ] **Step 3: Create detection fixtures**

`tests/fixtures/deploy.xml`:

```xml
<deploy>
    <files>
        <path>~/FileCabinet/SuiteScripts/*</path>
    </files>
    <objects>
        <path>~/Objects/*</path>
    </objects>
</deploy>
```

`tests/fixtures/customrecord_example.xml`:

```xml
<customrecordtype scriptid="customrecord_example">
    <label>Example Record</label>
</customrecordtype>
```

`tests/fixtures/not-sdf.xml`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<catalog>
    <book id="1"><title>Plain XML</title></book>
</catalog>
```

- [ ] **Step 4: Manual verification in Zed**

1. In Zed: `zed: extensions` → "Install Dev Extension" → select the repo root (requires rustup-installed Rust; Zed compiles the WASM itself).
2. Open each fixture: `deploy.xml` and `customrecord_example.xml` must show language "SDF XML" in the status bar with highlighting; `not-sdf.xml` must NOT (Plain Text or XML, depending on installed extensions).
3. If anything fails, check `zed: open log`.

Expected: detection works as described. Record the results in the Task 9 checklist file.

- [ ] **Step 5: Commit**

```bash
git add languages/ tests/fixtures/
git commit -m "Add SDF XML language with two-stage file detection"
```

---

### Task 8: Snippets

**Files:**
- Create: `snippets/javascript.json`, `snippets/typescript.json`, `snippets/sdfxml.json`

**Interfaces:**
- Consumes: language name `SDF XML` (Task 7); `snippets` key already declared in extension.toml (Task 6).
- Produces: user-facing snippets; no downstream consumers.

**Snippet-file naming caveat:** Zed maps snippet files to languages by file name (lowercase language name; the docs show "Plain Text" → `plaintext.json`, i.e. spaces removed). We therefore use `sdfxml.json` for the "SDF XML" language. The manual check in Step 4 verifies this; if the snippets do not appear in an SDF XML buffer, rename the file to `sdf xml.json` (lowercase with space) and update the `snippets` array in `extension.toml` accordingly.

- [ ] **Step 1: Write the JavaScript snippets**

`snippets/javascript.json`:

```json
{
  "SuiteScript User Event": {
    "prefix": "nsue",
    "description": "SuiteScript 2.1 User Event script",
    "body": [
      "/**",
      " * @NApiVersion 2.1",
      " * @NScriptType UserEventScript",
      " */",
      "define([${1:'N/record'}], (${2:record}) => {",
      "    /** @param {Object} context - beforeLoad context */",
      "    const beforeLoad = (context) => {",
      "        ${3}",
      "    };",
      "",
      "    /** @param {Object} context - beforeSubmit context */",
      "    const beforeSubmit = (context) => {",
      "    };",
      "",
      "    /** @param {Object} context - afterSubmit context */",
      "    const afterSubmit = (context) => {",
      "    };",
      "",
      "    return { beforeLoad, beforeSubmit, afterSubmit };",
      "});",
      ""
    ]
  },
  "SuiteScript Suitelet": {
    "prefix": "nssl",
    "description": "SuiteScript 2.1 Suitelet",
    "body": [
      "/**",
      " * @NApiVersion 2.1",
      " * @NScriptType Suitelet",
      " */",
      "define([${1:'N/ui/serverWidget'}], (${2:serverWidget}) => {",
      "    /** @param {Object} context - request/response */",
      "    const onRequest = (context) => {",
      "        ${3}",
      "    };",
      "",
      "    return { onRequest };",
      "});",
      ""
    ]
  },
  "SuiteScript Map/Reduce": {
    "prefix": "nsmr",
    "description": "SuiteScript 2.1 Map/Reduce script",
    "body": [
      "/**",
      " * @NApiVersion 2.1",
      " * @NScriptType MapReduceScript",
      " */",
      "define([${1:'N/search'}], (${2:search}) => {",
      "    const getInputData = () => {",
      "        ${3}",
      "    };",
      "",
      "    /** @param {Object} context - map context */",
      "    const map = (context) => {",
      "    };",
      "",
      "    /** @param {Object} context - reduce context */",
      "    const reduce = (context) => {",
      "    };",
      "",
      "    /** @param {Object} summary - summarize context */",
      "    const summarize = (summary) => {",
      "    };",
      "",
      "    return { getInputData, map, reduce, summarize };",
      "});",
      ""
    ]
  },
  "SuiteScript RESTlet": {
    "prefix": "nsrl",
    "description": "SuiteScript 2.1 RESTlet",
    "body": [
      "/**",
      " * @NApiVersion 2.1",
      " * @NScriptType Restlet",
      " */",
      "define([${1:'N/record'}], (${2:record}) => {",
      "    const get = (requestParams) => {",
      "        ${3}",
      "    };",
      "",
      "    const post = (requestBody) => {",
      "    };",
      "",
      "    const put = (requestBody) => {",
      "    };",
      "",
      "    const doDelete = (requestParams) => {",
      "    };",
      "",
      "    return { get, post, put, delete: doDelete };",
      "});",
      ""
    ]
  },
  "SuiteScript Client Script": {
    "prefix": "nscs",
    "description": "SuiteScript 2.1 Client Script",
    "body": [
      "/**",
      " * @NApiVersion 2.1",
      " * @NScriptType ClientScript",
      " */",
      "define([${1:'N/currentRecord'}], (${2:currentRecord}) => {",
      "    /** @param {Object} context - pageInit context */",
      "    const pageInit = (context) => {",
      "        ${3}",
      "    };",
      "",
      "    /** @param {Object} context - fieldChanged context */",
      "    const fieldChanged = (context) => {",
      "    };",
      "",
      "    /** @returns {boolean} true to allow the save */",
      "    const saveRecord = (context) => {",
      "        return true;",
      "    };",
      "",
      "    return { pageInit, fieldChanged, saveRecord };",
      "});",
      ""
    ]
  },
  "SuiteScript Scheduled Script": {
    "prefix": "nssch",
    "description": "SuiteScript 2.1 Scheduled Script",
    "body": [
      "/**",
      " * @NApiVersion 2.1",
      " * @NScriptType ScheduledScript",
      " */",
      "define([${1:'N/search'}], (${2:search}) => {",
      "    /** @param {Object} context - execution context */",
      "    const execute = (context) => {",
      "        ${3}",
      "    };",
      "",
      "    return { execute };",
      "});",
      ""
    ]
  },
  "SuiteScript Workflow Action": {
    "prefix": "nswa",
    "description": "SuiteScript 2.1 Workflow Action script",
    "body": [
      "/**",
      " * @NApiVersion 2.1",
      " * @NScriptType WorkflowActionScript",
      " */",
      "define([${1:'N/record'}], (${2:record}) => {",
      "    /** @param {Object} context - onAction context */",
      "    const onAction = (context) => {",
      "        ${3}",
      "    };",
      "",
      "    return { onAction };",
      "});",
      ""
    ]
  },
  "SuiteScript AMD Module": {
    "prefix": "nsmod",
    "description": "Plain SuiteScript 2.1 AMD module",
    "body": [
      "/**",
      " * @NApiVersion 2.1",
      " */",
      "define([${1}], (${2}) => {",
      "    ${3}",
      "",
      "    return {};",
      "});",
      ""
    ]
  }
}
```

- [ ] **Step 2: Write the TypeScript snippets**

`snippets/typescript.json` (same eight prefixes; typed via `@hitc/netsuite-types`):

```json
{
  "SuiteScript User Event (TS)": {
    "prefix": "nsue",
    "description": "SuiteScript 2.1 User Event script (TypeScript)",
    "body": [
      "/**",
      " * @NApiVersion 2.1",
      " * @NScriptType UserEventScript",
      " */",
      "import { EntryPoints } from 'N/types';",
      "",
      "export const beforeLoad: EntryPoints.UserEvent.beforeLoad = (context) => {",
      "    ${1}",
      "};",
      "",
      "export const beforeSubmit: EntryPoints.UserEvent.beforeSubmit = (context) => {",
      "};",
      "",
      "export const afterSubmit: EntryPoints.UserEvent.afterSubmit = (context) => {",
      "};",
      ""
    ]
  },
  "SuiteScript Suitelet (TS)": {
    "prefix": "nssl",
    "description": "SuiteScript 2.1 Suitelet (TypeScript)",
    "body": [
      "/**",
      " * @NApiVersion 2.1",
      " * @NScriptType Suitelet",
      " */",
      "import { EntryPoints } from 'N/types';",
      "",
      "export const onRequest: EntryPoints.Suitelet.onRequest = (context) => {",
      "    ${1}",
      "};",
      ""
    ]
  },
  "SuiteScript Map/Reduce (TS)": {
    "prefix": "nsmr",
    "description": "SuiteScript 2.1 Map/Reduce script (TypeScript)",
    "body": [
      "/**",
      " * @NApiVersion 2.1",
      " * @NScriptType MapReduceScript",
      " */",
      "import { EntryPoints } from 'N/types';",
      "",
      "export const getInputData: EntryPoints.MapReduce.getInputData = () => {",
      "    ${1}",
      "};",
      "",
      "export const map: EntryPoints.MapReduce.map = (context) => {",
      "};",
      "",
      "export const reduce: EntryPoints.MapReduce.reduce = (context) => {",
      "};",
      "",
      "export const summarize: EntryPoints.MapReduce.summarize = (summary) => {",
      "};",
      ""
    ]
  },
  "SuiteScript RESTlet (TS)": {
    "prefix": "nsrl",
    "description": "SuiteScript 2.1 RESTlet (TypeScript)",
    "body": [
      "/**",
      " * @NApiVersion 2.1",
      " * @NScriptType Restlet",
      " */",
      "import { EntryPoints } from 'N/types';",
      "",
      "export const get: EntryPoints.RESTlet.get = (requestParams) => {",
      "    ${1}",
      "};",
      "",
      "export const post: EntryPoints.RESTlet.post = (requestBody) => {",
      "};",
      "",
      "export const put: EntryPoints.RESTlet.put = (requestBody) => {",
      "};",
      "",
      "export const doDelete: EntryPoints.RESTlet.delete_ = (requestParams) => {",
      "};",
      ""
    ]
  },
  "SuiteScript Client Script (TS)": {
    "prefix": "nscs",
    "description": "SuiteScript 2.1 Client Script (TypeScript)",
    "body": [
      "/**",
      " * @NApiVersion 2.1",
      " * @NScriptType ClientScript",
      " */",
      "import { EntryPoints } from 'N/types';",
      "",
      "export const pageInit: EntryPoints.Client.pageInit = (context) => {",
      "    ${1}",
      "};",
      "",
      "export const fieldChanged: EntryPoints.Client.fieldChanged = (context) => {",
      "};",
      "",
      "export const saveRecord: EntryPoints.Client.saveRecord = (context) => {",
      "    return true;",
      "};",
      ""
    ]
  },
  "SuiteScript Scheduled Script (TS)": {
    "prefix": "nssch",
    "description": "SuiteScript 2.1 Scheduled Script (TypeScript)",
    "body": [
      "/**",
      " * @NApiVersion 2.1",
      " * @NScriptType ScheduledScript",
      " */",
      "import { EntryPoints } from 'N/types';",
      "",
      "export const execute: EntryPoints.Scheduled.execute = (context) => {",
      "    ${1}",
      "};",
      ""
    ]
  },
  "SuiteScript Workflow Action (TS)": {
    "prefix": "nswa",
    "description": "SuiteScript 2.1 Workflow Action script (TypeScript)",
    "body": [
      "/**",
      " * @NApiVersion 2.1",
      " * @NScriptType WorkflowActionScript",
      " */",
      "import { EntryPoints } from 'N/types';",
      "",
      "export const onAction: EntryPoints.WorkflowAction.onAction = (context) => {",
      "    ${1}",
      "};",
      ""
    ]
  },
  "SuiteScript Module (TS)": {
    "prefix": "nsmod",
    "description": "Plain SuiteScript 2.1 module (TypeScript)",
    "body": [
      "/**",
      " * @NApiVersion 2.1",
      " */",
      "${1}",
      ""
    ]
  }
}
```

Note: verify the two nonstandard type names against the installed `@hitc/netsuite-types` before finishing this task: `EntryPoints.RESTlet.delete_` (TS cannot use `delete` as an identifier — check how hitc names it, e.g. `delete_` vs `deleteFunc`) and `EntryPoints.Scheduled.execute`. Run `grep -rn "namespace RESTlet\|namespace Scheduled" node_modules/@hitc/netsuite-types/N/types.d.ts` in any project that has the package installed (e.g. after running `setup_project` once) and fix the snippet if the names differ.

- [ ] **Step 3: Write the SDF XML snippets**

`snippets/sdfxml.json`:

```json
{
  "SDF deploy.xml": {
    "prefix": "sdfdeploy",
    "description": "deploy.xml skeleton",
    "body": [
      "<deploy>",
      "    <files>",
      "        <path>~/FileCabinet/SuiteScripts/*</path>",
      "    </files>",
      "    <objects>",
      "        <path>~/Objects/*</path>",
      "    </objects>",
      "</deploy>",
      ""
    ]
  },
  "SDF manifest.xml (ACP)": {
    "prefix": "sdfmanifest",
    "description": "manifest.xml for an account customization project",
    "body": [
      "<manifest projecttype=\"ACCOUNTCUSTOMIZATION\">",
      "    <projectname>${1:project_name}</projectname>",
      "    <frameworkversion>1.0</frameworkversion>",
      "</manifest>",
      ""
    ]
  },
  "SDF manifest.xml (SuiteApp)": {
    "prefix": "sdfmanifestapp",
    "description": "manifest.xml for a SuiteApp",
    "body": [
      "<manifest projecttype=\"SUITEAPP\">",
      "    <publisherid>${1:com.example}</publisherid>",
      "    <projectid>${2:myapp}</projectid>",
      "    <projectname>${3:My App}</projectname>",
      "    <projectversion>${4:1.0.0}</projectversion>",
      "    <frameworkversion>1.0</frameworkversion>",
      "</manifest>",
      ""
    ]
  },
  "SDF Custom Record": {
    "prefix": "sdfrecord",
    "description": "Custom record type skeleton",
    "body": [
      "<customrecordtype scriptid=\"customrecord_${1:id}\">",
      "    <label>${2:Label}</label>",
      "    <customrecordcustomfields>",
      "        <customrecordcustomfield scriptid=\"custrecord_${3:field_id}\">",
      "            <label>${4:Field Label}</label>",
      "            <fieldtype>${5:TEXT}</fieldtype>",
      "        </customrecordcustomfield>",
      "    </customrecordcustomfields>",
      "</customrecordtype>",
      ""
    ]
  },
  "SDF Custom Body Field": {
    "prefix": "sdffield",
    "description": "Transaction body custom field skeleton",
    "body": [
      "<transactionbodycustomfield scriptid=\"custbody_${1:id}\">",
      "    <label>${2:Label}</label>",
      "    <fieldtype>${3:TEXT}</fieldtype>",
      "    <bodysale>${4:T}</bodysale>",
      "</transactionbodycustomfield>",
      ""
    ]
  },
  "SDF Script Deployment": {
    "prefix": "sdfdeployment",
    "description": "Script deployment block",
    "body": [
      "<scriptdeployments>",
      "    <scriptdeployment scriptid=\"customdeploy_${1:id}\">",
      "        <status>${2:TESTING}</status>",
      "        <loglevel>${3:DEBUG}</loglevel>",
      "        <allroles>T</allroles>",
      "        <isdeployed>T</isdeployed>",
      "    </scriptdeployment>",
      "</scriptdeployments>",
      ""
    ]
  }
}
```

- [ ] **Step 4: Validate JSON and verify in Zed**

Run: `node -e "['javascript','typescript','sdfxml'].forEach(f => JSON.parse(require('node:fs').readFileSync('snippets/'+f+'.json','utf8')))"`
Expected: no output (all three parse).

Then reinstall the dev extension in Zed and verify: `nsue` expands in a `.js` buffer, `nsue` expands with imports in a `.ts` buffer, `sdfrecord` expands in `tests/fixtures/customrecord_example.xml`. If the SDF XML snippets do not appear, apply the naming fallback described in the task header.

- [ ] **Step 5: Commit**

```bash
git add snippets/
git commit -m "Add SuiteScript and SDF XML snippets"
```

---

### Task 9: README, tasks.json examples, manual test checklist

**Files:**
- Create: `README.md`, `docs/manual-testing.md`

**Interfaces:**
- Consumes: everything user-facing from Tasks 1–8 (tool names, snippet prefixes, setup steps).
- Produces: registry-ready documentation.

- [ ] **Step 1: Write README.md**

`README.md` (complete content):

````markdown
# SuiteCloud for Zed

NetSuite SuiteCloud/SDF support for the [Zed](https://zed.dev) editor:

- **SuiteScript snippets** — `nsue`, `nssl`, `nsmr`, `nsrl`, `nscs`, `nssch`, `nswa`, `nsmod`
  for JavaScript (JSDoc) and TypeScript, with correct `@NApiVersion`/`@NScriptType` headers.
- **SDF XML** — syntax highlighting and file detection for SDF object files,
  `deploy.xml`, and `manifest.xml`, plus snippets (`sdfdeploy`, `sdfmanifest`,
  `sdfrecord`, `sdffield`, `sdfdeployment`).
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
````

- [ ] **Step 2: Write the manual test checklist**

`docs/manual-testing.md`:

```markdown
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
```

- [ ] **Step 3: Commit**

```bash
git add README.md docs/manual-testing.md
git commit -m "Add README and manual release checklist"
```

---

### Task 10: CI and publish workflows

**Files:**
- Create: `.github/workflows/ci.yml`, `.github/workflows/publish.yml`

**Interfaces:**
- Consumes: `mcp-server` test/build scripts (Task 1/5), the Rust crate (Task 6).
- Produces: green CI as the merge gate; tag-triggered npm publishing.

- [ ] **Step 1: Write the CI workflow**

`.github/workflows/ci.yml`:

```yaml
name: CI
on:
  push:
    branches: [main]
  pull_request:

jobs:
  mcp-server:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: mcp-server
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
          cache-dependency-path: mcp-server/package-lock.json
      - run: npm ci
      - run: npm test
      - run: npm run build

  extension:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@stable
        with:
          targets: wasm32-wasip2
      - run: cargo check --target wasm32-wasip2

  snippets:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: |
          node -e "['javascript','typescript','sdfxml'].forEach(f => JSON.parse(require('node:fs').readFileSync('snippets/'+f+'.json','utf8')))"
```

- [ ] **Step 2: Write the publish workflow**

`.github/workflows/publish.yml`:

```yaml
name: Publish suitecloud-mcp
on:
  push:
    tags: ['mcp-v*']

jobs:
  publish:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: mcp-server
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          registry-url: https://registry.npmjs.org
      - run: npm ci
      - run: npm test
      - run: npm publish --access public
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

(Requires the `NPM_TOKEN` repo secret; noted in the release checklist.)

- [ ] **Step 3: Verify workflows run on GitHub**

If the repo has no remote yet, create the GitHub repository first:

```bash
gh repo create zed-suitecloud-plugin --public --source . --push
```

This also resolves the `TODO(repo-url)` from the Global Constraints — if the resulting URL differs from the `repository` fields in `extension.toml` and `mcp-server/package.json`, update them now.

Then push and confirm in the GitHub Actions tab that both workflows appear and CI runs green:

```bash
git push -u origin main
gh run watch
```

Expected: all three CI jobs (mcp-server, extension, snippets) pass.

- [ ] **Step 4: Commit**

```bash
git add .github/
git commit -m "Add CI and npm publish workflows"
```

---

## Post-plan release sequence (manual, after all tasks green)

1. Complete `docs/manual-testing.md` against a sandbox account.
2. Tag `mcp-v0.1.0` → npm publish runs.
3. Also publish the server to the official MCP registry (https://registry.modelcontextprotocol.io) — Zed has announced MCP-extension deprecation in favor of that registry, so this keeps the server discoverable long-term.
4. Fork `zed-industries/extensions`, add this repo as a submodule + `extensions.toml` entry, open the PR.
