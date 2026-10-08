import { HomeView } from "@/components/home-view";
import { getSession } from "@/server/session";
import { loadHome } from "@/server/store";
import { redirect } from "next/navigation";

export const metadata = { title: "Home" };

export default async function Page() {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  return <HomeView data={loadHome(session.user.id)} />;
}
