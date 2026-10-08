import { HttpError } from "@/server/http";
import { subscribe } from "@/server/realtime";
import { requireUser } from "@/server/session";
import { getSpaceContext } from "@/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  let session: Awaited<ReturnType<typeof requireUser>>;
  try {
    session = await requireUser();
  } catch (error) {
    if (error instanceof HttpError && error.status === 401) return new Response("Sign in again.", { status: 401 });
    throw error;
  }
  const ctx = getSpaceContext(session.user.id);
  if (!ctx) return new Response("Open a space first.", { status: 409 });

  const encoder = new TextEncoder();
  let close = () => {};
  const stream = new ReadableStream({
    start(controller) {
      const send = (chunk: string) => {
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          /* closed */
        }
      };
      send(": ready\n\n");
      const unsubscribe = subscribe(ctx.spaceId, (event) => {
        send(`data: ${JSON.stringify(event)}\n\n`);
      });
      const ping = setInterval(() => send(": ping\n\n"), 25_000);
      close = () => {
        clearInterval(ping);
        unsubscribe();
        try {
          controller.close();
        } catch {
          /* closed */
        }
      };
    },
    cancel() {
      close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
