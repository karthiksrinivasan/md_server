import { NextRequest, NextResponse } from 'next/server';
import path from 'node:path';
import fs from 'node:fs/promises';
import matter from 'gray-matter';
import { getConfig } from '@/server/config';

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const filePath = searchParams.get('path');

  if (!filePath) {
    return NextResponse.json({ error: 'Missing path parameter' }, { status: 400 });
  }

  const config = getConfig();
  const absolutePath = path.resolve(config.rootDir, filePath);
  const resolvedRoot = path.resolve(config.rootDir);
  if (!absolutePath.startsWith(resolvedRoot + path.sep) && absolutePath !== resolvedRoot) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Try the path as-is, then with .md extension
  let resolvedPath = absolutePath;
  if (!(await fileExists(resolvedPath))) {
    resolvedPath = absolutePath + '.md';
  }
  if (!(await fileExists(resolvedPath))) {
    resolvedPath = absolutePath + '.markdown';
  }
  if (!(await fileExists(resolvedPath))) {
    return NextResponse.json({ error: 'File not found' }, { status: 404 });
  }

  try {
    // Resolve symlinks and re-check boundary
    const realRoot = await fs.realpath(resolvedRoot);
    const realPath = await fs.realpath(resolvedPath);
    if (!realPath.startsWith(realRoot + path.sep) && realPath !== realRoot) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const raw = await fs.readFile(realPath, 'utf-8');
    const { data: frontmatter, content } = matter(raw);
    const stat = await fs.stat(realPath);
    return NextResponse.json({ content, frontmatter, size: stat.size });
  } catch {
    return NextResponse.json({ error: 'Failed to read file' }, { status: 500 });
  }
}
