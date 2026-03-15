// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useFileTree, type TreeNode } from '../use-file-tree';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/',
}));

const mockTree: TreeNode[] = [
  {
    name: 'docs',
    path: 'docs',
    type: 'directory',
    children: [
      { name: 'intro.md', path: 'docs/intro.md', type: 'file' },
      { name: 'guide.md', path: 'docs/guide.md', type: 'file' },
    ],
  },
  { name: 'README.md', path: 'README.md', type: 'file' },
  {
    name: 'api',
    path: 'api',
    type: 'directory',
    children: [
      { name: 'reference.md', path: 'api/reference.md', type: 'file' },
    ],
  },
];

function makeFetchMock(data: unknown, ok = true) {
  return vi.fn().mockResolvedValue({
    ok,
    status: ok ? 200 : 500,
    json: async () => data,
  });
}

describe('useFileTree', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('fetches tree on mount and auto-expands first-level dirs', async () => {
    global.fetch = makeFetchMock(mockTree);
    const { result } = renderHook(() => useFileTree());

    expect(result.current.loading).toBe(true);

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.tree).toEqual(mockTree);
    expect(result.current.error).toBe(null);
    // First level dirs should be auto-expanded
    expect(result.current.expandedPaths.has('docs')).toBe(true);
    expect(result.current.expandedPaths.has('api')).toBe(true);
  });

  it('handles fetch error', async () => {
    global.fetch = makeFetchMock(null, false);
    const { result } = renderHook(() => useFileTree());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toContain('Failed to fetch tree');
    expect(result.current.tree).toEqual([]);
  });

  it('handles network error', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));
    const { result } = renderHook(() => useFileTree());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBe('Network error');
  });

  it('toggleExpanded adds and removes path', async () => {
    global.fetch = makeFetchMock(mockTree);
    const { result } = renderHook(() => useFileTree());

    await waitFor(() => expect(result.current.loading).toBe(false));

    // 'docs' is auto-expanded; toggle to collapse it
    act(() => {
      result.current.toggleExpanded('docs');
    });
    expect(result.current.expandedPaths.has('docs')).toBe(false);

    // toggle again to expand
    act(() => {
      result.current.toggleExpanded('docs');
    });
    expect(result.current.expandedPaths.has('docs')).toBe(true);
  });

  it('expandAll expands all directories', async () => {
    global.fetch = makeFetchMock(mockTree);
    const { result } = renderHook(() => useFileTree());

    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.collapseAll();
    });
    expect(result.current.expandedPaths.size).toBe(0);

    act(() => {
      result.current.expandAll();
    });
    expect(result.current.expandedPaths.has('docs')).toBe(true);
    expect(result.current.expandedPaths.has('api')).toBe(true);
  });

  it('collapseAll collapses all directories', async () => {
    global.fetch = makeFetchMock(mockTree);
    const { result } = renderHook(() => useFileTree());

    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.collapseAll();
    });
    expect(result.current.expandedPaths.size).toBe(0);
  });

  it('filters by filename (case insensitive)', async () => {
    global.fetch = makeFetchMock(mockTree);
    const { result } = renderHook(() => useFileTree());

    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.setFilter('intro');
    });

    await waitFor(() => {
      const filtered = result.current.filteredTree;
      expect(filtered.length).toBe(1);
      expect(filtered[0].name).toBe('docs');
      expect(filtered[0].children?.length).toBe(1);
      expect(filtered[0].children?.[0].name).toBe('intro.md');
    });
  });

  it('returns empty filteredTree when no files match', async () => {
    global.fetch = makeFetchMock(mockTree);
    const { result } = renderHook(() => useFileTree());

    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.setFilter('zzznomatch');
    });

    await waitFor(() => {
      expect(result.current.filteredTree).toEqual([]);
    });
  });

  it('auto-expands dirs when filter is active', async () => {
    global.fetch = makeFetchMock(mockTree);
    const { result } = renderHook(() => useFileTree());

    await waitFor(() => expect(result.current.loading).toBe(false));

    // Collapse everything first
    act(() => {
      result.current.collapseAll();
    });
    expect(result.current.expandedPaths.size).toBe(0);

    // Apply a filter
    act(() => {
      result.current.setFilter('guide');
    });

    await waitFor(() => {
      // docs dir should now be expanded because it matches the filter
      expect(result.current.expandedPaths.has('docs')).toBe(true);
    });
  });

  it('refetch re-fetches the tree', async () => {
    global.fetch = makeFetchMock(mockTree);
    const { result } = renderHook(() => useFileTree());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(global.fetch).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.refetch();
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });
});
