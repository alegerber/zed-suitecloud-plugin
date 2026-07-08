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
