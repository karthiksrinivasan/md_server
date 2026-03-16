import { NextRequest, NextResponse } from 'next/server';
import path from 'node:path';
import fs from 'node:fs/promises';
import { getConfig } from '@/server/config';
import { resolveAssetPath, generateETag } from '@/server/assets';

const ALLOWED_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.pdf']);

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const assetPath = searchParams.get('path');

  if (!assetPath) {
    return NextResponse.json({ error: 'Missing path parameter' }, { status: 400 });
  }

  const config = getConfig();
  const absolutePath = path.resolve(config.rootDir, assetPath);
  const resolvedRoot = path.resolve(config.rootDir);
  if (!absolutePath.startsWith(resolvedRoot + path.sep) && absolutePath !== resolvedRoot) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const ext = path.extname(assetPath).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const resolved = await resolveAssetPath(config.rootDir, assetPath);
  if (!resolved) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // Resolve symlinks and re-check boundary
  const realRoot = await fs.realpath(resolvedRoot);
  const realPath = await fs.realpath(resolved.absolutePath);
  if (!realPath.startsWith(realRoot + path.sep) && realPath !== realRoot) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const etag = await generateETag(realPath);
  const ifNoneMatch = request.headers.get('If-None-Match');
  if (ifNoneMatch && ifNoneMatch === etag) {
    return new NextResponse(null, { status: 304 });
  }

  const fileBuffer = await fs.readFile(realPath);
  return new NextResponse(fileBuffer, {
    status: 200,
    headers: {
      'Content-Type': resolved.contentType,
      'ETag': etag,
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
