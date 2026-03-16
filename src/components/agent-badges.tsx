'use client';

import { useAgents } from '@/hooks/use-agents';

export function AgentBadges() {
  const { availableAgents } = useAgents();

  if (availableAgents.length === 0) return null;

  return (
    <div className="flex items-center gap-1.5">
      {availableAgents.map((agent) => (
        <span
          key={agent.id}
          className="px-2 py-0.5 text-xs rounded-md bg-primary/10 text-primary border border-primary/20"
        >
          {agent.name}
        </span>
      ))}
    </div>
  );
}
