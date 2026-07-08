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
