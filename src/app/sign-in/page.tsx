import { SignInForm } from "@/components/auth-forms";
import { safeNext } from "@/lib/text";
import { getSession } from "@/server/session";
import { getSpaceContext } from "@/server/store";
import { redirect } from "next/navigation";

export const metadata = { title: "Sign in" };

export default async function Page({ searchParams }: { searchParams: Promise<{ next?: string; expired?: string }> }) {
  const params = await searchParams;
  const next = safeNext(params.next);
  const session = await getSession();
  if (session) redirect(next || (getSpaceContext(session.user.id) ? "/home" : "/start"));
  return <SignInForm next={next} expired={params.expired === "1"} />;
}
