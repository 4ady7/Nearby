"use client";

import { COLORS, colorHex } from "@/lib/constants";
import { ApiError, api } from "@/lib/client";
import type { SettingsView } from "@/lib/types";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { CodeLine, Dialog } from "./ui";

export function SettingsViewPanel({
  email,
  displayName,
  color,
  hasPartner,
  settings,
}: {
  email: string;
  displayName: string;
  color: string;
  hasPartner: boolean;
  settings: SettingsView;
}) {
  return (
    <div className="stack loose">
      <header>
        <p className="eyebrow">You</p>
        <h1>{displayName}</h1>
        <p className="lede">{email}</p>
      </header>
      <ProfileForm displayName={displayName} color={color} />
      <PasswordForm />
      <RecoveryForm />
      <NotifyForm settings={settings} />
      <DeviceAlerts />
      <SpaceDanger hasPartner={hasPartner} />
      <AccountDanger />
      <SignOut />
    </div>
  );
}

function ProfileForm({ displayName, color }: { displayName: string; color: string }) {
  const router = useRouter();
  const [name, setName] = useState(displayName);
  const [picked, setPicked] = useState(color);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);
    setMessage(null);
    try {
      await api("/api/me", { method: "PATCH", json: { displayName: name, color: picked } });
      setMessage("Saved.");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "That didn't save.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="card stack" onSubmit={submit}>
      <h2>Name</h2>
      <label className="field">
        <span>What they see</span>
        <input value={name} onChange={(event) => setName(event.target.value)} maxLength={32} required />
      </label>
      <div className="field">
        <span className="field-label">Color</span>
        <div className="colors" role="group" aria-label="Your color">
          {COLORS.map((item) => (
            <button
              key={item.id}
              type="button"
              className="swatch"
              style={{ background: item.hex }}
              aria-label={item.id}
              aria-pressed={picked === item.id}
              onClick={() => setPicked(item.id)}
            />
          ))}
        </div>
      </div>
      <span className="avatar" style={{ background: colorHex(picked) }} aria-hidden="true">
        {(name.trim()[0] || "?").toLocaleUpperCase()}
      </span>
      {error ? <p className="alert" role="alert">{error}</p> : <p className="status" role="status">{message}</p>}
      <button className="btn" type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save"}
      </button>
    </form>
  );
}

function PasswordForm() {
  const [currentPassword, setCurrent] = useState("");
  const [nextPassword, setNext] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);
    setMessage(null);
    try {
      await api("/api/me/password", { method: "POST", json: { currentPassword, nextPassword } });
      setCurrent("");
      setNext("");
      setMessage("Password updated.");
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "That didn't change.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="card stack" onSubmit={submit}>
      <h2>Password</h2>
      <label className="field">
        <span>Current password</span>
        <input type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrent(event.target.value)} required />
      </label>
      <label className="field">
        <span>New password</span>
        <input type="password" autoComplete="new-password" value={nextPassword} onChange={(event) => setNext(event.target.value)} minLength={8} required />
      </label>
      {error ? <p className="alert" role="alert">{error}</p> : <p className="status" role="status">{message}</p>}
      <button className="btn secondary" type="submit" disabled={pending}>
        {pending ? "Updating…" : "Update password"}
      </button>
    </form>
  );
}

function RecoveryForm() {
  const [password, setPassword] = useState("");
  const [code, setCode] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);
    setCopied(false);
    try {
      const result = await api<{ recoveryCode: string }>("/api/auth/recovery-code", {
        method: "POST",
        json: { password },
        idempotencyKey: crypto.randomUUID(),
      });
      setCode(result.recoveryCode);
      setPassword("");
      sessionStorage.setItem("between:recovery", result.recoveryCode);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Couldn't make a new code.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="card stack" onSubmit={submit}>
      <h2>Recovery code</h2>
      <p className="hint">If you lose your password, this is how you get back in. A new code replaces the old one. It is shown once.</p>
      <label className="field">
        <span>Current password</span>
        <input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
      </label>
      {code ? (
        <>
          <CodeLine value={code} label="New recovery code" />
          <button
            type="button"
            className="btn secondary"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(code);
                setCopied(true);
              } catch {
                setError("Select the code and copy it.");
              }
            }}
          >
            {copied ? "Copied" : "Copy code"}
          </button>
        </>
      ) : null}
      {error ? <p className="alert" role="alert">{error}</p> : null}
      <button className="btn secondary" type="submit" disabled={pending}>
        {pending ? "Making a code…" : "Create a new recovery code"}
      </button>
    </form>
  );
}

