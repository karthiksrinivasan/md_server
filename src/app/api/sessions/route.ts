import { NextRequest, NextResponse } from 'next/server';
import { getConfig } from '@/server/config';
import { getSessionIndexer, getIndexReady } from '@/server/session-indexer-singleton';
import path from 'node:path';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const filePath = searchParams.get('file');

  if (!filePath) {
    return NextResponse.json({ error: 'Missing file parameter' }, { status: 400 });
  }

  const config = getConfig();

  const absPath = path.resolve(config.rootDir, filePath);
  if (!absPath.startsWith(path.resolve(config.rootDir) + path.sep)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const cacheDir = path.join(config.rootDir, '.md_server');
  const indexer = getSessionIndexer(config.rootDir, cacheDir);

  // Wait for initial index build to complete before querying
  const ready = getIndexReady();
  if (ready) await ready;

  const sessions = indexer.getSessionsForFile(filePath);

  return NextResponse.json({ sessions });
}
