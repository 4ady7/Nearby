import { enforceRate, jsonResult, readUser, runRoute, withIdempotency } from "@/server/api";
import { refreshInvite } from "@/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function POST(req: Request) {
  return runRoute(async () => {
    const user = await readUser(req, true);
    enforceRate(`invite:${user.id}`, 10, 3_600_000);
    const result = await withIdempotency(user.id, req, "/api/space/invite", async () => {
      return { status: 200, body: refreshInvite(user.id) };
    });
    return jsonResult(result);
  });
}
