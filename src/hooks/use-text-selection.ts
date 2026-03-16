'use client';

import { useState, useEffect, useCallback, useRef, type RefObject } from 'react';

interface TextSelection {
  text: string;
  rect: DOMRect | null;
}

export function useTextSelection(containerRef: RefObject<HTMLElement | null>) {
  const [selection, setSelection] = useState<TextSelection>({ text: '', rect: null });
  // Track the actual DOM element to detect when it changes
  const [container, setContainer] = useState<HTMLElement | null>(null);

  // Poll briefly for container availability — handles conditional rendering
  useEffect(() => {
    const check = () => {
      const el = containerRef.current;
      if (el !== container) setContainer(el);
    };
    check();
    // Re-check periodically for a short time to catch late mounts
    const id = setInterval(check, 100);
    const timeout = setTimeout(() => clearInterval(id), 2000);
    return () => { clearInterval(id); clearTimeout(timeout); };
  }); // intentionally no deps — runs every render to catch ref changes

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
