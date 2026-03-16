'use client';

import { useState, useEffect, useCallback } from 'react';

interface TextSelection {
  text: string;
  rect: DOMRect | null;
}

export function useTextSelection(containerRef: React.RefObject<HTMLElement | null>) {
  const [selection, setSelection] = useState<TextSelection>({ text: '', rect: null });

  const handleSelectionChange = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) {
      setSelection({ text: '', rect: null });
      return;
    }

    const range = sel.getRangeAt(0);
    if (containerRef.current && !containerRef.current.contains(range.commonAncestorContainer)) {
      return;
    }

    const text = sel.toString().trim();
    if (!text) {
      setSelection({ text: '', rect: null });
      return;
    }

    const rect = range.getBoundingClientRect();
    setSelection({ text, rect });
  }, [containerRef]);

  useEffect(() => {
    document.addEventListener('selectionchange', handleSelectionChange);
    return () => document.removeEventListener('selectionchange', handleSelectionChange);
  }, [handleSelectionChange]);

  const clearSelection = useCallback(() => {
    window.getSelection()?.removeAllRanges();
    setSelection({ text: '', rect: null });
  }, []);

  return { selection, clearSelection };
}
