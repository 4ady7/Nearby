"use client";

import { colorHex } from "@/lib/constants";
import type { NoticeView, Person } from "@/lib/types";
import { api } from "@/lib/client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { softTime } from "@/lib/text";
import { Dialog, IconAsk, IconBook, IconNote, IconPair, IconQuiet } from "./ui";
import { SpaceStream } from "./stream";

const tabs = [
  { href: "/home", label: "Home", icon: IconPair },
  { href: "/moments", label: "Moments", icon: IconNote },
  { href: "/memories", label: "Memories", icon: IconBook },
  { href: "/questions", label: "Questions", icon: IconAsk },
];

export function Shell({
  me,
  notices,
  unread,
  children,
}: {
  me: Person;
  notices: NoticeView[];
  unread: number;
  children: React.ReactNode;
}) {
  const path = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [marking, setMarking] = useState(false);

  async function openNotices() {
    setOpen(true);
    if (!unread || marking) return;
    setMarking(true);
    try {
      await api("/api/notifications", { method: "POST", json: {} });
      router.refresh();
    } catch {
      /* the tray still shows what we have */
    } finally {
      setMarking(false);
    }
  }

  return (
    <div className="app-shell">
      <a className="skip" href="#main">
        Skip to content
      </a>
      <SpaceStream meId={me.id} />
      <header className="topbar">
        <Link href="/home" className="brand">
          Between
        </Link>
        <div className="top-actions">
          <button type="button" className="icon-btn bell" aria-label={unread ? "Notices, something is waiting" : "Notices"} onClick={openNotices}>
            <IconQuiet />
            {unread > 0 ? <span className="quiet-dot" /> : null}
          </button>
          <Link
            href="/settings"
            className="avatar"
            style={{ background: colorHex(me.color) }}
            aria-label={`You, ${me.displayName}, settings`}
            aria-current={path === "/settings" ? "page" : undefined}
          >
            {me.initial}
          </Link>
        </div>
      </header>
      <main id="main" className="page">
        {children}
      </main>
      <nav className="tabbar" aria-label="Primary">
        {tabs.map((tab) => {
          const current = path === tab.href;
          const Icon = tab.icon;
          const homeWaiting = tab.href === "/home" && unread > 0;
          return (
            <Link key={tab.href} href={tab.href} aria-current={current ? "page" : undefined} aria-label={homeWaiting ? "Home, something is waiting" : tab.label}>
              <Icon filled={current} />
              <span>{tab.label}</span>
              {homeWaiting ? <span className="tab-dot" /> : null}
            </Link>
          );
        })}
      </nav>
      <Dialog open={open} title="Waiting" onClose={() => setOpen(false)}>
        {notices.length === 0 ? (
          <p className="lede">Nothing is waiting. When something is left for you, it will show up here quietly.</p>
        ) : (
          <div>
            {notices.map((notice) => (
              <Link key={notice.id} href={notice.targetPath || "/home"} className={notice.read ? "notice read" : "notice"} onClick={() => setOpen(false)}>
                <strong>{notice.title}</strong>
                <span>{notice.body}</span>
                <span className="fine">{softTime(notice.createdAt)}</span>
              </Link>
            ))}
          </div>
        )}
      </Dialog>
    </div>
  );
}
