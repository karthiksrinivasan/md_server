'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import { useLayout } from '../layout-context';
import { MarkdownRenderer } from '@/components/markdown-renderer';
import { FrontmatterCard } from '@/components/frontmatter-card';
import { useSSE, type SSEEvent } from '@/hooks/use-sse';
import type { HeadingItem } from '@/lib/markdown';
import Link from 'next/link';
import { AgentToolbar } from '@/components/agent-toolbar';
import { SelectionEditBar } from '@/components/selection-edit-bar';
import { useTextSelection } from '@/hooks/use-text-selection';
import { useSessions } from '@/hooks/use-sessions';

interface FileData {
  content: string;
  frontmatter: Record<string, unknown>;
  size: number;
}

function WelcomeContent() {
  const { flatFiles } = useLayout();
  const rootPath = process.env.NEXT_PUBLIC_MD_SERVE_ROOT ?? '.';
  const fileCount = flatFiles.length;
  const firstFile = flatFiles[0] ?? null;

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
      <h1 className="text-3xl font-bold mb-2">md-serve</h1>
      <p className="text-gray-500 dark:text-gray-400 mb-6 text-sm font-mono">{rootPath}</p>
      {fileCount > 0 ? (
        <>
          <p className="text-lg mb-4">
            <span className="font-semibold text-2xl">{fileCount}</span>{' '}
            <span className="text-gray-600 dark:text-gray-300">
              markdown {fileCount === 1 ? 'file' : 'files'} found
            </span>
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
            Select a file from the sidebar to start reading, or press{' '}
            <kbd className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-xs font-mono">
              Cmd+K
            </kbd>{' '}
            to search.
          </p>
          {firstFile && (
            <Link
              href={`/${firstFile.path}`}
              className="inline-flex items-center gap-2 px-4 py-2 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded-md text-sm font-medium hover:opacity-90 transition-opacity"
            >
              Open {firstFile.name}
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M5 3l4 4-4 4" />
              </svg>
            </Link>
          )}
        </>
      ) : (
        <>
          <p className="text-lg mb-4 text-gray-600 dark:text-gray-300">No markdown files found</p>
          <div className="text-sm text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg px-6 py-4 text-left max-w-md">
            <p className="mb-2 font-medium">Active filters:</p>
            <ul className="list-disc list-inside space-y-1 font-mono text-xs">
              <li>Root: <code>{rootPath}</code></li>
            </ul>
            <p className="mt-3 text-gray-400">Try adjusting your include/exclude/filter flags.</p>
          </div>
        </>
      )}
    </div>
  );
}

function FileViewContent({ filePath }: { filePath: string }) {
  const { setHeadings, setCurrentFilePath } = useLayout();
  const [fileData, setFileData] = useState<FileData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchFile = useCallback(async () => {
    if (!filePath) return;
    try {
      const res = await fetch(`/api/file?path=${encodeURIComponent(filePath)}`);
      if (!res.ok) {
        if (res.status === 404) setError('File not found');
        else setError(`Failed to load file (${res.status})`);
        setFileData(null);
        return;
      }
      const data: FileData = await res.json();
      setFileData(data);
      setError(null);
    } catch {
      setError('Failed to load file');
      setFileData(null);
    } finally {
      setLoading(false);
    }
  }, [filePath]);

  useEffect(() => {
    if (!filePath) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    setFileData(null);
    setCurrentFilePath(filePath);
    fetchFile();
    return () => setCurrentFilePath(null);
  }, [filePath, fetchFile, setCurrentFilePath]);

  const handleHeadingsExtracted = useCallback(
    (headings: HeadingItem[]) => { setHeadings(headings); },
    [setHeadings],
  );

  useEffect(() => {
    return () => setHeadings([]);
  }, [filePath, setHeadings]);

  useSSE({
    onFileChanged: useCallback(
      (event: SSEEvent) => {
        if (event.path === filePath) fetchFile();
      },
      [filePath, fetchFile],
    ),
  });

  const contentRef = useRef<HTMLDivElement>(null);
  const { selection, clearSelection } = useTextSelection(contentRef);
  const { sessions } = useSessions(filePath);

  useEffect(() => {
    if (!loading && fileData && typeof window !== 'undefined' && window.location.hash) {
      const id = window.location.hash.slice(1);
      const el = document.getElementById(id);
      if (el) requestAnimationFrame(() => el.scrollIntoView({ behavior: 'smooth' }));
    }
  }, [loading, fileData]);

  if (loading) return (
    <div className="flex items-center justify-center min-h-[40vh]">
      <div className="animate-pulse text-gray-400 text-sm">Loading...</div>
    </div>
  );

  if (error) return (
    <div className="flex flex-col items-center justify-center min-h-[40vh] text-center">
      <div className="text-6xl mb-4 text-gray-300 dark:text-gray-700">404</div>
      <h1 className="text-xl font-semibold mb-2">File not found</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400">
        <code className="bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded text-xs">{filePath}</code> does not exist or is not a markdown file.
      </p>
    </div>
  );

  if (!fileData) return null;

  const hasFrontmatter = fileData.frontmatter && Object.keys(fileData.frontmatter).length > 0;

  return (
    <>
      <AgentToolbar filePath={filePath} sessionCount={sessions.length} />
      <div ref={contentRef}>
        <article>
          {hasFrontmatter && <FrontmatterCard data={fileData.frontmatter} />}
          <div className="prose prose-gray dark:prose-invert max-w-none">
            <MarkdownRenderer content={fileData.content} filePath={filePath} onHeadingsExtracted={handleHeadingsExtracted} />
          </div>
        </article>
      </div>
      <SelectionEditBar
        selectedText={selection.text}
        rect={selection.rect}
        filePath={filePath}
        onDone={clearSelection}
      />
    </>
  );
}

export default function CatchAllPage() {
  const params = useParams<{ path?: string[] }>();
  const pathSegments = params.path ?? [];
  const filePath = pathSegments.join('/');

  if (pathSegments.length === 0) {
    return <WelcomeContent />;
  }

  return <FileViewContent filePath={filePath} />;
}
