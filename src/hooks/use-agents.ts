'use client';

import { useEffect } from 'react';
import { useLayout } from '@/app/layout-context';

export function useAgents() {
  const { availableAgents, setAvailableAgents, selectedAgent, setSelectedAgent } = useLayout();

  useEffect(() => {
    async function fetchAgents() {
      try {
        const res = await fetch('/api/agents');
        if (!res.ok) return;
        const data = await res.json();
        setAvailableAgents(data.agents);
        if (data.agents.length > 0 && !selectedAgent) {
          setSelectedAgent(data.agents[0].id);
        }
      } catch {
        // Agent detection failed — agents feature not available
      }
    }
    fetchAgents();
  }, [setAvailableAgents, selectedAgent, setSelectedAgent]);

  return { availableAgents, selectedAgent, setSelectedAgent };
}
