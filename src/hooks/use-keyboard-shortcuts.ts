'use client';

import { useEffect } from 'react';

interface ShortcutActions {
  onToggleSearch: () => void;
  onToggleFileTree: () => void;
  onToggleOutline: () => void;
  onEscape: () => void;
}

export function useKeyboardShortcuts({ onToggleSearch, onToggleFileTree, onToggleOutline, onEscape }: ShortcutActions) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key === 'k') { e.preventDefault(); onToggleSearch(); return; }
      if (meta && e.key === 'b') { e.preventDefault(); onToggleFileTree(); return; }
      if (meta && e.shiftKey && (e.key === 'o' || e.key === 'O')) { e.preventDefault(); onToggleOutline(); return; }
      if (e.key === 'Escape') { e.preventDefault(); onEscape(); return; }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onToggleSearch, onToggleFileTree, onToggleOutline, onEscape]);
}