function NotifyForm({ settings }: { settings: SettingsView }) {
  const router = useRouter();
  const [value, setValue] = useState(settings);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setValue(settings), [settings]);

  async function toggle(key: keyof SettingsView) {
    if (pending) return;
    const next = { ...value, [key]: !value[key] };
    setValue(next);
    setPending(true);
    setError(null);
    try {
      const result = await api<{ settings: SettingsView }>("/api/settings", { method: "PATCH", json: next });
      setValue(result.settings);
      router.refresh();
    } catch (caught) {
      setValue(value);
      setError(caught instanceof ApiError ? caught.message : "That didn't save.");
    } finally {
      setPending(false);
    }
  }

  const rows: { key: keyof SettingsView; label: string; hint: string }[] = [
    { key: "notifySignals", label: "Signals", hint: "When they leave a feeling" },
    { key: "notifyMoments", label: "Moments", hint: "When they leave something" },
    { key: "notifyQuestions", label: "Questions", hint: "When they ask or answer" },
    { key: "notifyMemories", label: "Memories", hint: "When they add to the scrapbook" },
    { key: "notifyReactions", label: "Reactions", hint: "Off by default. Reactions can stay quiet." },
  ];

  return (
    <section className="card stack">
      <h2>Notes</h2>
      <p className="hint">These stay inside Between. Nothing here nags you to come back.</p>
      {rows.map((row) => (
        <button
          key={row.key}
          type="button"
          className="between"
          aria-pressed={value[row.key]}
          onClick={() => toggle(row.key)}
          disabled={pending}
          style={{ background: "transparent", border: 0, textAlign: "left", minHeight: 48, padding: "0.35rem 0" }}
        >
          <span>
            <strong>{row.label}</strong>
            <span className="fine" style={{ display: "block" }}>{row.hint}</span>
          </span>
          <span>{value[row.key] ? "On" : "Off"}</span>
        </button>
      ))}
      {error ? <p className="alert" role="alert">{error}</p> : null}
    </section>
  );
}

function DeviceAlerts() {
  const [on, setOn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setOn(window.localStorage.getItem("between:device-alerts") === "on"), []);

  async function enable() {
    setError(null);
    if (!("Notification" in window)) {
      setError("This browser doesn't offer alerts.");
      return;
    }
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      setError("Alerts stayed off.");
      return;
    }
    window.localStorage.setItem("between:device-alerts", "on");
    setOn(true);
  }

  return (
    <section className="card stack">
      <h2>This device</h2>
      <p className="hint">
        A quiet alert only while Between is open in the background. It never says what was shared, and it never reminds you to open the app.
      </p>
      {on ? (
        <button
          type="button"
          className="btn secondary"
          onClick={() => {
            window.localStorage.setItem("between:device-alerts", "off");
            setOn(false);
          }}
        >
          Turn device alerts off
        </button>
      ) : (
        <button type="button" className="btn secondary" onClick={() => void enable()}>
          Allow quiet alerts
        </button>
      )}
      {error ? <p className="alert" role="alert">{error}</p> : null}
    </section>
  );
}

function SpaceDanger({ hasPartner }: { hasPartner: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const word = hasPartner ? "LEAVE" : "CLOSE";

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      await api("/api/space", { method: "DELETE", json: { confirm } });
      router.push("/start");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "That didn't happen.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="card stack">
      <h2>{hasPartner ? "Leave this space" : "Close this space"}</h2>
      <p className="hint">
        {hasPartner
          ? "You'll lose access. What you already shared stays for them, with your name."
          : "Nothing has been shared with anyone else. Closing removes this space."}
      </p>
      <button type="button" className="btn danger" onClick={() => setOpen(true)}>
        {hasPartner ? "Leave space" : "Close space"}
      </button>
      <Dialog open={open} title={hasPartner ? "Leave this space?" : "Close this space?"} onClose={() => setOpen(false)}>
        <form className="stack" onSubmit={submit}>
          <label className="field">
            <span>Type {word} to confirm</span>
            <input value={confirm} onChange={(event) => setConfirm(event.target.value)} autoComplete="off" />
          </label>
          {error ? <p className="alert" role="alert">{error}</p> : null}
          <button className="btn danger" type="submit" disabled={pending || confirm !== word}>
            {pending ? "Working…" : hasPartner ? "Leave" : "Close"}
          </button>
        </form>
      </Dialog>
    </section>
  );
}

function AccountDanger() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      await api("/api/me", { method: "DELETE", json: { confirm, password } });
      router.push("/");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "The account is still here.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="card stack">
      <h2>Delete account</h2>
      <p className="hint">
        Your account disappears. Moments you left stay in the space, with your name. Your answers and reactions are removed.
      </p>
      <button type="button" className="btn danger" onClick={() => setOpen(true)}>
        Delete account
      </button>
      <Dialog open={open} title="Delete your account?" onClose={() => setOpen(false)}>
        <form className="stack" onSubmit={submit}>
          <label className="field">
            <span>Type DELETE</span>
            <input value={confirm} onChange={(event) => setConfirm(event.target.value)} autoComplete="off" />
          </label>
          <label className="field">
            <span>Password</span>
            <input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
          </label>
          {error ? <p className="alert" role="alert">{error}</p> : null}
          <button className="btn danger" type="submit" disabled={pending || confirm !== "DELETE"}>
            {pending ? "Deleting…" : "Delete account"}
          </button>
        </form>
      </Dialog>
    </section>
  );
}

function SignOut() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  return (
    <button
      type="button"
      className="btn secondary block"
      disabled={pending}
      onClick={async () => {
        if (pending) return;
        setPending(true);
        try {
          await api("/api/auth/sign-out", { method: "POST", json: {} });
        } catch {
          /* still leave the screen */
        }
        router.push("/");
        router.refresh();
      }}
    >
      {pending ? "Signing out…" : "Sign out"}
    </button>
  );
}
