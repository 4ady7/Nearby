import { signInSchema } from "@/lib/validators";
import { clientKey, enforceRate, jsonResult, readJson, runRoute } from "@/server/api";
import { assertSameOrigin } from "@/server/http";
import { signIn } from "@/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function POST(req: Request) {
  return runRoute(async () => {
    assertSameOrigin(req);
    const input = signInSchema.parse(await readJson(req));
    enforceRate(`signin:${clientKey(req)}:${input.email}`, 8, 15 * 60_000);
    const user = await signIn(input.email, input.password);
    return jsonResult({ status: 200, body: { user } });
  });
}
