const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function randomFromAlphabet(length: number) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < length; i++) out += ALPHABET[bytes[i]! % ALPHABET.length];
  return out;
}

export function formatCode(code: string) {
  const raw = normalizeCode(code);
  if (raw.length !== 8) return raw;
  return `${raw.slice(0, 4)}-${raw.slice(4)}`;
}

export function normalizeCode(input: string) {
  return input.toUpperCase().replace(/[^A-Z2-9]/g, "");
}

export function initial(name: string) {
  const chars = Array.from(name.trim());
  const first = chars[0] ?? "?";
  return first.toLocaleUpperCase();
}

export function cleanText(input: string) {
  return input.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").replace(/\r\n/g, "\n");
}

export function hostFromUrl(value: string) {
  try {
    return new URL(value).host.replace(/^www\./, "");
  } catch {
    return "";
  }
}

export function safeNext(value: string | undefined | null) {
  if (!value) return null;
  if (!value.startsWith("/")) return null;
  if (value.startsWith("//") || value.startsWith("/\\")) return null;
  if (value.includes("://") || value.startsWith("/api")) return null;
  if (value.length > 200) return null;
  return value;
}

export function softTime(ts: number, now = Date.now()) {
  const d = new Date(ts);
  const n = new Date(now);
  if (d.toDateString() === n.toDateString()) {
    const h = d.getHours();
    if (h < 5) return "late night";
    if (h < 12) return "this morning";
    if (h < 17) return "this afternoon";
    if (h < 21) return "this evening";
    return "tonight";
  }
  const yesterday = new Date(n);
  yesterday.setDate(n.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "yesterday";
  if (now - ts < 7 * 86_400_000) {
    return d.toLocaleDateString(undefined, { weekday: "long" });
  }
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export function dayLabel(ts: number, now = Date.now()) {
  const d = new Date(ts);
  const n = new Date(now);
  if (d.toDateString() === n.toDateString()) return "Today";
  const yesterday = new Date(n);
  yesterday.setDate(n.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString(undefined, {
    day: "numeric",
    month: "long",
    year: d.getFullYear() === n.getFullYear() ? undefined : "numeric",
  });
}

export function formatDay(iso: string | null) {
  if (!iso) return "";
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return iso;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return date.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
}

export function expiresLabel(ts: number, now = Date.now()) {
  const days = Math.ceil((ts - now) / 86_400_000);
  if (days <= 0) return "Expired";
  if (days === 1) return "Expires within a day";
  return `Expires in ${days} days`;
}

export function presenceFreshness(updatedAt: number, now = Date.now()): "now" | "earlier" | "stale" {
  const age = now - updatedAt;
  if (age > 48 * 3_600_000) return "stale";
  if (age > 12 * 3_600_000) return "earlier";
  return "now";
}

export function pairTitle(a: string, b: string | null) {
  if (!b) return a;
  return `${a} & ${b}`;
}
