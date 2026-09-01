import type { Session } from "./session";

export type PermissionKey =
  | "manage_users"
  | "manage_campaigns"
  | "manage_templates"
  | "manage_images"
  | "manage_surveys"
  | "manage_events";

export function hasPermission(session: Session | null, key: PermissionKey): boolean {
  return session?.permissions.includes(key) ?? false;
}

export function requirePermission(session: Session | null, key: PermissionKey): void {
  if (!hasPermission(session, key)) {
    throw new Error("You don't have permission to do that");
  }
}

export function requireSession(session: Session | null): asserts session is Session {
  if (!session) {
    throw new Error("Not signed in");
  }
}
