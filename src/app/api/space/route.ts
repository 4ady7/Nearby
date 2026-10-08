import { joinSchema } from "@/lib/validators";
import { enforceRate, jsonResult, readJson, readUser, runRoute, withIdempotency } from "@/server/api";
import { createSpace, getSpaceContext, leaveSpace } from "@/server/store";
import { HttpError } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function POST(req: Request) {
  return runRoute(async () => {
    const user = await readUser(req, true);
    enforceRate(`space:${user.id}`, 10, 3_600_000);
    const result = await withIdempotency(user.id, req, "/api/space", async () => {
      const space = createSpace(user.id);
      return { status: 201, body: space };
    });
    return jsonResult(result);
  });
}

export function DELETE(req: Request) {
  return runRoute(async () => {
    const user = await readUser(req, true);
    enforceRate(`leave:${user.id}`, 8, 3_600_000);
    const body = (await readJson(req)) as { confirm?: string };
    const ctx = getSpaceContext(user.id);
    if (!ctx) throw new HttpError(404, "You're not in a space.", "NOT_FOUND");
    const expected = ctx.partner ? "LEAVE" : "CLOSE";
    if (body.confirm !== expected) {
      throw new HttpError(400, expected === "CLOSE" ? "Type CLOSE to close this space." : "Type LEAVE to leave this space.", "VALIDATION");
    }
    const result = leaveSpace(user.id);
    return jsonResult({ status: 200, body: result });
  });
}
