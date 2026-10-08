import { signalSchema } from "@/lib/validators";
import { enforceRate, jsonResult, readJson, readUser, runRoute, withIdempotency } from "@/server/api";
import { sendSignal } from "@/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function POST(req: Request) {
  return runRoute(async () => {
    const user = await readUser(req, true);
    enforceRate(`signal:${user.id}`, 40, 3_600_000);
    const result = await withIdempotency(user.id, req, "/api/signals", async () => {
      const input = signalSchema.parse(await readJson(req));
      const signal = sendSignal(user.id, input.preset, input.note);
      return { status: signal.created ? 201 : 200, body: signal };
    });
    return jsonResult(result);
  });
}
