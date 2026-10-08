import "server-only";
import fs from "fs";
import path from "path";
import { DatabaseSync } from "node:sqlite";

const globalForDb = globalThis as unknown as { __betweenDb?: DatabaseSync };

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 4000;
PRAGMA synchronous = NORMAL;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL COLLATE NOCASE UNIQUE,
  password_hash TEXT NOT NULL,
  recovery_hash TEXT NOT NULL,
  display_name TEXT NOT NULL,
  color TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS spaces (
  id TEXT PRIMARY KEY,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS space_members (
  space_id TEXT NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at INTEGER NOT NULL,
  PRIMARY KEY (space_id, user_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS space_members_one_space ON space_members(user_id);

CREATE TABLE IF NOT EXISTS invitations (
  id TEXT PRIMARY KEY,
  space_id TEXT NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  code TEXT NOT NULL UNIQUE,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  expires_at INTEGER NOT NULL,
  used_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  used_at INTEGER,
  revoked_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS invitations_space ON invitations(space_id);

CREATE TABLE IF NOT EXISTS media (
  id TEXT PRIMARY KEY,
  space_id TEXT NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  uploader_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  kind TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  storage_name TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS media_space ON media(space_id);

CREATE TABLE IF NOT EXISTS moments (
  id TEXT PRIMARY KEY,
  space_id TEXT NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  author_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  author_name TEXT NOT NULL,
  kind TEXT NOT NULL,
  body TEXT,
  media_id TEXT REFERENCES media(id) ON DELETE SET NULL,
  link_url TEXT,
  link_title TEXT,
  detail TEXT,
  duration_ms INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS moments_space_time ON moments(space_id, created_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS signals (
  id TEXT PRIMARY KEY,
  space_id TEXT NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  author_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  author_name TEXT NOT NULL,
  preset TEXT NOT NULL,
  emoji TEXT NOT NULL,
  label TEXT NOT NULL,
  note TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS signals_space_time ON signals(space_id, created_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS reactions (
  id TEXT PRIMARY KEY,
  space_id TEXT NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  emoji TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE (user_id, target_type, target_id)
);
CREATE INDEX IF NOT EXISTS reactions_target ON reactions(space_id, target_type, target_id);

CREATE TABLE IF NOT EXISTS questions (
  id TEXT PRIMARY KEY,
  space_id TEXT NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  author_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  author_name TEXT NOT NULL,
  prompt TEXT NOT NULL,
  category TEXT NOT NULL,
  source TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS questions_space_time ON questions(space_id, created_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS answers (
  id TEXT PRIMARY KEY,
  question_id TEXT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  space_id TEXT NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (question_id, user_id)
);
CREATE INDEX IF NOT EXISTS answers_question ON answers(question_id);

CREATE TABLE IF NOT EXISTS memories (
  id TEXT PRIMARY KEY,
  space_id TEXT NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  author_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  author_name TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  kind TEXT NOT NULL,
  occurred_on TEXT,
  media_id TEXT REFERENCES media(id) ON DELETE SET NULL,
  link_url TEXT,
  link_title TEXT,
  place TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS memories_space_time ON memories(space_id, created_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS presence (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  space_id TEXT NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  space_id TEXT NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  target_path TEXT,
  read_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS notifications_user_time ON notifications(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS settings (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  notify_signals INTEGER NOT NULL DEFAULT 1,
  notify_moments INTEGER NOT NULL DEFAULT 1,
  notify_questions INTEGER NOT NULL DEFAULT 1,
  notify_memories INTEGER NOT NULL DEFAULT 1,
  notify_reactions INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS seen_marks (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  seen_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, target_type, target_id)
);

CREATE TABLE IF NOT EXISTS idempotency_keys (
  key TEXT NOT NULL,
  user_id TEXT NOT NULL,
  method TEXT NOT NULL,
  path TEXT NOT NULL,
  status INTEGER NOT NULL,
  response TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (key, user_id)
);

CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL
);
`;

const TRIGGER = `
CREATE TRIGGER IF NOT EXISTS space_member_limit
BEFORE INSERT ON space_members
FOR EACH ROW
WHEN (SELECT COUNT(*) FROM space_members WHERE space_id = NEW.space_id) >= 2
BEGIN
  SELECT RAISE(ABORT, 'space_full');
END;
`;

export function dataDir() {
  return path.join(process.cwd(), "data");
}

export function uploadsDir() {
  return path.join(dataDir(), "uploads");
}

export function getDb() {
  if (!globalForDb.__betweenDb) {
    fs.mkdirSync(uploadsDir(), { recursive: true });
    const db = new DatabaseSync(path.join(dataDir(), "between.db"));
    db.exec(SCHEMA);
    db.exec(TRIGGER);
    housekeeping(db);
    globalForDb.__betweenDb = db;
  }
  return globalForDb.__betweenDb;
}

function housekeeping(db: DatabaseSync) {
  const now = Date.now();
  db.prepare("DELETE FROM sessions WHERE expires_at < ?").run(now);
  db.prepare("DELETE FROM idempotency_keys WHERE created_at < ? OR (status = 0 AND created_at < ?)").run(
    now - 24 * 3_600_000,
    now - 2 * 60_000,
  );
  db.prepare("DELETE FROM rate_limits WHERE window_start < ?").run(now - 24 * 3_600_000);
}

export function tx<T>(fn: () => T): T {
  const db = getDb();
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    try {
      db.exec("ROLLBACK");
    } catch {
      /* already closed */
    }
    throw error;
  }
}

export function one<T>(sql: string, ...params: Array<string | number | bigint | null | Uint8Array>): T | undefined {
  return getDb().prepare(sql).get(...params) as T | undefined;
}

export function many<T>(sql: string, ...params: Array<string | number | bigint | null | Uint8Array>): T[] {
  return getDb().prepare(sql).all(...params) as T[];
}

export function run(sql: string, ...params: Array<string | number | bigint | null | Uint8Array>) {
  return getDb().prepare(sql).run(...params);
}
