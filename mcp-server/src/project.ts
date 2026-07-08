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
