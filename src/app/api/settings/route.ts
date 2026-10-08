import { settingsSchema } from "@/lib/validators";
import { jsonResult, readJson, readUser, runRoute } from "@/server/api";
import { getSettings, updateSettings } from "@/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(req: Request) {
  return runRoute(async () => {
    const user = await readUser(req);
    return jsonResult({ status: 200, body: { settings: getSettings(user.id) } });
  });
}

export function PATCH(req: Request) {
  return runRoute(async () => {
    const user = await readUser(req, true);
    const input = settingsSchema.parse(await readJson(req));
    return jsonResult({ status: 200, body: { settings: updateSettings(user.id, input) } });
  });
}
