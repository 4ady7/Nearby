"use client";

import { PRESENCE, SIGNALS, categoryLabel, colorHex, memoryKindLabel } from "@/lib/constants";
import { ApiError, api } from "@/lib/client";
import type { FeedItem, HomePayload } from "@/lib/types";
import { expiresLabel, formatDay, pairTitle } from "@/lib/text";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { AnswerForm, FeedCard } from "./pieces";
import { CodeLine, Dialog, EmptyState } from "./ui";

export function HomeView({ data }: { data: HomePayload }) {
  const [held, setHeld] = useState<FeedItem[]>(data.waiting);
  const seenKey = data.waiting.map((item) => item.id).join(",");

  useEffect(() => {
    const all = new Map([...data.waiting, ...data.recent].map((item) => [`${item.type}:${item.id}`, item]));
    setHeld((current) => {
      const kept = current
        .filter((item) => all.has(`${item.type}:${item.id}`))
        .map((item) => all.get(`${item.type}:${item.id}`)!);
      const known = new Set(kept.map((item) => item.id));
      const fresh = data.waiting.filter((item) => !known.has(item.id));
      return [...fresh, ...kept].slice(0, 6);
    });
  }, [data]);

  const waitingRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!seenKey) return;
    const node = waitingRef.current;
    if (!node) return;
    let timer: number | undefined;
    const mark = () => {
      const items = seenKey.split(",").filter(Boolean).map((id) => {
        const match = data.waiting.find((item) => item.id === id);
        return match ? { type: match.type, id: match.id } : null;
      }).filter((item): item is { type: "moment" | "signal"; id: string } => Boolean(item));
      if (!items.length) return;
      void api("/api/seen", { method: "POST", json: { items } }).catch(() => undefined);
    };
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.some((entry) => entry.isIntersecting && entry.intersectionRatio >= 0.35);
      if (!visible) {
        if (timer) window.clearTimeout(timer);
        timer = undefined;
        return;
      }
      if (timer) return;
      timer = window.setTimeout(mark, 4000);
    }, { threshold: [0.35] });
    observer.observe(node);
    return () => {
      observer.disconnect();
      if (timer) window.clearTimeout(timer);
    };
  }, [seenKey, data.waiting]);

  const heldIds = new Set(held.map((item) => item.id));
  const recent = data.recent.filter((item) => !heldIds.has(item.id));
  const title = pairTitle(data.me.displayName, data.partner?.displayName ?? null);

  return (
    <div className="stack loose">
      <header>
        <p className="eyebrow">Your space</p>
        <h1>{data.partner ? title : "This space is ready."}</h1>
        <p className="lede">
          {data.partner
            ? "A little world, just yours. Nothing here needs a reply."
            : "Share the code with one person. Only they can join."}
        </p>
        <PresenceRow data={data} />
      </header>

      {data.partner ? <SignalBar /> : <InvitePanel invite={data.invite} />}

      {data.partner && held.length > 0 ? (
        <section className="section" aria-label="Left for you" ref={waitingRef}>
          <p className="section-label">Left for you</p>
          {held.map((item) => (
            <FeedCard key={`${item.type}-${item.id}`} item={item} />
          ))}
        </section>
      ) : null}

      {data.partner && held.length === 0 && recent.length === 0 && !data.question && !data.memory ? (
        <EmptyState
          title="It's quiet. That's allowed."
          body="Leave a feeling, a photo, or a question whenever something small crosses your mind."
        />
      ) : null}

      {data.question ? <QuestionPeek question={data.question} /> : null}
      {data.memory ? (
        <section className="section">
          <div className="between">
            <p className="section-label">From the scrapbook</p>
            <Link href="/memories">Open</Link>
          </div>
          <article className="card">
            <p className="kind fine">{memoryKindLabel(data.memory.kind)}</p>
            <h2>{data.memory.title}</h2>
            {data.memory.occurredOn ? <p className="fine">{formatDay(data.memory.occurredOn)}</p> : null}
            {data.memory.body ? <p className="thought">{data.memory.body}</p> : null}
          </article>
        </section>
      ) : null}

      {recent.length > 0 ? (
        <section className="section">
          <div className="between">
            <p className="section-label">Already here</p>
            <Link href="/moments">Moments</Link>
          </div>
          {recent.map((item) => (
            <FeedCard key={`${item.type}-${item.id}`} item={item} />
          ))}
        </section>
      ) : null}
    </div>
  );
}

