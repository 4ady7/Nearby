"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

export function SpaceStream({ meId }: { meId: string }) {
  const router = useRouter();
  useEffect(() => {
    let source: EventSource | null = null;
    let stopped = false;
    let retry = 0;
    let refreshTimer = 0;
    const refresh = () => {
      window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(() => router.refresh(), 400);
    };
    const connect = () => {
      source = new EventSource("/api/stream");
      source.onmessage = (event) => {
        refresh();
        if (document.visibilityState !== "hidden") return;
        if (window.localStorage.getItem("between:device-alerts") !== "on") return;
        if (!("Notification" in window) || Notification.permission !== "granted") return;
        try {
          const data = JSON.parse(event.data) as { actorId?: string; type?: string };
          if (!data.actorId || data.actorId === meId) return;
          if (data.type === "presence" || data.type === "reaction" || data.type === "profile") return;
          new Notification("Between", {
            body: "Something is waiting for you.",
            tag: "between",
            silent: true,
          });
        } catch {
          /* ignore malformed events */
        }
      };
      source.onerror = () => {
        source?.close();
        if (!stopped) retry = window.setTimeout(connect, 4000);
      };
    };
    connect();
    const onVisible = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      source?.close();
      window.clearTimeout(retry);
      window.clearTimeout(refreshTimer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [meId, router]);
  return null;
}
