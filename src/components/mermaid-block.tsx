'use client';

import { useEffect, useRef, useState } from 'react';
import { useTheme } from 'next-themes';

interface MermaidBlockProps {
  code: string;
}

export function MermaidBlock({ code }: MermaidBlockProps) {
  const { resolvedTheme } = useTheme();
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const idRef = useRef(`mermaid-${Math.random().toString(36).slice(2)}`);

  useEffect(() => {
    let cancelled = false;

    async function render() {
      setLoading(true);
      setError(null);
      setSvg(null);

      try {
        const mermaid = (await import('mermaid')).default;

        mermaid.initialize({
          startOnLoad: false,
          theme: resolvedTheme === 'dark' ? 'dark' : 'default',
          securityLevel: 'loose',
        });

        const { svg: renderedSvg } = await mermaid.render(idRef.current, code);

        if (!cancelled) {
          setSvg(renderedSvg);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    render();

    return () => {
      cancelled = true;
    };
  }, [code, resolvedTheme]);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8 rounded-md border border-[hsl(var(--code-border))] bg-[hsl(var(--code-bg))] my-4">
        <div className="flex items-center gap-2 text-muted-foreground">
          <svg
            className="animate-spin"
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </svg>
          <span className="text-sm">Rendering diagram…</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-md border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/20 my-4 overflow-hidden">
        <div className="px-4 py-2 border-b border-red-300 dark:border-red-800 bg-red-100 dark:bg-red-950/40">
          <span className="text-xs font-semibold text-red-700 dark:text-red-400">Mermaid diagram error</span>
        </div>
        <pre className="px-4 py-3 text-xs font-mono text-red-700 dark:text-red-400 overflow-x-auto whitespace-pre-wrap">
          {code}
        </pre>
        <div className="px-4 py-2 border-t border-red-300 dark:border-red-800 text-xs text-red-600 dark:text-red-500">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex justify-center items-center p-4 my-4 overflow-x-auto"
      dangerouslySetInnerHTML={{ __html: svg ?? '' }}
    />
  );
}
