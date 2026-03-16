'use client';

import { useEffect } from 'react';
import { useLayout } from '@/app/layout-context';

export function useAgents() {
  const { availableAgents, setAvailableAgents, selectedAgent, setSelectedAgent } = useLayout();

  useEffect(() => {
    let cancelled = false;
    async function fetchAgents() {
      try {
        const res = await fetch('/api/agents');
        if (!res.ok || cancelled) return;
        const data = await res.json();
        setAvailableAgents(data.agents);
        if (data.agents.length > 0) {
          setSelectedAgent((prev: string) => prev || data.agents[0].id);
        }
      } catch {
        // Agent detection failed — agents feature not available
      }
    }
    fetchAgents();
    return () => { cancelled = true; };
  }, [setAvailableAgents, setSelectedAgent]);

  return { availableAgents, selectedAgent, setSelectedAgent };
}
