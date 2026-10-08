"use client";

import { ApiError, api } from "@/lib/client";
import { formatCode } from "@/lib/text";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { CodeLine } from "./ui";

export function StartFlow({ name }: { name: string }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [pending, setPending] = useState<"create" | "join" | "out" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    if (pending) return;
    setPending("create");
    setError(null);
    try {
      await api("/api/space", { method: "POST", json: {}, idempotencyKey: crypto.randomUUID() });
      router.push("/home");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Couldn't open a space.");
      setPending(null);
    }
  }

  async function join(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    setPending("join");
    setError(null);
    try {
      await api("/api/space/join", { method: "POST", json: { code }, idempotencyKey: crypto.randomUUID() });
      router.push("/home");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Couldn't join.");
      setPending(null);
    }
  }

  return (
    <main className="auth">
      <p className="eyebrow">Between</p>
      <h1>Hello, {name}.</h1>
      <p className="lede">Open a space and invite one person, or join the one they already made.</p>
      <button type="button" className="btn" onClick={create} disabled={Boolean(pending)}>
        {pending === "create" ? "Opening…" : "Open a space"}
      </button>
      <form className="stack" onSubmit={join}>
        <label className="field">
          <span>Or join with a code</span>
          <input
            value={code}
            onChange={(event) => setCode(event.target.value.toUpperCase())}
            autoComplete="off"
            spellCheck={false}
            placeholder="ABCD-EFGH"
            aria-label="Invite code"
          />
        </label>
        <button className="btn secondary" type="submit" disabled={Boolean(pending) || code.trim().length < 4}>
          {pending === "join" ? "Joining…" : "Join"}
        </button>
      </form>
      {error ? <p className="alert" role="alert">{error}</p> : null}
      <button
        type="button"
        className="btn quiet"
        disabled={pending === "out"}
        onClick={async () => {
          setPending("out");
          try {
            await api("/api/auth/sign-out", { method: "POST", json: {} });
          } catch {
            /* leave anyway */
          }
          router.push("/");
          router.refresh();
        }}
      >
        Sign out
      </button>
    </main>
  );
}

export function JoinFlow({ code, already }: { code: string; already: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pretty = formatCode(code);

  async function join() {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      await api("/api/space/join", { method: "POST", json: { code }, idempotencyKey: crypto.randomUUID() });
      router.push("/home");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Couldn't join.");
      setPending(false);
    }
  }

  return (
    <main className="auth">
      <p className="eyebrow">Between</p>
      <h1>{already ? "You're already in a space." : "Join this space?"}</h1>
      <CodeLine value={pretty} label={`Invite code ${pretty}`} />
      <p className="lede">
        {already
          ? "Leave it from settings if you meant to join a different one."
          : "Once you join, this code stops working. The space belongs to the two of you."}
      </p>
      {already ? (
        <a className="btn" href="/home">
          Go to your space
        </a>
      ) : (
        <button type="button" className="btn" onClick={join} disabled={pending}>
          {pending ? "Joining…" : "Join"}
        </button>
      )}
      {error ? <p className="alert" role="alert">{error}</p> : null}
    </main>
  );
}
