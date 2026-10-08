import { getSession } from "@/server/session";
import { getSpaceContext } from "@/server/store";
import Link from "next/link";
import { redirect } from "next/navigation";

export default async function Home() {
  const session = await getSession();
  if (session) redirect(getSpaceContext(session.user.id) ? "/home" : "/start");

  return (
    <main className="welcome">
      <div className="mark" aria-hidden="true">
        <span />
        <span />
      </div>
      <p className="eyebrow">Between</p>
      <h1>A little space for the two of you.</h1>
      <p className="lede">
        Leave a feeling, a photo, a song, a question. It can sit here until they find it. You don't have to keep the conversation going.
      </p>
      <div className="welcome-points">
        <p>A signal, when you don't have the words.</p>
        <p>A moment, left without expecting a reply.</p>
        <p>A scrapbook of the things worth keeping.</p>
      </div>
      <div className="stack">
        <Link className="btn" href="/sign-up">
          Begin
        </Link>
        <Link className="btn secondary" href="/sign-in">
          I have an account
        </Link>
      </div>
    </main>
  );
}
