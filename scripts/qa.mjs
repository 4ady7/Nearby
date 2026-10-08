const base = process.env.BASE || "http://127.0.0.1:3000";
const origin = new URL(base).origin;
let failed = 0;

function assert(condition, message) {
  if (!condition) {
    failed += 1;
    console.error("FAIL", message);
  } else {
    console.log("ok", message);
  }
}

function jar() {
  const cookies = new Map();
  return {
    async fetch(path, init = {}) {
      const headers = new Headers(init.headers);
      headers.set("origin", origin);
      const cookie = [...cookies.entries()].map(([key, value]) => `${key}=${value}`).join("; ");
      if (cookie) headers.set("cookie", cookie);
      const response = await fetch(base + path, { ...init, headers, redirect: "manual" });
      const setCookies = typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : [];
      for (const line of setCookies) {
        const [pair] = line.split(";");
        const index = pair.indexOf("=");
        if (index > 0) cookies.set(pair.slice(0, index).trim(), pair.slice(index + 1).trim());
      }
      return response;
    },
    clear() {
      cookies.clear();
    },
  };
}

async function json(response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return { raw: text };
  }
}

function post(path, body, key) {
  return {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(key ? { "idempotency-key": key } : {}),
    },
    body: JSON.stringify(body),
  };
}

const stamp = Date.now().toString(36);
const password = "correct horse battery";
const a = jar();
const b = jar();
const c = jar();

const health = await fetch(base + "/api/health");
assert(health.ok, "health");

const noOrigin = await fetch(base + "/api/auth/sign-in", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ email: "a@b.co", password: "12345678" }),
});
assert(noOrigin.status === 403, "mutation without origin is blocked");

const badSignup = await json(await a.fetch("/api/auth/sign-up", post("/api/auth/sign-up", { email: "nope", password: "short", displayName: "" })));
assert(badSignup?.error?.code === "VALIDATION", "signup validation");

const signupA = await json(
  await a.fetch(
    "/api/auth/sign-up",
    post("/api/auth/sign-up", {
      email: `a-${stamp}@between.test`,
      password,
      displayName: "Ava ✨",
      color: "sage",
    }),
  ),
);
assert(signupA?.recoveryCode && signupA.user.displayName === "Ava ✨", "signup A");

const dup = await a.fetch(
  "/api/auth/sign-up",
  post("/api/auth/sign-up", { email: `a-${stamp}@between.test`, password, displayName: "Ava", color: "clay" }),
);
assert(dup.status === 409, "duplicate email");

const me = await json(await a.fetch("/api/me"));
assert(me.user.email === `a-${stamp}@between.test` && me.user.hasSpace === false, "me");

const space = await json(await a.fetch("/api/space", post("/api/space", {}, `space-${stamp}`)));
assert(space.code && space.code.includes("-"), "create space");
const again = await a.fetch("/api/space", post("/api/space", {}, `space-again-${stamp}`));
assert(again.status === 409, "second space blocked");

const signupB = await json(
  await b.fetch(
    "/api/auth/sign-up",
    post("/api/auth/sign-up", { email: `b-${stamp}@between.test`, password, displayName: "Bea", color: "dusk" }),
  ),
);
assert(signupB.user.displayName === "Bea", "signup B");

const badJoin = await json(await b.fetch("/api/space/join", post("/api/space/join", { code: "ZZZZ-ZZZZ" }, `bad-join-${stamp}`)));
assert(badJoin.error?.message?.includes("doesn't match"), "bad invite");

const joined = await json(await b.fetch("/api/space/join", post("/api/space/join", { code: space.code.toLowerCase() }, `join-${stamp}`)));
assert(joined.ok === true, "join with lowercase code");
const rejoin = await b.fetch("/api/space/join", post("/api/space/join", { code: space.code }, `rejoin-${stamp}`));
assert(rejoin.status === 409, "cannot join twice");

const signupC = await json(
  await c.fetch(
    "/api/auth/sign-up",
    post("/api/auth/sign-up", { email: `c-${stamp}@between.test`, password, displayName: "Cleo", color: "rose" }),
  ),
);
assert(signupC.user, "signup C");
const full = await c.fetch("/api/space/join", post("/api/space/join", { code: space.code }, `full-${stamp}`));
assert(full.status === 400, "third person cannot join");

const homeA = await json(await a.fetch("/api/home"));
const homeB = await json(await b.fetch("/api/home"));
assert(homeA.partner.displayName === "Bea" && homeB.partner.displayName === "Ava ✨", "both see each other");
assert(homeA.invite === null, "invite closes after join");

