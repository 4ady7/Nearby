import { jsonResult, runRoute } from "@/server/api";
import { assertSameOrigin } from "@/server/http";
import { signOut } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function POST(req: Request) {
  return runRoute(async () => {
    assertSameOrigin(req);
    await signOut();
    return jsonResult({ status: 200, body: { ok: true } });
  });
}
