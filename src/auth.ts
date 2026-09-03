import NextAuth from "next-auth";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";
import { createServiceRoleClient } from "@/lib/supabase";

declare module "next-auth" {
  interface Session {
    appUserId: string;
    permissions: string[];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    appUserId?: string;
    permissions?: string[];
  }
}

// Same ceiling the local session system uses (SESSION_DURATION_MS in
// src/lib/auth/session.ts) -- the session cookie itself is browser-session
// only (see `cookies` below), but this bounds how long a JWT stays valid if
// a browser restores cookies on restart (e.g. Chrome's "continue where you
// left off").
const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

/**
 * Resolves (and JIT-provisions if needed) the app_users row for a signed-in
 * Entra identity, plus their permissions computed from Entra group
 * membership -- via entra_group_permissions, not the local
 * app_user_permissions table used by password logins (see session.ts for
 * how the two paths merge into the same Session shape).
 */
async function resolveAppUserAndPermissions(profile: {
  oid?: string | null;
  sub?: string | null;
  email?: string | null;
  preferred_username?: string | null;
  groups?: string[];
}): Promise<{ appUserId: string; email: string; permissions: string[] }> {
  const supabase = createServiceRoleClient();

  // `oid` is Microsoft's documented stable directory object id; `sub` is a
  // fallback for tenants/tokens where it's absent.
  const entraObjectId = profile.oid ?? profile.sub;
  const email = (profile.email ?? profile.preferred_username ?? "").toLowerCase();
  if (!entraObjectId || !email) {
    throw new Error("Entra sign-in did not return an object id or email");
  }

  // Group object ids come from the ID token's groups claim (configured in
  // the Entra App Registration's Token configuration) -- see
  // node/plan notes on the "overage" case (200+ groups) not being handled
  // here; unlikely at this app's scale.
  const groupIds = Array.isArray(profile.groups) ? profile.groups : [];
  let permissions: string[] = [];
  if (groupIds.length > 0) {
    const { data } = await supabase
      .from("entra_group_permissions")
      .select("permission_key")
      .in("entra_group_id", groupIds);
    permissions = [...new Set((data ?? []).map((r) => r.permission_key as string))];
  }

  const { data: existingByOid } = await supabase
    .from("app_users")
    .select("id")
    .eq("entra_object_id", entraObjectId)
    .maybeSingle();

  if (existingByOid) {
    return { appUserId: existingByOid.id, email, permissions };
  }

  // First-ever SSO login for this identity -- link to an existing local
  // account with the same email if one exists (e.g. an admin created
  // manually before SSO was set up), rather than colliding with the unique
  // constraint on app_users.email by inserting a duplicate.
  const { data: existingByEmail } = await supabase
    .from("app_users")
    .select("id, entra_object_id")
    .eq("email", email)
    .maybeSingle();

  if (existingByEmail) {
    if (!existingByEmail.entra_object_id) {
      await supabase.from("app_users").update({ entra_object_id: entraObjectId }).eq("id", existingByEmail.id);
    }
    return { appUserId: existingByEmail.id, email, permissions };
  }

  const { data: inserted, error } = await supabase
    .from("app_users")
    .insert({ email, entra_object_id: entraObjectId, password_hash: null })
    .select("id")
    .single();
  if (error || !inserted) {
    throw new Error(`Failed to provision SSO user: ${error?.message ?? "unknown error"}`);
  }
  return { appUserId: inserted.id, email, permissions };
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [MicrosoftEntraID],
  session: {
    strategy: "jwt",
    maxAge: SESSION_MAX_AGE_SECONDS,
  },
  cookies: {
    sessionToken: {
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: process.env.NODE_ENV === "production",
        // Deliberately no maxAge/expires -- a browser-session cookie,
        // matching the local login system's policy (see the comment on
        // createSession() in src/lib/auth/session.ts).
      },
    },
  },
  callbacks: {
    async jwt({ token, account, profile }) {
      // account/profile are only populated on the initial sign-in request;
      // on every later request this callback just passes the existing
      // token through unchanged.
      if (account && profile) {
        const resolved = await resolveAppUserAndPermissions(profile);
        token.appUserId = resolved.appUserId;
        token.email = resolved.email;
        token.permissions = resolved.permissions;
      }
      return token;
    },
    async session({ session, token }) {
      session.appUserId = token.appUserId ?? "";
      session.permissions = token.permissions ?? [];
      if (token.email) session.user.email = token.email;
      return session;
    },
  },
});
