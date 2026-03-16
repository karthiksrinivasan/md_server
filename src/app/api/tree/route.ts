import { NextResponse } from 'next/server';
import { getCachedTree } from '@/server/tree-cache';

export async function GET() {
  const tree = await getCachedTree();
  return NextResponse.json({ tree });
}
