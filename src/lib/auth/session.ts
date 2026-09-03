import crypto from "crypto";
import { cookies } from "next/headers";
import { createServiceRoleClient } from "@/lib/supabase";
import { auth as authEntra } from "@/auth";

export const SESSION_COOKIE_NAME = "app_session";
const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export type Session = {
  sessionId: string;
  userId: string;
  email: string;
  aal: "aal1" | "aal2";
  permissions: string[];
  hasVerifiedMfa: boolean;
};

export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/**
 * Core session lookup, independent of how the token was obtained -- shared by
 * getSession() (reads the `next/headers` cookie jar) and middleware (reads
 * the NextRequest cookie jar, a different API for the same cookie).
 */
export async function resolveSession(token: string | undefined): Promise<Session | null> {
  if (!token) return null;

  const supabase = createServiceRoleClient();
  const tokenHash = hashToken(token);

  const { data: sessionRow } = await supabase
    .from("app_sessions")
    .select("id, user_id, aal, expires_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (!sessionRow || new Date(sessionRow.expires_at) < new Date()) {
    return null;
  }

  const [{ data: user }, { data: permRows }, { data: factorRows }] = await Promise.all([
    supabase.from("app_users").select("id, email").eq("id", sessionRow.user_id).maybeSingle(),
    supabase.from("app_user_permissions").select("permission_key").eq("user_id", sessionRow.user_id),
    supabase.from("app_mfa_factors").select("id").eq("user_id", sessionRow.user_id).eq("status", "verified"),
  ]);

  if (!user) return null;

  return {
    sessionId: sessionRow.id,
    userId: user.id,
    email: user.email,
    aal: sessionRow.aal as "aal1" | "aal2",
    permissions: (permRows ?? []).map((p) => p.permission_key),
    hasVerifiedMfa: (factorRows?.length ?? 0) > 0,
  };
}

export async function getSession(): Promise<Session | null> {
  const cookieStore = await cookies();
  const localSession = await resolveSession(cookieStore.get(SESSION_COOKIE_NAME)?.value);
  if (localSession) return localSession;

  // No local session cookie -- fall back to an Entra SSO session (see
  // src/auth.ts). Entra's own Conditional Access/MFA already satisfies the
  // assurance level this app cares about, so SSO sessions are always aal2
  // and skip the local TOTP dance entirely. Permissions come from Entra
  // group membership (resolved once at sign-in, embedded in the JWT), not
  // from app_user_permissions.
  const entraSession = await authEntra();
  if (!entraSession?.appUserId || !entraSession.user?.email) return null;

  return {
    sessionId: `entra:${entraSession.appUserId}`,
    userId: entraSession.appUserId,
    email: entraSession.user.email,
    aal: "aal2",
    permissions: entraSession.permissions ?? [],
    hasVerifiedMfa: true,
  };
}

/**
 * Creates an aal1 session (password verified). For an account without MFA
 * enrolled that's already sufficient; for one with a verified TOTP factor,
 * the caller must follow up with upgradeSessionToAal2() once the code is
 * verified before protected routes will admit the session (see middleware).
 */
export async function createSession(userId: string): Promise<void> {
  const token = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS).toISOString();

  const supabase = createServiceRoleClient();
  const { error } = await supabase.from("app_sessions").insert({
    user_id: userId,
    token_hash: hashToken(token),
    aal: "aal1",
    expires_at: expiresAt,
  });
  if (error) throw new Error(`Failed to create session: ${error.message}`);

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    // Deliberately no `expires`/`maxAge` -- this makes it a browser session
    // cookie, cleared when the browser is fully closed (not just the tab),
    // so closing out of the browser always requires a fresh login + 2FA
    // rather than silently staying signed in. The underlying app_sessions
    // row is still capped at SESSION_DURATION_MS server-side as a ceiling,
    // in case a browser is configured to restore session cookies on restart
    // (e.g. Chrome's "continue where you left off").
  });
}

export async function upgradeSessionToAal2(): Promise<boolean> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return false;

  const supabase = createServiceRoleClient();
  const { error } = await supabase
    .from("app_sessions")
    .update({ aal: "aal2" })
    .eq("token_hash", hashToken(token));

  return !error;
}

export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (token) {
    const supabase = createServiceRoleClient();
    await supabase.from("app_sessions").delete().eq("token_hash", hashToken(token));
  }
  cookieStore.delete(SESSION_COOKIE_NAME);
}
