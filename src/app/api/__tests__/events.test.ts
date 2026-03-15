import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/server/watcher-singleton', () => ({
  getFileWatcher: vi.fn(),
}));

import { getFileWatcher } from '@/server/watcher-singleton';
import { GET } from '../events/route';

const mockGetFileWatcher = vi.mocked(getFileWatcher);

const createMockWatcher = () => ({
  onEvent: vi.fn(),
  start: vi.fn(),
  stop: vi.fn(),
});

describe('GET /api/events', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns response with correct SSE headers', async () => {
    const mockWatcher = createMockWatcher();
    mockGetFileWatcher.mockReturnValue(mockWatcher as unknown as ReturnType<typeof getFileWatcher>);

    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('text/event-stream');
    expect(response.headers.get('Cache-Control')).toBe('no-cache');
    expect(response.headers.get('Connection')).toBe('keep-alive');
  });

  it('registers an event callback with the watcher', async () => {
    const mockWatcher = createMockWatcher();
    mockGetFileWatcher.mockReturnValue(mockWatcher as unknown as ReturnType<typeof getFileWatcher>);

    await GET();

    expect(mockWatcher.onEvent).toHaveBeenCalledOnce();
    expect(typeof mockWatcher.onEvent.mock.calls[0][0]).toBe('function');
  });

  it('sends a heartbeat connected event on connect', async () => {
    const mockWatcher = createMockWatcher();
    mockGetFileWatcher.mockReturnValue(mockWatcher as unknown as ReturnType<typeof getFileWatcher>);

    const response = await GET();
    const reader = response.body!.getReader();
    const { value } = await reader.read();
    const text = new TextDecoder().decode(value);

    expect(text).toContain('event: connected');
    expect(text).toContain('"status":"ok"');
    reader.releaseLock();
  });

  it('formats file events in SSE format', async () => {
    let capturedCallback: ((event: unknown) => void) | null = null;
    const mockWatcher = {
      onEvent: vi.fn((cb) => { capturedCallback = cb; }),
      start: vi.fn(),
      stop: vi.fn(),
    };
    mockGetFileWatcher.mockReturnValue(mockWatcher as unknown as ReturnType<typeof getFileWatcher>);

    const response = await GET();
    const reader = response.body!.getReader();

    // Read the initial heartbeat
    await reader.read();

    // Simulate a file event
    const testEvent = { type: 'file:changed', path: 'docs/test.md' };
    capturedCallback!(testEvent);

    // Read the event message
    const { value } = await reader.read();
    const text = new TextDecoder().decode(value);

    expect(text).toContain('event: file:changed');
    expect(text).toContain('"type":"file:changed"');
    expect(text).toContain('"path":"docs/test.md"');
    expect(text).toMatch(/\n\n$/);
    reader.releaseLock();
  });
});
