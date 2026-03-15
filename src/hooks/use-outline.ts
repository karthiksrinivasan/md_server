'use client';

import { useState, useEffect, useCallback } from 'react';
import type { HeadingItem } from '@/lib/markdown';

interface UseOutlineReturn {
  activeId: string | null;
  scrollToHeading: (id: string) => void;
}

export function useOutline(headings: HeadingItem[]): UseOutlineReturn {
  const [activeId, setActiveId] = useState<string | null>(
    headings.length > 0 ? headings[0].id : null
  );

  useEffect(() => {
    if (headings.length === 0) {
      setActiveId(null);
      return;
    }

    // Set first heading as initial active if not already set
    setActiveId(headings[0].id);

    const elements = headings
      .map((h) => document.getElementById(h.id))
      .filter((el): el is HTMLElement => el !== null);

    if (elements.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting);
        if (visible.length > 0) {
          // Pick the topmost visible heading
          const topmost = visible.reduce((prev, curr) =>
            prev.boundingClientRect.top < curr.boundingClientRect.top
              ? prev
              : curr
          );
          setActiveId(topmost.target.id);
        }
      },
      {
        rootMargin: '0px 0px -80% 0px',
        threshold: 0,
      }
    );

    for (const el of elements) {
      observer.observe(el);
    }

    return () => {
      observer.disconnect();
    };
  }, [headings]);

  const scrollToHeading = useCallback((id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
      window.history.replaceState(null, '', `#${id}`);
      setActiveId(id);
    }
  }, []);

  return { activeId, scrollToHeading };
}
