// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { useKeyboardShortcuts } from '../use-keyboard-shortcuts';

function fireKey(key: string, opts: Partial<KeyboardEventInit> = {}) {
  window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...opts }));
}

function makeActions() {
  return { onToggleSearch: vi.fn(), onToggleFileTree: vi.fn(), onToggleOutline: vi.fn(), onEscape: vi.fn() };
}

describe('useKeyboardShortcuts', () => {
  it('calls onToggleSearch on Cmd+K', () => {
    const actions = makeActions();
    renderHook(() => useKeyboardShortcuts(actions));
    fireKey('k', { metaKey: true });
    expect(actions.onToggleSearch).toHaveBeenCalledTimes(1);
  });

  it('calls onToggleSearch on Ctrl+K', () => {
    const actions = makeActions();
    renderHook(() => useKeyboardShortcuts(actions));
    fireKey('k', { ctrlKey: true });
    expect(actions.onToggleSearch).toHaveBeenCalledTimes(1);
  });

  it('calls onToggleFileTree on Cmd+B', () => {
    const actions = makeActions();
    renderHook(() => useKeyboardShortcuts(actions));
    fireKey('b', { metaKey: true });
    expect(actions.onToggleFileTree).toHaveBeenCalledTimes(1);
  });

  it('calls onToggleFileTree on Ctrl+B', () => {
    const actions = makeActions();
    renderHook(() => useKeyboardShortcuts(actions));
    fireKey('b', { ctrlKey: true });
    expect(actions.onToggleFileTree).toHaveBeenCalledTimes(1);
  });

  it('calls onToggleOutline on Cmd+Shift+O', () => {
    const actions = makeActions();
    renderHook(() => useKeyboardShortcuts(actions));
    fireKey('O', { metaKey: true, shiftKey: true });
    expect(actions.onToggleOutline).toHaveBeenCalledTimes(1);
  });

  it('calls onEscape on Escape key', () => {
    const actions = makeActions();
    renderHook(() => useKeyboardShortcuts(actions));
    fireKey('Escape');
    expect(actions.onEscape).toHaveBeenCalledTimes(1);
  });

  it('does not fire shortcuts without modifier keys', () => {
    const actions = makeActions();
    renderHook(() => useKeyboardShortcuts(actions));
    fireKey('k');
    fireKey('b');
    expect(actions.onToggleSearch).not.toHaveBeenCalled();
    expect(actions.onToggleFileTree).not.toHaveBeenCalled();
  });

  it('cleans up listener on unmount', () => {
    const actions = makeActions();
    const { unmount } = renderHook(() => useKeyboardShortcuts(actions));
    unmount();
    fireKey('k', { metaKey: true });
    expect(actions.onToggleSearch).not.toHaveBeenCalled();
  });
});
