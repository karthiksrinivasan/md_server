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

vi.mock('@/server/session-indexer-singleton', () => ({
  getSessionIndexer: vi.fn(() => ({
    getSessionsForFile: vi.fn((filePath: string) => {
      if (filePath === 'README.md') {
        return [
          {
            provider: 'claude', sessionId: 'sess-1', sessionFile: '/tmp/session.jsonl',
            timestamp: '2026-03-15T10:00:00Z', summary: 'Updated readme',
            action: 'modified', resumeCommand: 'claude --resume sess-1',
          },
        ];
      }
      return [];
    }),
  })),
}));

import { GET } from '../sessions/route';

describe('GET /api/sessions', () => {
  it('returns sessions for a file', async () => {
    const request = new NextRequest('http://localhost:3030/api/sessions?file=README.md');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.sessions.length).toBe(1);
    expect(data.sessions[0].provider).toBe('claude');
    expect(data.sessions[0].resumeCommand).toBe('claude --resume sess-1');
  });

  it('returns 400 when file param is missing', async () => {
    const request = new NextRequest('http://localhost:3030/api/sessions');
    const response = await GET(request);
    expect(response.status).toBe(400);
  });

  it('returns empty array for file with no sessions', async () => {
    const request = new NextRequest('http://localhost:3030/api/sessions?file=unknown.md');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.sessions).toEqual([]);
  });

  it('returns 403 for path traversal attempt', async () => {
    const request = new NextRequest('http://localhost:3030/api/sessions?file=../../../etc/passwd');
    const response = await GET(request);
    expect(response.status).toBe(403);
  });
});
