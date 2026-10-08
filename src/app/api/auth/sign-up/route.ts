import { signUpSchema } from "@/lib/validators";
import { clientKey, enforceRate, jsonResult, readJson, runRoute } from "@/server/api";
import { assertSameOrigin } from "@/server/http";
import { signUp } from "@/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function POST(req: Request) {
  return runRoute(async () => {
    assertSameOrigin(req);
    enforceRate(`signup:${clientKey(req)}`, 15, 3_600_000);
    const input = signUpSchema.parse(await readJson(req));
    const result = await signUp(input);
    return jsonResult({ status: 201, body: result });
  });
}
