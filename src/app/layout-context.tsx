'use client';

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  type ReactNode,
  type Dispatch,
  type SetStateAction,
} from 'react';
import type { HeadingItem } from '@/lib/markdown';
import type { FlatFile, TreeNode } from '@/hooks/use-file-tree';

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
  tree: TreeNode[];
  setTree: Dispatch<SetStateAction<TreeNode[]>>;
  treeLoading: boolean;
  setTreeLoading: Dispatch<SetStateAction<boolean>>;
  treeError: string | null;
  setTreeError: Dispatch<SetStateAction<string | null>>;
  availableAgents: { id: string; name: string; binary: string }[];
  setAvailableAgents: Dispatch<SetStateAction<{ id: string; name: string; binary: string }[]>>;
  selectedAgent: string;
  setSelectedAgent: Dispatch<SetStateAction<string>>;
  isAgentWorking: boolean;
  setIsAgentWorking: Dispatch<SetStateAction<boolean>>;
  fileChangedCounter: number;
  incrementFileChanged: () => void;
  assetVersion: number;
  incrementAssetVersion: () => void;
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
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [treeLoading, setTreeLoading] = useState(true);
  const [treeError, setTreeError] = useState<string | null>(null);
  const [availableAgents, setAvailableAgents] = useState<{ id: string; name: string; binary: string }[]>([]);
  const [selectedAgent, setSelectedAgent] = useState('');
  const [isAgentWorking, setIsAgentWorking] = useState(false);
  const [fileChangedCounter, setFileChangedCounter] = useState(0);
  const [assetVersion, setAssetVersion] = useState(0);

  const toggleFileTree = useCallback(() => setFileTreeOpen((v) => !v), []);
  const toggleOutline = useCallback(() => setOutlineOpen((v) => !v), []);
  const incrementFileChanged = useCallback(() => setFileChangedCounter((c) => c + 1), []);
  const incrementAssetVersion = useCallback(() => setAssetVersion((c) => c + 1), []);

  const value = useMemo(() => ({
    fileTreeOpen, setFileTreeOpen, toggleFileTree,
    outlineOpen, setOutlineOpen, toggleOutline,
    searchOpen, setSearchOpen,
    headings, setHeadings,
    sseConnected, setSseConnected,
    currentFilePath, setCurrentFilePath,
    flatFiles, setFlatFiles,
    tree, setTree,
    treeLoading, setTreeLoading,
    treeError, setTreeError,
    availableAgents, setAvailableAgents,
    selectedAgent, setSelectedAgent,
    isAgentWorking, setIsAgentWorking,
    fileChangedCounter, incrementFileChanged,
    assetVersion, incrementAssetVersion,
  }), [
    fileTreeOpen, setFileTreeOpen, toggleFileTree,
    outlineOpen, setOutlineOpen, toggleOutline,
    searchOpen, setSearchOpen,
    headings, setHeadings,
    sseConnected, setSseConnected,
    currentFilePath, setCurrentFilePath,
    flatFiles, setFlatFiles,
    tree, setTree,
    treeLoading, setTreeLoading,
    treeError, setTreeError,
    availableAgents, setAvailableAgents,
    selectedAgent, setSelectedAgent,
    isAgentWorking, setIsAgentWorking,
    fileChangedCounter, incrementFileChanged,
    assetVersion, incrementAssetVersion,
  ]);

  return (
    <LayoutContext.Provider value={value}>
      {children}
    </LayoutContext.Provider>
  );
}

export function useLayout() {
  const ctx = useContext(LayoutContext);
  if (!ctx) throw new Error('useLayout must be used within LayoutProvider');
  return ctx;
}
