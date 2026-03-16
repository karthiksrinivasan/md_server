'use client';

import { useState } from 'react';
import { useSessions } from '@/hooks/use-sessions';

interface SessionsPanelProps {
  filePath: string | null;
}

function timeAgo(timestamp: string): string {
  const diff = Date.now() - new Date(timestamp).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function SessionsPanel({ filePath }: SessionsPanelProps) {
  const { sessions, loading } = useSessions(filePath);
  const [copied, setCopied] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="px-2 py-1">
        <p className="text-xs text-muted-foreground animate-pulse">Loading sessions...</p>
      </div>
    );
  }

  if (sessions.length === 0) return null;

  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Sessions
      </p>
      <div className="space-y-2">
        {sessions.map((session, i) => (
          <div
            key={`${session.sessionId}-${i}`}
            className="p-2 rounded-md border border-border bg-muted/30"
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-semibold text-primary">{session.provider}</span>
              <span className="text-[10px] text-muted-foreground">{timeAgo(session.timestamp)}</span>
            </div>
            {session.summary && (
              <p className="text-xs text-foreground mb-1.5 line-clamp-2">{session.summary}</p>
            )}
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                {session.action}
              </span>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(session.resumeCommand);
                  setCopied(session.sessionId);
                  setTimeout(() => setCopied(null), 2000);
                }}
                className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 transition-colors"
              >
                {copied === session.sessionId ? 'Copied!' : 'Copy resume cmd'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
