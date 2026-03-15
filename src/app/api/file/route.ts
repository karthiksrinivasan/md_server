import { NextRequest, NextResponse } from 'next/server';
import path from 'node:path';
import fs from 'node:fs';
import matter from 'gray-matter';
import { getConfig } from '@/server/config';

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
  if (!fs.existsSync(resolvedPath)) {
    resolvedPath = absolutePath + '.md';
  }
  if (!fs.existsSync(resolvedPath)) {
    resolvedPath = absolutePath + '.markdown';
  }
  if (!fs.existsSync(resolvedPath)) {
    return NextResponse.json({ error: 'File not found' }, { status: 404 });
  }

  try {
    const raw = fs.readFileSync(resolvedPath, 'utf-8');
    const { data: frontmatter, content } = matter(raw);
    const stat = fs.statSync(resolvedPath);
    return NextResponse.json({ content, frontmatter, size: stat.size });
  } catch {
    return NextResponse.json({ error: 'Failed to read file' }, { status: 500 });
  }
}
