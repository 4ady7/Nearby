import { QuestionsView } from "@/components/questions-view";
import { getSession } from "@/server/session";
import { listQuestions } from "@/server/store";
import { redirect } from "next/navigation";

export const metadata = { title: "Questions" };

export default async function Page() {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  const page = listQuestions(session.user.id, null, 20);
  return <QuestionsView questions={page.items} next={page.next} />;
}
