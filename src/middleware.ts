import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PROTECTED = [/^\/home(\/|$)/, /^\/moments(\/|$)/, /^\/memories(\/|$)/, /^\/questions(\/|$)/, /^\/settings(\/|$)/, /^\/start(\/|$)/, /^\/join(\/|$)/];

export function middleware(request: NextRequest) {
  const hasSession = Boolean(request.cookies.get("between_session")?.value);
  if (PROTECTED.some((pattern) => pattern.test(request.nextUrl.pathname)) && !hasSession) {
    const url = request.nextUrl.clone();
    url.pathname = "/sign-in";
    url.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/home/:path*", "/moments/:path*", "/memories/:path*", "/questions/:path*", "/settings/:path*", "/start/:path*", "/join/:path*", "/home", "/moments", "/memories", "/questions", "/settings", "/start", "/join"],
};
