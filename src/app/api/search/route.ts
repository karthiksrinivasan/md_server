import { NextRequest, NextResponse } from 'next/server';
import { getSearchIndex } from '@/server/search-singleton';
import { getConfig } from '@/server/config';

let buildPromise: Promise<void> | null = null;

function ensureBuilt(): Promise<void> {
  if (!buildPromise) {
    const index = getSearchIndex();
    const config = getConfig();
    buildPromise = index.build(config.rootDir, config.filters).catch((err) => {
      buildPromise = null;
      throw err;
    });
  }
  return buildPromise;
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const query = searchParams.get('q');

  if (query === null || query === undefined) {
    return NextResponse.json({ error: 'Missing q parameter' }, { status: 400 });
  }

  await ensureBuilt();

  const index = getSearchIndex();
  const results = index.search(query);
  return NextResponse.json({ results });
}
