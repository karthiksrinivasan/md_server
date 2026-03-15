'use client';

import { useState, useCallback, useEffect } from 'react';

export interface TreeNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: TreeNode[];
}

interface UseFileTreeReturn {
  tree: TreeNode[];
  loading: boolean;
  error: string | null;
  filter: string;
  setFilter: (filter: string) => void;
  expandedPaths: Set<string>;
  toggleExpanded: (path: string) => void;
  expandAll: () => void;
  collapseAll: () => void;
  filteredTree: TreeNode[];
  refetch: () => void;
}

function collectAllDirPaths(nodes: TreeNode[]): string[] {
  const paths: string[] = [];
  for (const node of nodes) {
    if (node.type === 'directory') {
      paths.push(node.path);
      if (node.children) {
        paths.push(...collectAllDirPaths(node.children));
      }
    }
  }
  return paths;
}

function filterTree(nodes: TreeNode[], filter: string): TreeNode[] {
  if (!filter) return nodes;
  const lower = filter.toLowerCase();

  const filtered: TreeNode[] = [];
  for (const node of nodes) {
    if (node.type === 'file') {
      if (node.name.toLowerCase().includes(lower)) {
        filtered.push(node);
      }
    } else {
      const filteredChildren = filterTree(node.children ?? [], filter);
      if (filteredChildren.length > 0) {
        filtered.push({ ...node, children: filteredChildren });
      } else if (node.name.toLowerCase().includes(lower)) {
        filtered.push(node);
      }
    }
  }
  return filtered;
}

function collectDirPathsFromTree(nodes: TreeNode[]): string[] {
  const paths: string[] = [];
  for (const node of nodes) {
    if (node.type === 'directory') {
      paths.push(node.path);
      if (node.children) {
        paths.push(...collectDirPathsFromTree(node.children));
      }
    }
  }
  return paths;
}

export function useFileTree(): UseFileTreeReturn {
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());

  const fetchTree = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/tree');
      if (!res.ok) throw new Error(`Failed to fetch tree: ${res.status}`);
      const data: TreeNode[] = await res.json();
      setTree(data);
      // Auto-expand first level directories
      const firstLevelDirs = data
        .filter((n) => n.type === 'directory')
        .map((n) => n.path);
      setExpandedPaths(new Set(firstLevelDirs));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTree();
  }, [fetchTree]);

  const toggleExpanded = useCallback((path: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  const expandAll = useCallback(() => {
    const allDirs = collectAllDirPaths(tree);
    setExpandedPaths(new Set(allDirs));
  }, [tree]);

  const collapseAll = useCallback(() => {
    setExpandedPaths(new Set());
  }, []);

  const handleSetFilter = useCallback((newFilter: string) => {
    setFilter(newFilter);
    if (newFilter) {
      // Auto-expand all dirs when filter is active
      setExpandedPaths((prev) => {
        // We'll expand after filtering, but we need the current tree
        return prev;
      });
    }
  }, []);

  const computedFilteredTree = filterTree(tree, filter);

  // Auto-expand dirs when filter is active
  useEffect(() => {
    if (filter) {
      const dirPaths = collectDirPathsFromTree(computedFilteredTree);
      setExpandedPaths(new Set(dirPaths));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  return {
    tree,
    loading,
    error,
    filter,
    setFilter: handleSetFilter,
    expandedPaths,
    toggleExpanded,
    expandAll,
    collapseAll,
    filteredTree: computedFilteredTree,
    refetch: fetchTree,
  };
}
