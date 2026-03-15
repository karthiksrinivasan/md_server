'use client';

import { useEffect, useRef } from 'react';
import { useMediaQuery } from './use-media-query';

interface PanelSetters {
  setFileTreeOpen: (v: boolean) => void;
  setOutlineOpen: (v: boolean) => void;
}

export type Breakpoint = 'mobile' | 'tablet' | 'desktop';

export function useResponsivePanels({ setFileTreeOpen, setOutlineOpen }: PanelSetters): Breakpoint {
  const isMobile = useMediaQuery('(max-width: 767px)');
  const isTablet = useMediaQuery('(min-width: 768px) and (max-width: 1199px)');
  const prevBreakpoint = useRef<Breakpoint | null>(null);
  const breakpoint: Breakpoint = isMobile ? 'mobile' : isTablet ? 'tablet' : 'desktop';

  useEffect(() => {
    if (prevBreakpoint.current === breakpoint) return;
    prevBreakpoint.current = breakpoint;
    switch (breakpoint) {
      case 'mobile': setFileTreeOpen(false); setOutlineOpen(false); break;
      case 'tablet': setFileTreeOpen(true); setOutlineOpen(false); break;
      case 'desktop': setFileTreeOpen(true); setOutlineOpen(true); break;
    }
  }, [breakpoint, setFileTreeOpen, setOutlineOpen]);

  return breakpoint;
}
