import { NextRequest, NextResponse } from 'next/server';
import { getSearchIndex } from '@/server/search-singleton';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const query = searchParams.get('q');

  if (query === null || query === undefined) {
    return NextResponse.json({ error: 'Missing q parameter' }, { status: 400 });
  }

  const index = getSearchIndex();
  const results = index.search(query);
  return NextResponse.json({ results });
}
