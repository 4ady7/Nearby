import "server-only";
import type { Cursor } from "@/lib/types";
import { apiError, assertSameOrigin, clientKey, enforceRate, jsonResult, readJson, withIdempotency } from "./http";
import { requireUser } from "./session";

export function cursorFrom(req: Request): Cursor | null {
  const url = new URL(req.url);
  const createdAt = Number(url.searchParams.get("before") || "");
  const id = url.searchParams.get("beforeId") || "";
  if (!Number.isFinite(createdAt) || createdAt <= 0 || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  return { createdAt, id };
}

export async function readUser(req: Request, mutation = false) {
  if (mutation) assertSameOrigin(req);
  return (await requireUser()).user;
}

export function runRoute(fn: () => Promise<Response> | Response) {
  return Promise.resolve()
    .then(fn)
    .catch((error: unknown) => apiError(error));
}

export { clientKey, enforceRate, jsonResult, readJson, withIdempotency };

export const node = {
  runtime: "nodejs",
  dynamic: "force-dynamic",
} as const;
