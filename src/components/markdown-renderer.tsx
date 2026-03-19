'use client';

import { useEffect, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';
import Link from 'next/link';
import Image from 'next/image';
import { remarkPlugins, rehypePlugins, extractHeadings, type HeadingItem } from '@/lib/markdown';
import { CodeBlock } from './code-block';
import { MermaidBlock } from './mermaid-block';

interface MarkdownRendererProps {
  content: string;
  filePath?: string;
  onHeadingsExtracted?: (headings: HeadingItem[]) => void;
  assetVersion?: number;
}

function isAbsoluteUrl(ref: string): boolean {
  return ref.startsWith('http://') || ref.startsWith('https://') || ref.startsWith('/');
}

/** Resolve a relative reference against the directory of the current file. */
function resolveRelativePath(ref: string, filePath?: string): string {
  const dir = filePath && filePath.includes('/') ? filePath.replace(/\/[^/]+$/, '') : '';
  const joined = dir ? `${dir}/${ref}` : ref;
  // Normalize redundant ./ segments
  return joined.replace(/(?:^|\/)\.\//, '/').replace(/^\//, '');
}

function resolveRelativeLink(href: string, filePath?: string): string {
  if (!filePath || isAbsoluteUrl(href)) return href;

  if (href.endsWith('.md') || href.includes('.md#')) {
    const resolved = resolveRelativePath(href, filePath);
    return '/' + resolved.replace(/\.md(#|$)/, '$1');
  }

  return href;
}

function resolveImageSrc(src: string, filePath?: string, assetVersion?: number): string {
  if (!src || isAbsoluteUrl(src)) return src;
  const base = `/api/asset?path=${encodeURIComponent(resolveRelativePath(src, filePath))}`;
  return assetVersion ? `${base}&_v=${assetVersion}` : base;
}

function extractRawText(children: React.ReactNode): string {
  if (typeof children === 'string') return children;
  if (Array.isArray(children)) return children.map(extractRawText).join('');
  if (children && typeof children === 'object' && 'props' in (children as object)) {
    const el = children as React.ReactElement<{ children?: React.ReactNode }>;
    return extractRawText(el.props.children);
  }
  return '';
}

export function MarkdownRenderer({ content, filePath, onHeadingsExtracted, assetVersion }: MarkdownRendererProps) {
  const headings = useMemo(() => extractHeadings(content), [content]);

  useEffect(() => {
    if (onHeadingsExtracted) {
      onHeadingsExtracted(headings);
    }
  }, [headings, onHeadingsExtracted]);

  const components: Components = useMemo(
    () => ({
      // Links: internal .md → SPA nav, external → new tab
      a({ href, children, ...props }) {
        if (!href) return <a {...props}>{children}</a>;

        // Block dangerous URI schemes (javascript:, data:, vbscript:, etc.)
        const SAFE_SCHEMES = /^(https?:|mailto:|\/|#|\.)/i;
        if (href && !SAFE_SCHEMES.test(href)) {
          return <span>{children}</span>;
        }

        const isExternal =
          href.startsWith('http://') || href.startsWith('https://') || href.startsWith('//');

        if (isExternal) {
          return (
            <a href={href} target="_blank" rel="noopener noreferrer" {...props}>
              {children}
            </a>
          );
        }

        const resolved = resolveRelativeLink(href, filePath);
        return (
          <Link href={resolved} {...props}>
            {children}
          </Link>
        );
      },

      // Images: resolve relative to /api/asset
      img({ src, alt, ...props }) {
        const resolvedSrc = resolveImageSrc(typeof src === 'string' ? src : '', filePath, assetVersion);
        // Use a regular img for external images, Next Image for internal
        if (!resolvedSrc.startsWith('http')) {
          return (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={resolvedSrc} alt={alt ?? ''} className="max-w-full h-auto rounded" {...props} />
          );
        }
        return (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={resolvedSrc} alt={alt ?? ''} className="max-w-full h-auto rounded" {...props} />
        );
      },

      // Pre/code: detect mermaid vs regular code blocks
      pre({ children, ...props }) {
        // Check if this is a mermaid block
        const child = Array.isArray(children) ? children[0] : children;
        if (child && typeof child === 'object' && 'props' in (child as object)) {
          const codeProps = (child as React.ReactElement<{ className?: string; children?: React.ReactNode }>).props;
          const className = codeProps.className ?? '';
          const language = className.replace(/^language-/, '');

          if (language === 'mermaid') {
            const code = extractRawText(codeProps.children);
            return <MermaidBlock code={code} />;
          }

          const rawCode = extractRawText(codeProps.children);
          return (
            <CodeBlock language={language || undefined} rawCode={rawCode}>
              {children}
            </CodeBlock>
          );
        }

        return <pre {...props}>{children}</pre>;
      },

      // Inline code (block code is handled by the pre() handler above)
      code({ children, className, ...props }) {
        // Block-level code (inside <pre>) has a language-* class from rehype-highlight
        const isBlock = className && /language-|hljs/.test(className);
        if (isBlock) {
          return (
            <code className={className} {...props}>
              {children}
            </code>
          );
        }
        // Inline code styling
        return (
          <code
            className={`${className ?? ''} px-1 py-0.5 rounded text-sm font-mono bg-[hsl(var(--code-bg))]`}
            {...props}
          >
            {children}
          </code>
        );
      },

      // Tables: scroll wrapper
      table({ children, ...props }) {
        return (
          <div className="overflow-x-auto my-4">
            <table className="min-w-full divide-y divide-border" {...props}>
              {children}
            </table>
          </div>
        );
      },

      // Checkboxes: styled readonly
      input({ type, checked, ...props }) {
        if (type === 'checkbox') {
          return (
            <input
              type="checkbox"
              checked={checked}
              readOnly
              className="mr-2 rounded"
              {...props}
            />
          );
        }
        return <input type={type} {...props} />;
      },
    }),
    [filePath, assetVersion]
  );

  return (
    <div>
      <ReactMarkdown
        remarkPlugins={remarkPlugins}
        rehypePlugins={rehypePlugins}
        components={components}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
