'use client';

import { useState, useEffect } from 'react';

interface SessionRef {
  provider: string;
  sessionId: string;
  sessionFile: string;
  timestamp: string;
  summary?: string;
  action: 'created' | 'modified' | 'read';
  resumeCommand: string;
}

export function useSessions(filePath: string | null) {
  const [sessions, setSessions] = useState<SessionRef[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!filePath) {
      setSessions([]);
      return;
    }

    let cancelled = false;

    async function fetchSessions() {
      setLoading(true);
      try {
        const res = await fetch(`/api/sessions?file=${encodeURIComponent(filePath!)}`);
        if (cancelled || !res.ok) return;
        const data = await res.json();
        if (!cancelled) setSessions(data.sessions);
      } catch {
        if (!cancelled) setSessions([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchSessions();

    return () => { cancelled = true; };
  }, [filePath]);

  return { sessions, loading };
}
