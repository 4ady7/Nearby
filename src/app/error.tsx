"use client";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="center-page">
      <p className="eyebrow">Between</p>
      <h1>Something stumbled.</h1>
      <p className="lede">Your space is still there.</p>
      <button type="button" className="btn" onClick={() => reset()}>
        Try again
      </button>
    </main>
  );
}
