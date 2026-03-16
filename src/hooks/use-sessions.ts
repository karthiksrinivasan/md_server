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

    async function fetchSessions() {
      setLoading(true);
      try {
        const res = await fetch(`/api/sessions?file=${encodeURIComponent(filePath!)}`);
        if (!res.ok) return;
        const data = await res.json();
        setSessions(data.sessions);
      } catch {
        setSessions([]);
      } finally {
        setLoading(false);
      }
    }
    fetchSessions();
  }, [filePath]);

  return { sessions, loading };
}
