import { passwordChangeSchema } from "@/lib/validators";
import { enforceRate, jsonResult, readJson, runRoute } from "@/server/api";
import { assertSameOrigin } from "@/server/http";
import { requireUser } from "@/server/session";
import { changePassword } from "@/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function POST(req: Request) {
  return runRoute(async () => {
    assertSameOrigin(req);
    const session = await requireUser();
    enforceRate(`password:${session.user.id}`, 8, 3_600_000);
    const input = passwordChangeSchema.parse(await readJson(req));
    await changePassword(session.user.id, session.sessionId, input.currentPassword, input.nextPassword);
    return jsonResult({ status: 200, body: { ok: true } });
  });
}
