import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockBuild = vi.fn().mockResolvedValue(undefined);
const mockSearch = vi.fn().mockReturnValue([]);

vi.mock('@/server/search-singleton', () => ({
  getSearchIndex: vi.fn(() => ({
    search: mockSearch,
    build: mockBuild,
    update: vi.fn(),
    remove: vi.fn(),
  })),
}));

vi.mock('@/server/config', () => ({
  getConfig: vi.fn(() => ({
    rootDir: '/test',
    port: 3030,
    host: 'localhost',
    watch: true,
    open: false,
    filters: { include: [], exclude: [], filter: null },
  })),
}));

describe('GET /api/search', () => {
  beforeEach(() => {
    mockSearch.mockReset().mockReturnValue([]);
    mockBuild.mockReset().mockResolvedValue(undefined);
  });

  async function callGET(url: string) {
    // Re-import to reset module-level buildPromise
    vi.resetModules();
    const { GET } = await import('../search/route');
    return GET(new NextRequest(url));
  }

  it('returns search results for a query', async () => {
    const mockResults = [
      { path: 'docs/intro.md', title: 'Introduction', matches: [{ line: 1, text: 'Hello world' }] },
    ];
    mockSearch.mockReturnValue(mockResults);

    const response = await callGET('http://localhost:3030/api/search?q=hello');
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ results: mockResults });
    expect(mockSearch).toHaveBeenCalledWith('hello');
  });

  it('returns empty results for empty query string', async () => {
    const response = await callGET('http://localhost:3030/api/search?q=');
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ results: [] });
  });

  it('returns empty results when no matches found', async () => {
    const response = await callGET('http://localhost:3030/api/search?q=xyznonexistent');
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ results: [] });
    expect(mockSearch).toHaveBeenCalledWith('xyznonexistent');
  });

  it('returns 400 when q parameter is missing', async () => {
    const response = await callGET('http://localhost:3030/api/search');
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Missing q parameter');
  });
});
