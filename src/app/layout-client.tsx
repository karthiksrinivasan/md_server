'use client';

import { type ReactNode, useEffect, useCallback, useState } from 'react';
import { useLayout } from './layout-context';
import { FileTree } from '@/components/file-tree';
import { OutlinePanel } from '@/components/outline-panel';
import { SearchDialog } from '@/components/search-dialog';
import { ThemeToggle } from '@/components/theme-toggle';
import { useToast } from '@/components/toast';
import { useSSE, type SSEEvent } from '@/hooks/use-sse';
import { useFileTree } from '@/hooks/use-file-tree';
import { useKeyboardShortcuts } from '@/hooks/use-keyboard-shortcuts';
import { useResponsivePanels } from '@/hooks/use-responsive-panels';

export function LayoutClient({ children }: { children: ReactNode }) {
  const {
    fileTreeOpen, setFileTreeOpen, toggleFileTree,
    outlineOpen, setOutlineOpen, toggleOutline,
    searchOpen, setSearchOpen,
    headings, sseConnected, setSseConnected,
  } = useLayout();

  const { refetch: refreshTree } = useFileTree();
  const { addToast } = useToast();

  const { connectionStatus } = useSSE({
    onFileChanged: useCallback(
      (event: SSEEvent) => { addToast(`File updated: ${event.path ?? 'unknown'}`); },
      [addToast],
    ),
    onFileAdded: useCallback(
      (event: SSEEvent) => { addToast(`File added: ${event.path ?? 'unknown'}`); refreshTree(); },
      [addToast, refreshTree],
    ),
    onFileRemoved: useCallback(
      (event: SSEEvent) => { addToast(`File removed: ${event.path ?? 'unknown'}`); refreshTree(); },
      [addToast, refreshTree],
    ),
    onTreeUpdated: useCallback(
      () => { refreshTree(); },
      [refreshTree],
    ),
  });

  useEffect(() => {
    setSseConnected(connectionStatus === 'connected');
  }, [connectionStatus, setSseConnected]);

  useKeyboardShortcuts({
    onToggleSearch: () => setSearchOpen((v) => !v),
    onToggleFileTree: toggleFileTree,
    onToggleOutline: toggleOutline,
    onEscape: () => {
      if (searchOpen) setSearchOpen(false);
      else if (fileTreeOpen) setFileTreeOpen(false);
    },
  });

  useResponsivePanels({ setFileTreeOpen, setOutlineOpen });

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <header className="flex items-center h-[var(--header-height)] px-3 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 shrink-0 z-20">
        <button
          onClick={toggleFileTree}
          className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 mr-2"
          aria-label="Toggle file tree"
          title="Toggle file tree (Cmd+B)"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M3 4.5h12M3 9h12M3 13.5h12" />
          </svg>
        </button>
        <span className="text-sm font-semibold mr-2 select-none">md-serve</span>
        <span className="text-xs text-gray-500 dark:text-gray-400 truncate mr-auto">
          {process.env.NEXT_PUBLIC_MD_SERVE_ROOT ?? ''}
        </span>
        {!sseConnected && (
          <span className="reconnecting-pulse mr-3" aria-live="polite">Reconnecting...</span>
        )}
        <button
          onClick={() => setSearchOpen(true)}
          className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-700 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800 mr-2"
          title="Search (Cmd+K)"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="6" cy="6" r="4.5" />
            <path d="M9.5 9.5L13 13" />
          </svg>
          <kbd className="hidden sm:inline text-[10px] font-mono opacity-60">&#x2318;K</kbd>
        </button>
        <ThemeToggle />
      </header>
      <div className="flex flex-1 overflow-hidden relative">
        {fileTreeOpen && (
          <>
            <aside className="w-[var(--sidebar-width)] shrink-0 border-r border-gray-200 dark:border-gray-800 overflow-y-auto panel-scroll bg-gray-50 dark:bg-gray-900 max-md:absolute max-md:inset-y-0 max-md:left-0 max-md:z-40">
              <FileTree onFileSelect={() => {
                if (typeof window !== 'undefined' && window.innerWidth < 768) {
                  setFileTreeOpen(false);
                }
              }} />
            </aside>
            <div className="panel-overlay md:hidden" onClick={toggleFileTree} aria-hidden />
          </>
        )}
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-[var(--content-max-width)] mx-auto px-6 py-8">{children}</div>
        </main>
        {outlineOpen && headings.length > 0 && (
          <>
            <aside className="w-[var(--outline-width)] shrink-0 border-l border-gray-200 dark:border-gray-800 overflow-y-auto panel-scroll bg-gray-50 dark:bg-gray-900 max-lg:absolute max-lg:inset-y-0 max-lg:right-0 max-lg:z-40 hidden lg:block">
              <div className="p-4 sticky top-0">
                <OutlinePanel headings={headings} />
              </div>
            </aside>
            <div className="panel-overlay lg:hidden" onClick={toggleOutline} aria-hidden />
          </>
        )}
      </div>
      <SearchDialog open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}