function PresenceRow({ data }: { data: HomePayload }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mine = data.myPresence && data.myPresence.freshness !== "stale" ? data.myPresence : null;
  const partnerPresence = data.partner?.presence && data.partner.presence.freshness !== "stale" ? data.partner.presence : null;

  async function choose(status: string | null) {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      if (status) await api("/api/presence", { method: "PUT", json: { status } });
      else await api("/api/presence", { method: "DELETE" });
      setOpen(false);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "That didn't update.");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <div className="presence-line">
        <button type="button" className="pill" onClick={() => setOpen(true)}>
          <span className="dot" style={{ background: colorHex(data.me.color) }} />
          {mine ? `${mine.emoji} ${mine.label}` : "Set a status"}
          {mine?.freshness === "earlier" ? " · earlier" : ""}
        </button>
        {data.partner ? (
          <p className="pill static">
            <span className="dot" style={{ background: colorHex(data.partner.color) }} />
            {data.partner.displayName}
            {partnerPresence ? ` · ${partnerPresence.emoji} ${partnerPresence.label}` : ""}
            {partnerPresence?.freshness === "earlier" ? " · earlier" : ""}
          </p>
        ) : null}
      </div>
      <Dialog open={open} title="How are you?" onClose={() => setOpen(false)}>
        <p className="lede">This is just a note you set yourself. It isn't tracking.</p>
        <div className="choice-grid" style={{ marginTop: "0.9rem" }}>
          {PRESENCE.map((item) => (
            <button key={item.id} type="button" className="choice" disabled={pending} onClick={() => choose(item.id)} aria-pressed={mine?.status === item.id}>
              <strong>
                {item.emoji} {item.label}
              </strong>
            </button>
          ))}
        </div>
        {mine ? (
          <button type="button" className="btn quiet" style={{ marginTop: "0.6rem" }} disabled={pending} onClick={() => choose(null)}>
            Clear status
          </button>
        ) : null}
        {error ? (
          <p className="alert" role="alert">
            {error}
          </p>
        ) : null}
      </Dialog>
    </>
  );
}

function SignalBar() {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [thoughtOpen, setThoughtOpen] = useState(false);
  const [songOpen, setSongOpen] = useState(false);
  const keys = useRef<Record<string, string>>({});

  async function send(preset: string) {
    if (pending) return;
    setPending(preset);
    setError(null);
    if (!keys.current[preset]) keys.current[preset] = crypto.randomUUID();
    try {
      await api("/api/signals", {
        method: "POST",
        json: { preset },
        idempotencyKey: keys.current[preset],
      });
      delete keys.current[preset];
      setMessage("Left for them. No reply needed.");
      router.refresh();
    } catch (caught) {
      setMessage(null);
      setError(caught instanceof ApiError ? caught.message : "That didn't send. Try again.");
    } finally {
      setPending(null);
    }
  }

  return (
    <section className="section" aria-label="Leave a signal">
      <p className="section-label">Leave a signal</p>
      <div className="signal-scroller">
        {SIGNALS.map((signal) => (
          <button
            key={signal.id}
            type="button"
            className="chip"
            aria-busy={pending === signal.id}
            disabled={Boolean(pending)}
            onClick={() => send(signal.id)}
          >
            <span className="emoji" aria-hidden="true">
              {signal.emoji}
            </span>
            <span>{signal.label}</span>
          </button>
        ))}
        <button type="button" className="chip" onClick={() => setThoughtOpen(true)}>
          <span className="emoji" aria-hidden="true">
            🧠
          </span>
          <span>Random thought</span>
        </button>
        <button type="button" className="chip" onClick={() => setSongOpen(true)}>
          <span className="emoji" aria-hidden="true">
            🎧
          </span>
          <span>Listen to this</span>
        </button>
      </div>
      <p className="status" role="status">
        {message}
      </p>
      {error ? (
        <p className="alert" role="alert">
          {error}
        </p>
      ) : null}
      <QuickMoment open={thoughtOpen} mode="thought" onClose={() => setThoughtOpen(false)} />
      <QuickMoment open={songOpen} mode="song" onClose={() => setSongOpen(false)} />
    </section>
  );
}

