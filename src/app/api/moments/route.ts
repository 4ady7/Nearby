import { momentTextSchema } from "@/lib/validators";
import { cursorFrom, enforceRate, jsonResult, readJson, readUser, runRoute, withIdempotency } from "@/server/api";
import { HttpError } from "@/server/http";
import { createMoment, listMoments } from "@/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function numberOrNull(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || !value) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 70_000) {
    throw new HttpError(400, "That recording is a little long.", "VALIDATION");
  }
  return Math.round(parsed);
}

function textOrNull(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value : null;
}

export function GET(req: Request) {
  return runRoute(async () => {
    const user = await readUser(req);
    return jsonResult({ status: 200, body: listMoments(user.id, cursorFrom(req), 20) });
  });
}

export function POST(req: Request) {
  return runRoute(async () => {
    const user = await readUser(req, true);
    enforceRate(`moment:${user.id}`, 40, 3_600_000);
    const length = Number(req.headers.get("content-length") || 0);
    if (length > 20_000_000) throw new HttpError(413, "That file is too large.", "TOO_LARGE");
    const result = await withIdempotency(user.id, req, "/api/moments", async () => {
      const type = req.headers.get("content-type") || "";
      if (type.includes("multipart/form-data")) {
        const form = await req.formData();
        const file = form.get("file");
        const input = momentTextSchema.parse({
          kind: textOrNull(form.get("kind")),
          body: textOrNull(form.get("body")),
          linkUrl: textOrNull(form.get("linkUrl")),
          linkTitle: textOrNull(form.get("linkTitle")),
          detail: textOrNull(form.get("detail")),
          durationMs: numberOrNull(form.get("durationMs")),
        });
        const moment = await createMoment(user.id, { ...input, durationMs: input.durationMs ?? null, file: file instanceof File ? file : null });
        return { status: moment.created ? 201 : 200, body: moment };
      }
      const input = momentTextSchema.parse(await readJson(req));
      const moment = await createMoment(user.id, { ...input, durationMs: input.durationMs ?? null });
      return { status: moment.created ? 201 : 200, body: moment };
    });
    return jsonResult(result);
  });
}
