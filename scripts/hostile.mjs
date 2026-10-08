/**
 * Adversarial checks against a running Between server.
 * Usage: node scripts/hostile.mjs
 */
const base = process.env.BETWEEN_URL || "http://127.0.0.1:3000";
const origin = new URL(base).origin;
const stamp = Date.now().toString(36);
const results = [];

function record(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
}

function jar() {
  const cookies = new Map();
  return {
    header() {
      return [...cookies].map(([k, v]) => `${k}=${v}`).join("; ");
    },
    take(res) {
      for (const line of res.headers.getSetCookie?.() || []) {
        const [pair] = line.split(";");
        const i = pair.indexOf("=");
        const name = pair.slice(0, i).trim();
        const value = pair.slice(i + 1);
        if (!value) cookies.delete(name);
        else cookies.set(name, value);
      }
    },
  };
}

async function call(store, path, init = {}) {
  const headers = new Headers(init.headers || {});
  if (init.origin !== false) headers.set("origin", init.origin || origin);
  const cookie = store?.header?.() || "";
  if (cookie) headers.set("cookie", cookie);
  const res = await fetch(base + path, { ...init, headers });
  store?.take?.(res);
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { status: res.status, data, text };
}

async function signup(name, color = "clay") {
  const store = jar();
  const email = `${name}-${stamp}@between.test`;
  const password = "correct horse battery";
  const res = await call(store, "/api/auth/sign-up", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password, displayName: name, color }),
  });
  if (res.status !== 200 && res.status !== 201) {
    throw new Error(`signup ${name} ${res.status} ${res.text}`);
  }
  return { store, email, password, user: res.data.user, recovery: res.data.recoveryCode };
}

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

