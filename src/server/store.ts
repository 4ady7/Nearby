import "server-only";
import { randomInt } from "crypto";
import { DECK } from "@/lib/deck";
import {
  INVITE_DAYS,
  LIMITS,
  presenceById,
  signalById,
} from "@/lib/constants";
import { formatCode, initial, normalizeCode, presenceFreshness, randomFromAlphabet } from "@/lib/text";
import type {
  Cursor,
  FeedItem,
  HomePayload,
  MeResponse,
  MemoryView,
  MomentView,
  NoticeView,
  Person,
  PresenceView,
  QuestionView,
  ReactionView,
  SettingsView,
  SignalView,
} from "@/lib/types";
import { dummySecretHash, hashSecret, verifySecret } from "./crypto";
import { many, one, run, tx } from "./db";
import { removeFiles, saveUpload } from "./files";
import { HttpError } from "./http";
import { publish } from "./realtime";
import { createSession } from "./session";

type UserRow = {
  id: string;
  email: string;
  password_hash: string;
  recovery_hash: string;
  display_name: string;
  color: string;
  created_at: number;
  updated_at: number;
};

type MemberRow = { id: string; display_name: string; color: string; joined_at: number };

type MomentRow = {
  id: string;
  space_id: string;
  author_id: string | null;
  author_name: string;
  kind: string;
  body: string | null;
  media_id: string | null;
  media_mime: string | null;
  link_url: string | null;
  link_title: string | null;
  detail: string | null;
  duration_ms: number | null;
  created_at: number;
};

type SignalRow = {
  id: string;
  author_id: string | null;
  author_name: string;
  preset: string;
  emoji: string;
  label: string;
  note: string | null;
  created_at: number;
};

type MemoryRow = {
  id: string;
  author_id: string | null;
  author_name: string;
  title: string;
  body: string | null;
  kind: string;
  occurred_on: string | null;
  media_id: string | null;
  link_url: string | null;
  link_title: string | null;
  place: string | null;
  created_at: number;
};

type QuestionRow = {
  id: string;
  author_id: string | null;
  author_name: string;
  prompt: string;
  category: string;
  created_at: number;
};

type AnswerRow = {
  id: string;
  question_id: string;
  user_id: string;
  body: string;
  created_at: number;
  updated_at: number;
};

type SettingsRow = {
  notify_signals: number;
  notify_moments: number;
  notify_questions: number;
  notify_memories: number;
  notify_reactions: number;
};

export type SpaceContext = {
  spaceId: string;
  members: MemberRow[];
  me: MemberRow;
  partner: MemberRow | null;
};

function person(row: { id: string; display_name: string; color: string }): Person {
  return { id: row.id, displayName: row.display_name, color: row.color, initial: initial(row.display_name) };
}

function authorBits(authorId: string | null, snapshot: string, members: MemberRow[], meId: string) {
  const member = authorId ? members.find((m) => m.id === authorId) : undefined;
  return {
    authorId,
    authorName: member?.display_name ?? snapshot,
    authorColor: member?.color ?? "clay",
    mine: authorId === meId,
  };
}

export function getSpaceContext(userId: string): SpaceContext | null {
  const membership = one<{ space_id: string }>("SELECT space_id FROM space_members WHERE user_id = ?", userId);
  if (!membership) return null;
  const members = many<MemberRow>(
    `SELECT u.id, u.display_name, u.color, m.joined_at
     FROM space_members m JOIN users u ON u.id = m.user_id
     WHERE m.space_id = ?
     ORDER BY m.joined_at ASC`,
    membership.space_id,
  );
  const me = members.find((m) => m.id === userId);
  if (!me) return null;
  return {
    spaceId: membership.space_id,
    members,
    me,
    partner: members.find((m) => m.id !== userId) ?? null,
  };
}

export function requireSpace(userId: string) {
  const ctx = getSpaceContext(userId);
  if (!ctx) throw new HttpError(409, "Open a space first.", "NO_SPACE");
  return ctx;
}

function getUser(id: string) {
  const user = one<UserRow>("SELECT * FROM users WHERE id = ?", id);
  if (!user) throw new HttpError(401, "Please sign in again.", "UNAUTHORIZED");
  return user;
}

function getUserByEmail(email: string) {
  return one<UserRow>("SELECT * FROM users WHERE email = ?", email);
}

function friendlyConstraint(error: unknown): never {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("space_full")) throw new HttpError(409, "This space already has two people.", "FULL");
  if (message.includes("space_members")) throw new HttpError(409, "You're already in a space.", "CONFLICT");
  if (message.includes("UNIQUE") && message.includes("email")) {
    throw new HttpError(409, "An account already uses that email.", "CONFLICT");
  }
  throw error;
}

function parseHttpUrl(input: string) {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new HttpError(400, "That link doesn't look right.", "VALIDATION");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new HttpError(400, "Use a normal web link.", "VALIDATION");
  }
  if (url.username || url.password) throw new HttpError(400, "That link doesn't look right.", "VALIDATION");
  if (url.href.length > LIMITS.url) throw new HttpError(400, "That link is too long.", "VALIDATION");
  return url.href;
}

function uniqueCode() {
  for (let i = 0; i < 6; i++) {
    const code = randomFromAlphabet(8);
    if (!one("SELECT id FROM invitations WHERE code = ?", code)) return code;
  }
  throw new HttpError(500, "Couldn't make a code. Try again.", "INTERNAL");
}

function reactionMap(spaceId: string, type: string, ids: string[], meId: string) {
  const map = new Map<string, ReactionView[]>();
  if (!ids.length) return map;
  const marks = ids.map(() => "?").join(",");
  const rows = many<{ target_id: string; user_id: string; emoji: string }>(
    `SELECT target_id, user_id, emoji FROM reactions
     WHERE space_id = ? AND target_type = ? AND target_id IN (${marks})`,
    spaceId,
    type,
    ...ids,
  );
  const grouped = new Map<string, Map<string, boolean>>();
  for (const row of rows) {
    const emojis = grouped.get(row.target_id) ?? new Map<string, boolean>();
    emojis.set(row.emoji, Boolean(emojis.get(row.emoji)) || row.user_id === meId);
    grouped.set(row.target_id, emojis);
  }
  for (const [id, emojis] of grouped) {
    map.set(id, [...emojis.entries()].map(([emoji, mine]) => ({ emoji, mine })));
  }
  return map;
}

