'use client';

import { useState, useEffect, type ReactNode } from 'react';
import { ThemeToggle } from '@/components/theme-toggle';
import { FileTree } from '@/components/file-tree';
import { SearchDialog } from '@/components/search-dialog';

interface LayoutShellProps {
  children: ReactNode;
}

function HamburgerIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

export function LayoutShell({ children }: LayoutShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [searchOpen, setSearchOpen] = useState(false);

  // Keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const isMac = navigator.platform.toUpperCase().includes('MAC');
      const modifier = isMac ? e.metaKey : e.ctrlKey;

      if (modifier && e.key === 'k') {
        e.preventDefault();
        setSearchOpen((prev) => !prev);
        return;
      }

      if (modifier && e.key === 'b') {
        e.preventDefault();
        setSidebarOpen((prev) => !prev);
        return;
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className="flex flex-col min-h-screen">
      {/* Header */}
      <header className="sticky top-0 z-40 h-14 flex items-center gap-2 px-4 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <button
          type="button"
          onClick={() => setSidebarOpen((prev) => !prev)}
          className="p-2 rounded-md hover:bg-muted transition-colors"
          aria-label="Toggle sidebar"
          aria-expanded={sidebarOpen}
        >
          <HamburgerIcon />
        </button>

        <span className="font-semibold text-base select-none">md-serve</span>

        <div className="flex-1" />

        {/* Search button */}
        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          className="flex items-center gap-2 px-3 py-1.5 text-sm text-muted-foreground rounded-md border border-border hover:bg-muted transition-colors"
          aria-label="Search"
        >
          <SearchIcon />
          <span className="hidden sm:inline">Search</span>
          <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 text-xs font-mono border border-border rounded ml-1">
            ⌘K
          </kbd>
        </button>

        <ThemeToggle />
      </header>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* Sidebar */}
        {sidebarOpen && (
          <aside
            className="w-64 shrink-0 border-r border-border bg-background overflow-y-auto
                       md:relative md:shadow-none
                       max-md:absolute max-md:top-0 max-md:left-0 max-md:h-full max-md:z-30 max-md:shadow-xl"
          >
            <FileTree
              onFileSelect={() => {
                // On mobile, close sidebar when a file is selected
                if (window.innerWidth < 768) {
                  setSidebarOpen(false);
                }
              }}
            />
          </aside>
        )}

        {/* Main content */}
        <main className="flex-1 overflow-auto min-w-0">
          {children}
        </main>
      </div>

      {/* Search dialog */}
      <SearchDialog
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
      />
    </div>
  );
}
