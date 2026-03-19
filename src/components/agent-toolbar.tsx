'use client';

import { useState } from 'react';
import { useLayout } from '@/app/layout-context';
import { useAgents } from '@/hooks/use-agents';
import { AgentPicker } from '@/components/agent-picker';
import { SummaryModal } from '@/components/summary-modal';

interface AgentToolbarProps {
  filePath: string;
  onShowSessions?: () => void;
  sessionCount?: number;
  selectedText?: string;
  onEditDone?: () => void;
}

export function AgentToolbar({ filePath, onShowSessions, sessionCount, selectedText, onEditDone }: AgentToolbarProps) {
  const { availableAgents, selectedAgent } = useAgents();
  const { isAgentWorking, setIsAgentWorking } = useLayout();
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [summary, setSummary] = useState('');
  const [summaryLoading, setSummaryLoading] = useState(false);

  if (availableAgents.length === 0) return null;

  async function handleSummarize() {
    if (!selectedAgent) return;
    setSummaryOpen(true);
    setSummaryLoading(true);
    setIsAgentWorking(true);
    try {
      const res = await fetch('/api/agent/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: selectedAgent, filePath }),
      });
      const data = await res.json();
      setSummary(data.summary || data.error || 'No summary generated');
    } catch {
      setSummary('Failed to generate summary');
    } finally {
      setSummaryLoading(false);
      setIsAgentWorking(false);
    }
  }

  const hasSelection = !!selectedText;

  async function handleEdit() {
    if (!selectedAgent) return;
    const label = hasSelection
      ? 'Enter edit instruction for the selected text:'
      : 'Enter edit instruction for the entire document:';
    const prompt = window.prompt(label);
    if (!prompt) return;

    setIsAgentWorking(true);
    try {
      const body: Record<string, string> = { agentId: selectedAgent, filePath, prompt };
      if (hasSelection) body.selection = selectedText!;
      const res = await fetch('/api/agent/edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        window.alert(`Edit failed: ${data.error || res.statusText}`);
      }
    } catch {
      window.alert('Edit failed: network error');
    } finally {
      setIsAgentWorking(false);
      onEditDone?.();
    }
  }

  return (
    <>
      <div className="flex items-center gap-2 px-4 py-1.5 border-b border-border bg-muted/30">
        <button
          type="button"
          onClick={handleSummarize}
          disabled={isAgentWorking}
          className="px-2.5 py-1 text-xs rounded-md bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 disabled:opacity-50 transition-colors"
        >
          Summarize
        </button>
        <button
          type="button"
          onClick={handleEdit}
          disabled={isAgentWorking}
          className={`px-2.5 py-1 text-xs rounded-md border disabled:opacity-50 transition-colors ${
            hasSelection
              ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20 hover:bg-blue-500/20'
              : 'bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20 hover:bg-green-500/20'
          }`}
        >
          {hasSelection ? 'Edit selected text with AI' : 'Edit with AI'}
        </button>

        <AgentPicker />

        <div className="flex-1" />

        {sessionCount !== undefined && sessionCount > 0 && (
          <button
            type="button"
            onClick={onShowSessions}
            className="px-2.5 py-1 text-xs rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 hover:bg-amber-500/20 transition-colors"
          >
            Sessions ({sessionCount})
          </button>
        )}

        {isAgentWorking && (
          <span className="text-xs text-muted-foreground animate-pulse">Working...</span>
        )}
      </div>

      <SummaryModal
        open={summaryOpen}
        onClose={() => setSummaryOpen(false)}
        summary={summary}
        loading={summaryLoading}
      />
    </>
  );
}
