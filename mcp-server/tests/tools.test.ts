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
