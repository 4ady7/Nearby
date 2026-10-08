import type { ReactNode } from "react";
import { Shell } from "@/components/shell";
import { initial } from "@/lib/text";
import { getSession } from "@/server/session";
import { getSpaceContext, listNotices } from "@/server/store";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function SpaceLayout({ children }: { children: ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  const space = getSpaceContext(session.user.id);
  if (!space) redirect("/start");
  const { notices, unread } = listNotices(session.user.id);
  return (
    <Shell
      me={{
        id: space.me.id,
        displayName: space.me.display_name,
        color: space.me.color,
        initial: initial(space.me.display_name),
      }}
      notices={notices}
      unread={unread}
    >
      {children}
    </Shell>
  );
}
