"use client";

import { MEMORY_KINDS, memoryKindLabel } from "@/lib/constants";
import { ApiError, api } from "@/lib/client";
import type { Cursor, MemoryView } from "@/lib/types";
import { formatDay, hostFromUrl } from "@/lib/text";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ReactionBar } from "./pieces";
import { Dialog, EmptyState } from "./ui";

export function MemoriesView({ memories, next }: { memories: MemoryView[]; next: Cursor | null }) {
  const [open, setOpen] = useState(false);
  const [extra, setExtra] = useState<MemoryView[]>([]);
  const [cursor, setCursor] = useState(next);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const first = memories[0]?.id ?? "";

  useEffect(() => {
    setExtra([]);
    setCursor(next);
  }, [first, next]);

  const all = [...memories, ...extra.filter((item) => !memories.some((memory) => memory.id === item.id))];

  async function earlier() {
    if (!cursor || pending) return;
    setPending(true);
    setError(null);
    try {
      const page = await api<{ items: MemoryView[]; next: Cursor | null }>(
        `/api/memories?before=${cursor.createdAt}&beforeId=${cursor.id}`,
      );
      setExtra((current) => [...current, ...page.items]);
      setCursor(page.next);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Couldn't load earlier memories.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="stack loose">
      <header>
        <p className="eyebrow">Memories</p>
        <h1>Worth keeping</h1>
        <p className="lede">A private scrapbook. Places, jokes, songs, days. Not a feed.</p>
      </header>
      <button type="button" className="btn" onClick={() => setOpen(true)}>
        Add to the scrapbook
      </button>
      {all.length === 0 ? (
        <EmptyState title="The scrapbook is still blank." body="Save a place, an inside joke, a song, or a day you don't want to lose." />
      ) : (
        <div className="scrap">
          {all.map((memory, index) => (
            <MemoryCard key={memory.id} memory={memory} wide={index === 0} />
          ))}
        </div>
      )}
      {cursor ? (
        <button type="button" className="btn secondary" onClick={earlier} disabled={pending}>
          {pending ? "Loading…" : "Show earlier"}
        </button>
      ) : null}
      {error ? (
        <p className="alert" role="alert">
          {error}
        </p>
      ) : null}
      <MemoryForm open={open} onClose={() => setOpen(false)} />
    </div>
  );
}

function MemoryCard({ memory, wide }: { memory: MemoryView; wide: boolean }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      await api(`/api/memories/${memory.id}`, { method: "DELETE" });
      setConfirm(false);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "That memory stayed.");
    } finally {
      setPending(false);
    }
  }

  return (
    <article className={wide ? "card polaroid wide" : "card polaroid"}>
      <p className="kind">{memoryKindLabel(memory.kind)}</p>
      {memory.mediaUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="media" src={memory.mediaUrl} alt={memory.title} />
      ) : null}
      <h3 className={memory.kind === "joke" ? "quote" : undefined}>{memory.title}</h3>
      {memory.place ? <p className="fine">{memory.place}</p> : null}
      {memory.occurredOn ? <p className="fine">{formatDay(memory.occurredOn)}</p> : null}
      {memory.body ? <p>{memory.body}</p> : null}
      {memory.linkUrl ? (
        <a href={memory.linkUrl} target="_blank" rel="noopener noreferrer">
          {memory.linkTitle || hostFromUrl(memory.linkUrl)}
        </a>
      ) : null}
      <p className="fine">{memory.mine ? "You kept this" : `${memory.authorName} kept this`}</p>
      <ReactionBar targetType="memory" targetId={memory.id} reactions={memory.reactions} />
      {memory.mine ? (
        <button type="button" className="btn quiet small" onClick={() => setConfirm(true)}>
          Remove
        </button>
      ) : null}
      {error ? (
        <p className="alert" role="alert">
          {error}
        </p>
      ) : null}
      <Dialog open={confirm} title="Remove this memory?" onClose={() => setConfirm(false)}>
        <p className="lede">It leaves the scrapbook for both of you.</p>
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

function MemoryForm({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [kind, setKind] = useState("moment");
  const [occurredOn, setOccurredOn] = useState("");
  const [place, setPlace] = useState("");
  const [linkTitle, setLinkTitle] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
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
      if (file) {
        const form = new FormData();
        form.set("title", title.trim());
        form.set("kind", kind);
        if (body.trim()) form.set("body", body.trim());
        if (occurredOn) form.set("occurredOn", occurredOn);
        if (place.trim()) form.set("place", place.trim());
        if (linkTitle.trim()) form.set("linkTitle", linkTitle.trim());
        if (linkUrl.trim()) form.set("linkUrl", linkUrl.trim());
        form.set("file", file);
        await api("/api/memories", { method: "POST", body: form, idempotencyKey: key.current });
      } else {
        await api("/api/memories", {
          method: "POST",
          idempotencyKey: key.current,
          json: {
            title: title.trim(),
            body: body.trim() || null,
            kind,
            occurredOn: occurredOn || null,
            place: place.trim() || null,
            linkTitle: linkTitle.trim() || null,
            linkUrl: linkUrl.trim() || null,
          },
        });
      }
      key.current = null;
      setTitle("");
      setBody("");
      setPlace("");
      setLinkTitle("");
      setLinkUrl("");
      setFile(null);
      onClose();
      router.refresh();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "That didn't save. It's still in the form.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} title="Keep something" onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        <label className="field">
          <span>What kind</span>
          <select value={kind} onChange={(event) => setKind(event.target.value)}>
            {MEMORY_KINDS.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Title</span>
          <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={80} required />
        </label>
        <label className="field">
          <span>A note</span>
          <textarea value={body} onChange={(event) => setBody(event.target.value)} maxLength={2000} />
        </label>
        <label className="field">
          <span>Date, if it has one</span>
          <input type="date" value={occurredOn} onChange={(event) => setOccurredOn(event.target.value)} />
        </label>
        {kind === "place" ? (
          <label className="field">
            <span>Place</span>
            <input value={place} onChange={(event) => setPlace(event.target.value)} maxLength={80} />
          </label>
        ) : null}
        {kind === "song" ? (
          <>
            <label className="field">
              <span>Song</span>
              <input value={linkTitle} onChange={(event) => setLinkTitle(event.target.value)} maxLength={120} />
            </label>
            <label className="field">
              <span>Link</span>
              <input type="url" value={linkUrl} onChange={(event) => setLinkUrl(event.target.value)} placeholder="https://" />
            </label>
          </>
        ) : null}
        <label className="field">
          <span>Photo, if you want</span>
          <input
            type="file"
            accept="image/*"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
        </label>
        {error ? (
          <p className="alert" role="alert">
            {error}
          </p>
        ) : null}
        <button className="btn" type="submit" disabled={pending || !title.trim()}>
          {pending ? "Saving…" : "Keep it"}
        </button>
      </form>
    </Dialog>
  );
}
