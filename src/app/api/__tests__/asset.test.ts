import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

vi.mock('@/server/config', () => ({
  getConfig: vi.fn(),
}));

import { getConfig } from '@/server/config';
import { GET } from '../asset/route';

const mockGetConfig = vi.mocked(getConfig);

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'md-serve-asset-test-'));
  mockGetConfig.mockReturnValue({
    rootDir: tmpDir,
    port: 3030,
    host: 'localhost',
    open: false,
    watch: true,
    filters: { include: [], exclude: [], filter: null },
  });
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  vi.resetAllMocks();
});

describe('GET /api/asset', () => {
  it('serves an image file with correct content type and ETag', async () => {
    // Create a minimal PNG file (1x1 pixel)
    const pngData = Buffer.from(
      '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6260000000020001e221bc330000000049454e44ae426082',
      'hex'
    );
    fs.writeFileSync(path.join(tmpDir, 'image.png'), pngData);

    const request = new NextRequest(`http://localhost:3030/api/asset?path=image.png`);
    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('image/png');
    expect(response.headers.get('ETag')).toBeTruthy();
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=3600');
  });

  it('returns 404 when asset does not exist', async () => {
    const request = new NextRequest(`http://localhost:3030/api/asset?path=missing.png`);
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe('Not found');
  });

  it('returns 403 for path traversal attempt', async () => {
    const request = new NextRequest(`http://localhost:3030/api/asset?path=../../../etc/shadow.png`);
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data.error).toBe('Forbidden');
  });

  it('returns 403 for disallowed file type', async () => {
    fs.writeFileSync(path.join(tmpDir, 'script.js'), 'alert("xss")', 'utf-8');

    const request = new NextRequest(`http://localhost:3030/api/asset?path=script.js`);
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data.error).toBe('Forbidden');
  });

  it('returns 304 when ETag matches If-None-Match header', async () => {
    const pngData = Buffer.from(
      '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6260000000020001e221bc330000000049454e44ae426082',
      'hex'
    );
    fs.writeFileSync(path.join(tmpDir, 'image.png'), pngData);

    // First request to get the ETag
    const firstRequest = new NextRequest(`http://localhost:3030/api/asset?path=image.png`);
    const firstResponse = await GET(firstRequest);
    const etag = firstResponse.headers.get('ETag')!;

    // Second request with matching ETag
    const secondRequest = new NextRequest(`http://localhost:3030/api/asset?path=image.png`, {
      headers: { 'If-None-Match': etag },
    });
    const secondResponse = await GET(secondRequest);

    expect(secondResponse.status).toBe(304);
  });

  it('returns 400 when path parameter is missing', async () => {
    const request = new NextRequest(`http://localhost:3030/api/asset`);
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Missing path parameter');
  });
});
