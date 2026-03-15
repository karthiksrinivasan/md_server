// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useSSE } from '../use-sse';

type EventHandler = (event: MessageEvent) => void;

class MockEventSource {
  static instances: MockEventSource[] = [];

  url: string;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  private listeners: Map<string, EventHandler[]> = new Map();

  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
  }

  addEventListener(type: string, handler: EventHandler) {
    const handlers = this.listeners.get(type) ?? [];
    handlers.push(handler);
    this.listeners.set(type, handlers);
  }

  removeEventListener(type: string, handler: EventHandler) {
    const handlers = this.listeners.get(type) ?? [];
    this.listeners.set(type, handlers.filter((h) => h !== handler));
  }

  dispatchEvent(type: string, data: unknown) {
    const handlers = this.listeners.get(type) ?? [];
    const event = new MessageEvent(type, { data: JSON.stringify(data) });
    for (const handler of handlers) {
      handler(event);
    }
  }

  close = vi.fn();

  triggerOpen() {
    this.onopen?.();
  }

  triggerError() {
    this.onerror?.();
  }
}

describe('useSSE', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    MockEventSource.instances = [];
    Object.defineProperty(global, 'EventSource', {
      writable: true,
      value: MockEventSource,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('connects to /api/events on mount', () => {
    renderHook(() => useSSE());
    expect(MockEventSource.instances.length).toBe(1);
    expect(MockEventSource.instances[0].url).toBe('/api/events');
  });

  it('sets status to connected on open', () => {
    const { result } = renderHook(() => useSSE());
    expect(result.current.connectionStatus).toBe('connecting');

    act(() => {
      MockEventSource.instances[0].triggerOpen();
    });

    expect(result.current.connectionStatus).toBe('connected');
    expect(result.current.isConnected).toBe(true);
  });

  it('dispatches onFileChanged callback', () => {
    const onFileChanged = vi.fn();
    const { result } = renderHook(() => useSSE({ onFileChanged }));

    act(() => {
      MockEventSource.instances[0].triggerOpen();
    });

    act(() => {
      MockEventSource.instances[0].dispatchEvent('file:changed', { path: 'test.md' });
    });

    expect(onFileChanged).toHaveBeenCalledWith(expect.objectContaining({ type: 'file:changed', path: 'test.md' }));
    expect(result.current.lastEvent).toEqual(expect.objectContaining({ type: 'file:changed' }));
  });

  it('dispatches onFileAdded callback', () => {
    const onFileAdded = vi.fn();
    renderHook(() => useSSE({ onFileAdded }));

    act(() => {
      MockEventSource.instances[0].triggerOpen();
      MockEventSource.instances[0].dispatchEvent('file:added', { path: 'new.md' });
    });

    expect(onFileAdded).toHaveBeenCalledWith(expect.objectContaining({ type: 'file:added', path: 'new.md' }));
  });

  it('dispatches onFileRemoved callback', () => {
    const onFileRemoved = vi.fn();
    renderHook(() => useSSE({ onFileRemoved }));

    act(() => {
      MockEventSource.instances[0].triggerOpen();
      MockEventSource.instances[0].dispatchEvent('file:removed', { path: 'old.md' });
    });

    expect(onFileRemoved).toHaveBeenCalledWith(expect.objectContaining({ type: 'file:removed' }));
  });

  it('dispatches onTreeUpdated callback', () => {
    const onTreeUpdated = vi.fn();
    renderHook(() => useSSE({ onTreeUpdated }));

    act(() => {
      MockEventSource.instances[0].triggerOpen();
      MockEventSource.instances[0].dispatchEvent('tree:updated', {});
    });

    expect(onTreeUpdated).toHaveBeenCalledWith(expect.objectContaining({ type: 'tree:updated' }));
  });

  it('reconnects with exponential backoff on error', async () => {
    renderHook(() => useSSE());

    // Initial connection
    expect(MockEventSource.instances.length).toBe(1);

    // Trigger error
    act(() => {
      MockEventSource.instances[0].triggerError();
    });

    expect(MockEventSource.instances[0].close).toHaveBeenCalled();

    // Advance timer by initial delay (1000ms)
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    // Should reconnect
    expect(MockEventSource.instances.length).toBe(2);

    // Trigger second error
    act(() => {
      MockEventSource.instances[1].triggerError();
    });

    // Advance by doubled delay (2000ms)
    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(MockEventSource.instances.length).toBe(3);
  });

  it('resets retry delay on successful connection', () => {
    const { result } = renderHook(() => useSSE());

    // Trigger error to increment delay
    act(() => {
      MockEventSource.instances[0].triggerError();
    });

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(MockEventSource.instances.length).toBe(2);

    // Connect successfully (resets delay)
    act(() => {
      MockEventSource.instances[1].triggerOpen();
    });

    expect(result.current.isConnected).toBe(true);
    expect(result.current.connectionStatus).toBe('connected');
  });

  it('cleans up on unmount', () => {
    const { unmount } = renderHook(() => useSSE());
    const instance = MockEventSource.instances[0];

    unmount();

    expect(instance.close).toHaveBeenCalled();
  });

  it('does not reconnect after unmount', () => {
    const { unmount } = renderHook(() => useSSE());

    act(() => {
      MockEventSource.instances[0].triggerError();
    });

    unmount();

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    // Should still only have 1 instance (no reconnection after unmount)
    expect(MockEventSource.instances.length).toBe(1);
  });

  it('updates lastEvent on each received event', () => {
    const { result } = renderHook(() => useSSE());

    act(() => {
      MockEventSource.instances[0].triggerOpen();
    });

    act(() => {
      MockEventSource.instances[0].dispatchEvent('file:changed', { path: 'a.md' });
    });
    expect(result.current.lastEvent?.type).toBe('file:changed');

    act(() => {
      MockEventSource.instances[0].dispatchEvent('tree:updated', {});
    });
    expect(result.current.lastEvent?.type).toBe('tree:updated');
  });
});
