import { jsonResult, readUser, runRoute } from "@/server/api";
import { loadHome } from "@/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(req: Request) {
  return runRoute(async () => {
    const user = await readUser(req);
    return jsonResult({ status: 200, body: loadHome(user.id) });
  });
}
