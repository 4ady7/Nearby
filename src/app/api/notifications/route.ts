import { jsonResult, readUser, runRoute } from "@/server/api";
import { listNotices, markNoticesRead } from "@/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(req: Request) {
  return runRoute(async () => {
    const user = await readUser(req);
    return jsonResult({ status: 200, body: listNotices(user.id) });
  });
}

export function POST(req: Request) {
  return runRoute(async () => {
    const user = await readUser(req, true);
    return jsonResult({ status: 200, body: markNoticesRead(user.id) });
  });
}