async function main() {
  const health = await call(null, "/api/health");
  record("health", health.status === 200, String(health.status));

  const rateStatuses = [];
  for (let i = 0; i < 9; i++) {
    const attempt = await call(null, "/api/auth/sign-in", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": `10.8.8.${i}` },
      body: JSON.stringify({ email: "rate-probe@between.test", password: "wrong-password" }),
    });
    rateStatuses.push(attempt.status);
  }
  record(
    "sign-in limit ignores spoofed client address",
    rateStatuses.slice(0, 8).every((status) => status === 401) && rateStatuses[8] === 429,
    rateStatuses.join(","),
  );

  const blocked = await call(null, "/api/auth/sign-in", {
    method: "POST",
    origin: "https://evil.example",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "a@b.co", password: "whatever" }),
  });
  record("csrf origin mismatch", blocked.status === 403, String(blocked.status));

  const noOrigin = await call(null, "/api/auth/sign-in", {
    method: "POST",
    origin: false,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "a@b.co", password: "whatever" }),
  });
  record("csrf missing origin", noOrigin.status === 403, String(noOrigin.status));

  const badSignup = await call(jar(), "/api/auth/sign-up", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "not-an-email", password: "short", displayName: "   " }),
  });
  record("signup validation", badSignup.status === 400, String(badSignup.status));

  const ada = await signup("Ada", "sage");
  const bea = await signup("Bea", "rose");
  const cy = await signup("Cy", "sea");

  const dup = await call(jar(), "/api/auth/sign-up", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: ada.email, password: ada.password, displayName: "Ada", color: "clay" }),
  });
  record("duplicate email", dup.status === 409, String(dup.status));

  const space = await call(ada.store, "/api/space", {
    method: "POST",
    headers: { "content-type": "application/json", "idempotency-key": `space-${stamp}` },
    body: "{}",
  });
  record("create space", space.status === 200 || space.status === 201, String(space.status));
  const code = space.data?.code;

  const again = await call(ada.store, "/api/space", {
    method: "POST",
    headers: { "content-type": "application/json", "idempotency-key": `space2-${stamp}` },
    body: "{}",
  });
  record("second space rejected", again.status === 409, String(again.status));

  const parallelSpaces = await Promise.all(
    [1, 2].map((n) =>
      call(bea.store, "/api/space", {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": `bea-space-${n}-${stamp}` },
        body: "{}",
      }),
    ),
  );
  const spaceWins = parallelSpaces.filter((r) => r.status === 200 || r.status === 201).length;
  record("parallel create space is one membership", spaceWins === 1, `wins=${spaceWins} statuses=${parallelSpaces.map((r) => r.status).join(",")}`);

  await call(bea.store, "/api/space", {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ confirm: "CLOSE" }),
  });

  const joined = await call(bea.store, "/api/space/join", {
    method: "POST",
    headers: { "content-type": "application/json", "idempotency-key": `join-${stamp}` },
    body: JSON.stringify({ code: code.toLowerCase() }),
  });
  record("join lowercase code", joined.status === 200, `${joined.status} ${joined.text}`);

  const rejoin = await call(bea.store, "/api/space/join", {
    method: "POST",
    headers: { "content-type": "application/json", "idempotency-key": `rejoin-${stamp}` },
    body: JSON.stringify({ code }),
  });
  record("used code rejected", rejoin.status === 400 || rejoin.status === 409, String(rejoin.status));

  const outsider = await call(cy.store, "/api/space/join", {
    method: "POST",
    headers: { "content-type": "application/json", "idempotency-key": `cyjoin-${stamp}` },
    body: JSON.stringify({ code }),
  });
  record("third person rejected", outsider.status === 400 || outsider.status === 409, String(outsider.status));

  const homeA = await call(ada.store, "/api/home");
  const homeB = await call(bea.store, "/api/home");
  record("both see each other", homeA.data?.partner?.displayName === "Bea" && homeB.data?.partner?.displayName === "Ada", `${homeA.status}/${homeB.status}`);
  record("invite closed after join", !homeA.data?.invite, JSON.stringify(homeA.data?.invite ?? null));

  const burst = await Promise.all(
    Array.from({ length: 8 }, (_, i) =>
      call(ada.store, "/api/signals", {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": `sig-${stamp}-${i}` },
        body: JSON.stringify({ preset: "hug" }),
      }),
    ),
  );
  const created = burst.filter((r) => r.data?.created === true).length;
  const okBurst = burst.filter((r) => r.status === 200 || r.status === 201).length;
  record("parallel identical signals collapse to one", created === 1 && okBurst === 8, `created=${created} ok=${okBurst} statuses=${burst.map((r) => r.status).join(",")}`);

  const moment = await call(bea.store, "/api/moments", {
    method: "POST",
    headers: { "content-type": "application/json", "idempotency-key": `note-${stamp}` },
    body: JSON.stringify({ kind: "note", body: "hello <script>alert(1)</script> 🌙" }),
  });
  record("note stored", moment.status === 201 || moment.status === 200, String(moment.status));
  const momentId = moment.data?.moment?.id;

  const jsLink = await call(ada.store, "/api/moments", {
    method: "POST",
    headers: { "content-type": "application/json", "idempotency-key": `js-${stamp}` },
    body: JSON.stringify({ kind: "link", linkUrl: "javascript:alert(1)", linkTitle: "nope" }),
  });
  record("javascript url rejected", jsLink.status === 400, String(jsLink.status));

  const credLink = await call(ada.store, "/api/moments", {
    method: "POST",
    headers: { "content-type": "application/json", "idempotency-key": `cred-${stamp}` },
    body: JSON.stringify({ kind: "link", linkUrl: "https://user:pass@example.com/a" }),
  });
  record("credential url rejected", credLink.status === 400, String(credLink.status));

  const longNote = await call(ada.store, "/api/moments", {
    method: "POST",
    headers: { "content-type": "application/json", "idempotency-key": `long-${stamp}` },
    body: JSON.stringify({ kind: "note", body: "a".repeat(5000) }),
  });
  record("overlong note rejected", longNote.status === 400, String(longNote.status));

  const blank = await call(ada.store, "/api/moments", {
    method: "POST",
    headers: { "content-type": "application/json", "idempotency-key": `blank-${stamp}` },
    body: JSON.stringify({ kind: "note", body: "   \n  " }),
  });
  record("blank note rejected", blank.status === 400, String(blank.status));

  const replay = await call(bea.store, "/api/moments", {
    method: "POST",
    headers: { "content-type": "application/json", "idempotency-key": `note-${stamp}` },
    body: JSON.stringify({ kind: "note", body: "a different note" }),
  });
  const afterReplay = await call(bea.store, "/api/moments");
  const copies = (afterReplay.data?.items || []).filter((item) => item.id === momentId).length;
  record("idempotent replay returns the same note", replay.data?.moment?.id === momentId && copies === 1, `idMatch=${replay.data?.moment?.id === momentId} copies=${copies}`);

  const stolen = await call(cy.store, "/api/moments");
  record("outsider cannot list this space moments", stolen.status === 409 || stolen.status === 401, String(stolen.status));

  const crossDelete = await call(ada.store, `/api/moments/${momentId}`, { method: "DELETE" });
  record("cannot delete partner moment", crossDelete.status === 403, String(crossDelete.status));

  const missing = await call(ada.store, `/api/moments/${crypto.randomUUID()}`, { method: "DELETE" });
  record("missing moment is 404", missing.status === 404, String(missing.status));

  const form = new FormData();
  form.set("kind", "photo");
  form.set("file", new File([png], "dot.png", { type: "image/png" }));
  const uploaded = await call(bea.store, "/api/moments", {
    method: "POST",
    headers: { "idempotency-key": `png-${stamp}` },
    body: form,
  });
  const mediaId = String(uploaded.data?.moment?.mediaUrl || "").split("/").pop() || "";
  record("png upload", (uploaded.status === 201 || uploaded.status === 200) && Boolean(mediaId), `${uploaded.status} media=${mediaId}`);

  const svg = new FormData();
  svg.set("kind", "photo");
  svg.set("file", new File(["<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>"], "x.svg", { type: "image/svg+xml" }));
  const svgRes = await call(ada.store, "/api/moments", {
    method: "POST",
    headers: { "idempotency-key": `svg-${stamp}` },
    body: svg,
  });
  record("svg rejected", svgRes.status === 400, String(svgRes.status));

  if (mediaId) {
    const own = await call(bea.store, `/api/media/${mediaId}`);
    const other = await call(cy.store, `/api/media/${mediaId}`);
    const adaOk = await call(ada.store, `/api/media/${mediaId}`);
    record("member can fetch media", own.status === 200, String(own.status));
    record("partner can fetch media", adaOk.status === 200, String(adaOk.status));
    record("outsider media blocked", other.status === 404 || other.status === 409, String(other.status));
  }

  const reactions = await Promise.all(
    ["❤️", "😂", "🥹"].map((emoji, i) =>
      call(ada.store, "/api/reactions", {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": `react-${stamp}-${i}` },
        body: JSON.stringify({ targetType: "moment", targetId: momentId, emoji }),
      }),
    ),
  );
  const reactionFails = reactions.filter((r) => r.status >= 500).length;
  const listed = await call(ada.store, "/api/moments");
  const target = listed.data?.items?.find((item) => item.id === momentId);
  const mine = (target?.reactions || []).filter((r) => r.mine);
  record("parallel reactions do not 500 and leave one of mine", reactionFails === 0 && mine.length <= 1, `500s=${reactionFails} mine=${mine.length} statuses=${reactions.map((r) => r.status).join(",")}`);

  const crossReact = await call(cy.store, "/api/reactions", {
    method: "POST",
    headers: { "content-type": "application/json", "idempotency-key": `xreact-${stamp}` },
    body: JSON.stringify({ targetType: "moment", targetId: momentId, emoji: "🔥" }),
  });
  record("cross-space reaction blocked", crossReact.status === 404 || crossReact.status === 409, String(crossReact.status));

  const question = await call(ada.store, "/api/questions", {
    method: "POST",
    headers: { "content-type": "application/json", "idempotency-key": `q-${stamp}` },
    body: JSON.stringify({ source: "custom", prompt: "Where tonight?", category: "hypothetical" }),
  });
  const questionId = question.data?.question?.id;
  record("question created", Boolean(questionId), String(question.status));

  const hidden = await call(bea.store, `/api/questions/${questionId}/answer`, {
    method: "POST",
    headers: { "content-type": "application/json", "idempotency-key": `ansb-${stamp}` },
    body: JSON.stringify({ body: "the river" }),
  });
  const adaQuestions = await call(ada.store, "/api/questions");
  const hiddenQ = adaQuestions.data?.items?.find((q) => q.id === questionId);
  const leaked = JSON.stringify(hiddenQ || {}).includes("the river");
  record("answer hidden until you answer", hiddenQ?.theyAnswered === true && hiddenQ?.theirAnswer == null && !leaked, `they=${hiddenQ?.theyAnswered} leak=${leaked}`);

  const answers = await Promise.all(
    ["lanterns", "market", "home"].map((body, i) =>
      call(ada.store, `/api/questions/${questionId}/answer`, {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": `ansa-${stamp}-${i}` },
        body: JSON.stringify({ body }),
      }),
    ),
  );
  const answer500 = answers.filter((r) => r.status >= 500).length;
  const after = await call(ada.store, "/api/questions");
  const revealed = after.data?.items?.find((q) => q.id === questionId);
  record("parallel answers do not 500", answer500 === 0 && Boolean(revealed?.myAnswer?.body), `500s=${answer500} body=${revealed?.myAnswer?.body}`);
  record("partner answer revealed after yours", revealed?.theirAnswer?.body === "the river", revealed?.theirAnswer?.body || "missing");

  const bidi = await call(ada.store, "/api/me", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ displayName: "Ada\u202Ebea", color: "sage" }),
  });
  const bidiName = bidi.data?.user?.displayName || "";
  record("bidi override stripped from name", !bidiName.includes("\u202E"), JSON.stringify(bidiName));

  const sessionB = jar();
  const sign2 = await call(sessionB, "/api/auth/sign-in", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: ada.email, password: ada.password }),
  });
  record("second session", sign2.status === 200, String(sign2.status));
  const changed = await call(ada.store, "/api/me/password", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ currentPassword: ada.password, nextPassword: "correct horse battery!" }),
  });
  ada.password = "correct horse battery!";
  const oldSession = await call(sessionB, "/api/me");
  const currentSession = await call(ada.store, "/api/me");
  record("password change keeps current session", currentSession.status === 200, String(currentSession.status));
  record("password change drops other sessions", oldSession.status === 401, String(oldSession.status));

  const meCy = await call(cy.store, "/api/notifications");
  const leakedNotice = JSON.stringify(meCy.data || {}).includes("Ada") || JSON.stringify(meCy.data || {}).includes("the river");
  record("outsider notices stay empty of this space", !leakedNotice, meCy.text.slice(0, 180));

  await call(bea.store, "/api/space", {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ confirm: "LEAVE" }),
  });
  const beaNotices = await call(bea.store, "/api/notifications");
  const stale = (beaNotices.data?.notices || []).some((n) => /Ada|feeling|question|waiting/i.test(`${n.title} ${n.body}`));
  record("leaving clears your old notices", !stale, JSON.stringify(beaNotices.data?.notices || []).slice(0, 240));
  const beaHome = await call(bea.store, "/api/home");
  record("leaver loses space access", beaHome.status === 409, String(beaHome.status));
  const adaStill = await call(ada.store, "/api/moments");
  record("remaining person keeps the moment", (adaStill.data?.items || []).some((item) => item.id === momentId), `count=${adaStill.data?.items?.length}`);

  const own = await call(ada.store, "/api/moments", {
    method: "POST",
    headers: { "content-type": "application/json", "idempotency-key": `own-${stamp}` },
    body: JSON.stringify({ kind: "note", body: "mine to remove" }),
  });
  const ownId = own.data?.moment?.id;
  const ownForm = new FormData();
  ownForm.set("kind", "photo");
  ownForm.set("file", new File([png], "mine.png", { type: "image/png" }));
  const ownPhoto = await call(ada.store, "/api/moments", {
    method: "POST",
    headers: { "idempotency-key": `ownpng-${stamp}` },
    body: ownForm,
  });
  const ownMedia = String(ownPhoto.data?.moment?.mediaUrl || "").split("/").pop() || "";
  await call(ada.store, `/api/moments/${ownId}`, { method: "DELETE" });
  if (ownMedia) await call(ada.store, `/api/moments/${ownPhoto.data?.moment?.id}`, { method: "DELETE" });
  const gone = await call(ada.store, "/api/moments");
  record("deleted moment stays deleted", ownId && !(gone.data?.items || []).some((item) => item.id === ownId));
  if (ownMedia) {
    const mediaGone = await call(ada.store, `/api/media/${ownMedia}`);
    record("deleted media stays gone", mediaGone.status === 404, String(mediaGone.status));
  }

  const signedOut = await call(ada.store, "/api/auth/sign-out", { method: "POST" });
  const afterOut = await call(ada.store, "/api/home");
  record("sign out", signedOut.status === 200 && afterOut.status === 401, `${signedOut.status}/${afterOut.status}`);

  const badCookie = jar();
  badCookie.take(new Response(null, { headers: { "set-cookie": "between_session=not-a-real-session; Path=/" } }));
  const bogus = await call(badCookie, "/api/me");
  record("bogus session is 401", bogus.status === 401, String(bogus.status));

  for (const person of [ada, bea, cy]) {
    const fresh = jar();
    await call(fresh, "/api/auth/sign-in", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: person.email, password: person.password }),
    });
    await call(fresh, "/api/me", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: person.password, confirm: "DELETE" }),
    });
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (failed.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
