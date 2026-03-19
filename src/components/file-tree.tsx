'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useLayout } from '@/app/layout-context';
import type { TreeNode } from '@/hooks/use-file-tree';

interface FileTreeProps {
  onFileSelect?: () => void;
}

function fileRoute(nodePath: string): string {
  // Keep .md extension in URL to prevent Next.js from normalising "/index" → "/"
  return '/' + nodePath;
}

function collectAllDirPaths(nodes: TreeNode[]): string[] {
  const paths: string[] = [];
  for (const node of nodes) {
    if (node.type === 'directory') {
      paths.push(node.path);
      if (node.children) paths.push(...collectAllDirPaths(node.children));
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
      if (node.name.toLowerCase().includes(lower)) filtered.push(node);
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

function FolderIcon({ isOpen }: { isOpen: boolean }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0">
      {isOpen ? (
        <>
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
          <line x1="12" y1="11" x2="12" y2="17" />
          <line x1="9" y1="14" x2="15" y2="14" />
        </>
      ) : (
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
      )}
    </svg>
  );
}

function FileIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}

function ChevronIcon({ isOpen }: { isOpen: boolean }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={`shrink-0 transition-transform duration-150 ${isOpen ? 'rotate-90' : ''}`}>
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

interface TreeNodeItemProps {
  node: TreeNode;
  depth: number;
  expandedPaths: Set<string>;
  toggleExpanded: (path: string) => void;
  pathname: string;
  onFileSelect?: () => void;
  router: ReturnType<typeof useRouter>;
}

function TreeNodeItem({
  node, depth, expandedPaths, toggleExpanded, pathname, onFileSelect, router,
}: TreeNodeItemProps) {
  const isExpanded = expandedPaths.has(node.path);
  const indentStyle = { paddingLeft: `${depth * 12 + 8}px` };

  if (node.type === 'directory') {
    return (
      <li>
        <button
          type="button"
          className="flex w-full items-center gap-1.5 py-1 pr-2 text-sm text-foreground/80 hover:text-foreground hover:bg-muted/50 rounded transition-colors"
          style={indentStyle}
          onClick={() => toggleExpanded(node.path)}
          aria-expanded={isExpanded}
        >
          <ChevronIcon isOpen={isExpanded} />
          <FolderIcon isOpen={isExpanded} />
          <span className="truncate">{node.name}</span>
        </button>
        {isExpanded && node.children && node.children.length > 0 && (
          <ul>
            {node.children.map((child) => (
              <TreeNodeItem
                key={child.path}
                node={child}
                depth={depth + 1}
                expandedPaths={expandedPaths}
                toggleExpanded={toggleExpanded}
                pathname={pathname}
                onFileSelect={onFileSelect}
                router={router}
              />
            ))}
          </ul>
        )}
      </li>
    );
  }

  const route = fileRoute(node.path);
  const isActive = pathname === route;

  return (
    <li>
      <button
        type="button"
        className={`flex w-full items-center gap-1.5 py-1 pr-2 text-sm rounded transition-colors ${
          isActive
            ? 'bg-primary/10 text-primary font-medium'
            : 'text-foreground/70 hover:text-foreground hover:bg-muted/50'
        }`}
        style={indentStyle}
        onClick={() => {
          router.push(route);
          onFileSelect?.();
        }}
        aria-current={isActive ? 'page' : undefined}
      >
        <span className="w-[14px] shrink-0" />
        <FileIcon />
        <span className="truncate">{node.name}</span>
      </button>
    </li>
  );
}

export function FileTree({ onFileSelect }: FileTreeProps) {
  const { tree, treeLoading: loading, treeError: error } = useLayout();
  const [filter, setFilter] = useState('');
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const pathname = usePathname();
  const router = useRouter();

  // Auto-expand first level directories when tree loads
  useEffect(() => {
    if (tree.length > 0) {
      setExpandedPaths((prev) => {
        if (prev.size > 0) return prev; // Don't reset if user has interacted
        const firstLevelDirs = tree.filter((n) => n.type === 'directory').map((n) => n.path);
        return new Set(firstLevelDirs);
      });
    }
  }, [tree]);

  const toggleExpanded = useCallback((path: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const filteredTree = useMemo(() => filterTree(tree, filter), [tree, filter]);

  // Auto-expand dirs when filter is active
  useEffect(() => {
    if (filter) {
      const dirPaths = collectAllDirPaths(filteredTree);
      setExpandedPaths(new Set(dirPaths));
    }
  }, [filter, filteredTree]);

  return (
    <div className="flex flex-col h-full">
      <div className="p-2 border-b border-border">
        <input
          type="search"
          placeholder="Filter files..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="w-full px-2 py-1 text-sm bg-muted rounded border border-border focus:outline-none focus:ring-1 focus:ring-ring"
          aria-label="Filter files"
        />
      </div>
      <div className="flex-1 overflow-y-auto py-1">
        {loading && (
          <p className="px-3 py-2 text-sm text-muted-foreground">Loading...</p>
        )}
        {error && (
          <p className="px-3 py-2 text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
        {!loading && !error && filteredTree.length === 0 && (
          <p className="px-3 py-2 text-sm text-muted-foreground">
            {filter ? 'No files match your filter.' : 'No files found.'}
          </p>
        )}
        {!loading && !error && filteredTree.length > 0 && (
          <ul role="tree" aria-label="File tree">
            {filteredTree.map((node) => (
              <TreeNodeItem
                key={node.path}
                node={node}
                depth={0}
                expandedPaths={expandedPaths}
                toggleExpanded={toggleExpanded}
                pathname={pathname}
                onFileSelect={onFileSelect}
                router={router}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
