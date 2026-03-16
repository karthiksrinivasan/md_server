'use client';

interface SummaryModalProps {
  open: boolean;
  onClose: () => void;
  summary: string;
  loading: boolean;
}

export function SummaryModal({ open, onClose, summary, loading }: SummaryModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-background border border-border rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] overflow-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="text-sm font-semibold">AI Summary</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground text-lg leading-none"
            aria-label="Close"
          >
            &times;
          </button>
        </div>
        <div className="p-4">
          {loading ? (
            <div className="animate-pulse text-muted-foreground text-sm">Generating summary...</div>
          ) : (
            <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap">{summary}</div>
          )}
        </div>
      </div>
    </div>
  );
}
