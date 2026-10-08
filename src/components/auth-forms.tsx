"use client";

import { COLORS } from "@/lib/constants";
import { ApiError, api } from "@/lib/client";
import type { MeResponse } from "@/lib/types";
import { safeNext } from "@/lib/text";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { CodeLine } from "./ui";

export function SignInForm({ next, expired }: { next?: string | null; expired?: boolean }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const result = await api<{ user: MeResponse }>("/api/auth/sign-in", {
        method: "POST",
        json: { email, password },
      });
      router.push(safeNext(next) || (result.user.hasSpace ? "/home" : "/start"));
      router.refresh();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Couldn't sign in.");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="auth">
      <p className="eyebrow">Between</p>
      <h1>Welcome back.</h1>
      {expired ? <p className="lede">Your session ended. Sign in again.</p> : <p className="lede">The space is still there.</p>}
      <form className="stack" onSubmit={submit}>
        <label className="field">
          <span>Email</span>
          <input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
        </label>
        <label className="field">
          <span>Password</span>
          <input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
        </label>
        {error ? <p className="alert" role="alert">{error}</p> : null}
        <button className="btn" type="submit" disabled={pending}>
          {pending ? "Signing in…" : "Sign in"}
        </button>
      </form>
      <p>
        <Link href="/recover">Lost your password</Link>
      </p>
      <p>
        New here? <Link href={next ? `/sign-up?next=${encodeURIComponent(next)}` : "/sign-up"}>Begin</Link>
      </p>
    </main>
  );
}

export function SignUpForm({ next }: { next?: string | null }) {
  const router = useRouter();
  const [displayName, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [color, setColor] = useState("clay");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const existing = sessionStorage.getItem("between:recovery");
    if (existing) setCode(existing);
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const result = await api<{ recoveryCode: string; user: MeResponse }>("/api/auth/sign-up", {
        method: "POST",
        json: { displayName, email, password, color },
      });
      sessionStorage.setItem("between:recovery", result.recoveryCode);
      setCode(result.recoveryCode);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Couldn't create the account. Try again.");
    } finally {
      setPending(false);
    }
  }

  function continueOn() {
    sessionStorage.removeItem("between:recovery");
    router.push(safeNext(next) || "/start");
    router.refresh();
  }

  if (code) {
    return (
      <main className="auth">
        <p className="eyebrow">Save this once</p>
        <h1>Your recovery code</h1>
        <p className="lede">If you ever lose your password, this is the way back. It won't be shown again.</p>
        <CodeLine value={code} label="Recovery code" />
        <button
          type="button"
          className="btn secondary"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(code);
            } catch {
              setError("Select the code and copy it.");
            }
          }}
        >
          Copy code
        </button>
        <label className="row" style={{ alignItems: "flex-start" }}>
          <input type="checkbox" checked={saved} onChange={(event) => setSaved(event.target.checked)} />
          <span>I've saved this code somewhere only I can find.</span>
        </label>
        {error ? <p className="alert" role="alert">{error}</p> : null}
        <button type="button" className="btn" disabled={!saved} onClick={continueOn}>
          Continue
        </button>
      </main>
    );
  }

  return (
    <main className="auth">
      <p className="eyebrow">Between</p>
      <h1>Make it yours.</h1>
      <p className="lede">A name, an email, a password. Then a space for two.</p>
      <form className="stack" onSubmit={submit}>
        <label className="field">
          <span>Your name</span>
          <input autoComplete="name" value={displayName} onChange={(event) => setName(event.target.value)} maxLength={32} required />
        </label>
        <label className="field">
          <span>Email</span>
          <input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
        </label>
        <label className="field">
          <span>Password</span>
          <input type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={8} required />
        </label>
        <div className="field">
          <span className="field-label">A color</span>
          <div className="colors" role="group" aria-label="Your color">
            {COLORS.map((item) => (
              <button
                key={item.id}
                type="button"
                className="swatch"
                style={{ background: item.hex }}
                aria-label={item.id}
                aria-pressed={color === item.id}
                onClick={() => setColor(item.id)}
              />
            ))}
          </div>
        </div>
        {error ? <p className="alert" role="alert">{error}</p> : null}
        <button className="btn" type="submit" disabled={pending}>
          {pending ? "Creating…" : "Create account"}
        </button>
      </form>
      <p>
        Already have one? <Link href={next ? `/sign-in?next=${encodeURIComponent(next)}` : "/sign-in"}>Sign in</Link>
      </p>
    </main>
  );
}

export function RecoverForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      await api("/api/auth/recover", { method: "POST", json: { email, code, password } });
      router.push("/home");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Couldn't reset the password.");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="auth">
      <p className="eyebrow">Between</p>
      <h1>Use your recovery code.</h1>
      <p className="lede">The one you saved when you joined. Then choose a new password.</p>
      <form className="stack" onSubmit={submit}>
        <label className="field">
          <span>Email</span>
          <input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
        </label>
        <label className="field">
          <span>Recovery code</span>
          <input value={code} onChange={(event) => setCode(event.target.value)} autoComplete="off" spellCheck={false} required />
        </label>
        <label className="field">
          <span>New password</span>
          <input type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={8} required />
        </label>
        {error ? <p className="alert" role="alert">{error}</p> : null}
        <button className="btn" type="submit" disabled={pending}>
          {pending ? "Updating…" : "Set new password"}
        </button>
      </form>
      <p>
        <Link href="/sign-in">Back to sign in</Link>
      </p>
    </main>
  );
}
