import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/server/config', () => ({
  getConfig: vi.fn(),
}));

vi.mock('@/server/tree', () => ({
  scanDirectory: vi.fn(),
}));

import { getConfig } from '@/server/config';
import { scanDirectory } from '@/server/tree';
import { GET } from '../tree/route';

const mockGetConfig = vi.mocked(getConfig);
const mockScanDirectory = vi.mocked(scanDirectory);

const defaultConfig = {
  rootDir: '/test/root',
  port: 3030,
  host: 'localhost',
  open: false,
  watch: true,
  filters: { include: [], exclude: [], filter: null },
};

describe('GET /api/tree', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockGetConfig.mockReturnValue(defaultConfig);
  });

  it('returns tree from scanDirectory', async () => {
    const mockTree = [
      { name: 'docs', path: 'docs', type: 'directory' as const, children: [
        { name: 'readme.md', path: 'docs/readme.md', type: 'file' as const },
      ]},
    ];
    mockScanDirectory.mockReturnValue(mockTree);

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ tree: mockTree });
    expect(mockScanDirectory).toHaveBeenCalledWith('/test/root', defaultConfig.filters);
  });

  it('calls scanDirectory with correct rootDir and filters', async () => {
    mockScanDirectory.mockReturnValue([]);

    await GET();

    expect(mockGetConfig).toHaveBeenCalledOnce();
    expect(mockScanDirectory).toHaveBeenCalledWith('/test/root', { include: [], exclude: [], filter: null });
  });

  it('returns empty tree when no files found', async () => {
    mockScanDirectory.mockReturnValue([]);

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ tree: [] });
  });
});
