import { reactionSchema } from "@/lib/validators";
import { enforceRate, jsonResult, readJson, readUser, runRoute, withIdempotency } from "@/server/api";
import { setReaction } from "@/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function POST(req: Request) {
  return runRoute(async () => {
    const user = await readUser(req, true);
    enforceRate(`reaction:${user.id}`, 120, 3_600_000);
    const result = await withIdempotency(user.id, req, "/api/reactions", async () => {
      const input = reactionSchema.parse(await readJson(req));
      return { status: 200, body: setReaction(user.id, input.targetType, input.targetId, input.emoji) };
    });
    return jsonResult(result);
  });
}
