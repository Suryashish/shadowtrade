// Perpl's market-data WebSocket rejects browser origins, so the server holds the socket and
// relays one stream to the browser as Server-Sent Events.
const WS_URL = "wss://testnet.perpl.xyz/ws/v1/market-data";
const STREAM = /^(order-book|trades)@\d{1,4}$|^candles@\d{1,4}\*\d{2,5}$/;
const KEEPALIVE_MS = 15_000;

export async function GET(request: Request) {
  const stream = new URL(request.url).searchParams.get("s") ?? "";
  if (!STREAM.test(stream)) return Response.json({ error: "Unknown stream." }, { status: 404 });

  const encoder = new TextEncoder();
  let ws: WebSocket | null = null;
  let keepalive: ReturnType<typeof setInterval> | null = null;

  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (chunk: string) => {
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          // The client already disconnected; the abort handler cleans up.
        }
      };
      const close = () => {
        if (keepalive) clearInterval(keepalive);
        ws?.close();
        try {
          controller.close();
        } catch {
          // Already closed.
        }
      };

      ws = new WebSocket(WS_URL);
      ws.onopen = () => ws?.send(JSON.stringify({ mt: 5, subs: [{ stream, subscribe: true }] }));
      ws.onmessage = (event) => {
        if (typeof event.data === "string") send(`data: ${event.data}\n\n`);
      };
      // Ending the response lets EventSource reconnect on its own schedule.
      ws.onclose = close;
      ws.onerror = close;
      keepalive = setInterval(() => send(": keepalive\n\n"), KEEPALIVE_MS);
      request.signal.addEventListener("abort", close);
    },
    cancel() {
      if (keepalive) clearInterval(keepalive);
      ws?.close();
    },
  });

  return new Response(body, {
    headers: { "content-type": "text/event-stream", "cache-control": "no-cache, no-transform", connection: "keep-alive" },
  });
}