function toMoment(row: MomentRow, members: MemberRow[], meId: string, reactions: ReactionView[]): MomentView {
  return {
    type: "moment",
    id: row.id,
    kind: row.kind,
    body: row.body,
    mediaUrl: row.media_id ? `/api/media/${row.media_id}` : null,
    mediaMime: row.media_mime,
    linkUrl: row.link_url,
    linkTitle: row.link_title,
    detail: row.detail,
    durationMs: row.duration_ms,
    createdAt: row.created_at,
    reactions,
    ...authorBits(row.author_id, row.author_name, members, meId),
  };
}

function toSignal(row: SignalRow, members: MemberRow[], meId: string, reactions: ReactionView[]): SignalView {
  return {
    type: "signal",
    id: row.id,
    preset: row.preset,
    emoji: row.emoji,
    label: row.label,
    note: row.note,
    createdAt: row.created_at,
    reactions,
    ...authorBits(row.author_id, row.author_name, members, meId),
  };
}

function toMemory(row: MemoryRow, members: MemberRow[], meId: string, reactions: ReactionView[]): MemoryView {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    kind: row.kind,
    occurredOn: row.occurred_on,
    mediaUrl: row.media_id ? `/api/media/${row.media_id}` : null,
    linkUrl: row.link_url,
    linkTitle: row.link_title,
    place: row.place,
    createdAt: row.created_at,
    reactions,
    ...authorBits(row.author_id, row.author_name, members, meId),
  };
}

const momentSelect = `SELECT m.*, media.mime AS media_mime
  FROM moments m LEFT JOIN media ON media.id = m.media_id`;

function loadMoments(spaceId: string, members: MemberRow[], meId: string, cursor: Cursor | null, limit: number) {
  const rows = cursor
    ? many<MomentRow>(
        `${momentSelect}
         WHERE m.space_id = ? AND (m.created_at < ? OR (m.created_at = ? AND m.id < ?))
         ORDER BY m.created_at DESC, m.id DESC LIMIT ?`,
        spaceId,
        cursor.createdAt,
        cursor.createdAt,
        cursor.id,
        limit + 1,
      )
    : many<MomentRow>(
        `${momentSelect} WHERE m.space_id = ? ORDER BY m.created_at DESC, m.id DESC LIMIT ?`,
        spaceId,
        limit + 1,
      );
  const page = rows.slice(0, limit);
  const reactions = reactionMap(spaceId, "moment", page.map((row) => row.id), meId);
  const items = page.map((row) => toMoment(row, members, meId, reactions.get(row.id) ?? []));
  const last = page[page.length - 1];
  return { items, next: rows.length > limit && last ? { createdAt: last.created_at, id: last.id } : null };
}

function loadSignals(spaceId: string, members: MemberRow[], meId: string, limit: number) {
  const rows = many<SignalRow>(
    `SELECT * FROM signals WHERE space_id = ? ORDER BY created_at DESC, id DESC LIMIT ?`,
    spaceId,
    limit,
  );
  const reactions = reactionMap(spaceId, "signal", rows.map((row) => row.id), meId);
  return rows.map((row) => toSignal(row, members, meId, reactions.get(row.id) ?? []));
}

function loadAnswers(spaceId: string, questionIds: string[]) {
  if (!questionIds.length) return [] as AnswerRow[];
  const marks = questionIds.map(() => "?").join(",");
  return many<AnswerRow>(
    `SELECT * FROM answers WHERE space_id = ? AND question_id IN (${marks})`,
    spaceId,
    ...questionIds,
  );
}

function toQuestion(row: QuestionRow, answers: AnswerRow[], members: MemberRow[], meId: string): QuestionView {
  const mine = answers.find((a) => a.user_id === meId) ?? null;
  const theirs = answers.find((a) => a.user_id !== meId) ?? null;
  const theirMember = theirs ? members.find((m) => m.id === theirs.user_id) : undefined;
  return {
    id: row.id,
    prompt: row.prompt,
    category: row.category,
    createdAt: row.created_at,
    myAnswer: mine ? { id: mine.id, body: mine.body, updatedAt: mine.updated_at, authorName: "You" } : null,
    theyAnswered: Boolean(theirs),
    theirAnswer:
      mine && theirs
        ? {
            id: theirs.id,
            body: theirs.body,
            updatedAt: theirs.updated_at,
            authorName: theirMember?.display_name ?? "Them",
          }
        : null,
    ...authorBits(row.author_id, row.author_name, members, meId),
  };
}

export function listQuestions(userId: string, cursor: Cursor | null, limit = 20) {
  const ctx = requireSpace(userId);
  const rows = cursor
    ? many<QuestionRow>(
        `SELECT * FROM questions WHERE space_id = ? AND (created_at < ? OR (created_at = ? AND id < ?))
         ORDER BY created_at DESC, id DESC LIMIT ?`,
        ctx.spaceId,
        cursor.createdAt,
        cursor.createdAt,
        cursor.id,
        limit + 1,
      )
    : many<QuestionRow>(
        `SELECT * FROM questions WHERE space_id = ? ORDER BY created_at DESC, id DESC LIMIT ?`,
        ctx.spaceId,
        limit + 1,
      );
  const page = rows.slice(0, limit);
  const answers = loadAnswers(ctx.spaceId, page.map((row) => row.id));
  const items = page.map((row) =>
    toQuestion(row, answers.filter((a) => a.question_id === row.id), ctx.members, userId),
  );
  const last = page[page.length - 1];
  return { items, next: rows.length > limit && last ? { createdAt: last.created_at, id: last.id } : null };
}

export function listMemories(userId: string, cursor: Cursor | null, limit = 24) {
  const ctx = requireSpace(userId);
  const rows = cursor
    ? many<MemoryRow>(
        `SELECT * FROM memories WHERE space_id = ? AND (created_at < ? OR (created_at = ? AND id < ?))
         ORDER BY created_at DESC, id DESC LIMIT ?`,
        ctx.spaceId,
        cursor.createdAt,
        cursor.createdAt,
        cursor.id,
        limit + 1,
      )
    : many<MemoryRow>(
        `SELECT * FROM memories WHERE space_id = ? ORDER BY created_at DESC, id DESC LIMIT ?`,
        ctx.spaceId,
        limit + 1,
      );
  const page = rows.slice(0, limit);
  const reactions = reactionMap(ctx.spaceId, "memory", page.map((row) => row.id), userId);
  const items = page.map((row) => toMemory(row, ctx.members, userId, reactions.get(row.id) ?? []));
  const last = page[page.length - 1];
  return { items, next: rows.length > limit && last ? { createdAt: last.created_at, id: last.id } : null };
}