function QuickMoment({ open, mode, onClose }: { open: boolean; mode: "thought" | "song"; onClose: () => void }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [url, setUrl] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const key = useRef<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);
    if (!key.current) key.current = crypto.randomUUID();
    try {
      await api("/api/moments", {
        method: "POST",
        idempotencyKey: key.current,
        json:
          mode === "thought"
            ? { kind: "thought", body }
            : { kind: "song", linkTitle: title, detail: artist || null, linkUrl: url || null, body: body || null },
      });
      key.current = null;
      setBody("");
      setTitle("");
      setArtist("");
      setUrl("");
      onClose();
      router.refresh();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "That didn't send. It's still here.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} title={mode === "thought" ? "A passing thought" : "Listen to this"} onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        {mode === "song" ? (
          <>
            <label className="field">
              <span>Song</span>
              <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} required />
            </label>
            <label className="field">
              <span>Artist, if you want</span>
              <input value={artist} onChange={(event) => setArtist(event.target.value)} maxLength={80} />
            </label>
            <label className="field">
              <span>Link, if you have one</span>
              <input type="url" inputMode="url" value={url} onChange={(event) => setUrl(event.target.value)} maxLength={500} placeholder="https://" />
            </label>
          </>
        ) : null}
        <label className="field">
          <span>{mode === "thought" ? "The thought" : "A note, if you want"}</span>
          <textarea value={body} onChange={(event) => setBody(event.target.value)} maxLength={mode === "thought" ? 280 : 2000} required={mode === "thought"} />
        </label>
        {error ? (
          <p className="alert" role="alert">
            {error}
          </p>
        ) : null}
        <button className="btn" type="submit" disabled={pending}>
          {pending ? "Leaving it…" : "Leave it"}
        </button>
      </form>
    </Dialog>
  );
}

function InvitePanel({ invite }: { invite: HomePayload["invite"] }) {
  const router = useRouter();
  const [copied, setCopied] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const raw = useMemo(() => invite?.code.replace(/-/g, "") ?? "", [invite]);

  async function copy(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
    } catch {
      setError("Select the code and copy it.");
    }
  }

  async function renew() {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      await api("/api/space/invite", { method: "POST", json: {}, idempotencyKey: crypto.randomUUID() });
      router.refresh();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Couldn't make a new code.");
    } finally {
      setPending(false);
    }
  }

  if (!invite) {
    return (
      <section className="card">
        <p>The last code expired.</p>
        <button type="button" className="btn" onClick={renew} disabled={pending}>
          {pending ? "Making a code…" : "Make a new code"}
        </button>
        {error ? (
          <p className="alert" role="alert">
            {error}
          </p>
        ) : null}
      </section>
    );
  }

  const link = typeof window !== "undefined" ? `${window.location.origin}/join/${raw}` : `/join/${raw}`;
  return (
    <section className="card" aria-label="Invite">
      <CodeLine value={invite.code} label={`Invite code ${invite.code.split("").join(" ")}`} />
      <p className="fine">{expiresLabel(invite.expiresAt)}. It stops working once someone joins.</p>
      <div className="row">
        <button type="button" className="btn" onClick={() => copy(invite.code, "Code copied")}>
          Copy code
        </button>
        <button type="button" className="btn secondary" onClick={() => copy(link, "Link copied")}>
          Copy link
        </button>
        <button type="button" className="btn quiet" onClick={renew} disabled={pending}>
          {pending ? "Making…" : "New code"}
        </button>
      </div>
      <p className="status" role="status">
        {copied}
      </p>
      {error ? (
        <p className="alert" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}

function QuestionPeek({ question }: { question: NonNullable<HomePayload["question"]> }) {
  return (
    <section className="section">
      <div className="between">
        <p className="section-label">{categoryLabel(question.category)}</p>
        <Link href="/questions">All questions</Link>
      </div>
      <article className="card">
        <h2>{question.prompt}</h2>
        <p className="fine">From {question.mine ? "you" : question.authorName}</p>
        {question.myAnswer && question.theirAnswer ? (
          <div className="answers">
            <div className="answer">
              <span className="fine">You</span>
              <p>{question.myAnswer.body}</p>
            </div>
            <div className="answer">
              <span className="fine">{question.theirAnswer.authorName}</span>
              <p>{question.theirAnswer.body}</p>
            </div>
          </div>
        ) : question.myAnswer ? (
          <div className="stack">
            <div className="answer">
              <span className="fine">You</span>
              <p>{question.myAnswer.body}</p>
            </div>
            <p className="hint">You answered. Theirs can arrive whenever.</p>
          </div>
        ) : (
          <div className="stack">
            {question.theyAnswered ? <p className="hint">They've answered. You'll see it after you do.</p> : null}
            <AnswerForm questionId={question.id} />
          </div>
        )}
      </article>
    </section>
  );
}
