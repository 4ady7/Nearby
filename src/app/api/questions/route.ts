import { questionSchema } from "@/lib/validators";
import { cursorFrom, enforceRate, jsonResult, readJson, readUser, runRoute, withIdempotency } from "@/server/api";
import { askQuestion, listQuestions } from "@/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(req: Request) {
  return runRoute(async () => {
    const user = await readUser(req);
    return jsonResult({ status: 200, body: listQuestions(user.id, cursorFrom(req), 20) });
  });
}

export function POST(req: Request) {
  return runRoute(async () => {
    const user = await readUser(req, true);
    enforceRate(`question:${user.id}`, 20, 3_600_000);
    const result = await withIdempotency(user.id, req, "/api/questions", async () => {
      const input = questionSchema.parse(await readJson(req));
      const question = askQuestion(user.id, input);
      return { status: question.created ? 201 : 200, body: question };
    });
    return jsonResult(result);
  });
}