const signalKey = `sig-${stamp}`;
const signal = await json(await a.fetch("/api/signals", post("/api/signals", { preset: "thinking" }, signalKey)));
assert(signal.signal?.label === "Thinking of you" && signal.created === true, "signal");
const signalAgain = await json(await a.fetch("/api/signals", post("/api/signals", { preset: "thinking" }, signalKey)));
assert(signalAgain.signal.id === signal.signal.id, "idempotent signal");
const dupSignal = await json(await a.fetch("/api/signals", post("/api/signals", { preset: "thinking" }, `sig2-${stamp}`)));
assert(dupSignal.created === false && dupSignal.signal.id === signal.signal.id, "rapid duplicate signal collapsed");

const homeAfter = await json(await b.fetch("/api/home"));
assert(homeAfter.waiting.some((item) => item.type === "signal" && item.id === signal.signal.id), "partner sees waiting signal");
const notices = await json(await b.fetch("/api/notifications"));
assert(notices.notices.some((item) => item.body.includes("Ava")), "partner notified without the private wording of a chat");

const xss = "<script>alert(1)</script>";
const note = await json(
  await a.fetch("/api/moments", post("/api/moments", { kind: "note", body: xss }, `note-${stamp}`)),
);
assert(note.moment.body === xss, "text is stored, not executed");
const long = await a.fetch("/api/moments", post("/api/moments", { kind: "note", body: "x".repeat(5000) }, `long-${stamp}`));
assert(long.status === 400, "overlong note rejected");
const badLink = await a.fetch(
  "/api/moments",
  post("/api/moments", { kind: "link", linkUrl: "javascript:alert(1)", body: "nope" }, `js-${stamp}`),
);
assert(badLink.status === 400, "javascript url rejected");

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);
const form = new FormData();
form.set("kind", "photo");
form.set("body", "a tiny photo");
form.set("file", new Blob([png], { type: "image/png" }), "dot.png");
const photo = await json(
  await a.fetch("/api/moments", { method: "POST", headers: { "idempotency-key": `photo-${stamp}` }, body: form }),
);
assert(photo.moment?.mediaUrl?.startsWith("/api/media/"), "photo upload");
const media = await a.fetch(photo.moment.mediaUrl);
assert(media.ok && media.headers.get("content-type") === "image/png", "owner can read media");
const stolen = await c.fetch(photo.moment.mediaUrl);
assert(stolen.status === 404 || stolen.status === 409, "outsider cannot read media");
const svg = new FormData();
svg.set("kind", "photo");
svg.set("file", new Blob(["<svg xmlns='http://www.w3.org/2000/svg'></svg>"], { type: "image/svg+xml" }), "x.svg");
const svgRes = await a.fetch("/api/moments", { method: "POST", headers: { "idempotency-key": `svg-${stamp}` }, body: svg });
assert(svgRes.status === 400, "svg upload rejected");

const reacted = await json(
  await b.fetch(
    "/api/reactions",
    post("/api/reactions", { targetType: "moment", targetId: note.moment.id, emoji: "❤️" }, `react-${stamp}`),
  ),
);
assert(reacted.reactions.some((item) => item.emoji === "❤️"), "reaction");
const cleared = await json(
  await b.fetch(
    "/api/reactions",
    post("/api/reactions", { targetType: "moment", targetId: note.moment.id, emoji: "❤️" }, `react-off-${stamp}`),
  ),
);
assert(!cleared.reactions.some((item) => item.mine && item.emoji === "❤️"), "reaction toggles off");
const foreignReact = await c.fetch(
  "/api/reactions",
  post("/api/reactions", { targetType: "moment", targetId: note.moment.id, emoji: "🔥" }, `foreign-${stamp}`),
);
assert(foreignReact.status === 404 || foreignReact.status === 409, "cannot react across spaces");

await c.fetch("/api/space", post("/api/space", {}, `c-space-${stamp}`));
const cMoments = await json(await c.fetch("/api/moments"));
assert(!JSON.stringify(cMoments).includes(note.moment.id), "other space cannot list these moments");

