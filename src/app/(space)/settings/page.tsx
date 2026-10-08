import { SettingsViewPanel } from "@/components/settings-view";
import { getSession } from "@/server/session";
import { getSettings, getSpaceContext } from "@/server/store";
import { redirect } from "next/navigation";

export const metadata = { title: "You" };

export default async function Page() {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  const space = getSpaceContext(session.user.id);
  if (!space) redirect("/start");
  return (
    <SettingsViewPanel
      email={session.user.email}
      displayName={session.user.displayName}
      color={session.user.color}
      hasPartner={Boolean(space.partner)}
      settings={getSettings(session.user.id)}
    />
  );
}
