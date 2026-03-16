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
      detectArgs: ['--version'], summarizeArgs: [], editArgs: ['--print', '{prompt}'],
      resumeArgs: [], sessionPaths: [], timeout: 120000,
    } : undefined),
    isAvailable: vi.fn((id: string) => id === 'claude'),
  })),
}));

vi.mock('@/server/agent-executor', () => ({
  AgentExecutor: vi.fn(function () {
    return { edit: vi.fn().mockResolvedValue({ success: true }) };
  }),
}));

import { POST } from '../agent/edit/route';

describe('POST /api/agent/edit', () => {
  it('edits file with full-document prompt', async () => {
    const request = new NextRequest('http://localhost:3030/api/agent/edit', {
      method: 'POST',
      body: JSON.stringify({ agentId: 'claude', filePath: 'README.md', prompt: 'rewrite it' }),
      headers: { 'Content-Type': 'application/json' },
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
  });

  it('edits file with selection', async () => {
    const request = new NextRequest('http://localhost:3030/api/agent/edit', {
      method: 'POST',
      body: JSON.stringify({
        agentId: 'claude', filePath: 'README.md',
        prompt: 'make shorter', selection: 'some text to edit',
      }),
      headers: { 'Content-Type': 'application/json' },
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
  });

  it('returns 400 for missing prompt', async () => {
    const request = new NextRequest('http://localhost:3030/api/agent/edit', {
      method: 'POST',
      body: JSON.stringify({ agentId: 'claude', filePath: 'README.md' }),
      headers: { 'Content-Type': 'application/json' },
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
  });

  it('returns 403 for path traversal attempt', async () => {
    const request = new NextRequest('http://localhost:3030/api/agent/edit', {
      method: 'POST',
      body: JSON.stringify({ agentId: 'claude', filePath: '../../../etc/passwd', prompt: 'test' }),
      headers: { 'Content-Type': 'application/json' },
    });

    const response = await POST(request);
    expect(response.status).toBe(403);
  });
});