const drawn = await json(await a.fetch("/api/questions", post("/api/questions", { source: "deck" }, `q-${stamp}`)));
assert(drawn.question.prompt.length > 8, "deck question");
const answerB = await json(
  await b.fetch(`/api/questions/${drawn.question.id}/answer`, post(`/api/questions/${drawn.question.id}/answer`, { body: "secret answer from bea" }, `ans-b-${stamp}`)),
);
assert(answerB.question.myAnswer.body.includes("bea"), "B sees own answer");
const peek = await json(await a.fetch("/api/questions"));
const hidden = peek.items.find((item) => item.id === drawn.question.id);
assert(hidden.theyAnswered === true && hidden.theirAnswer === null, "answer stays hidden until you answer");
assert(!JSON.stringify(hidden).includes("secret answer from bea"), "hidden answer is not in the payload");
const answerA = await json(
  await a.fetch(`/api/questions/${drawn.question.id}/answer`, post(`/api/questions/${drawn.question.id}/answer`, { body: "mine" }, `ans-a-${stamp}`)),
);
assert(answerA.question.theirAnswer.body.includes("secret answer"), "answer reveals after you answer");

const memory = await json(
  await b.fetch(
    "/api/memories",
    post(
      "/api/memories",
      { title: "The rainy Tuesday", body: "We stayed in.", kind: "moment", occurredOn: "2024-03-02" },
      `mem-${stamp}`,
    ),
  ),
);
assert(memory.memory.title === "The rainy Tuesday", "memory");
const aMemories = await json(await a.fetch("/api/memories"));
assert(aMemories.items.some((item) => item.id === memory.memory.id), "partner sees memory");

const presence = await json(await a.fetch("/api/presence", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ status: "quiet" }) }));
assert(presence.presence.label === "Need some quiet", "presence");
const seenPresence = await json(await b.fetch("/api/home"));
assert(seenPresence.partner.presence.status === "quiet", "partner sees presence");

const delOther = await b.fetch(`/api/moments/${note.moment.id}`, { method: "DELETE" });
assert(delOther.status === 403, "cannot delete partner moment");
const del = await a.fetch(`/api/moments/${photo.moment.id}`, { method: "DELETE" });
assert(del.status === 200, "delete own moment");
const gone = await a.fetch(photo.moment.mediaUrl);
assert(gone.status === 404, "deleted media is gone");

const garbage = jar();
const expired = await garbage.fetch("/api/me", { headers: { cookie: "between_session=not-a-real-session" } });
assert(expired.status === 401, "bad session");

await b.fetch("/api/auth/sign-out", post("/api/auth/sign-out", {}));
const signedOut = await b.fetch("/api/me");
assert(signedOut.status === 401, "sign out");
const back = await json(await b.fetch("/api/auth/sign-in", post("/api/auth/sign-in", { email: `b-${stamp}@between.test`, password })));
assert(back.user.hasSpace === true, "sign in again");
const wrong = await b.fetch("/api/auth/sign-in", post("/api/auth/sign-in", { email: `b-${stamp}@between.test`, password: "wrong-password-1" }));
assert(wrong.status === 401, "wrong password");

const left = await json(await b.fetch("/api/space", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ confirm: "LEAVE" }) }));
assert(left.closed === false, "leave space");
const lockedOut = await b.fetch("/api/moments");
assert(lockedOut.status === 409, "leaver loses access");
const stillThere = await json(await a.fetch("/api/moments"));
assert(stillThere.items.some((item) => item.body === xss), "shared moment remains for the other person");

const closed = await json(await a.fetch("/api/space", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ confirm: "CLOSE" }) }));
assert(closed.closed === true, "close empty space");

const recovered = await json(
  await c.fetch("/api/auth/recover", post("/api/auth/recover", { email: `c-${stamp}@between.test`, code: signupC.recoveryCode, password: "a-new-password" })),
);
assert(recovered.ok === true, "recovery code");
c.clear();
const oldPass = await c.fetch("/api/auth/sign-in", post("/api/auth/sign-in", { email: `c-${stamp}@between.test`, password }));
assert(oldPass.status === 401, "old password dies after recovery");
const newPass = await c.fetch("/api/auth/sign-in", post("/api/auth/sign-in", { email: `c-${stamp}@between.test`, password: "a-new-password" }));
assert(newPass.status === 200, "new password works");

const removed = await json(
  await c.fetch("/api/me", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ confirm: "DELETE", password: "a-new-password" }) }),
);
assert(removed.ok === true, "delete account");

await a.fetch("/api/auth/sign-in", post("/api/auth/sign-in", { email: `a-${stamp}@between.test`, password }));
const deletedA = await a.fetch("/api/me", {
  method: "DELETE",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ confirm: "DELETE", password }),
});
assert(deletedA.status === 200, "cleanup A");
await b.fetch("/api/auth/sign-in", post("/api/auth/sign-in", { email: `b-${stamp}@between.test`, password }));
const deletedB = await b.fetch("/api/me", {
  method: "DELETE",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ confirm: "DELETE", password }),
});
assert(deletedB.status === 200, "cleanup B");

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log("\nAll QA checks passed");
