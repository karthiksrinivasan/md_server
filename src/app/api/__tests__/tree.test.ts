import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/server/tree-cache', () => ({
  getCachedTree: vi.fn(),
}));

import { getCachedTree } from '@/server/tree-cache';
import { GET } from '../tree/route';

const mockGetCachedTree = vi.mocked(getCachedTree);

describe('GET /api/tree', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns tree from cache', async () => {
    const mockTree = [
      { name: 'docs', path: 'docs', type: 'directory' as const, children: [
        { name: 'readme.md', path: 'docs/readme.md', type: 'file' as const },
      ]},
    ];
    mockGetCachedTree.mockResolvedValue(mockTree);

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ tree: mockTree });
    expect(mockGetCachedTree).toHaveBeenCalledOnce();
  });

  it('returns empty tree when no files found', async () => {
    mockGetCachedTree.mockResolvedValue([]);

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ tree: [] });
  });
});
