import { passwordChangeSchema } from "@/lib/validators";
import { enforceRate, jsonResult, readJson, readUser, runRoute } from "@/server/api";
import { changePassword } from "@/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function POST(req: Request) {
  return runRoute(async () => {
    const user = await readUser(req, true);
    enforceRate(`password:${user.id}`, 8, 3_600_000);
    const input = passwordChangeSchema.parse(await readJson(req));
    await changePassword(user.id, input.currentPassword, input.nextPassword);
    return jsonResult({ status: 200, body: { ok: true } });
  });
}
