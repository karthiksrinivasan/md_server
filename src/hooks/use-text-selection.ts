'use client';

import { useState, useEffect, useCallback, type RefObject } from 'react';

interface TextSelection {
  text: string;
  rect: DOMRect | null;
}

export function useTextSelection(containerRef: RefObject<HTMLElement | null>) {
  const [selection, setSelection] = useState<TextSelection>({ text: '', rect: null });
  // Track when the container element is actually mounted
  const [containerReady, setContainerReady] = useState(false);

  // Poll for container readiness (ref.current becomes non-null after conditional render)
  useEffect(() => {
    if (containerRef.current) {
      setContainerReady(true);
      return;
    }
    const interval = setInterval(() => {
      if (containerRef.current) {
        setContainerReady(true);
        clearInterval(interval);
      }
    }, 200);
    return () => clearInterval(interval);
  }, [containerRef]);

  const checkSelection = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) {
      setSelection({ text: '', rect: null });
      return;
    }

    const range = sel.getRangeAt(0);
    const container = containerRef.current;
    if (!container || !container.contains(range.commonAncestorContainer)) {
      setSelection({ text: '', rect: null });
      return;
    }

    const text = sel.toString().trim();
    if (!text || text.length < 3) {
      setSelection({ text: '', rect: null });
      return;
    }

    const rect = range.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) {
      setSelection({ text: '', rect: null });
      return;
    }

    setSelection({ text, rect });
  }, [containerRef]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !containerReady) return;

    const handleMouseUp = () => {
      setTimeout(checkSelection, 50);
    };

    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // Don't clear if clicking inside the edit bar
      if (target.closest('form.fixed') || target.closest('[data-selection-bar]')) return;
      if (!container.contains(target)) {
        setSelection({ text: '', rect: null });
      }
    };

    container.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('mousedown', handleMouseDown);
    container.addEventListener('keyup', handleMouseUp);

    return () => {
      container.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('mousedown', handleMouseDown);
      container.removeEventListener('keyup', handleMouseUp);
    };
  }, [containerRef, containerReady, checkSelection]);

  const clearSelection = useCallback(() => {
    window.getSelection()?.removeAllRanges();
    setSelection({ text: '', rect: null });
  }, []);

  return { selection, clearSelection };
}
