import Link from "next/link";

export default function NotFound() {
  return (
    <main className="center-page">
      <p className="eyebrow">Between</p>
      <h1>This page isn't part of the space.</h1>
      <p className="lede">Head back. Whatever you were looking for isn't here.</p>
      <Link className="btn" href="/">
        Go back
      </Link>
    </main>
  );
}
