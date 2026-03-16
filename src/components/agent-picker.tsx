'use client';

import { useAgents } from '@/hooks/use-agents';

interface AgentPickerProps {
  className?: string;
}

export function AgentPicker({ className }: AgentPickerProps) {
  const { availableAgents, selectedAgent, setSelectedAgent } = useAgents();

  if (availableAgents.length <= 1) return null;

  return (
    <select
      value={selectedAgent}
      onChange={(e) => setSelectedAgent(e.target.value)}
      className={`text-xs px-2 py-1 rounded-md border border-border bg-background text-foreground ${className ?? ''}`}
      aria-label="Select agent"
    >
      {availableAgents.map((agent) => (
        <option key={agent.id} value={agent.id}>
          {agent.name}
        </option>
      ))}
    </select>
  );
}