export function listSignals(userId: string, limit = 80) {
  const ctx = requireSpace(userId);
  return loadSignals(ctx.spaceId, ctx.members, userId, limit);
}

export function listMoments(userId: string, cursor: Cursor | null, limit = 20) {
  const ctx = requireSpace(userId);
  return loadMoments(ctx.spaceId, ctx.members, userId, cursor, limit);
}

function presenceView(status: string, updatedAt: number): PresenceView {
  const known = presenceById(status);
  return {
    status,
    label: known?.label ?? "Here",
    emoji: known?.emoji ?? "·",
    updatedAt,
    freshness: presenceFreshness(updatedAt),
  };
}

export function loadHome(userId: string): HomePayload {
  const ctx = requireSpace(userId);
  const presences = many<{ user_id: string; status: string; updated_at: number }>(
    "SELECT user_id, status, updated_at FROM presence WHERE space_id = ?",
    ctx.spaceId,
  );
  const mineRow = presences.find((p) => p.user_id === userId);
  const partnerRow = ctx.partner ? presences.find((p) => p.user_id === ctx.partner?.id) : undefined;
  let invite: { code: string; expiresAt: number } | null = null;
  if (!ctx.partner) {
    const row = one<{ code: string; expires_at: number }>(
      `SELECT code, expires_at FROM invitations
       WHERE space_id = ? AND used_at IS NULL AND revoked_at IS NULL AND expires_at > ?
       ORDER BY created_at DESC LIMIT 1`,
      ctx.spaceId,
      Date.now(),
    );
    if (row) invite = { code: formatCode(row.code), expiresAt: row.expires_at };
  }

  const waitingMoments = ctx.partner
    ? many<MomentRow>(
        `${momentSelect}
         WHERE m.space_id = ? AND m.author_id = ?
         AND NOT EXISTS (
           SELECT 1 FROM seen_marks s WHERE s.user_id = ? AND s.target_type = 'moment' AND s.target_id = m.id
         )
         ORDER BY m.created_at DESC LIMIT 4`,
        ctx.spaceId,
        ctx.partner.id,
        userId,
      )
    : [];
  const waitingSignals = ctx.partner
    ? many<SignalRow>(
        `SELECT * FROM signals WHERE space_id = ? AND author_id = ?
         AND NOT EXISTS (
           SELECT 1 FROM seen_marks s WHERE s.user_id = ? AND s.target_type = 'signal' AND s.target_id = signals.id
         )
         ORDER BY created_at DESC LIMIT 4`,
        ctx.spaceId,
        ctx.partner.id,
        userId,
      )
    : [];
  const momentReactions = reactionMap(ctx.spaceId, "moment", waitingMoments.map((row) => row.id), userId);
  const signalReactions = reactionMap(ctx.spaceId, "signal", waitingSignals.map((row) => row.id), userId);
  const waiting: FeedItem[] = [
    ...waitingMoments.map((row) => toMoment(row, ctx.members, userId, momentReactions.get(row.id) ?? [])),
    ...waitingSignals.map((row) => toSignal(row, ctx.members, userId, signalReactions.get(row.id) ?? [])),
  ]
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 4);
  const waitingIds = new Set(waiting.map((item) => item.id));
  const recentPool: FeedItem[] = [
    ...loadMoments(ctx.spaceId, ctx.members, userId, null, 8).items,
    ...loadSignals(ctx.spaceId, ctx.members, userId, 8),
  ]
    .filter((item) => !waitingIds.has(item.id))
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 6);

  const questions = listQuestions(userId, null, 8).items;
  const question = questions.find((q) => !q.myAnswer) ?? questions.find((q) => !q.theyAnswered) ?? questions[0] ?? null;
  const memory = listMemories(userId, null, 1).items[0] ?? null;
  const unread = Number(
    one<{ n: number }>("SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL", userId)?.n ?? 0,
  );

  return {
    me: person(ctx.me),
    partner: ctx.partner
      ? { ...person(ctx.partner), presence: partnerRow ? presenceView(partnerRow.status, partnerRow.updated_at) : null }
      : null,
    myPresence: mineRow ? presenceView(mineRow.status, mineRow.updated_at) : null,
    invite,
    waiting,
    recent: recentPool,
    question,
    memory,
    unread,
  };
}

export function listNotices(userId: string) {
  const rows = many<{
    id: string;
    kind: string;
    title: string;
    body: string;
    target_path: string | null;
    created_at: number;
    read_at: number | null;
  }>("SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 40", userId);
  const notices: NoticeView[] = rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    title: row.title,
    body: row.body,
    targetPath: row.target_path,
    createdAt: row.created_at,
    read: row.read_at != null,
  }));
  const unread = notices.filter((n) => !n.read).length;
  return { notices, unread };
}

export function markNoticesRead(userId: string) {
  run("UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL", Date.now(), userId);
  return listNotices(userId);
}

export function getSettings(userId: string): SettingsView {
  let row = one<SettingsRow>("SELECT * FROM settings WHERE user_id = ?", userId);
  if (!row) {
    run(
      `INSERT INTO settings (user_id, notify_signals, notify_moments, notify_questions, notify_memories, notify_reactions, updated_at)
       VALUES (?, 1, 1, 1, 1, 0, ?)`,
      userId,
      Date.now(),
    );
    row = {
      notify_signals: 1,
      notify_moments: 1,
      notify_questions: 1,
      notify_memories: 1,
      notify_reactions: 0,
    };
  }
  return {
    notifySignals: row.notify_signals === 1,
    notifyMoments: row.notify_moments === 1,
    notifyQuestions: row.notify_questions === 1,
    notifyMemories: row.notify_memories === 1,
    notifyReactions: row.notify_reactions === 1,
  };
}

