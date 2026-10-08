"use client";

import type { Cursor, FeedItem, MomentView, SignalView } from "@/lib/types";
import { ApiError, api } from "@/lib/client";
import { dayLabel } from "@/lib/text";
import { useEffect, useState } from "react";
import { Composer } from "./composer";
import { FeedCard } from "./pieces";
import { EmptyState } from "./ui";

export function MomentsView({
  moments,
  signals,
  next,
}: {
  moments: MomentView[];
  signals: SignalView[];
  next: Cursor | null;
}) {
  const [open, setOpen] = useState(false);
  const [extra, setExtra] = useState<MomentView[]>([]);
  const [cursor, setCursor] = useState(next);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const first = moments[0]?.id ?? "";

  useEffect(() => {
    setExtra([]);
    setCursor(next);
  }, [first, next]);

  const momentItems = [...moments, ...extra.filter((item) => !moments.some((moment) => moment.id === item.id))];
  const all: FeedItem[] = [...momentItems, ...signals].sort((a, b) => b.createdAt - a.createdAt || b.id.localeCompare(a.id));
  const groups: { label: string; items: FeedItem[] }[] = [];
  for (const item of all) {
    const label = dayLabel(item.createdAt);
    const last = groups[groups.length - 1];
    if (!last || last.label !== label) groups.push({ label, items: [item] });
    else last.items.push(item);
  }

  async function earlier() {
    if (!cursor || pending) return;
    setPending(true);
    setError(null);
    try {
      const page = await api<{ items: MomentView[]; next: Cursor | null }>(
        `/api/moments?before=${cursor.createdAt}&beforeId=${cursor.id}`,
      );
      setExtra((current) => [...current, ...page.items]);
      setCursor(page.next);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Couldn't load earlier moments.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="stack loose">
      <header className="between">
        <div>
          <p className="eyebrow">Moments</p>
          <h1>Left for each other</h1>
        </div>
      </header>
      <p className="lede">A note, a photo, a song. It can sit here until they find it.</p>
      <button type="button" className="btn" onClick={() => setOpen(true)}>
        Leave something
      </button>
      {all.length === 0 ? (
        <EmptyState title="Nothing has been left yet." body="When you leave something, it waits here. A reply is optional." />
      ) : (
        groups.map((group) => (
          <section key={group.label} className="section" aria-label={group.label}>
            <p className="section-label">{group.label}</p>
            {group.items.map((item) => (
              <FeedCard key={`${item.type}-${item.id}`} item={item} />
            ))}
          </section>
        ))
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
      <Composer open={open} onClose={() => setOpen(false)} />
    </div>
  );
}
