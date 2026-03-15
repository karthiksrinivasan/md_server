import { NextResponse } from 'next/server';
import { getConfig } from '@/server/config';
import { scanDirectory } from '@/server/tree';

export async function GET() {
  const config = getConfig();
  const tree = scanDirectory(config.rootDir, config.filters);
  return NextResponse.json({ tree });
}
