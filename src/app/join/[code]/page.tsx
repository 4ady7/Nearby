import { JoinFlow } from "@/components/start-join";
import { normalizeCode } from "@/lib/text";
import { getSession } from "@/server/session";
import { getSpaceContext } from "@/server/store";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
export const metadata = { title: "Join" };

export default async function Page({ params }: { params: Promise<{ code: string }> }) {
  const { code: raw } = await params;
  const code = normalizeCode(raw);
  const session = await getSession();
  if (!session) redirect(`/sign-in?next=${encodeURIComponent(`/join/${code}`)}`);
  const already = Boolean(getSpaceContext(session.user.id));
  return <JoinFlow code={code} already={already} />;
}
