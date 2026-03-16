import { getConfig } from './config';
import { scanDirectory, type TreeNode } from './tree';

let cached: TreeNode[] | null = null;
let pending: Promise<TreeNode[]> | null = null;
let dirty = false;

export async function getCachedTree(): Promise<TreeNode[]> {
  if (cached) return cached;
  if (pending) return pending;

  dirty = false;
  pending = (async () => {
    const config = getConfig();
    const tree = await scanDirectory(config.rootDir, config.filters);
    if (dirty) {
      cached = null;
      pending = null;
      dirty = false;
      return tree;
    }
    cached = tree;
    pending = null;
    return tree;
  })();

  return pending;
}

export function invalidateTreeCache(): void {
  cached = null;
  if (pending) {
    dirty = true;
  }
}
