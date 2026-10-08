import { StartFlow } from "@/components/start-join";
import { getSession } from "@/server/session";
import { getSpaceContext } from "@/server/store";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
export const metadata = { title: "Start" };

export default async function Page() {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  if (getSpaceContext(session.user.id)) redirect("/home");
  return <StartFlow name={session.user.displayName} />;
}
