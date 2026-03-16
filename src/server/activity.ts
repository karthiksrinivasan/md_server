/**
 * Lightweight server-side activity tracker.
 * Broadcasts "server:busy" / "server:idle" events via registered SSE callbacks
 * so the frontend can show an indicator while background work is in progress.
 */

type ActivityCallback = (busy: boolean, label: string) => void;

const listeners: ActivityCallback[] = [];
let activeCount = 0;
const activeLabels = new Map<number, string>();
let nextId = 0;

export function onActivity(cb: ActivityCallback): () => void {
  listeners.push(cb);
  return () => {
    const idx = listeners.indexOf(cb);
    if (idx !== -1) listeners.splice(idx, 1);
  };
}

function broadcast(busy: boolean, label: string) {
  for (const cb of listeners) cb(busy, label);
}

/**
 * Call when a background task starts. Returns a `done()` function to call when it finishes.
 */
export function trackActivity(label: string): () => void {
  const id = nextId++;
  activeCount++;
  activeLabels.set(id, label);
  broadcast(true, label);
  let called = false;
  return () => {
    if (called) return;
    called = true;
    activeCount--;
    activeLabels.delete(id);
    if (activeCount <= 0) {
      activeCount = 0;
      broadcast(false, '');
    } else {
      // Show the most recently added label among remaining active tasks
      const remaining = [...activeLabels.values()];
      broadcast(true, remaining[remaining.length - 1]);
    }
  };
}
