// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useOutline } from '../use-outline';
import type { HeadingItem } from '@/lib/markdown';

// Mock IntersectionObserver
let observerCallback: IntersectionObserverCallback | null = null;
const mockObserve = vi.fn();
const mockUnobserve = vi.fn();
const mockDisconnect = vi.fn();

class MockIntersectionObserver implements IntersectionObserver {
  readonly root: Element | null = null;
  readonly rootMargin: string = '';
  readonly thresholds: ReadonlyArray<number> = [];

  constructor(callback: IntersectionObserverCallback) {
    observerCallback = callback;
  }
  observe = mockObserve;
  unobserve = mockUnobserve;
  disconnect = mockDisconnect;
  takeRecords = vi.fn().mockReturnValue([]);
}

const headings: HeadingItem[] = [
  { id: 'heading-1', text: 'Heading 1', level: 1 },
  { id: 'heading-2', text: 'Heading 2', level: 2 },
  { id: 'heading-3', text: 'Heading 3', level: 3 },
];

function createHeadingElements() {
  for (const h of headings) {
    const existing = document.getElementById(h.id);
    if (!existing) {
      const el = document.createElement(`h${h.level}`);
      el.id = h.id;
      el.textContent = h.text;
      document.body.appendChild(el);
    }
  }
}

function removeHeadingElements() {
  for (const h of headings) {
    const el = document.getElementById(h.id);
    if (el) el.remove();
  }
}

describe('useOutline', () => {
  beforeEach(() => {
    observerCallback = null;
    mockObserve.mockClear();
    mockUnobserve.mockClear();
    mockDisconnect.mockClear();
    Object.defineProperty(window, 'IntersectionObserver', {
      writable: true,
      value: MockIntersectionObserver,
    });
    createHeadingElements();
  });

  afterEach(() => {
    removeHeadingElements();
    vi.restoreAllMocks();
  });

  it('sets first heading as initial active', () => {
    const { result } = renderHook(() => useOutline(headings));
    expect(result.current.activeId).toBe('heading-1');
  });

  it('returns null activeId for empty headings', () => {
    const { result } = renderHook(() => useOutline([]));
    expect(result.current.activeId).toBe(null);
  });

  it('observes heading elements', () => {
    renderHook(() => useOutline(headings));
    expect(mockObserve).toHaveBeenCalledTimes(headings.length);
  });

  it('updates activeId when intersection observer fires', () => {
    const { result } = renderHook(() => useOutline(headings));

    expect(result.current.activeId).toBe('heading-1');

    act(() => {
      if (observerCallback) {
        const el = document.getElementById('heading-2')!;
        const entry = {
          target: el,
          isIntersecting: true,
          boundingClientRect: { top: 100 } as DOMRectReadOnly,
          intersectionRatio: 1,
          intersectionRect: {} as DOMRectReadOnly,
          rootBounds: null,
          time: 0,
        } as IntersectionObserverEntry;
        observerCallback([entry], {} as IntersectionObserver);
      }
    });

    expect(result.current.activeId).toBe('heading-2');
  });

  it('scrollToHeading scrolls to element and updates activeId', () => {
    const mockScrollIntoView = vi.fn();
    const mockReplaceState = vi.fn();
    window.history.replaceState = mockReplaceState;

    const { result } = renderHook(() => useOutline(headings));

    const el = document.getElementById('heading-3')!;
    el.scrollIntoView = mockScrollIntoView;

    act(() => {
      result.current.scrollToHeading('heading-3');
    });

    expect(mockScrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth' });
    expect(mockReplaceState).toHaveBeenCalledWith(null, '', '#heading-3');
    expect(result.current.activeId).toBe('heading-3');
  });

  it('disconnects observer on unmount', () => {
    const { unmount } = renderHook(() => useOutline(headings));
    unmount();
    expect(mockDisconnect).toHaveBeenCalled();
  });
});