export function updateSettings(userId: string, input: SettingsView) {
  getSettings(userId);
  run(
    `UPDATE settings SET notify_signals = ?, notify_moments = ?, notify_questions = ?, notify_memories = ?, notify_reactions = ?, updated_at = ?
     WHERE user_id = ?`,
    input.notifySignals ? 1 : 0,
    input.notifyMoments ? 1 : 0,
    input.notifyQuestions ? 1 : 0,
    input.notifyMemories ? 1 : 0,
    input.notifyReactions ? 1 : 0,
    Date.now(),
    userId,
  );
  return getSettings(userId);
}

function noticeCopy(kind: string, name: string) {
  switch (kind) {
    case "signal":
      return { title: "A signal", body: `${name} left a feeling.`, path: "/home" };
    case "moment":
      return { title: "Something is waiting", body: `${name} left something for you.`, path: "/home" };
    case "question":
      return { title: "A question", body: `${name} left a question.`, path: "/questions" };
    case "answer":
      return { title: "An answer", body: `${name} answered a question.`, path: "/questions" };
    case "memory":
      return { title: "A memory", body: `${name} added to the scrapbook.`, path: "/memories" };
    case "reaction":
      return { title: "A reaction", body: `${name} reacted.`, path: "/home" };
    case "joined":
      return { title: "They're here", body: `${name} joined your space.`, path: "/home" };
    case "left":
      return { title: "The space changed", body: `${name} left the space.`, path: "/home" };
    default:
      return { title: "Between", body: "Something is waiting.", path: "/home" };
  }
}

function notifyUser(recipientId: string, spaceId: string, actorId: string | null, actorName: string, kind: string) {
  if (kind !== "joined" && kind !== "left") {
    const settings = getSettings(recipientId);
    const allowed =
      (kind === "signal" && settings.notifySignals) ||
      (kind === "moment" && settings.notifyMoments) ||
      ((kind === "question" || kind === "answer") && settings.notifyQuestions) ||
      (kind === "memory" && settings.notifyMemories) ||
      (kind === "reaction" && settings.notifyReactions);
    if (!allowed) {
      publish(spaceId, { type: kind, actorId });
      return;
    }
  }
  const copy = noticeCopy(kind, actorName);
  const now = Date.now();
  run(
    `INSERT INTO notifications (id, user_id, space_id, kind, title, body, target_path, read_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?)`,
    crypto.randomUUID(),
    recipientId,
    spaceId,
    kind,
    copy.title,
    copy.body,
    copy.path,
    now,
  );
  run(
    `DELETE FROM notifications WHERE user_id = ? AND id NOT IN (
       SELECT id FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 80
     )`,
    recipientId,
    recipientId,
  );
  publish(spaceId, { type: kind, actorId });
}

function notifyPartner(ctx: SpaceContext, kind: string) {
  if (!ctx.partner) {
    publish(ctx.spaceId, { type: kind, actorId: ctx.me.id });
    return;
  }
  notifyUser(ctx.partner.id, ctx.spaceId, ctx.me.id, ctx.me.display_name, kind);
}

