import { auth } from "@/src/auth/auth";
import type { Role } from "@/src/auth/permissions";
import { sqlClient } from "@/src/db";
import { getAccessibleChatChannels } from "@/src/db/queries/chat";
import { getViewerContext } from "@/src/db/queries/viewer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session || session.user.status !== "ACTIVE")
    return new Response("Unauthorized", { status: 401 });
  const context = await getViewerContext(session.user.id);
  if (!context.campaign) return new Response("Campaign not found", { status: 404 });
  const channels = await getAccessibleChatChannels({
    campaignId: context.campaign.id,
    role: session.user.role as Role,
    countryId: context.country?.id ?? null,
  });
  const allowedChannelIds = new Set(channels.map((channel) => channel.id));
  const encoder = new TextEncoder();
  let closed = false;
  let unlisten: (() => Promise<void>) | undefined;
  let heartbeat: ReturnType<typeof setInterval> | undefined;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: string, data: string) => {
        if (!closed) controller.enqueue(encoder.encode(`event: ${event}\ndata: ${data}\n\n`));
      };
      send("ready", "connected");
      void sqlClient
        .listen("chat_events", (payload) => {
          try {
            const event = JSON.parse(payload) as { campaignId?: string; channelId?: string };
            if (
              event.campaignId === context.campaign!.id &&
              event.channelId &&
              allowedChannelIds.has(event.channelId)
            ) {
              send("message", payload);
            }
          } catch {
            // Invalid notifications are ignored; messages are always re-read from the database.
          }
        })
        .then((listener) => {
          unlisten = () => listener.unlisten();
        });
      heartbeat = setInterval(() => send("ping", String(Date.now())), 20_000);

      const close = () => {
        if (closed) return;
        closed = true;
        if (heartbeat) clearInterval(heartbeat);
        void unlisten?.();
        controller.close();
      };
      request.signal.addEventListener("abort", close, { once: true });
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
