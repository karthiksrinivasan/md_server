'use client';

import { useState, useEffect, useLayoutEffect, useCallback, useRef, type RefObject } from 'react';

interface TextSelection {
  text: string;
  rect: DOMRect | null;
}

export function useTextSelection(containerRef: RefObject<HTMLElement | null>) {
  const [selection, setSelection] = useState<TextSelection>({ text: '', rect: null });
  // Track the actual DOM element to detect when it changes
  const [container, setContainer] = useState<HTMLElement | null>(null);

  // Sync container ref on mount; use MutationObserver for late mounts
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (el) {
      setContainer(el);
      return;
    }
    // If not available yet, wait for a single rAF then observe parent for child additions
    const rafId = requestAnimationFrame(() => {
      const el2 = containerRef.current;
      if (el2) {
        setContainer(el2);
        return;
      }
    });
    return () => cancelAnimationFrame(rafId);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- containerRef is a stable ref

  const checkSelection = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) {
      setSelection({ text: '', rect: null });
      return;
    }

    const range = sel.getRangeAt(0);
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
  }, [container]);

  // Attach/detach listeners when the container element changes
  useEffect(() => {
    if (!container) return;

    const handleMouseUp = () => {
      setTimeout(checkSelection, 50);
    };

    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // Don't clear if clicking inside the edit bar
      if (target.closest('form.fixed') || target.closest('[data-selection-bar]')) return;
      // Don't interfere with sidebar navigation, header, or any interactive UI outside content
      if (target.closest('aside') || target.closest('nav') || target.closest('[role="tree"]') || target.closest('header')) return;
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
  }, [container, checkSelection]);

  const clearSelection = useCallback(() => {
    window.getSelection()?.removeAllRanges();
    setSelection({ text: '', rect: null });
  }, []);

  return { selection, clearSelection };
}
