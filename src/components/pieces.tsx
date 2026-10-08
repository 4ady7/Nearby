"use client";

import { REACTIONS } from "@/lib/constants";
import { ApiError, api } from "@/lib/client";
import type { FeedItem, MomentView, ReactionView } from "@/lib/types";
import { hostFromUrl, softTime } from "@/lib/text";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Dialog } from "./ui";

export function ReactionBar({
  targetType,
  targetId,
  reactions,
}: {
  targetType: "moment" | "signal" | "memory" | "answer";
  targetId: string;
  reactions: ReactionView[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState(reactions);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  useEffect(() => {
    if (!busyRef.current) setCurrent(reactions);
  }, [reactions]);

  async function react(emoji: string) {
    if (busy) return;
    const previous = current;
    const mine = previous.find((item) => item.mine && item.emoji === emoji);
    setCurrent(
      mine
        ? previous.filter((item) => !(item.mine && item.emoji === emoji))
        : [...previous.filter((item) => !item.mine), { emoji, mine: true }],
    );
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await api<{ reactions: ReactionView[] }>("/api/reactions", {
        method: "POST",
        json: { targetType, targetId, emoji },
        idempotencyKey: crypto.randomUUID(),
      });
      setCurrent(result.reactions);
      router.refresh();
    } catch (caught) {
      setCurrent(previous);
      setError(caught instanceof ApiError ? caught.message : "That reaction didn't land.");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="react-line">
        {current.map((item) => (
          <span key={item.emoji} className={item.mine ? "shown mine" : "shown"} aria-label={item.mine ? `You reacted ${item.emoji}` : item.emoji}>
            {item.emoji}
          </span>
        ))}
        <button type="button" className="btn quiet small" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
          React
        </button>
      </div>
      {open ? (
        <div className="emoji-row" role="group" aria-label="Choose a reaction">
          {REACTIONS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              aria-pressed={current.some((item) => item.mine && item.emoji === emoji)}
              aria-label={`React with ${emoji}`}
              disabled={busy}
              onClick={() => react(emoji)}
            >
              {emoji}
            </button>
          ))}
        </div>
      ) : null}
      {error ? (
        <p className="alert" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function formatClock(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const rounded = Math.floor(seconds);
  return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, "0")}`;
}

export function AudioPlayer({ src }: { src: string }) {
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);

  function toggle() {
    const node = audio.current;
    if (!node) return;
    if (node.paused) {
      void node.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
    } else {
      node.pause();
      setPlaying(false);
    }
  }

  return (
    <div className="player">
      <button type="button" className="btn small" onClick={toggle} aria-label={playing ? "Pause voice note" : "Play voice note"}>
        {playing ? "Pause" : "Play"}
      </button>
      <input
        type="range"
        min={0}
        max={duration || 0}
        step={0.1}
        value={Math.min(time, duration || 0)}
        aria-label="Voice note position"
        onChange={(event) => {
          const next = Number(event.target.value);
          if (audio.current) audio.current.currentTime = next;
          setTime(next);
        }}
      />
      <span className="time">
        {formatClock(time)} / {formatClock(duration)}
      </span>
      <audio
        ref={audio}
        src={src}
        preload="metadata"
        onLoadedMetadata={(event) => setDuration(event.currentTarget.duration || 0)}
        onTimeUpdate={(event) => setTime(event.currentTarget.currentTime)}
        onEnded={() => setPlaying(false)}
      />
    </div>
  );
}

export function FeedCard({ item }: { item: FeedItem }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      await api(item.type === "signal" ? `/api/signals/${item.id}` : `/api/moments/${item.id}`, { method: "DELETE" });
      setConfirm(false);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "That didn't come back.");
    } finally {
      setPending(false);
    }
  }

  return (
    <article className="card">
      <p className="who">
        {item.mine ? "You" : item.authorName} · {softTime(item.createdAt)}
      </p>
      {item.type === "signal" ? (
        <div className="signal">
          <span className="emoji" aria-hidden="true">
            {item.emoji}
          </span>
          <div>
            <strong>{item.label}</strong>
            {item.note ? <p className="thought">{item.note}</p> : null}
          </div>
        </div>
      ) : (
        <MomentBody moment={item} />
      )}
      <ReactionBar targetType={item.type === "signal" ? "signal" : "moment"} targetId={item.id} reactions={item.reactions} />
      {item.mine ? (
        <button type="button" className="btn quiet small" onClick={() => setConfirm(true)}>
          Take it back
        </button>
      ) : null}
      {error ? (
        <p className="alert" role="alert">
          {error}
        </p>
      ) : null}
      <Dialog open={confirm} title="Take this back?" onClose={() => setConfirm(false)}>
        <p className="lede">It disappears for both of you.</p>
        <div className="row" style={{ marginTop: "1rem" }}>
          <button type="button" className="btn secondary" onClick={() => setConfirm(false)}>
            Keep it
          </button>
          <button type="button" className="btn danger" onClick={remove} disabled={pending}>
            {pending ? "Removing…" : "Remove"}
          </button>
        </div>
      </Dialog>
    </article>
  );
}

function MomentBody({ moment }: { moment: MomentView }) {
  if (moment.kind === "photo" || moment.kind === "drawing") {
    return (
      <>
        {moment.mediaUrl ? (
          // User media is private and served from an authenticated route.
          // eslint-disable-next-line @next/next/no-img-element
          <img className="media" src={moment.mediaUrl} alt={moment.body || (moment.kind === "drawing" ? "A drawing" : "A photo")} />
        ) : null}
        {moment.body ? <p className="body">{moment.body}</p> : null}
      </>
    );
  }
  if (moment.kind === "video" && moment.mediaUrl) {
    return (
      <>
        <video className="media video" src={moment.mediaUrl} controls preload="metadata" playsInline />
        {moment.body ? <p className="body">{moment.body}</p> : null}
      </>
    );
  }
  if (moment.kind === "voice" && moment.mediaUrl) {
    return (
      <>
        <AudioPlayer src={moment.mediaUrl} />
        {moment.body ? <p className="body">{moment.body}</p> : null}
      </>
    );
  }
  if (moment.kind === "song") {
    return (
      <>
        {moment.linkUrl ? (
          <a className="song-card" href={moment.linkUrl} target="_blank" rel="noopener noreferrer">
            <span className="fine">Song</span>
            <span className="title">{moment.linkTitle}</span>
            <span className="fine">{[moment.detail, hostFromUrl(moment.linkUrl)].filter(Boolean).join(" · ")}</span>
          </a>
        ) : (
          <div className="song-card">
            <span className="fine">Song</span>
            <span className="title">{moment.linkTitle}</span>
            {moment.detail ? <span className="fine">{moment.detail}</span> : null}
          </div>
        )}
        {moment.body ? <p className="body">{moment.body}</p> : null}
      </>
    );
  }
  if (moment.kind === "link" && moment.linkUrl) {
    return (
      <>
        <a className="link-card" href={moment.linkUrl} target="_blank" rel="noopener noreferrer">
          <span className="title">{moment.linkTitle || hostFromUrl(moment.linkUrl)}</span>
          <span className="fine">{hostFromUrl(moment.linkUrl)}</span>
        </a>
        {moment.body ? <p className="body">{moment.body}</p> : null}
      </>
    );
  }
  if (moment.kind === "thought") return <p className="thought">{moment.body}</p>;
  return <p className="body">{moment.body}</p>;
}

export function AnswerForm({
  questionId,
  initial = "",
  updatedAt = 0,
}: {
  questionId: string;
  initial?: string;
  updatedAt?: number;
}) {
  const router = useRouter();
  const storageKey = `between:answer:${questionId}`;
  const [value, setValue] = useState(initial);
  const [ready, setReady] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const key = useRef<string | null>(null);

  useEffect(() => {
    const raw = sessionStorage.getItem(storageKey);
    let draft: { body: string; at: number } | null = null;
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as { body?: string; at?: number };
        if (typeof parsed.body === "string") draft = { body: parsed.body, at: parsed.at ?? 0 };
      } catch {
        if (!initial) draft = { body: raw, at: 0 };
      }
    }
    if (draft && draft.at >= updatedAt) setValue(draft.body);
    else setValue(initial);
    setReady(true);
  }, [storageKey, initial, updatedAt]);

  useEffect(() => {
    if (!ready) return;
    if (value && value !== initial) sessionStorage.setItem(storageKey, JSON.stringify({ body: value, at: Date.now() }));
    else sessionStorage.removeItem(storageKey);
  }, [ready, storageKey, value, initial]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);
    if (!key.current) key.current = crypto.randomUUID();
    try {
      await api(`/api/questions/${questionId}/answer`, {
        method: "POST",
        json: { body: value },
        idempotencyKey: key.current,
      });
      key.current = null;
      sessionStorage.removeItem(storageKey);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "That didn't save. Your words are still here.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="stack" onSubmit={submit}>
      <label className="field">
        <span>Your answer</span>
        <textarea value={value} onChange={(event) => setValue(event.target.value)} maxLength={2000} required aria-invalid={error ? true : undefined} />
      </label>
      {error ? (
        <p className="alert" role="alert">
          {error}
        </p>
      ) : (
        <p className="hint">Whenever you feel like it. No need to match their length.</p>
      )}
      <button className="btn" type="submit" disabled={pending || !value.trim()}>
        {pending ? "Saving…" : initial ? "Update answer" : "Leave answer"}
      </button>
    </form>
  );
}
