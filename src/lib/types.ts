export type Person = {
  id: string;
  displayName: string;
  color: string;
  initial: string;
};

export type PresenceView = {
  status: string;
  label: string;
  emoji: string;
  updatedAt: number;
  freshness: "now" | "earlier" | "stale";
};

export type ReactionView = {
  emoji: string;
  mine: boolean;
};

export type SignalView = {
  type: "signal";
  id: string;
  preset: string;
  emoji: string;
  label: string;
  note: string | null;
  authorId: string | null;
  authorName: string;
  authorColor: string;
  createdAt: number;
  mine: boolean;
  reactions: ReactionView[];
};

export type MomentView = {
  type: "moment";
  id: string;
  kind: string;
  body: string | null;
  mediaUrl: string | null;
  mediaMime: string | null;
  linkUrl: string | null;
  linkTitle: string | null;
  detail: string | null;
  durationMs: number | null;
  authorId: string | null;
  authorName: string;
  authorColor: string;
  createdAt: number;
  mine: boolean;
  reactions: ReactionView[];
};

export type FeedItem = MomentView | SignalView;

export type AnswerView = {
  id: string;
  body: string;
  updatedAt: number;
  authorName: string;
};

export type QuestionView = {
  id: string;
  prompt: string;
  category: string;
  authorId: string | null;
  authorName: string;
  authorColor: string;
  mine: boolean;
  createdAt: number;
  myAnswer: AnswerView | null;
  theirAnswer: AnswerView | null;
  theyAnswered: boolean;
};

export type MemoryView = {
  id: string;
  title: string;
  body: string | null;
  kind: string;
  occurredOn: string | null;
  mediaUrl: string | null;
  linkUrl: string | null;
  linkTitle: string | null;
  place: string | null;
  authorId: string | null;
  authorName: string;
  authorColor: string;
  mine: boolean;
  createdAt: number;
  reactions: ReactionView[];
};

export type NoticeView = {
  id: string;
  kind: string;
  title: string;
  body: string;
  targetPath: string | null;
  createdAt: number;
  read: boolean;
};

export type SettingsView = {
  notifySignals: boolean;
  notifyMoments: boolean;
  notifyQuestions: boolean;
  notifyMemories: boolean;
  notifyReactions: boolean;
};

export type HomePayload = {
  me: Person;
  partner: (Person & { presence: PresenceView | null }) | null;
  myPresence: PresenceView | null;
  invite: { code: string; expiresAt: number } | null;
  waiting: FeedItem[];
  recent: FeedItem[];
  question: QuestionView | null;
  memory: MemoryView | null;
  unread: number;
};

export type Cursor = { createdAt: number; id: string };

export type MeResponse = {
  id: string;
  email: string;
  displayName: string;
  color: string;
  hasSpace: boolean;
};
