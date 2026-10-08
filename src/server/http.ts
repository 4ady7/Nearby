import "server-only";
import { ZodError } from "zod";
import { one, run } from "./db";

export class HttpError extends Error {
  status: number;
  code: string;

  constructor(status: number, message: string, code: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function apiError(error: unknown) {
  if (error instanceof HttpError) {
    return Response.json({ error: { message: error.message, code: error.code } }, { status: error.status });
  }
  if (error instanceof ZodError) {
    return Response.json(
      { error: { message: error.issues[0]?.message ?? "Check that and try again.", code: "VALIDATION" } },
      { status: 400 },
    );
  }
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("space_full")) {
    return Response.json(
      { error: { message: "This space already has two people.", code: "FULL" } },
      { status: 409 },
    );
  }
  console.error(error);
  return Response.json(
    { error: { message: "Something went wrong. Try again.", code: "INTERNAL" } },
    { status: 500 },
  );
}

export function assertSameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  const host = req.headers.get("host");
  if (!origin || !host) throw new HttpError(403, "That request was blocked.", "ORIGIN");
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    throw new HttpError(403, "That request was blocked.", "ORIGIN");
  }
  if (url.host !== host) throw new HttpError(403, "That request was blocked.", "ORIGIN");
}

export async function readJson(req: Request) {
  const length = Number(req.headers.get("content-length") || 0);
  if (length > 80_000) throw new HttpError(413, "That was too large.", "TOO_LARGE");
  const type = (req.headers.get("content-type") || "").toLowerCase();
  if (!type.includes("application/json")) {
    throw new HttpError(415, "That could not be read.", "TYPE");
  }
  try {
    return await req.json();
  } catch {
    throw new HttpError(400, "That could not be read.", "BAD_JSON");
  }
}

export function clientKey(req: Request) {
  const forwarded = req.headers.get("x-forwarded-for");
  const ip = (forwarded ? forwarded.split(",")[0] : req.headers.get("x-real-ip"))?.trim() || "local";
  return ip.slice(0, 80);
}

export function enforceRate(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const row = one<{ window_start: number; count: number }>("SELECT window_start, count FROM rate_limits WHERE key = ?", key);
  if (!row || now - row.window_start >= windowMs) {
    run(
      `INSERT INTO rate_limits (key, window_start, count) VALUES (?, ?, 1)
       ON CONFLICT(key) DO UPDATE SET window_start = excluded.window_start, count = 1`,
      key,
      now,
    );
    return;
  }
  if (row.count >= limit) {
    throw new HttpError(429, "That's happening a little fast. Pause, then try again.", "RATE");
  }
  run("UPDATE rate_limits SET count = count + 1 WHERE key = ?", key);
}

type Idempotent = { status: number; body: unknown };

export async function withIdempotency(userId: string, req: Request, path: string, fn: () => Promise<Idempotent> | Idempotent) {
  const key = req.headers.get("idempotency-key")?.trim() || "";
  if (!key) return fn();
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(key)) {
    throw new HttpError(400, "That request could not be matched. Try again.", "IDEMPOTENCY");
  }
  const inserted = run(
    `INSERT OR IGNORE INTO idempotency_keys (key, user_id, method, path, status, response, created_at)
     VALUES (?, ?, ?, ?, 0, '', ?)`,
    key,
    userId,
    req.method,
    path,
    Date.now(),
  );
  if (inserted.changes === 0) {
    const existing = one<{ status: number; response: string }>(
      "SELECT status, response FROM idempotency_keys WHERE key = ? AND user_id = ?",
      key,
      userId,
    );
    if (!existing || existing.status === 0) {
      throw new HttpError(409, "That's already sending.", "IN_PROGRESS");
    }
    return { status: existing.status, body: JSON.parse(existing.response) as unknown, replay: true };
  }
  try {
    const result = await fn();
    run(
      "UPDATE idempotency_keys SET status = ?, response = ? WHERE key = ? AND user_id = ?",
      result.status,
      JSON.stringify(result.body),
      key,
      userId,
    );
    return result;
  } catch (error) {
    run("DELETE FROM idempotency_keys WHERE key = ? AND user_id = ?", key, userId);
    throw error;
  }
}

export function jsonResult(result: { status: number; body: unknown }) {
  return Response.json(result.body, { status: result.status });
}
