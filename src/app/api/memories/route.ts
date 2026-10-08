import { memorySchema } from "@/lib/validators";
import { cursorFrom, enforceRate, jsonResult, readJson, readUser, runRoute, withIdempotency } from "@/server/api";
import { HttpError } from "@/server/http";
import { createMemory, listMemories } from "@/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function textOrNull(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value : null;
}

export function GET(req: Request) {
  return runRoute(async () => {
    const user = await readUser(req);
    return jsonResult({ status: 200, body: listMemories(user.id, cursorFrom(req), 24) });
  });
}

export function POST(req: Request) {
  return runRoute(async () => {
    const user = await readUser(req, true);
    enforceRate(`memory:${user.id}`, 30, 3_600_000);
    const length = Number(req.headers.get("content-length") || 0);
    if (length > 12_000_000) throw new HttpError(413, "That photo is too large.", "TOO_LARGE");
    const result = await withIdempotency(user.id, req, "/api/memories", async () => {
      const type = req.headers.get("content-type") || "";
      if (type.includes("multipart/form-data")) {
        const form = await req.formData();
        const file = form.get("file");
        const input = memorySchema.parse({
          title: textOrNull(form.get("title")) ?? "",
          body: textOrNull(form.get("body")),
          kind: textOrNull(form.get("kind")),
          occurredOn: textOrNull(form.get("occurredOn")),
          linkUrl: textOrNull(form.get("linkUrl")),
          linkTitle: textOrNull(form.get("linkTitle")),
          place: textOrNull(form.get("place")),
        });
        const memory = await createMemory(user.id, { ...input, file: file instanceof File ? file : null });
        return { status: 201, body: memory };
      }
      const input = memorySchema.parse(await readJson(req));
      const memory = await createMemory(user.id, input);
      return { status: 201, body: memory };
    });
    return jsonResult(result);
  });
}
