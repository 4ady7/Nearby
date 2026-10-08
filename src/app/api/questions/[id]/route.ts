import { jsonResult, readUser, runRoute } from "@/server/api";
import { removeQuestion } from "@/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return runRoute(async () => {
    const user = await readUser(req, true);
    const { id } = await ctx.params;
    removeQuestion(user.id, id);
    return jsonResult({ status: 200, body: { ok: true } });
  });
}
