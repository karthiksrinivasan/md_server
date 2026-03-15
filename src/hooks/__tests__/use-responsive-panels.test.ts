// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useResponsivePanels } from '../use-responsive-panels';

vi.mock('../use-media-query', () => ({ useMediaQuery: vi.fn() }));

import { useMediaQuery } from '../use-media-query';
const mockUseMediaQuery = vi.mocked(useMediaQuery);

function setBreakpoint(bp: 'mobile' | 'tablet' | 'desktop') {
  mockUseMediaQuery.mockImplementation((query: string) => {
    if (query.includes('max-width: 767px')) return bp === 'mobile';
    if (query.includes('min-width: 768px') && query.includes('max-width: 1199px')) return bp === 'tablet';
    return false;
  });
}

describe('useResponsivePanels', () => {
  const setters = { setFileTreeOpen: vi.fn(), setOutlineOpen: vi.fn() };

  beforeEach(() => { vi.clearAllMocks(); });

  it('hides both panels on mobile', () => {
    setBreakpoint('mobile');
    const { result } = renderHook(() => useResponsivePanels(setters));
    expect(result.current).toBe('mobile');
    expect(setters.setFileTreeOpen).toHaveBeenCalledWith(false);
    expect(setters.setOutlineOpen).toHaveBeenCalledWith(false);
  });

  it('shows file tree only on tablet', () => {
    setBreakpoint('tablet');
    const { result } = renderHook(() => useResponsivePanels(setters));
    expect(result.current).toBe('tablet');
    expect(setters.setFileTreeOpen).toHaveBeenCalledWith(true);
    expect(setters.setOutlineOpen).toHaveBeenCalledWith(false);
  });

  it('shows both panels on desktop', () => {
    setBreakpoint('desktop');
    const { result } = renderHook(() => useResponsivePanels(setters));
    expect(result.current).toBe('desktop');
    expect(setters.setFileTreeOpen).toHaveBeenCalledWith(true);
    expect(setters.setOutlineOpen).toHaveBeenCalledWith(true);
  });
});
