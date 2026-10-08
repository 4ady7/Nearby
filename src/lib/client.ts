export class ApiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function parse(text: string): { error?: { message?: string; code?: string } } | null {
  try {
    return JSON.parse(text) as { error?: { message?: string; code?: string } };
  } catch {
    return null;
  }
}

export async function api<T>(
  path: string,
  init: RequestInit & { json?: unknown; idempotencyKey?: string } = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  let body = init.body;
  if (init.json !== undefined) {
    headers.set("content-type", "application/json");
    body = JSON.stringify(init.json);
  }
  if (init.idempotencyKey) headers.set("idempotency-key", init.idempotencyKey);

  let response: Response;
  try {
    response = await fetch(path, { ...init, headers, body });
  } catch {
    throw new ApiError("You seem to be offline. Nothing was lost.", 0, "OFFLINE");
  }

  const text = await response.text();
  const data = text ? parse(text) : null;
  if (response.status === 401 && !path.startsWith("/api/auth")) {
    window.location.assign("/sign-in?expired=1");
    throw new ApiError("Please sign in again.", 401, "UNAUTHORIZED");
  }
  if (!response.ok) {
    throw new ApiError(data?.error?.message || "Something went wrong. Try again.", response.status, data?.error?.code);
  }
  return (data ?? {}) as T;
}

export function newKey() {
  return crypto.randomUUID();
}

export function useStableKey() {
  return { current: null as string | null };
}
