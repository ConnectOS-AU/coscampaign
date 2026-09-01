"use server";

import { revalidatePath } from "next/cache";
import { createServiceRoleClient } from "@/lib/supabase";
import { getSession } from "@/lib/auth/session";
import { requirePermission, requireSession, type PermissionKey } from "@/lib/auth/permissions";
import { hashPassword } from "@/lib/auth/password";

export async function addUser(input: { email: string; password: string; permissions: PermissionKey[] }) {
  const session = await getSession();
  requirePermission(session, "manage_users");

  if (input.password.length < 8) {
    throw new Error("Password must be at least 8 characters");
  }

  const supabase = createServiceRoleClient();
  const { data: user, error } = await supabase
    .from("app_users")
    .insert({ email: input.email.trim().toLowerCase(), password_hash: await hashPassword(input.password) })
    .select("id")
    .single();

  if (error || !user) {
    throw new Error(`Failed to create user: ${error?.message ?? "unknown error"}`);
  }

  if (input.permissions.length > 0) {
    const { error: permError } = await supabase
      .from("app_user_permissions")
      .insert(input.permissions.map((permission_key) => ({ user_id: user.id, permission_key })));
    if (permError) {
      throw new Error(`User created, but failed to set permissions: ${permError.message}`);
    }
  }

  revalidatePath("/users");
}

export async function setUserPassword(userId: string, password: string) {
  const session = await getSession();
  requirePermission(session, "manage_users");

  if (password.length < 8) {
    throw new Error("Password must be at least 8 characters");
  }

  const supabase = createServiceRoleClient();
  const { error } = await supabase
    .from("app_users")
    .update({ password_hash: await hashPassword(password), updated_at: new Date().toISOString() })
    .eq("id", userId);

  if (error) {
    throw new Error(`Failed to update password: ${error.message}`);
  }
}

export async function setUserPermissions(userId: string, permissions: PermissionKey[]) {
  const session = await getSession();
  requireSession(session);
  requirePermission(session, "manage_users");

  if (session.userId === userId && !permissions.includes("manage_users")) {
    throw new Error("You can't remove your own user-management access");
  }

  const supabase = createServiceRoleClient();
  const { error: deleteError } = await supabase.from("app_user_permissions").delete().eq("user_id", userId);
  if (deleteError) {
    throw new Error(`Failed to update permissions: ${deleteError.message}`);
  }

  if (permissions.length > 0) {
    const { error: insertError } = await supabase
      .from("app_user_permissions")
      .insert(permissions.map((permission_key) => ({ user_id: userId, permission_key })));
    if (insertError) {
      throw new Error(`Failed to update permissions: ${insertError.message}`);
    }
  }

  revalidatePath("/users");
}

export async function deleteUser(userId: string) {
  const session = await getSession();
  requireSession(session);
  requirePermission(session, "manage_users");

  if (session.userId === userId) {
    throw new Error("You can't delete your own account");
  }

  const supabase = createServiceRoleClient();
  const { error } = await supabase.from("app_users").delete().eq("id", userId);
  if (error) {
    throw new Error(`Failed to delete user: ${error.message}`);
  }

  revalidatePath("/users");
}
