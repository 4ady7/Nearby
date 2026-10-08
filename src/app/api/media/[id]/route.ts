import fs from "fs";
import { Readable } from "stream";
import { runRoute } from "@/server/api";
import { mediaPath } from "@/server/files";
import { HttpError, apiError } from "@/server/http";
import { requireUser } from "@/server/session";
import { getMediaForMember } from "@/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return runRoute(async () => {
    const session = await requireUser();
    const { id } = await ctx.params;
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new HttpError(404, "That file isn't available.", "NOT_FOUND");
    const media = getMediaForMember(session.user.id, id);
    const filePath = mediaPath(media.storage_name);
    let stat: fs.Stats;
    try {
      stat = fs.statSync(filePath);
    } catch {
      return apiError(new HttpError(404, "That file isn't available.", "NOT_FOUND"));
    }
    const range = req.headers.get("range");
    const headers = new Headers({
      "Content-Type": media.mime,
      "Accept-Ranges": "bytes",
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": "inline",
    });
    if (range) {
      const match = /^bytes=(\d+)-(\d*)$/.exec(range);
      if (!match) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${stat.size}` } });
      const start = Number(match[1]);
      const requestedEnd = match[2] ? Number(match[2]) : stat.size - 1;
      const end = Math.min(requestedEnd, start + 1_048_575, stat.size - 1);
      if (!Number.isFinite(start) || start >= stat.size || end < start) {
        return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${stat.size}` } });
      }
      headers.set("Content-Length", String(end - start + 1));
      headers.set("Content-Range", `bytes ${start}-${end}/${stat.size}`);
      return new Response(Readable.toWeb(fs.createReadStream(filePath, { start, end })) as ReadableStream, {
        status: 206,
        headers,
      });
    }
    headers.set("Content-Length", String(stat.size));
    return new Response(Readable.toWeb(fs.createReadStream(filePath)) as ReadableStream, { status: 200, headers });
  });
}
