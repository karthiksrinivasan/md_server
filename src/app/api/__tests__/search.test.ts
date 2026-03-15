import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/server/search-singleton', () => ({
  getSearchIndex: vi.fn(),
}));

import { getSearchIndex } from '@/server/search-singleton';
import { GET } from '../search/route';

const mockGetSearchIndex = vi.mocked(getSearchIndex);

const createMockIndex = (results: unknown[] = []) => ({
  search: vi.fn().mockReturnValue(results),
  build: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
});

describe('GET /api/search', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns search results for a query', async () => {
    const mockResults = [
      { path: 'docs/intro.md', title: 'Introduction', matches: [{ line: 1, text: 'Hello world' }] },
    ];
    const mockIndex = createMockIndex(mockResults);
    mockGetSearchIndex.mockReturnValue(mockIndex as unknown as ReturnType<typeof getSearchIndex>);

    const request = new NextRequest(`http://localhost:3030/api/search?q=hello`);
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ results: mockResults });
    expect(mockIndex.search).toHaveBeenCalledWith('hello');
  });

  it('returns empty results for empty query string', async () => {
    const mockIndex = createMockIndex([]);
    mockGetSearchIndex.mockReturnValue(mockIndex as unknown as ReturnType<typeof getSearchIndex>);

    const request = new NextRequest(`http://localhost:3030/api/search?q=`);
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ results: [] });
  });

  it('returns empty results when no matches found', async () => {
    const mockIndex = createMockIndex([]);
    mockGetSearchIndex.mockReturnValue(mockIndex as unknown as ReturnType<typeof getSearchIndex>);

    const request = new NextRequest(`http://localhost:3030/api/search?q=xyznonexistent`);
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ results: [] });
    expect(mockIndex.search).toHaveBeenCalledWith('xyznonexistent');
  });

  it('returns 400 when q parameter is missing', async () => {
    const mockIndex = createMockIndex([]);
    mockGetSearchIndex.mockReturnValue(mockIndex as unknown as ReturnType<typeof getSearchIndex>);

    const request = new NextRequest(`http://localhost:3030/api/search`);
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Missing q parameter');
  });
});
