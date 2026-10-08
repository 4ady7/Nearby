import { MemoriesView } from "@/components/memories-view";
import { getSession } from "@/server/session";
import { listMemories } from "@/server/store";
import { redirect } from "next/navigation";

export const metadata = { title: "Memories" };

export default async function Page() {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  const page = listMemories(session.user.id, null, 24);
  return <MemoriesView memories={page.items} next={page.next} />;
}
