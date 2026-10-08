import { recoverSchema } from "@/lib/validators";
import { enforceRate, jsonResult, readJson, runRoute } from "@/server/api";
import { assertSameOrigin } from "@/server/http";
import { recoverAccount } from "@/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function POST(req: Request) {
  return runRoute(async () => {
    assertSameOrigin(req);
    const input = recoverSchema.parse(await readJson(req));
    enforceRate(`recover:${input.email}`, 5, 15 * 60_000);
    enforceRate("recover:all", 40, 15 * 60_000);
    await recoverAccount(input.email, input.code, input.password);
    return jsonResult({ status: 200, body: { ok: true } });
  });
}
