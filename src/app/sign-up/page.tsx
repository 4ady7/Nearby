import { SignUpForm } from "@/components/auth-forms";
import { safeNext } from "@/lib/text";

export const metadata = { title: "Begin" };

export default async function Page({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const params = await searchParams;
  return <SignUpForm next={safeNext(params.next)} />;
}
