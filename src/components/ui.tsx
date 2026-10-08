"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

export function IconPair({ filled = false }: { filled?: boolean }) {
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="9" cy="12" r="3.15" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.7" />
      <circle cx="15.2" cy="12" r="3.15" fill="none" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}

export function IconNote({ filled = false }: { filled?: boolean }) {
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 4.8h8.2L19 8.6V19a1.2 1.2 0 0 1-1.2 1.2H7A1.2 1.2 0 0 1 5.8 19V6A1.2 1.2 0 0 1 7 4.8Z" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.7" />
      <path d="M15 5v3.4H19" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path d="M8.5 12.2h7M8.5 15.4h5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

export function IconBook({ filled = false }: { filled?: boolean }) {
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 5.2h9.2A2.3 2.3 0 0 1 17.5 7.5V19H8.2A2.2 2.2 0 0 0 6 16.8V5.2Z" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.7" />
      <path d="M6 16.8h11.5" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}

export function IconQuiet() {
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="7.2" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="12" cy="12" r="1.7" fill="currentColor" />
    </svg>
  );
}

export function CodeLine({ value, label }: { value: string; label: string }) {
  const parts = value.split("-").filter(Boolean);
  return (
    <p className="code" aria-label={label}>
      {parts.map((part, index) => (
        <span key={`${part}-${index}`} className="code-bit">
          {index > 0 ? <span aria-hidden="true">-</span> : null}
          {part}
        </span>
      ))}
    </p>
  );
}

export function IconAsk({ filled = false }: { filled?: boolean }) {
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="7.2" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.7" />
      <path d="M9.6 9.7a2.4 2.4 0 1 1 3.5 2.1c-.7.4-1.1.9-1.1 1.7" fill="none" stroke={filled ? "var(--paper)" : "currentColor"} strokeWidth="1.7" strokeLinecap="round" />
      <circle cx="12" cy="16.2" r="0.8" fill={filled ? "var(--paper)" : "currentColor"} />
    </svg>
  );
}

export function Dialog({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const titleId = useId();
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const node = ref.current;
    const previous = document.activeElement as HTMLElement | null;
    const selector = 'button, [href], input, textarea, select, [tabindex]:not([tabindex="-1"])';
    const items = () =>
      Array.from(node?.querySelectorAll<HTMLElement>(selector) ?? []).filter((el) => !el.hasAttribute("disabled"));
    window.setTimeout(() => items()[0]?.focus(), 0);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const list = items();
      if (!list.length) return;
      const first = list[0]!;
      const last = list[list.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, [open]);

  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div className="scrim" onMouseDown={onClose}>
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        ref={ref}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="dialog-head">
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

export function EmptyState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="empty">
      <h2>{title}</h2>
      <p className="lede">{body}</p>
      {action}
    </div>
  );
}
