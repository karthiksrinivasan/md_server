'use client';

import type { HeadingItem } from '@/lib/markdown';
import { useOutline } from '@/hooks/use-outline';

interface OutlinePanelProps {
  headings: HeadingItem[];
}

const levelIndent: Record<number, string> = {
  1: 'pl-0',
  2: 'pl-0',
  3: 'pl-3',
  4: 'pl-6',
  5: 'pl-9',
  6: 'pl-12',
};

export function OutlinePanel({ headings }: OutlinePanelProps) {
  const { activeId, scrollToHeading } = useOutline(headings);

  if (headings.length === 0) return null;

  return (
    <nav aria-label="On this page">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        On this page
      </p>
      <ul className="space-y-0.5">
        {headings.map((heading) => {
          const indent = levelIndent[heading.level] ?? 'pl-0';
          const isActive = activeId === heading.id;

          return (
            <li key={heading.id} className={indent}>
              <button
                type="button"
                onClick={() => scrollToHeading(heading.id)}
                className={`w-full text-left text-sm py-0.5 px-2 rounded transition-colors truncate block ${
                  isActive
                    ? 'text-primary font-medium bg-primary/10'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                }`}
                aria-current={isActive ? 'true' : undefined}
              >
                {heading.text}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
