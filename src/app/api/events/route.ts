import { getFileWatcher } from '@/server/watcher-singleton';
import { onActivity } from '@/server/activity';

export async function GET() {
  const watcher = getFileWatcher();

  let cleanup: () => void = () => {};

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();

      function send(event: string, data: unknown) {
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          cleanup();
        }
      }

      const unsubWatch = watcher.onEvent((event) => {
        send(event.type, event);
      });

      const unsubActivity = onActivity((busy, label) => {
        send(busy ? 'server:busy' : 'server:idle', { busy, label });
      });

      cleanup = () => {
        unsubWatch();
        unsubActivity();
      };

      send('connected', { status: 'ok' });
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
