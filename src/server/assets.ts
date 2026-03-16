import path from 'node:path';
import fs from 'node:fs/promises';
import mime from 'mime-types';

const ALLOWED_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.pdf',
]);

export interface ResolvedAsset {
  absolutePath: string;
  contentType: string;
}

export async function resolveAssetPath(
  rootDir: string,
  requestedPath: string,
): Promise<ResolvedAsset | null> {
  const absolutePath = path.resolve(rootDir, requestedPath);

  // Security: must be within rootDir
  if (!absolutePath.startsWith(path.resolve(rootDir) + path.sep) &&
      absolutePath !== path.resolve(rootDir)) {
    return null;
  }

  const ext = path.extname(absolutePath).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return null;
  }

  try {
    await fs.access(absolutePath);
  } catch {
    return null;
  }

  const contentType = mime.lookup(absolutePath) || 'application/octet-stream';
  return { absolutePath, contentType };
}

export async function generateETag(filePath: string): Promise<string> {
  const stat = await fs.stat(filePath);
  return `"${stat.mtimeMs.toString(36)}-${stat.size.toString(36)}"`;
}
