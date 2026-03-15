import { getFileWatcher } from '@/server/watcher-singleton';

export async function GET() {
  const watcher = getFileWatcher();

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();

      watcher.onEvent((event) => {
        const sseMessage = `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
        try {
          controller.enqueue(encoder.encode(sseMessage));
        } catch {}
      });

      const heartbeat = `event: connected\ndata: {"status":"ok"}\n\n`;
      controller.enqueue(encoder.encode(heartbeat));
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
