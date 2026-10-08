import { recoverSchema } from "@/lib/validators";
import { clientKey, enforceRate, jsonResult, readJson, runRoute } from "@/server/api";
import { assertSameOrigin } from "@/server/http";
import { recoverAccount } from "@/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function POST(req: Request) {
  return runRoute(async () => {
    assertSameOrigin(req);
    enforceRate(`recover:${clientKey(req)}`, 5, 15 * 60_000);
    const input = recoverSchema.parse(await readJson(req));
    await recoverAccount(input.email, input.code, input.password);
    return jsonResult({ status: 200, body: { ok: true } });
  });
}
