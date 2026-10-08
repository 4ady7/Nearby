export const COLORS = [
  { id: "clay", hex: "#c4543a", ink: "#8d3826" },
  { id: "sage", hex: "#4f7d62", ink: "#2d513d" },
  { id: "dusk", hex: "#6a628f", ink: "#3e3860" },
  { id: "honey", hex: "#b8883a", ink: "#6d4e16" },
  { id: "sea", hex: "#3d7480", ink: "#1e454d" },
  { id: "rose", hex: "#b85c74", ink: "#6e3142" },
] as const;

export type ColorId = (typeof COLORS)[number]["id"];

export function colorHex(id: string) {
  return COLORS.find((c) => c.id === id)?.hex ?? COLORS[0].hex;
}

export const SIGNALS = [
  { id: "thinking", emoji: "❤️", label: "Thinking of you" },
  { id: "here", emoji: "👋", label: "I'm here" },
  { id: "youd-like", emoji: "😂", label: "You'd like this" },
  { id: "battery", emoji: "🫠", label: "Social battery: 2%" },
  { id: "talk", emoji: "☕", label: "Want to talk" },
  { id: "sleep", emoji: "🌙", label: "Going to sleep" },
  { id: "good", emoji: "✨", label: "Something good happened" },
  { id: "miss", emoji: "🥹", label: "Miss you" },
  { id: "proud", emoji: "🌟", label: "Proud of you" },
  { id: "hug", emoji: "🤗", label: "Sending a hug" },
] as const;

export type SignalId = (typeof SIGNALS)[number]["id"];

export const PRESENCE = [
  { id: "thinking", label: "Thinking", emoji: "💭" },
  { id: "busy", label: "Busy", emoji: "⏳" },
  { id: "out", label: "Out and about", emoji: "🚶" },
  { id: "chilling", label: "Chilling", emoji: "☁️" },
  { id: "listening", label: "Listening to music", emoji: "🎧" },
  { id: "talk", label: "Come talk to me", emoji: "☕" },
  { id: "quiet", label: "Need some quiet", emoji: "🌙" },
] as const;

export type PresenceId = (typeof PRESENCE)[number]["id"];

export const REACTIONS = ["❤️", "😂", "🥹", "👀", "🔥", "😭", "✨", "👍"] as const;

export const MOMENT_KINDS = [
  "note",
  "photo",
  "video",
  "voice",
  "song",
  "link",
  "drawing",
  "thought",
] as const;

export type MomentKind = (typeof MOMENT_KINDS)[number];

export const MEMORY_KINDS = [
  { id: "photo", label: "Photo" },
  { id: "date", label: "A date" },
  { id: "moment", label: "A moment" },
  { id: "joke", label: "Inside joke" },
  { id: "place", label: "A place" },
  { id: "song", label: "A song" },
  { id: "event", label: "Something that happened" },
] as const;

export type MemoryKind = (typeof MEMORY_KINDS)[number]["id"];

export const QUESTION_CATEGORIES = [
  { id: "funny", label: "Funny" },
  { id: "romantic", label: "Romantic" },
  { id: "deep", label: "Deep" },
  { id: "random", label: "Random" },
  { id: "nostalgic", label: "Nostalgic" },
  { id: "hypothetical", label: "Hypothetical" },
  { id: "playful", label: "Playful" },
] as const;

export type QuestionCategory = (typeof QUESTION_CATEGORIES)[number]["id"];

export const SESSION_COOKIE = "between_session";
export const SESSION_DAYS = 45;
export const INVITE_DAYS = 7;

export const LIMITS = {
  momentBody: 2000,
  thought: 280,
  signalNote: 140,
  question: 280,
  answer: 2000,
  memoryTitle: 80,
  memoryBody: 2000,
  name: 32,
  password: 200,
  url: 500,
  image: 8_000_000,
  audio: 6_000_000,
  video: 16_000_000,
  json: 80_000,
};

export function signalById(id: string) {
  return SIGNALS.find((s) => s.id === id);
}

export function presenceById(id: string) {
  return PRESENCE.find((p) => p.id === id);
}

export function categoryLabel(id: string) {
  return QUESTION_CATEGORIES.find((c) => c.id === id)?.label ?? "Question";
}

export function memoryKindLabel(id: string) {
  return MEMORY_KINDS.find((k) => k.id === id)?.label ?? "Memory";
}
