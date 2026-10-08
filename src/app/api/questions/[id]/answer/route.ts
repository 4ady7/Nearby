import { answerSchema } from "@/lib/validators";
import { enforceRate, jsonResult, readJson, readUser, runRoute, withIdempotency } from "@/server/api";
import { answerQuestion } from "@/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return runRoute(async () => {
    const user = await readUser(req, true);
    enforceRate(`answer:${user.id}`, 40, 3_600_000);
    const { id } = await ctx.params;
    const result = await withIdempotency(user.id, req, `/api/questions/${id}/answer`, async () => {
      const input = answerSchema.parse(await readJson(req));
      return { status: 200, body: answerQuestion(user.id, id, input.body) };
    });
    return jsonResult(result);
  });
}
