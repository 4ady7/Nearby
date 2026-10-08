import { joinSchema } from "@/lib/validators";
import { enforceRate, jsonResult, readJson, readUser, runRoute, withIdempotency } from "@/server/api";
import { joinSpace } from "@/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function POST(req: Request) {
  return runRoute(async () => {
    const user = await readUser(req, true);
    enforceRate(`join:${user.id}`, 10, 15 * 60_000);
    const result = await withIdempotency(user.id, req, "/api/space/join", async () => {
      const input = joinSchema.parse(await readJson(req));
      return { status: 200, body: joinSpace(user.id, input.code) };
    });
    return jsonResult(result);
  });
}
