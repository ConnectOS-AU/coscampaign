import { type NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { resolveSession, SESSION_COOKIE_NAME } from "@/lib/auth/session";

const PUBLIC_PATHS = ["/login", "/api/auth", "/api/webhooks", "/api/track", "/s/", "/api/surveys", "/e/", "/api/events"];

export async function proxy(request: NextRequest) {
  const isPublicPath = PUBLIC_PATHS.some((path) => request.nextUrl.pathname.startsWith(path));
  if (isPublicPath) {
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = await resolveSession(token);

  // A local session that has a verified authenticator but hasn't completed
  // the login-time MFA challenge is only aal1 -- block it here too, so a
  // direct URL visit can't skip the 2FA step. An Entra SSO session (no
  // local cookie at all) is checked separately below -- it's always aal2,
  // see the getSession() comment in src/lib/auth/session.ts.
  const hasValidLocalSession = session && !(session.hasVerifiedMfa && session.aal !== "aal2");
  if (hasValidLocalSession) {
    return NextResponse.next();
  }

  // No valid local session -- check for an Entra SSO session. getToken()
  // reads/decrypts the Auth.js JWT cookie directly from the request, no
  // request-scope dependency (unlike the bare auth() helper, which can't be
  // safely called from arbitrary middleware code).
  const entraToken = await getToken({ req: request, secret: process.env.AUTH_SECRET });
  if (entraToken?.appUserId) {
    return NextResponse.next();
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", request.nextUrl.pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
