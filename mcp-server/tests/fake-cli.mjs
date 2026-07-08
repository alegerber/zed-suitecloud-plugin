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
