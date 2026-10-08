import { confirmSchema, profileSchema } from "@/lib/validators";
import { enforceRate, jsonResult, readJson, readUser, runRoute } from "@/server/api";
import { HttpError } from "@/server/http";
import { clearSessionCookie } from "@/server/session";
import { deleteAccount, publicMe, updateProfile } from "@/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(req: Request) {
  return runRoute(async () => {
    const user = await readUser(req);
    return jsonResult({ status: 200, body: { user: publicMe(user.id) } });
  });
}

export function PATCH(req: Request) {
  return runRoute(async () => {
    const user = await readUser(req, true);
    enforceRate(`profile:${user.id}`, 30, 3_600_000);
    const input = profileSchema.parse(await readJson(req));
    return jsonResult({ status: 200, body: { user: updateProfile(user.id, input.displayName, input.color) } });
  });
}

export function DELETE(req: Request) {
  return runRoute(async () => {
    const user = await readUser(req, true);
    enforceRate(`delete:${user.id}`, 5, 3_600_000);
    const input = confirmSchema.parse(await readJson(req));
    if (input.confirm !== "DELETE" || !input.password) {
      throw new HttpError(400, "Type DELETE and enter your password.", "VALIDATION");
    }
    await deleteAccount(user.id, input.password);
    await clearSessionCookie();
    return jsonResult({ status: 200, body: { ok: true } });
  });
}