export async function signUp(input: { email: string; password: string; displayName: string; color: string }) {
  if (getUserByEmail(input.email)) throw new HttpError(409, "An account already uses that email.", "CONFLICT");
  const now = Date.now();
  const id = crypto.randomUUID();
  const recoveryCode = `${randomFromAlphabet(4)}-${randomFromAlphabet(4)}-${randomFromAlphabet(4)}-${randomFromAlphabet(4)}`;
  const passwordHash = await hashSecret(input.password);
  const recoveryHash = await hashSecret(normalizeCode(recoveryCode));
  try {
    tx(() => {
      run(
        `INSERT INTO users (id, email, password_hash, recovery_hash, display_name, color, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        id,
        input.email,
        passwordHash,
        recoveryHash,
        input.displayName,
        input.color,
        now,
        now,
      );
      run(
        `INSERT INTO settings (user_id, notify_signals, notify_moments, notify_questions, notify_memories, notify_reactions, updated_at)
         VALUES (?, 1, 1, 1, 1, 0, ?)`,
        id,
        now,
      );
    });
  } catch (error) {
    friendlyConstraint(error);
  }
  await createSession(id);
  return {
    recoveryCode,
    user: { id, email: input.email, displayName: input.displayName, color: input.color, hasSpace: false },
  };
}

export async function signIn(email: string, password: string) {
  const user = getUserByEmail(email);
  const hash = user?.password_hash ?? (await dummySecretHash());
  const ok = await verifySecret(password, hash);
  if (!user || !ok) throw new HttpError(401, "That email or password doesn't match.", "UNAUTHORIZED");
  await createSession(user.id);
  const hasSpace = Boolean(getSpaceContext(user.id));
  return { id: user.id, email: user.email, displayName: user.display_name, color: user.color, hasSpace };
}

export async function recoverAccount(email: string, code: string, password: string) {
  const user = getUserByEmail(email);
  const hash = user?.recovery_hash ?? (await dummySecretHash());
  const ok = await verifySecret(normalizeCode(code), hash);
  if (!user || !ok) throw new HttpError(400, "Those details don't match.", "VALIDATION");
  const passwordHash = await hashSecret(password);
  run("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?", passwordHash, Date.now(), user.id);
  run("DELETE FROM sessions WHERE user_id = ?", user.id);
  await createSession(user.id);
  return { ok: true };
}

export async function replaceRecoveryCode(userId: string, password: string) {
  const user = getUser(userId);
  if (!(await verifySecret(password, user.password_hash))) {
    throw new HttpError(400, "That password doesn't match.", "VALIDATION");
  }
  const recoveryCode = `${randomFromAlphabet(4)}-${randomFromAlphabet(4)}-${randomFromAlphabet(4)}-${randomFromAlphabet(4)}`;
  const recoveryHash = await hashSecret(normalizeCode(recoveryCode));
  run("UPDATE users SET recovery_hash = ?, updated_at = ? WHERE id = ?", recoveryHash, Date.now(), userId);
  return { recoveryCode };
}

export function publicMe(userId: string): MeResponse {
  const user = getUser(userId);
  return {
    id: user.id,
    email: user.email,
    displayName: user.display_name,
    color: user.color,
    hasSpace: Boolean(getSpaceContext(userId)),
  };
}

export function updateProfile(userId: string, displayName: string, color: string) {
  run("UPDATE users SET display_name = ?, color = ?, updated_at = ? WHERE id = ?", displayName, color, Date.now(), userId);
  const ctx = getSpaceContext(userId);
  if (ctx) publish(ctx.spaceId, { type: "profile", actorId: userId });
  return publicMe(userId);
}

export async function changePassword(userId: string, currentPassword: string, nextPassword: string) {
  const user = getUser(userId);
  if (!(await verifySecret(currentPassword, user.password_hash))) {
    throw new HttpError(400, "That password doesn't match.", "VALIDATION");
  }
  if (currentPassword === nextPassword) {
    throw new HttpError(400, "Choose a different password.", "VALIDATION");
  }
  run("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?", await hashSecret(nextPassword), Date.now(), userId);
  return { ok: true };
}

export function createSpace(userId: string) {
  if (getSpaceContext(userId)) throw new HttpError(409, "You're already in a space.", "CONFLICT");
  const user = getUser(userId);
  const spaceId = crypto.randomUUID();
  const code = uniqueCode();
  const now = Date.now();
  const expires = now + INVITE_DAYS * 86_400_000;
  try {
    tx(() => {
      run("INSERT INTO spaces (id, created_by, created_at) VALUES (?, ?, ?)", spaceId, userId, now);
      run("INSERT INTO space_members (space_id, user_id, joined_at) VALUES (?, ?, ?)", spaceId, userId, now);
      run(
        `INSERT INTO invitations (id, space_id, code, created_by, expires_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        crypto.randomUUID(),
        spaceId,
        code,
        userId,
        expires,
        now,
      );
    });
  } catch (error) {
    friendlyConstraint(error);
  }
  return { code: formatCode(code), expiresAt: expires, displayName: user.display_name };
}

export function refreshInvite(userId: string) {
  const ctx = requireSpace(userId);
  if (ctx.partner) throw new HttpError(409, "Someone is already here.", "FULL");
  const code = uniqueCode();
  const now = Date.now();
  const expires = now + INVITE_DAYS * 86_400_000;
  tx(() => {
    run(
      "UPDATE invitations SET revoked_at = ? WHERE space_id = ? AND used_at IS NULL AND revoked_at IS NULL",
      now,
      ctx.spaceId,
    );
    run(
      `INSERT INTO invitations (id, space_id, code, created_by, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      crypto.randomUUID(),
      ctx.spaceId,
      code,
      userId,
      expires,
      now,
    );
  });
  return { code: formatCode(code), expiresAt: expires };
}

export function joinSpace(userId: string, rawCode: string) {
  const code = normalizeCode(rawCode);
  if (code.length !== 8) throw new HttpError(400, "That code doesn't match an open space.", "VALIDATION");
  const user = getUser(userId);
  let joined: { spaceId: string; partner: MemberRow | null } | null = null;
  try {
    joined = tx(() => {
      if (getSpaceContext(userId)) {
        throw new HttpError(409, "You're already in a space. Leave it before joining another.", "CONFLICT");
      }
      const invite = one<{ id: string; space_id: string; expires_at: number; used_at: number | null; revoked_at: number | null }>(
        "SELECT id, space_id, expires_at, used_at, revoked_at FROM invitations WHERE code = ?",
        code,
      );
      const open = invite && !invite.used_at && !invite.revoked_at && invite.expires_at > Date.now();
      if (!invite || !open) throw new HttpError(400, "That code doesn't match an open space.", "VALIDATION");
      const count = Number(
        one<{ n: number }>("SELECT COUNT(*) AS n FROM space_members WHERE space_id = ?", invite.space_id)?.n ?? 0,
      );
      if (count >= 2) throw new HttpError(400, "That code doesn't match an open space.", "VALIDATION");
      const members = many<MemberRow>(
        `SELECT u.id, u.display_name, u.color, m.joined_at
         FROM space_members m JOIN users u ON u.id = m.user_id WHERE m.space_id = ?`,
        invite.space_id,
      );
      const now = Date.now();
      run("INSERT INTO space_members (space_id, user_id, joined_at) VALUES (?, ?, ?)", invite.space_id, userId, now);
      run("UPDATE invitations SET used_by = ?, used_at = ? WHERE id = ?", userId, now, invite.id);
      run(
        "UPDATE invitations SET revoked_at = ? WHERE space_id = ? AND used_at IS NULL AND revoked_at IS NULL",
        now,
        invite.space_id,
      );
      return { spaceId: invite.space_id, partner: members[0] ?? null };
    });
  } catch (error) {
    if (error instanceof HttpError) throw error;
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("space_full") || message.includes("space_members")) {
      throw new HttpError(400, "That code doesn't match an open space.", "VALIDATION");
    }
    friendlyConstraint(error);
  }
  if (!joined) throw new HttpError(500, "Couldn't join that space. Try again.", "INTERNAL");
  if (joined.partner) notifyUser(joined.partner.id, joined.spaceId, userId, user.display_name, "joined");
  else publish(joined.spaceId, { type: "joined", actorId: userId });
  return { ok: true };
}

function collectMedia(spaceId: string) {
  return many<{ storage_name: string }>("SELECT storage_name FROM media WHERE space_id = ?", spaceId).map(
    (row) => row.storage_name,
  );
}

export function leaveSpace(userId: string) {
  const ctx = requireSpace(userId);
  const alone = !ctx.partner;
  const partnerId = ctx.partner?.id ?? null;
  const name = ctx.me.display_name;
  let files: string[] = [];
  tx(() => {
    if (alone) files = collectMedia(ctx.spaceId);
    run("DELETE FROM space_members WHERE user_id = ?", userId);
    run("DELETE FROM presence WHERE user_id = ?", userId);
    if (alone) run("DELETE FROM spaces WHERE id = ?", ctx.spaceId);
  });
  if (alone) removeFiles(files);
  else if (partnerId) notifyUser(partnerId, ctx.spaceId, null, name, "left");
  return { closed: alone };
}

export async function deleteAccount(userId: string, password: string) {
  const user = getUser(userId);
  if (!(await verifySecret(password, user.password_hash))) {
    throw new HttpError(400, "That password doesn't match.", "VALIDATION");
  }
  const ctx = getSpaceContext(userId);
  let files: string[] = [];
  const partnerId = ctx?.partner?.id ?? null;
  const spaceId = ctx?.spaceId ?? null;
  tx(() => {
    if (ctx && !ctx.partner) {
      files = collectMedia(ctx.spaceId);
      run("DELETE FROM spaces WHERE id = ?", ctx.spaceId);
    } else if (ctx) {
      run("DELETE FROM space_members WHERE user_id = ?", userId);
      run("DELETE FROM presence WHERE user_id = ?", userId);
    }
    run("DELETE FROM users WHERE id = ?", userId);
  });
  removeFiles(files);
  if (partnerId && spaceId) notifyUser(partnerId, spaceId, null, user.display_name, "left");
}

export function sendSignal(userId: string, preset: string, note: string | null) {
  const ctx = requireSpace(userId);
  const known = signalById(preset);
  if (!known) throw new HttpError(400, "That signal isn't available.", "VALIDATION");
  const since = Date.now() - 20_000;
  const existing = one<SignalRow>(
    `SELECT * FROM signals WHERE space_id = ? AND author_id = ? AND preset = ? AND ifnull(note, '') = ifnull(?, '') AND created_at > ?
     ORDER BY created_at DESC LIMIT 1`,
    ctx.spaceId,
    userId,
    preset,
    note,
    since,
  );
  if (existing) {
    const reactions = reactionMap(ctx.spaceId, "signal", [existing.id], userId);
    return { signal: toSignal(existing, ctx.members, userId, reactions.get(existing.id) ?? []), created: false };
  }
  const id = crypto.randomUUID();
  const now = Date.now();
  run(
    `INSERT INTO signals (id, space_id, author_id, author_name, preset, emoji, label, note, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    ctx.spaceId,
    userId,
    ctx.me.display_name,
    known.id,
    known.emoji,
    known.label,
    note,
    now,
  );
  notifyPartner(ctx, "signal");
  const row = one<SignalRow>("SELECT * FROM signals WHERE id = ?", id)!;
  return { signal: toSignal(row, ctx.members, userId, []), created: true };
}

type MomentInput = {
  kind: string;
  body: string | null;
  linkUrl: string | null;
  linkTitle: string | null;
  detail: string | null;
  durationMs: number | null;
  file?: File | null;
};

export async function createMoment(userId: string, input: MomentInput) {
  const ctx = requireSpace(userId);
  let body = input.body;
  let linkUrl = input.linkUrl;
  let linkTitle = input.linkTitle;
  const detail = input.detail;
  const kind = input.kind;
  if (kind === "note" && !body) throw new HttpError(400, "Write a little something.", "VALIDATION");
  if (kind === "thought") {
    if (!body) throw new HttpError(400, "Share the thought.", "VALIDATION");
    if (body.length > LIMITS.thought) throw new HttpError(400, "Keep the thought a little shorter.", "VALIDATION");
  }
  if (kind === "link") {
    if (!linkUrl) throw new HttpError(400, "Add a link.", "VALIDATION");
    linkUrl = parseHttpUrl(linkUrl);
  }
  if (kind === "song") {
    if (!linkTitle) throw new HttpError(400, "Name the song.", "VALIDATION");
    if (linkUrl) linkUrl = parseHttpUrl(linkUrl);
  }
  const needsFile = kind === "photo" || kind === "drawing" || kind === "voice" || kind === "video";
  if (needsFile && !(input.file instanceof File)) throw new HttpError(400, "Choose a file first.", "VALIDATION");
  if (!needsFile && kind !== "note" && kind !== "thought" && kind !== "link" && kind !== "song") {
    throw new HttpError(400, "That kind of moment isn't available.", "VALIDATION");
  }

  if (!needsFile) {
    const since = Date.now() - 20_000;
    const existing = one<MomentRow>(
      `${momentSelect}
       WHERE m.space_id = ? AND m.author_id = ? AND m.kind = ?
       AND ifnull(m.body, '') = ifnull(?, '')
       AND ifnull(m.link_url, '') = ifnull(?, '')
       AND ifnull(m.link_title, '') = ifnull(?, '')
       AND m.created_at > ?
       ORDER BY m.created_at DESC LIMIT 1`,
      ctx.spaceId,
      userId,
      kind,
      body,
      linkUrl,
      linkTitle,
      since,
    );
    if (existing) {
      const reactions = reactionMap(ctx.spaceId, "moment", [existing.id], userId);
      return { moment: toMoment(existing, ctx.members, userId, reactions.get(existing.id) ?? []), created: false };
    }
  }

  const expected = kind === "voice" ? "audio" : kind === "video" ? "video" : needsFile ? "image" : null;
  let stored: Awaited<ReturnType<typeof saveUpload>> | null = null;
  if (expected && input.file) {
    stored = await saveUpload(input.file, expected);
  }

  const id = crypto.randomUUID();
  const mediaId = stored ? crypto.randomUUID() : null;
  const now = Date.now();
  try {
    tx(() => {
      if (stored && mediaId) {
        run(
          `INSERT INTO media (id, space_id, uploader_id, kind, mime, size, storage_name, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          mediaId,
          ctx.spaceId,
          userId,
          stored.kind,
          stored.mime,
          stored.size,
          stored.storageName,
          now,
        );
      }
      run(
        `INSERT INTO moments (id, space_id, author_id, author_name, kind, body, media_id, link_url, link_title, detail, duration_ms, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        id,
        ctx.spaceId,
        userId,
        ctx.me.display_name,
        kind,
        body,
        mediaId,
        linkUrl,
        linkTitle,
        detail,
        input.durationMs,
        now,
      );
    });
  } catch (error) {
    if (stored) removeFiles([stored.storageName]);
    throw error;
  }
  notifyPartner(ctx, "moment");
  const row = one<MomentRow>(`${momentSelect} WHERE m.id = ?`, id)!;
  return { moment: toMoment(row, ctx.members, userId, []), created: true };
}

export function deleteSignal(userId: string, signalId: string) {
  const ctx = requireSpace(userId);
  const row = one<{ author_id: string | null }>(
    "SELECT author_id FROM signals WHERE id = ? AND space_id = ?",
    signalId,
    ctx.spaceId,
  );
  if (!row) throw new HttpError(404, "That isn't here anymore.", "NOT_FOUND");
  if (row.author_id !== userId) throw new HttpError(403, "You can only take back something you left.", "FORBIDDEN");
  run("DELETE FROM reactions WHERE space_id = ? AND target_type = 'signal' AND target_id = ?", ctx.spaceId, signalId);
  run("DELETE FROM seen_marks WHERE target_type = 'signal' AND target_id = ?", signalId);
  run("DELETE FROM signals WHERE id = ?", signalId);
  publish(ctx.spaceId, { type: "signal", actorId: userId });
}

export function deleteMoment(userId: string, momentId: string) {
  const ctx = requireSpace(userId);
  const moment = one<{ id: string; author_id: string | null; media_id: string | null }>(
    "SELECT id, author_id, media_id FROM moments WHERE id = ? AND space_id = ?",
    momentId,
    ctx.spaceId,
  );
  if (!moment) throw new HttpError(404, "That isn't here anymore.", "NOT_FOUND");
  if (moment.author_id !== userId) throw new HttpError(403, "You can only take back something you left.", "FORBIDDEN");
  let storage: string | null = null;
  tx(() => {
    if (moment.media_id) {
      storage = one<{ storage_name: string }>("SELECT storage_name FROM media WHERE id = ?", moment.media_id)?.storage_name ?? null;
    }
    run("DELETE FROM reactions WHERE space_id = ? AND target_type = 'moment' AND target_id = ?", ctx.spaceId, momentId);
    run("DELETE FROM seen_marks WHERE target_type = 'moment' AND target_id = ?", momentId);
    run("DELETE FROM moments WHERE id = ?", momentId);
    if (moment.media_id) run("DELETE FROM media WHERE id = ?", moment.media_id);
  });
  if (storage) removeFiles([storage]);
  publish(ctx.spaceId, { type: "moment", actorId: userId });
}

export function setReaction(userId: string, targetType: string, targetId: string, emoji: string) {
  const ctx = requireSpace(userId);
  const table = { moment: "moments", signal: "signals", memory: "memories", answer: "answers" }[targetType];
  if (!table) throw new HttpError(400, "That can't be reacted to.", "VALIDATION");
  const target = one<{ id: string }>(`SELECT id FROM ${table} WHERE id = ? AND space_id = ?`, targetId, ctx.spaceId);
  if (!target) throw new HttpError(404, "That isn't here anymore.", "NOT_FOUND");
  const existing = one<{ emoji: string }>(
    "SELECT emoji FROM reactions WHERE user_id = ? AND target_type = ? AND target_id = ?",
    userId,
    targetType,
    targetId,
  );
  let changed = false;
  if (existing?.emoji === emoji) {
    run("DELETE FROM reactions WHERE user_id = ? AND target_type = ? AND target_id = ?", userId, targetType, targetId);
    changed = true;
  } else if (existing) {
    run(
      "UPDATE reactions SET emoji = ?, created_at = ? WHERE user_id = ? AND target_type = ? AND target_id = ?",
      emoji,
      Date.now(),
      userId,
      targetType,
      targetId,
    );
    changed = true;
  } else {
    run(
      `INSERT INTO reactions (id, space_id, user_id, target_type, target_id, emoji, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      crypto.randomUUID(),
      ctx.spaceId,
      userId,
      targetType,
      targetId,
      emoji,
      Date.now(),
    );
    changed = true;
    notifyPartner(ctx, "reaction");
  }
  if (changed && existing) publish(ctx.spaceId, { type: "reaction", actorId: userId });
  const reactions = reactionMap(ctx.spaceId, targetType, [targetId], userId).get(targetId) ?? [];
  return { reactions };
}

export function markSeen(userId: string, items: { type: "moment" | "signal"; id: string }[]) {
  const ctx = requireSpace(userId);
  const now = Date.now();
  for (const item of items) {
    const table = item.type === "moment" ? "moments" : "signals";
    const row = one("SELECT id FROM " + table + " WHERE id = ? AND space_id = ?", item.id, ctx.spaceId);
    if (!row) continue;
    run(
      `INSERT INTO seen_marks (user_id, target_type, target_id, seen_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(user_id, target_type, target_id) DO UPDATE SET seen_at = excluded.seen_at`,
      userId,
      item.type,
      item.id,
      now,
    );
  }
  return { ok: true };
}

export function askQuestion(userId: string, input: { source: "deck" } | { source: "custom"; prompt: string; category: string }) {
  const ctx = requireSpace(userId);
  let prompt = "";
  let category = "random";
  if (input.source === "deck") {
    const recent = many<{ prompt: string }>(
      "SELECT prompt FROM questions WHERE space_id = ? ORDER BY created_at DESC LIMIT 40",
      ctx.spaceId,
    );
    const used = new Set(recent.map((row) => row.prompt));
    const pool = DECK.filter((card) => !used.has(card.prompt));
    const source = pool.length ? pool : DECK;
    const card = source[randomInt(source.length)]!;
    prompt = card.prompt;
    category = card.category;
  } else {
    prompt = input.prompt;
    category = input.category;
  }
  const since = Date.now() - 20_000;
  const existing = one<QuestionRow>(
    `SELECT * FROM questions WHERE space_id = ? AND author_id = ? AND prompt = ? AND created_at > ? ORDER BY created_at DESC LIMIT 1`,
    ctx.spaceId,
    userId,
    prompt,
    since,
  );
  if (existing) {
    const answers = loadAnswers(ctx.spaceId, [existing.id]);
    return { question: toQuestion(existing, answers, ctx.members, userId), created: false };
  }
  const id = crypto.randomUUID();
  run(
    `INSERT INTO questions (id, space_id, author_id, author_name, prompt, category, source, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    ctx.spaceId,
    userId,
    ctx.me.display_name,
    prompt,
    category,
    input.source,
    Date.now(),
  );
  notifyPartner(ctx, "question");
  const row = one<QuestionRow>("SELECT * FROM questions WHERE id = ?", id)!;
  return { question: toQuestion(row, [], ctx.members, userId), created: true };
}

export function removeQuestion(userId: string, questionId: string) {
  const ctx = requireSpace(userId);
  const question = one<{ author_id: string | null }>(
    "SELECT author_id FROM questions WHERE id = ? AND space_id = ?",
    questionId,
    ctx.spaceId,
  );
  if (!question) throw new HttpError(404, "That isn't here anymore.", "NOT_FOUND");
  if (question.author_id !== userId) throw new HttpError(403, "You can only take back a question you asked.", "FORBIDDEN");
  const answers = Number(one<{ n: number }>("SELECT COUNT(*) AS n FROM answers WHERE question_id = ?", questionId)?.n ?? 0);
  if (answers > 0) throw new HttpError(409, "This one has answers, so it stays.", "CONFLICT");
  run("DELETE FROM questions WHERE id = ?", questionId);
  publish(ctx.spaceId, { type: "question", actorId: userId });
}

export function answerQuestion(userId: string, questionId: string, body: string) {
  const ctx = requireSpace(userId);
  const question = one<{ id: string }>("SELECT id FROM questions WHERE id = ? AND space_id = ?", questionId, ctx.spaceId);
  if (!question) throw new HttpError(404, "That isn't here anymore.", "NOT_FOUND");
  const existing = one<{ id: string }>("SELECT id FROM answers WHERE question_id = ? AND user_id = ?", questionId, userId);
  const now = Date.now();
  if (existing) {
    run("UPDATE answers SET body = ?, updated_at = ? WHERE id = ?", body, now, existing.id);
    publish(ctx.spaceId, { type: "answer", actorId: userId });
  } else {
    run(
      `INSERT INTO answers (id, question_id, space_id, user_id, body, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      crypto.randomUUID(),
      questionId,
      ctx.spaceId,
      userId,
      body,
      now,
      now,
    );
    notifyPartner(ctx, "answer");
  }
  const row = one<QuestionRow>("SELECT * FROM questions WHERE id = ?", questionId)!;
  const answers = loadAnswers(ctx.spaceId, [questionId]);
  return { question: toQuestion(row, answers, ctx.members, userId) };
}

type MemoryInput = {
  title: string;
  body: string | null;
  kind: string;
  occurredOn: string | null;
  linkUrl: string | null;
  linkTitle: string | null;
  place: string | null;
  file?: File | null;
};

export async function createMemory(userId: string, input: MemoryInput) {
  const ctx = requireSpace(userId);
  let linkUrl = input.linkUrl;
  if (linkUrl) linkUrl = parseHttpUrl(linkUrl);
  if (input.kind === "song" && !input.linkTitle && !input.title) {
    throw new HttpError(400, "Name the song.", "VALIDATION");
  }
  let stored: Awaited<ReturnType<typeof saveUpload>> | null = null;
  if (input.file instanceof File && input.file.size > 0) stored = await saveUpload(input.file, "image");
  const id = crypto.randomUUID();
  const mediaId = stored ? crypto.randomUUID() : null;
  const now = Date.now();
  try {
    tx(() => {
      if (stored && mediaId) {
        run(
          `INSERT INTO media (id, space_id, uploader_id, kind, mime, size, storage_name, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          mediaId,
          ctx.spaceId,
          userId,
          stored.kind,
          stored.mime,
          stored.size,
          stored.storageName,
          now,
        );
      }
      run(
        `INSERT INTO memories (id, space_id, author_id, author_name, title, body, kind, occurred_on, media_id, link_url, link_title, place, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        id,
        ctx.spaceId,
        userId,
        ctx.me.display_name,
        input.title,
        input.body,
        input.kind,
        input.occurredOn,
        mediaId,
        linkUrl,
        input.linkTitle,
        input.place,
        now,
      );
    });
  } catch (error) {
    if (stored) removeFiles([stored.storageName]);
    throw error;
  }
  notifyPartner(ctx, "memory");
  const row = one<MemoryRow>("SELECT * FROM memories WHERE id = ?", id)!;
  return { memory: toMemory(row, ctx.members, userId, []) };
}

export function deleteMemory(userId: string, memoryId: string) {
  const ctx = requireSpace(userId);
  const memory = one<{ author_id: string | null; media_id: string | null }>(
    "SELECT author_id, media_id FROM memories WHERE id = ? AND space_id = ?",
    memoryId,
    ctx.spaceId,
  );
  if (!memory) throw new HttpError(404, "That isn't here anymore.", "NOT_FOUND");
  if (memory.author_id !== userId) throw new HttpError(403, "You can only take back a memory you added.", "FORBIDDEN");
  let storage: string | null = null;
  tx(() => {
    if (memory.media_id) {
      storage = one<{ storage_name: string }>("SELECT storage_name FROM media WHERE id = ?", memory.media_id)?.storage_name ?? null;
    }
    run("DELETE FROM reactions WHERE space_id = ? AND target_type = 'memory' AND target_id = ?", ctx.spaceId, memoryId);
    run("DELETE FROM memories WHERE id = ?", memoryId);
    if (memory.media_id) run("DELETE FROM media WHERE id = ?", memory.media_id);
  });
  if (storage) removeFiles([storage]);
  publish(ctx.spaceId, { type: "memory", actorId: userId });
}

export function setPresence(userId: string, status: string) {
  const ctx = requireSpace(userId);
  if (!presenceById(status)) throw new HttpError(400, "That status isn't available.", "VALIDATION");
  const now = Date.now();
  run(
    `INSERT INTO presence (user_id, space_id, status, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET space_id = excluded.space_id, status = excluded.status, updated_at = excluded.updated_at`,
    userId,
    ctx.spaceId,
    status,
    now,
  );
  publish(ctx.spaceId, { type: "presence", actorId: userId });
  return { presence: presenceView(status, now) };
}

export function clearPresence(userId: string) {
  const ctx = requireSpace(userId);
  run("DELETE FROM presence WHERE user_id = ?", userId);
  publish(ctx.spaceId, { type: "presence", actorId: userId });
  return { presence: null };
}

export function getMediaForMember(userId: string, mediaId: string) {
  const ctx = requireSpace(userId);
  const media = one<{ storage_name: string; mime: string; size: number }>(
    "SELECT storage_name, mime, size FROM media WHERE id = ? AND space_id = ?",
    mediaId,
    ctx.spaceId,
  );
  if (!media) throw new HttpError(404, "That file isn't available.", "NOT_FOUND");
  return media;
}

export function hasSpace(userId: string) {
  return Boolean(getSpaceContext(userId));
}
