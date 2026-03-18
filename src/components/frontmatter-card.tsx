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
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function isEmptyValue(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string' && value.trim() === '') return true;
  if (Array.isArray(value) && value.length === 0) return true;
  return false;
}

function isDateLike(key: string, value: unknown): boolean {
  if (/date|created|updated|modified|published/i.test(key)) return true;
  if (value instanceof Date) return true;
  return false;
}

function humanizeKey(key: string): string {
  return key.replace(/([A-Z])/g, ' $1').replace(/[_-]/g, ' ').replace(/\s+/g, ' ').trim();
}

const LABEL_CLASS = 'text-[11px] font-medium text-muted-foreground/70 uppercase tracking-wide shrink-0 whitespace-nowrap';

function InlineObject({ value }: { value: Record<string, unknown> }) {
  const entries = Object.entries(value).filter(([, v]) => !isEmptyValue(v));
  if (entries.length === 0) return null;

  return (
    <span className="text-xs text-muted-foreground">
      {entries.map(([k, v], i) => (
        <span key={k}>
          {i > 0 && <span className="mx-1 text-muted-foreground/50">&middot;</span>}
          <span className="font-medium">{humanizeKey(k)}:</span>{' '}
          <InlineValue fieldKey={k} value={v} />
        </span>
      ))}
    </span>
  );
}

function InlineValue({ fieldKey, value }: { fieldKey: string; value: unknown }) {
  if (isEmptyValue(value)) return null;

  if (isDateLike(fieldKey, value)) {
    return <span>{formatDate(value)}</span>;
  }

  if (typeof value === 'boolean') {
    return <span className={value ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>{value ? 'yes' : 'no'}</span>;
  }

  if (typeof value === 'number') {
    return <span className="font-mono">{value.toLocaleString()}</span>;
  }

  if (Array.isArray(value)) {
    if (value.every(item => typeof item !== 'object' || item === null)) {
      return <span>{value.map(String).join(', ')}</span>;
    }
    return (
      <span className="flex flex-col gap-1 mt-0.5">
        {value.map((item, i) => (
          <span key={i} className="ml-2 pl-2 border-l border-[hsl(var(--border))]">
            {typeof item === 'object' && item !== null
              ? <InlineObject value={item as Record<string, unknown>} />
              : String(item)}
          </span>
        ))}
      </span>
    );
  }

  if (typeof value === 'object' && value !== null) {
    return <InlineObject value={value as Record<string, unknown>} />;
  }

  if (typeof value === 'string' && /^https?:\/\//.test(value)) {
    return (
      <a href={value} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
        {value}
      </a>
    );
  }

  return <span>{String(value)}</span>;
}

function FieldRow({ field, value }: { field: string; value: unknown }) {
  // Tags get special badge treatment
  if (field === 'tags' && Array.isArray(value)) {
    return (
      <div className="flex items-baseline gap-2">
        <span className={LABEL_CLASS}>{field}</span>
        <div className="flex flex-wrap gap-1">
          {value.map((tag, i) => (
            <span key={i} className="px-1.5 py-px rounded text-[11px] font-medium bg-primary/10 text-primary">{String(tag)}</span>
          ))}
        </div>
      </div>
    );
  }

  // Arrays of primitives as inline comma-separated
  if (Array.isArray(value) && value.every(item => typeof item !== 'object' || item === null)) {
    return (
      <div className="flex items-baseline gap-2">
        <span className={LABEL_CLASS}>{humanizeKey(field)}</span>
        <div className="flex flex-wrap gap-1">
          {value.map((item, i) => (
            <span key={i} className="px-1.5 py-px rounded text-[11px] font-medium bg-secondary text-secondary-foreground">{String(item)}</span>
          ))}
        </div>
      </div>
    );
  }

  // Arrays of objects — stacked rows
  if (Array.isArray(value) && value.length > 0) {
    return (
      <div className="flex items-start gap-2">
        <span className={`${LABEL_CLASS} pt-px`}>{humanizeKey(field)}</span>
        <div className="flex flex-col gap-1 min-w-0">
          {value.map((item, i) => (
            <div key={i} className="text-xs text-muted-foreground pl-2 border-l border-[hsl(var(--border))]">
              {typeof item === 'object' && item !== null
                ? <InlineObject value={item as Record<string, unknown>} />
                : <span>{String(item)}</span>}
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Objects — inline key:value pairs
  if (typeof value === 'object' && value !== null) {
    return (
      <div className="flex items-baseline gap-2">
        <span className={LABEL_CLASS}>{humanizeKey(field)}</span>
        <span className="text-xs text-muted-foreground">
          <InlineObject value={value as Record<string, unknown>} />
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-baseline gap-2">
      <span className={LABEL_CLASS}>{humanizeKey(field)}</span>
      <span className="text-xs text-muted-foreground">
        <InlineValue fieldKey={field} value={value} />
      </span>
    </div>
  );
}

export function FrontmatterCard({ data }: FrontmatterCardProps) {
  const [expanded, setExpanded] = useState(false);

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
    <div className="rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] text-[hsl(var(--card-foreground))] px-3 py-2 mb-4">
      <div className="flex flex-col gap-1">
        {primaryEntries.map(([key, value]) => (
          <FieldRow key={key} field={key} value={value} />
        ))}

        {hasExtra && expanded &&
          extraEntries.map(([key, value]) => (
            <FieldRow key={key} field={key} value={value} />
          ))}

        {hasExtra && (
          <div className="flex justify-end">
            <button
              onClick={() => setExpanded((e) => !e)}
              className="text-[11px] text-primary hover:underline"
            >
              {expanded ? 'less' : `+${extraEntries.length} more`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
