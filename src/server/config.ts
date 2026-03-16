export interface FilterConfig {
  include: string[];
  exclude: string[];
  filter: RegExp | null;
}

export interface ServerConfig {
  rootDir: string;
  port: number;
  host: string;
  watch: boolean;
  open: boolean;
  filters: FilterConfig;
}

const DEFAULT_EXCLUDES = ["node_modules/**", ".git/**", ".*/**"];

function parseFilterRegex(raw: string): RegExp | null {
  try {
    const regexMatch = raw.match(/^\/(.+)\/([gimsuy]*)$/);
    if (regexMatch) {
      const flags = regexMatch[2].replace(/g/g, '');
      return new RegExp(regexMatch[1], flags);
    }
    return new RegExp(raw);
  } catch (err) {
    if (err instanceof SyntaxError) {
      console.warn(`Invalid filter regex "${raw}": ${err.message}`);
      return null;
    }
    throw err;
  }
}

export interface ResolveFiltersInput {
  include?: string[];
  exclude?: string[];
  filter?: string | null;
}

export function resolveFilters(input: ResolveFiltersInput): FilterConfig {
  const include = input.include ?? [];
  const userExcludes = input.exclude ?? [];
  const exclude = [...new Set([...userExcludes, ...DEFAULT_EXCLUDES])];
  const filter = input.filter ? parseFilterRegex(input.filter) ?? null : null;
  return { include, exclude, filter };
}

export function getConfig(): ServerConfig {
  const rootDir = process.env.MD_SERVE_ROOT || process.cwd();
  const port = process.env.MD_SERVE_PORT ? parseInt(process.env.MD_SERVE_PORT, 10) : 3030;
  const host = process.env.MD_SERVE_HOST || "localhost";
  const watch = process.env.MD_SERVE_WATCH !== "false";
  const open = process.env.MD_SERVE_OPEN === "true";

  let filtersInput: ResolveFiltersInput = {};
  if (process.env.MD_SERVE_FILTERS) {
    try { filtersInput = JSON.parse(process.env.MD_SERVE_FILTERS); } catch {}
  }

  return { rootDir, port, host, watch, open, filters: resolveFilters(filtersInput) };
}
