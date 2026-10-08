import { MomentsView } from "@/components/moments-view";
import { getSession } from "@/server/session";
import { listMoments, listSignals } from "@/server/store";
import { redirect } from "next/navigation";

export const metadata = { title: "Moments" };

export default async function Page() {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  const page = listMoments(session.user.id, null, 20);
  const signals = listSignals(session.user.id, 80);
  return <MomentsView moments={page.items} signals={signals} next={page.next} />;
}
