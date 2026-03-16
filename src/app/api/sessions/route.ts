import { NextRequest, NextResponse } from 'next/server';
import { getConfig } from '@/server/config';
import { getSessionIndexer } from '@/server/session-indexer-singleton';
import path from 'node:path';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const filePath = searchParams.get('file');

  if (!filePath) {
    return NextResponse.json({ error: 'Missing file parameter' }, { status: 400 });
  }

  const config = getConfig();
  const cacheDir = path.join(config.rootDir, '.md_server');
  const indexer = getSessionIndexer(config.rootDir, cacheDir);
  const sessions = indexer.getSessionsForFile(filePath);

  return NextResponse.json({ sessions });
}
