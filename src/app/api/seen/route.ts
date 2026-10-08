import { seenSchema } from "@/lib/validators";
import { enforceRate, jsonResult, readJson, readUser, runRoute } from "@/server/api";
import { markSeen } from "@/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function POST(req: Request) {
  return runRoute(async () => {
    const user = await readUser(req, true);
    enforceRate(`seen:${user.id}`, 60, 3_600_000);
    const input = seenSchema.parse(await readJson(req));
    return jsonResult({ status: 200, body: markSeen(user.id, input.items) });
  });
}
