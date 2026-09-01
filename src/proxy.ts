import { type NextRequest, NextResponse } from "next/server";
import { resolveSession, SESSION_COOKIE_NAME } from "@/lib/auth/session";

const PUBLIC_PATHS = ["/login", "/api/auth", "/api/webhooks", "/api/track", "/s/", "/api/surveys"];

export async function proxy(request: NextRequest) {
  const isPublicPath = PUBLIC_PATHS.some((path) => request.nextUrl.pathname.startsWith(path));
  if (isPublicPath) {
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = await resolveSession(token);

  // A session that has a verified authenticator but hasn't completed the
  // login-time MFA challenge is only aal1 -- block it here too, so a direct
  // URL visit can't skip the 2FA step.
  if (!session || (session.hasVerifiedMfa && session.aal !== "aal2")) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
