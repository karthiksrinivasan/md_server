import path from 'node:path';
import fs from 'node:fs';
import mime from 'mime-types';

const ALLOWED_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.pdf',
]);

export interface ResolvedAsset {
  absolutePath: string;
  contentType: string;
}

export function resolveAssetPath(
  rootDir: string,
  requestedPath: string,
): ResolvedAsset | null {
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

  if (!fs.existsSync(absolutePath)) {
    return null;
  }

  const contentType = mime.lookup(absolutePath) || 'application/octet-stream';
  return { absolutePath, contentType };
}

export function generateETag(filePath: string): string {
  const stat = fs.statSync(filePath);
  return `"${stat.mtimeMs.toString(36)}-${stat.size.toString(36)}"`;
}
