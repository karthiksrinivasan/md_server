'use client';

import { useState } from 'react';

interface CodeBlockProps {
  language?: string;
  rawCode: string;
  children: React.ReactNode;
}

export function CodeBlock({ language, rawCode, children }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(rawCode);
      } else {
        // Fallback for insecure contexts
        const textArea = document.createElement('textarea');
        textArea.value = rawCode;
        textArea.style.position = 'fixed';
        textArea.style.opacity = '0';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  return (
    <div className="relative group rounded-md overflow-hidden border border-[hsl(var(--code-border))] bg-[hsl(var(--code-bg))] my-4">
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-[hsl(var(--code-border))] bg-[hsl(var(--code-bg))]">
        <span className="text-xs font-mono text-muted-foreground">
          {language || 'text'}
        </span>
        <button
          data-testid="copy-button"
          onClick={handleCopy}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded hover:bg-muted"
          aria-label="Copy code"
        >
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
      {/* Code content */}
      <div className="overflow-x-auto">
        <pre className="m-0 p-0 bg-transparent text-foreground">
          {children}
        </pre>
      </div>
    </div>
  );
}
