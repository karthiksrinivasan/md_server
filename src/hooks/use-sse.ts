'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

export type SSEEventType = 'file:changed' | 'file:added' | 'file:removed' | 'tree:updated' | 'asset:changed';

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

export interface SSEEvent {
  type: SSEEventType;
  path?: string;
  data?: unknown;
}

export interface ServerActivity {
  busy: boolean;
  label: string;
}

export type SSEEventCallback = (event: SSEEvent) => void;
export type ActivityCallback = (activity: ServerActivity) => void;

interface UseSSEOptions {
  onFileChanged?: SSEEventCallback;
  onFileAdded?: SSEEventCallback;
  onFileRemoved?: SSEEventCallback;
  onTreeUpdated?: SSEEventCallback;
  onAssetChanged?: SSEEventCallback;
  onActivity?: ActivityCallback;
}

interface UseSSEReturn {
  connectionStatus: ConnectionStatus;
  lastEvent: SSEEvent | null;
  isConnected: boolean;
  serverBusy: boolean;
  serverBusyLabel: string;
}

const INITIAL_DELAY = 1000;
const MAX_DELAY = 5000;

export function useSSE(options: UseSSEOptions = {}): UseSSEReturn {
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('connecting');
  const [lastEvent, setLastEvent] = useState<SSEEvent | null>(null);
  const [serverBusy, setServerBusy] = useState(false);
  const [serverBusyLabel, setServerBusyLabel] = useState('');
  const optionsRef = useRef(options);
  const retryDelayRef = useRef(INITIAL_DELAY);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const esRef = useRef<EventSource | null>(null);
  const unmountedRef = useRef(false);

  // Keep options ref up to date without re-running the effect
  optionsRef.current = options;

  const connect = useCallback(() => {
    if (unmountedRef.current) return;

    setConnectionStatus('connecting');

    const es = new EventSource('/api/events');
    esRef.current = es;

    es.onopen = () => {
      if (unmountedRef.current) return;
      setConnectionStatus('connected');
      retryDelayRef.current = INITIAL_DELAY;
    };

    const makeHandler = (type: SSEEventType) => (e: MessageEvent) => {
      if (unmountedRef.current) return;
      let data: unknown;
      try {
        data = JSON.parse(e.data);
      } catch {
        data = e.data;
      }
      const event: SSEEvent = { type, ...(typeof data === 'object' && data !== null ? data as object : { data }) };
      setLastEvent(event);

      const opts = optionsRef.current;
      if (type === 'file:changed') opts.onFileChanged?.(event);
      if (type === 'file:added') opts.onFileAdded?.(event);
      if (type === 'file:removed') opts.onFileRemoved?.(event);
      if (type === 'tree:updated') opts.onTreeUpdated?.(event);
      if (type === 'asset:changed') opts.onAssetChanged?.(event);
    };

    es.addEventListener('file:changed', makeHandler('file:changed'));
    es.addEventListener('file:added', makeHandler('file:added'));
    es.addEventListener('file:removed', makeHandler('file:removed'));
    es.addEventListener('tree:updated', makeHandler('tree:updated'));
    es.addEventListener('asset:changed', makeHandler('asset:changed'));

    // Activity events
    const handleBusy = (e: MessageEvent) => {
      if (unmountedRef.current) return;
      try {
        const data = JSON.parse(e.data) as { busy: boolean; label: string };
        setServerBusy(data.busy);
        setServerBusyLabel(data.label);
        optionsRef.current.onActivity?.(data);
      } catch {}
    };
    es.addEventListener('server:busy', handleBusy);
    es.addEventListener('server:idle', handleBusy);

    es.onerror = () => {
      if (unmountedRef.current) return;
      es.close();
      esRef.current = null;
      setConnectionStatus('disconnected');

      const delay = retryDelayRef.current;
      retryDelayRef.current = Math.min(delay * 2, MAX_DELAY);

      retryTimerRef.current = setTimeout(() => {
        if (!unmountedRef.current) {
          connect();
        }
      }, delay);
    };
  }, []);

  useEffect(() => {
    unmountedRef.current = false;
    connect();

    return () => {
      unmountedRef.current = true;
      if (retryTimerRef.current !== null) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
      if (esRef.current) {
        esRef.current.close();
        esRef.current = null;
      }
    };
  }, [connect]);

  return {
    connectionStatus,
    lastEvent,
    isConnected: connectionStatus === 'connected',
    serverBusy,
    serverBusyLabel,
  };
}
