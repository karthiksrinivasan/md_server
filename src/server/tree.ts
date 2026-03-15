import fs from "fs";
import path from "path";
import picomatch from "picomatch";
import type { FilterConfig } from "./config";

export interface TreeNode {
  name: string;
  path: string;
  type: "file" | "directory";
  children?: TreeNode[];
}

function matchesFilter(relativePath: string, filters: FilterConfig): boolean {
  if (filters.include.length > 0) {
    if (!filters.include.some((p) => picomatch(p)(relativePath))) return false;
  }
  if (filters.exclude.length > 0) {
    if (filters.exclude.some((p) => picomatch(p, { dot: true })(relativePath))) return false;
  }
  if (filters.filter && !filters.filter.test(relativePath)) return false;
  return true;
}

function isDirectoryExcluded(relativeDirPath: string, filters: FilterConfig): boolean {
  return filters.exclude.some((pattern) => {
    const matcher = picomatch(pattern, { dot: true });
    return matcher(relativeDirPath) || matcher(relativeDirPath + "/") || matcher(relativeDirPath + "/x.md");
  });
}

export function scanDirectory(rootDir: string, filters: FilterConfig, currentDir?: string): TreeNode[] {
  const dir = currentDir ?? rootDir;
  let entries: fs.Dirent[];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return []; }

  const dirNodes: TreeNode[] = [];
  const fileNodes: TreeNode[] = [];
  entries.sort((a, b) => a.name.localeCompare(b.name));

  for (const entry of entries) {
    const absolutePath = path.join(dir, entry.name);
    const relativePath = path.relative(rootDir, absolutePath);

    if (entry.isDirectory()) {
      if (isDirectoryExcluded(relativePath, filters)) continue;
      const children = scanDirectory(rootDir, filters, absolutePath);
      if (children.length > 0) {
        dirNodes.push({ name: entry.name, path: relativePath, type: "directory", children });
      }
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      if (matchesFilter(relativePath, filters)) {
        fileNodes.push({ name: entry.name, path: relativePath, type: "file" });
      }
    }
  }

  return [...dirNodes, ...fileNodes];
}
