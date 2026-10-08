"use client";

import { QUESTION_CATEGORIES, categoryLabel } from "@/lib/constants";
import { ApiError, api } from "@/lib/client";
import type { Cursor, QuestionView } from "@/lib/types";
import { softTime } from "@/lib/text";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AnswerForm } from "./pieces";
import { Dialog, EmptyState } from "./ui";

export function QuestionsView({ questions, next }: { questions: QuestionView[]; next: Cursor | null }) {
  const router = useRouter();
  const [extra, setExtra] = useState<QuestionView[]>([]);
  const [cursor, setCursor] = useState(next);
  const [writeOpen, setWriteOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const key = useRef<string | null>(null);
  const first = questions[0]?.id ?? "";

  useEffect(() => {
    setExtra([]);
    setCursor(next);
  }, [first, next]);

  const all = [...questions, ...extra.filter((item) => !questions.some((question) => question.id === item.id))];

  async function draw() {
    if (pending) return;
    setPending(true);
    setError(null);
    if (!key.current) key.current = crypto.randomUUID();
    try {
      await api("/api/questions", { method: "POST", json: { source: "deck" }, idempotencyKey: key.current });
      key.current = null;
      router.refresh();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Couldn't draw a question.");
    } finally {
      setPending(false);
    }
  }

  async function earlier() {
    if (!cursor || pending) return;
    setPending(true);
    setError(null);
    try {
      const page = await api<{ items: QuestionView[]; next: Cursor | null }>(
        `/api/questions?before=${cursor.createdAt}&beforeId=${cursor.id}`,
      );
      setExtra((current) => [...current, ...page.items]);
      setCursor(page.next);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Couldn't load earlier questions.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="stack loose">
      <header>
        <p className="eyebrow">Questions</p>
        <h1>Ask, whenever</h1>
        <p className="lede">A question can wait. Answer on your own time. You'll see theirs after you answer.</p>
      </header>
      <div className="row">
        <button type="button" className="btn" onClick={draw} disabled={pending}>
          {pending ? "Drawing…" : "Draw a question"}
        </button>
        <button type="button" className="btn secondary" onClick={() => setWriteOpen(true)}>
          Write your own
        </button>
      </div>
      {error ? (
        <p className="alert" role="alert">
          {error}
        </p>
      ) : null}
      {all.length === 0 ? (
        <EmptyState title="No questions yet." body="Draw one when you're curious, or write something only the two of you would ask." />
      ) : (
        all.map((question) => <QuestionCard key={question.id} question={question} />)
      )}
      {cursor ? (
        <button type="button" className="btn secondary" onClick={earlier} disabled={pending}>
          Show earlier
        </button>
      ) : null}
      <WriteQuestion open={writeOpen} onClose={() => setWriteOpen(false)} />
    </div>
  );
}

function QuestionCard({ question }: { question: QuestionView }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canDelete = question.mine && !question.myAnswer && !question.theyAnswered;

  async function remove() {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      await api(`/api/questions/${question.id}`, { method: "DELETE" });
      router.refresh();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "That question stayed.");
    } finally {
      setPending(false);
    }
  }

  return (
    <article className="card">
      <p className="fine">
        {categoryLabel(question.category)} · {question.mine ? "You" : question.authorName} · {softTime(question.createdAt)}
      </p>
      <h2>{question.prompt}</h2>
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
          <AnswerForm questionId={question.id} initial={question.myAnswer.body} updatedAt={question.myAnswer.updatedAt} />
        </div>
      ) : question.myAnswer ? (
        <div className="stack">
          <div className="answer">
            <span className="fine">You</span>
            <p>{question.myAnswer.body}</p>
          </div>
          <p className="hint">You answered. Theirs can arrive whenever.</p>
          <AnswerForm questionId={question.id} initial={question.myAnswer.body} updatedAt={question.myAnswer.updatedAt} />
        </div>
      ) : (
        <div className="stack">
          {question.theyAnswered ? <p className="hint">They've answered. You'll see it after you do.</p> : null}
          <AnswerForm questionId={question.id} />
        </div>
      )}
      {canDelete ? (
        <button type="button" className="btn quiet small" onClick={remove} disabled={pending}>
          {pending ? "Removing…" : "Take this question back"}
        </button>
      ) : null}
      {error ? (
        <p className="alert" role="alert">
          {error}
        </p>
      ) : null}
    </article>
  );
}

function WriteQuestion({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [category, setCategory] = useState("playful");
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
      await api("/api/questions", {
        method: "POST",
        json: { source: "custom", prompt, category },
        idempotencyKey: key.current,
      });
      key.current = null;
      setPrompt("");
      onClose();
      router.refresh();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "That didn't save. The question is still here.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} title="Your question" onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        <label className="field">
          <span>Question</span>
          <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} maxLength={280} required />
        </label>
        <label className="field">
          <span>Kind</span>
          <select value={category} onChange={(event) => setCategory(event.target.value)}>
            {QUESTION_CATEGORIES.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        {error ? (
          <p className="alert" role="alert">
            {error}
          </p>
        ) : null}
        <button className="btn" type="submit" disabled={pending || !prompt.trim()}>
          {pending ? "Leaving it…" : "Leave the question"}
        </button>
      </form>
    </Dialog>
  );
}
