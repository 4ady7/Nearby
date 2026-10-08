import { z } from "zod";
import {
  COLORS,
  LIMITS,
  MEMORY_KINDS,
  MOMENT_KINDS,
  PRESENCE,
  QUESTION_CATEGORIES,
  REACTIONS,
  SIGNALS,
} from "./constants";
import { cleanText } from "./text";

const colorIds = COLORS.map((c) => c.id) as [string, ...string[]];
const signalIds = SIGNALS.map((s) => s.id) as [string, ...string[]];
const presenceIds = PRESENCE.map((p) => p.id) as [string, ...string[]];
const momentKinds = [...MOMENT_KINDS] as [string, ...string[]];
const memoryKinds = MEMORY_KINDS.map((k) => k.id) as [string, ...string[]];
const categories = QUESTION_CATEGORIES.map((c) => c.id) as [string, ...string[]];
const reactions = [...REACTIONS] as [string, ...string[]];

function text(max: number, message: string) {
  return z
    .string()
    .transform((value) => cleanText(value).trim())
    .pipe(z.string().min(1, message).max(max, "That's a little long."));
}

function optionalText(max: number) {
  return z
    .string()
    .nullish()
    .transform((value) => {
      if (value == null) return null;
      const cleaned = cleanText(value).trim();
      return cleaned.length ? cleaned : null;
    })
    .pipe(z.string().max(max, "That's a little long.").nullable());
}

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email("Use a real email address.")
  .max(254, "That email is too long.");

export const passwordSchema = z
  .string()
  .min(8, "Use at least 8 characters.")
  .max(LIMITS.password, "That password is too long.")
  .refine((value) => value.trim().length >= 8, "Use at least 8 characters.");

export const nameSchema = z
  .string()
  .transform((value) => cleanText(value).replace(/\s+/g, " ").trim())
  .pipe(
    z
      .string()
      .min(1, "Add a name.")
      .max(LIMITS.name, "Keep the name a little shorter.")
      .refine((value) => !/[\u0000-\u001F\u007F]/.test(value), "That name has characters we can't use.")
      .refine((value) => !value.includes("\n"), "Keep the name on one line."),
  );

export const signUpSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  displayName: nameSchema,
  color: z.enum(colorIds).default("clay"),
});

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Enter your password.").max(LIMITS.password),
});

export const recoverSchema = z.object({
  email: emailSchema,
  code: z.string().trim().min(8, "Enter your recovery code.").max(40),
  password: passwordSchema,
});

export const profileSchema = z.object({
  displayName: nameSchema,
  color: z.enum(colorIds),
});

export const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1, "Enter your current password.").max(LIMITS.password),
  nextPassword: passwordSchema,
});

export const signalSchema = z.object({
  preset: z.enum(signalIds),
  note: optionalText(LIMITS.signalNote),
});

export const presenceSchema = z.object({
  status: z.enum(presenceIds),
});

export const reactionSchema = z.object({
  targetType: z.enum(["moment", "signal", "memory", "answer"]),
  targetId: z.string().uuid("That item isn't here."),
  emoji: z.enum(reactions),
});

export const seenSchema = z.object({
  items: z
    .array(
      z.object({
        type: z.enum(["moment", "signal"]),
        id: z.string().uuid(),
      }),
    )
    .max(30),
});

export const questionSchema = z.discriminatedUnion("source", [
  z.object({ source: z.literal("deck") }),
  z.object({
    source: z.literal("custom"),
    prompt: text(LIMITS.question, "Write the question."),
    category: z.enum(categories).default("random"),
  }),
]);

export const answerSchema = z.object({
  body: text(LIMITS.answer, "Write an answer, even a short one."),
});

export const momentTextSchema = z.object({
  kind: z.enum(momentKinds),
  body: optionalText(LIMITS.momentBody),
  linkUrl: optionalText(LIMITS.url),
  linkTitle: optionalText(120),
  detail: optionalText(80),
  durationMs: z.number().int().min(0).max(70_000).nullish(),
});

export const memorySchema = z.object({
  title: text(LIMITS.memoryTitle, "Give it a small title."),
  body: optionalText(LIMITS.memoryBody),
  kind: z.enum(memoryKinds),
  occurredOn: z
    .string()
    .nullish()
    .transform((value) => {
      if (!value) return null;
      return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
    }),
  linkUrl: optionalText(LIMITS.url),
  linkTitle: optionalText(120),
  place: optionalText(80),
});

export const settingsSchema = z.object({
  notifySignals: z.boolean(),
  notifyMoments: z.boolean(),
  notifyQuestions: z.boolean(),
  notifyMemories: z.boolean(),
  notifyReactions: z.boolean(),
});

export const joinSchema = z.object({
  code: z.string().trim().min(4, "Enter the code.").max(20),
});

export const confirmSchema = z.object({
  confirm: z.string(),
  password: z.string().optional(),
});
