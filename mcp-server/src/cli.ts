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
