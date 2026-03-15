import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

vi.mock('@/server/config', () => ({
  getConfig: vi.fn(),
}));

import { getConfig } from '@/server/config';
import { GET } from '../file/route';

const mockGetConfig = vi.mocked(getConfig);

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'md-serve-file-test-'));
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

describe('GET /api/file', () => {
  it('returns content and frontmatter for a markdown file with frontmatter', async () => {
    const content = `---\ntitle: Test Doc\nauthor: Alice\n---\n\n# Hello\n\nBody content here.`;
    fs.writeFileSync(path.join(tmpDir, 'test.md'), content, 'utf-8');

    const request = new NextRequest(`http://localhost:3030/api/file?path=test.md`);
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.frontmatter).toEqual({ title: 'Test Doc', author: 'Alice' });
    expect(data.content).toContain('# Hello');
    expect(data.content).toContain('Body content here.');
    expect(typeof data.size).toBe('number');
    expect(data.size).toBeGreaterThan(0);
  });

  it('returns content with empty frontmatter for file without frontmatter', async () => {
    const content = `# Simple Doc\n\nJust some text.`;
    fs.writeFileSync(path.join(tmpDir, 'simple.md'), content, 'utf-8');

    const request = new NextRequest(`http://localhost:3030/api/file?path=simple.md`);
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.frontmatter).toEqual({});
    expect(data.content).toContain('# Simple Doc');
  });

  it('returns 404 when file does not exist', async () => {
    const request = new NextRequest(`http://localhost:3030/api/file?path=nonexistent.md`);
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe('File not found');
  });

  it('returns 403 for path traversal attempt', async () => {
    const request = new NextRequest(`http://localhost:3030/api/file?path=../../../etc/passwd`);
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data.error).toBe('Forbidden');
  });

  it('returns 400 when path parameter is missing', async () => {
    const request = new NextRequest(`http://localhost:3030/api/file`);
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Missing path parameter');
  });
});
