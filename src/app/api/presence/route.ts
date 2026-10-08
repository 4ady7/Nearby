import { presenceSchema } from "@/lib/validators";
import { enforceRate, jsonResult, readJson, readUser, runRoute } from "@/server/api";
import { clearPresence, setPresence } from "@/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function PUT(req: Request) {
  return runRoute(async () => {
    const user = await readUser(req, true);
    enforceRate(`presence:${user.id}`, 60, 3_600_000);
    const input = presenceSchema.parse(await readJson(req));
    return jsonResult({ status: 200, body: setPresence(user.id, input.status) });
  });
}

export function DELETE(req: Request) {
  return runRoute(async () => {
    const user = await readUser(req, true);
    enforceRate(`presence:${user.id}`, 60, 3_600_000);
    return jsonResult({ status: 200, body: clearPresence(user.id) });
  });
}
