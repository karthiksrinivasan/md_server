'use client';

import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
  type Dispatch,
  type SetStateAction,
} from 'react';
import type { HeadingItem } from '@/lib/markdown';
import type { FlatFile } from '@/hooks/use-file-tree';

interface LayoutContextValue {
  fileTreeOpen: boolean;
  setFileTreeOpen: Dispatch<SetStateAction<boolean>>;
  toggleFileTree: () => void;
  outlineOpen: boolean;
  setOutlineOpen: Dispatch<SetStateAction<boolean>>;
  toggleOutline: () => void;
  searchOpen: boolean;
  setSearchOpen: Dispatch<SetStateAction<boolean>>;
  headings: HeadingItem[];
  setHeadings: Dispatch<SetStateAction<HeadingItem[]>>;
  sseConnected: boolean;
  setSseConnected: Dispatch<SetStateAction<boolean>>;
  currentFilePath: string | null;
  setCurrentFilePath: Dispatch<SetStateAction<string | null>>;
  flatFiles: FlatFile[];
  setFlatFiles: Dispatch<SetStateAction<FlatFile[]>>;
}

const LayoutContext = createContext<LayoutContextValue | null>(null);

export function LayoutProvider({ children }: { children: ReactNode }) {
  const [fileTreeOpen, setFileTreeOpen] = useState(true);
  const [outlineOpen, setOutlineOpen] = useState(true);
  const [searchOpen, setSearchOpen] = useState(false);
  const [headings, setHeadings] = useState<HeadingItem[]>([]);
  const [sseConnected, setSseConnected] = useState(true);
  const [currentFilePath, setCurrentFilePath] = useState<string | null>(null);
  const [flatFiles, setFlatFiles] = useState<FlatFile[]>([]);

  const toggleFileTree = useCallback(() => setFileTreeOpen((v) => !v), []);
  const toggleOutline = useCallback(() => setOutlineOpen((v) => !v), []);

  return (
    <LayoutContext.Provider
      value={{
        fileTreeOpen, setFileTreeOpen, toggleFileTree,
        outlineOpen, setOutlineOpen, toggleOutline,
        searchOpen, setSearchOpen,
        headings, setHeadings,
        sseConnected, setSseConnected,
        currentFilePath, setCurrentFilePath,
        flatFiles, setFlatFiles,
      }}
    >
      {children}
    </LayoutContext.Provider>
  );
}

export function useLayout() {
  const ctx = useContext(LayoutContext);
  if (!ctx) throw new Error('useLayout must be used within LayoutProvider');
  return ctx;
}
