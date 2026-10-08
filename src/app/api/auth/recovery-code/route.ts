import { passwordSchema } from "@/lib/validators";
import { z } from "zod";
import { enforceRate, jsonResult, readJson, readUser, runRoute, withIdempotency } from "@/server/api";
import { replaceRecoveryCode } from "@/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ password: passwordSchema });

export function POST(req: Request) {
  return runRoute(async () => {
    const user = await readUser(req, true);
    enforceRate(`recovery:${user.id}`, 5, 3_600_000);
    const result = await withIdempotency(user.id, req, "/api/auth/recovery-code", async () => {
      const input = schema.parse(await readJson(req));
      const body = await replaceRecoveryCode(user.id, input.password);
      return { status: 200, body };
    });
    return jsonResult(result);
  });
}
