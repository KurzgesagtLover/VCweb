import { auth } from "@/src/auth/auth";
import { sqlClient } from "@/src/db";
import { getViewerContext } from "@/src/db/queries/viewer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session || session.user.status !== "ACTIVE")
    return new Response("Unauthorized", { status: 401 });
  const context = await getViewerContext(session.user.id);
  if (!context.campaign) return new Response("Campaign not found", { status: 404 });
  const encoder = new TextEncoder();
  let closed = false;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let unlisten: (() => Promise<void>) | undefined;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: string, data: string) => {
        if (!closed) controller.enqueue(encoder.encode(`event: ${event}\ndata: ${data}\n\n`));
      };
      send("ready", "connected");
      void sqlClient
        .listen("notification_events", (payload) => {
          try {
            const event = JSON.parse(payload) as { campaignId?: string };
            if (event.campaignId === context.campaign!.id) send("notification", payload);
          } catch {
            // Invalid notifications are ignored; notification records are re-read from PostgreSQL.
          }
        })
        .then((listener) => {
          unlisten = () => listener.unlisten();
        });
      heartbeat = setInterval(() => send("ping", String(Date.now())), 20_000);
      request.signal.addEventListener(
        "abort",
        () => {
          if (closed) return;
          closed = true;
          if (heartbeat) clearInterval(heartbeat);
          void unlisten?.();
          controller.close();
        },
        { once: true },
      );
    },
    cancel() {
      closed = true;
      if (heartbeat) clearInterval(heartbeat);
      void unlisten?.();
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
