import "server-only";
import { cookies } from "next/headers";
import { SESSION_COOKIE, SESSION_DAYS } from "@/lib/constants";
import { one, run } from "./db";
import { newToken, sha256 } from "./crypto";
import { HttpError } from "./http";

export type SessionUser = {
  id: string;
  email: string;
  displayName: string;
  color: string;
};

type SessionRow = {
  session_id: string;
  expires_at: number;
  id: string;
  email: string;
  display_name: string;
  color: string;
};

function mapUser(row: SessionRow): SessionUser {
  return { id: row.id, email: row.email, displayName: row.display_name, color: row.color };
}

export async function getSession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const row = one<SessionRow>(
    `SELECT s.id AS session_id, s.expires_at, u.id, u.email, u.display_name, u.color
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ?`,
    sha256(token),
  );
  if (!row) return null;
  if (row.expires_at < Date.now()) {
    run("DELETE FROM sessions WHERE id = ?", row.session_id);
    return null;
  }
  return { user: mapUser(row), sessionId: row.session_id };
}

export async function requireUser() {
  const session = await getSession();
  if (!session) throw new HttpError(401, "Please sign in again.", "UNAUTHORIZED");
  return session;
}

const cookieBase = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
};

export async function createSession(userId: string) {
  const token = newToken();
  const now = Date.now();
  run(
    "INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)",
    crypto.randomUUID(),
    userId,
    sha256(token),
    now + SESSION_DAYS * 86_400_000,
    now,
  );
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, { ...cookieBase, maxAge: SESSION_DAYS * 24 * 60 * 60 });
}

export async function clearSessionCookie() {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, "", { ...cookieBase, maxAge: 0 });
}

export async function signOut() {
  const session = await getSession();
  if (session) run("DELETE FROM sessions WHERE id = ?", session.sessionId);
  await clearSessionCookie();
}
