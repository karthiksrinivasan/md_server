'use client';

import { useState } from 'react';

interface FrontmatterCardProps {
  data: Record<string, unknown>;
}

const PRIMARY_FIELDS = ['title', 'date', 'author', 'tags', 'description'] as const;

function formatDate(value: unknown): string {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(String(value));
  if (isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
}

function isEmptyValue(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string' && value.trim() === '') return true;
  if (Array.isArray(value) && value.length === 0) return true;
  return false;
}

function FieldValue({ field, value }: { field: string; value: unknown }) {
  if (field === 'tags' && Array.isArray(value)) {
    return (
      <div className="flex flex-wrap gap-1.5">
        {value.map((tag, i) => (
          <span
            key={i}
            className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary"
          >
            {String(tag)}
          </span>
        ))}
      </div>
    );
  }

  if (field === 'date') {
    return <span className="text-sm text-muted-foreground">{formatDate(value)}</span>;
  }

  if (Array.isArray(value)) {
    return (
      <div className="flex flex-wrap gap-1.5">
        {value.map((item, i) => (
          <span
            key={i}
            className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-secondary text-secondary-foreground"
          >
            {String(item)}
          </span>
        ))}
      </div>
    );
  }

  if (typeof value === 'object' && value !== null) {
    return (
      <pre className="text-xs font-mono text-muted-foreground whitespace-pre-wrap">
        {JSON.stringify(value, null, 2)}
      </pre>
    );
  }

  return <span className="text-sm text-muted-foreground">{String(value)}</span>;
}

export function FrontmatterCard({ data }: FrontmatterCardProps) {
  const [expanded, setExpanded] = useState(false);

  // Filter out empty values
  const entries = Object.entries(data).filter(([, value]) => !isEmptyValue(value));

  if (entries.length === 0) return null;

  const primaryEntries = entries.filter(([key]) =>
    PRIMARY_FIELDS.includes(key as (typeof PRIMARY_FIELDS)[number])
  );
  const extraEntries = entries.filter(
    ([key]) => !PRIMARY_FIELDS.includes(key as (typeof PRIMARY_FIELDS)[number])
  );

  const hasExtra = extraEntries.length > 0;

  return (
    <div className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] text-[hsl(var(--card-foreground))] p-4 mb-6">
      <div className="space-y-2">
        {primaryEntries.map(([key, value]) => (
          <div key={key} className="flex flex-col gap-0.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {key}
            </span>
            <FieldValue field={key} value={value} />
          </div>
        ))}

        {hasExtra && (
          <>
            {expanded &&
              extraEntries.map(([key, value]) => (
                <div key={key} className="flex flex-col gap-0.5 pt-1">
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {key}
                  </span>
                  <FieldValue field={key} value={value} />
                </div>
              ))}
            <button
              onClick={() => setExpanded((e) => !e)}
              className="text-xs text-primary hover:underline mt-1"
            >
              {expanded ? 'Show less' : `Show ${extraEntries.length} more field${extraEntries.length === 1 ? '' : 's'}`}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
