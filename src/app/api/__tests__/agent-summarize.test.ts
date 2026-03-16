import { describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/server/config', () => ({
  getConfig: vi.fn(() => ({
    rootDir: '/tmp/test',
    port: 3030,
    host: 'localhost',
    open: false,
    watch: true,
    filters: { include: [], exclude: [], filter: null },
  })),
}));

vi.mock('@/server/agent-registry-singleton', () => ({
  getAgentRegistry: vi.fn(async () => ({
    getAgent: vi.fn((id: string) => id === 'claude' ? {
      id: 'claude', name: 'Claude Code', binary: 'claude',
      detectArgs: ['--version'], summarizeArgs: ['--print', '{file}'],
      editArgs: [], resumeArgs: [], sessionPaths: [], timeout: 120000,
    } : undefined),
    isAvailable: vi.fn((id: string) => id === 'claude'),
  })),
}));

vi.mock('@/server/agent-executor', () => ({
  AgentExecutor: vi.fn(function () {
    return { summarize: vi.fn().mockResolvedValue({ summary: 'A test summary' }) };
  }),
}));

import { POST } from '../agent/summarize/route';

describe('POST /api/agent/summarize', () => {
  it('returns summary from agent', async () => {
    const request = new NextRequest('http://localhost:3030/api/agent/summarize', {
      method: 'POST',
      body: JSON.stringify({ agentId: 'claude', filePath: 'README.md' }),
      headers: { 'Content-Type': 'application/json' },
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.summary).toBe('A test summary');
  });

  it('returns 400 for missing params', async () => {
    const request = new NextRequest('http://localhost:3030/api/agent/summarize', {
      method: 'POST',
      body: JSON.stringify({}),
      headers: { 'Content-Type': 'application/json' },
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
  });

  it('returns 404 for unknown agent', async () => {
    const request = new NextRequest('http://localhost:3030/api/agent/summarize', {
      method: 'POST',
      body: JSON.stringify({ agentId: 'unknown', filePath: 'README.md' }),
      headers: { 'Content-Type': 'application/json' },
    });

    const response = await POST(request);
    expect(response.status).toBe(404);
  });
});
