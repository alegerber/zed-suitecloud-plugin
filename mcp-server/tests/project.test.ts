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
