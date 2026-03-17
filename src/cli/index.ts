import { Command } from 'commander';
import path from 'node:path';
import fs from 'node:fs';

export interface ParsedArgs {
  targetDir: string;
  port: number;
  host: string;
  open: boolean;
  watch: boolean;
  include: string[];
  exclude: string[];
  filter: string | null;
}

export function parseArgs(argv: string[]): ParsedArgs {
  const program = new Command();
  program.exitOverride();
  program
    .name('md-serve')
    .description('Lightweight local markdown server')
    .version(getVersion(), '-v, --version')
    .argument('[path]', 'Directory containing markdown files', '.')
    .option('-p, --port <number>', 'Port number', '3030')
    .option('-o, --open', 'Open browser automatically', false)
    .option('--include <glob...>', 'Include files matching glob (repeatable)')
    .option('--exclude <glob...>', 'Exclude files matching glob (repeatable)')
    .option('--filter <regex>', 'Filter by regex on relative path')
    .option('--no-watch', 'Disable file watching')
    .option('--host <string>', 'Bind address', 'localhost');

  program.parse(argv);
  const opts = program.opts();
  const base = process.env.MD_SERVE_CALLER_CWD || process.cwd();
  const targetDir = path.resolve(base, program.args[0]);

  return {
    targetDir,
    port: parseInt(opts.port, 10),
    host: opts.host,
    open: opts.open,
    watch: opts.watch,
    include: opts.include ?? [],
    exclude: opts.exclude ?? [],
    filter: opts.filter ?? null,
  };
}

export function validateDirectory(dirPath: string): boolean {
  try {
    const stat = fs.statSync(dirPath);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

export function buildEnvVars(args: ParsedArgs): Record<string, string | undefined> {
  const filters = {
    include: args.include,
    exclude: args.exclude,
    filter: args.filter,
  };
  return {
    MD_SERVE_ROOT: args.targetDir,
    MD_SERVE_PORT: String(args.port),
    MD_SERVE_HOST: args.host,
    MD_SERVE_OPEN: String(args.open),
    MD_SERVE_WATCH: String(args.watch),
    MD_SERVE_FILTERS: JSON.stringify(filters),
  };
}

function getVersion(): string {
  try {
    const pkgPath = path.resolve(__dirname, '../../package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    return pkg.version || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv);
  if (!validateDirectory(args.targetDir)) {
    console.error(`Error: "${args.targetDir}" is not a valid directory.`);
    process.exit(1);
  }
  const env = buildEnvVars(args);
  for (const [key, value] of Object.entries(env)) {
    if (value !== undefined) process.env[key] = value;
  }
  // When running via tsx, __dirname is src/cli/. Project root is two levels up.
  // When running from standalone build, __dirname is .next/standalone/src/cli/.
  const projectRoot = path.resolve(__dirname, '..', '..');
  const isDev = !fs.existsSync(path.join(projectRoot, '.next', 'BUILD_ID'));
  const { default: next } = await import('next');
  const app = next({ dev: isDev, dir: projectRoot, port: args.port, hostname: args.host });
  await app.prepare();
  const handle = app.getRequestHandler();
  const { createServer } = await import('node:http');
  const server = createServer((req, res) => { handle(req, res); });
  server.listen(args.port, args.host, () => {
    const url = `http://${args.host}:${args.port}`;
    console.log(`md-serve running at ${url}`);
    if (args.open) {
      const { exec } = require('node:child_process');
      const openCmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
      exec(`${openCmd} ${url}`);
    }
  });
}

if (require.main === module || process.argv[1]?.endsWith('md-serve.js')) {
  main().catch((err) => {
    if (err?.code === 'commander.helpDisplayed' || err?.code === 'commander.version') {
      process.exit(0);
    }
    console.error('Failed to start md-serve:', err);
    process.exit(1);
  });
}
