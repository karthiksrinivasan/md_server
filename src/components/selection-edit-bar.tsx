'use client';

import { useState, useRef, useEffect } from 'react';
import { useAgents } from '@/hooks/use-agents';
import { useLayout } from '@/app/layout-context';
import { AgentPicker } from '@/components/agent-picker';

interface SelectionEditBarProps {
  selectedText: string;
  rect: DOMRect | null;
  filePath: string;
  onDone: () => void;
}

export function SelectionEditBar({ selectedText, rect, filePath, onDone }: SelectionEditBarProps) {
  const [prompt, setPrompt] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const { selectedAgent } = useAgents();
  const { setIsAgentWorking } = useLayout();

  useEffect(() => {
    if (rect && inputRef.current) {
      inputRef.current.focus();
    }
  }, [rect]);

  if (!selectedText || !rect) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!prompt.trim() || !selectedAgent) return;

    setIsAgentWorking(true);
    try {
      await fetch('/api/agent/edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentId: selectedAgent,
          filePath,
          prompt: prompt.trim(),
          selection: selectedText,
        }),
      });
    } catch {
      // Error handling
    } finally {
      setIsAgentWorking(false);
      setPrompt('');
      onDone();
    }
  }

  const top = Math.max(8, rect.top - 44);
  const left = Math.max(8, rect.left);

  return (
    <form
      onSubmit={handleSubmit}
      className="fixed z-50 flex items-center gap-1.5 px-2 py-1.5 bg-background border border-border rounded-lg shadow-lg"
      style={{ top: `${top}px`, left: `${left}px` }}
    >
      <input
        ref={inputRef}
        type="text"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="Edit instruction..."
        className="text-xs px-2 py-1 w-48 bg-muted border border-border rounded text-foreground placeholder:text-muted-foreground"
      />
      <AgentPicker className="text-[10px]" />
      <button
        type="submit"
        disabled={!prompt.trim()}
        className="px-2 py-1 text-xs rounded bg-primary text-primary-foreground disabled:opacity-50"
      >
        Go
      </button>
      <button
        type="button"
        onClick={onDone}
        className="text-muted-foreground hover:text-foreground text-xs px-1"
        aria-label="Cancel"
      >
        &times;
      </button>
    </form>
  );
}
