"use server";

import { revalidatePath } from "next/cache";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { assertCurrentUserIsAdmin } from "@/lib/admin";

export async function addUser(input: { email: string; password: string; makeAdmin: boolean }) {
  const supabase = await createClient();
  await assertCurrentUserIsAdmin(supabase);

  if (input.password.length < 8) {
    throw new Error("Password must be at least 8 characters");
  }

  const admin = createServiceRoleClient();
  const { data, error } = await admin.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
  });

  if (error || !data.user) {
    throw new Error(`Failed to create user: ${error?.message ?? "unknown error"}`);
  }

  if (input.makeAdmin) {
    await supabase.from("marketing_email_admins").insert({ user_id: data.user.id });
  }

  revalidatePath("/users");
}

export async function setUserPassword(userId: string, password: string) {
  const supabase = await createClient();
  await assertCurrentUserIsAdmin(supabase);

  if (password.length < 8) {
    throw new Error("Password must be at least 8 characters");
  }

  const admin = createServiceRoleClient();
  const { error } = await admin.auth.admin.updateUserById(userId, { password });
  if (error) {
    throw new Error(`Failed to update password: ${error.message}`);
  }
}

export async function setAdmin(userId: string, isAdmin: boolean) {
  const supabase = await createClient();
  await assertCurrentUserIsAdmin(supabase);

  const {
    data: { user: currentUser },
  } = await supabase.auth.getUser();
  if (!isAdmin && currentUser?.id === userId) {
    throw new Error("You can't remove your own admin access");
  }

  if (isAdmin) {
    const { error } = await supabase.from("marketing_email_admins").insert({ user_id: userId });
    if (error) throw new Error(`Failed to grant admin: ${error.message}`);
  } else {
    const { error } = await supabase.from("marketing_email_admins").delete().eq("user_id", userId);
    if (error) throw new Error(`Failed to revoke admin: ${error.message}`);
  }

  revalidatePath("/users");
}

export async function deleteUser(userId: string) {
  const supabase = await createClient();
  await assertCurrentUserIsAdmin(supabase);

  const {
    data: { user: currentUser },
  } = await supabase.auth.getUser();
  if (currentUser?.id === userId) {
    throw new Error("You can't delete your own account");
  }

  const admin = createServiceRoleClient();
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) {
    throw new Error(`Failed to delete user: ${error.message}`);
  }

  revalidatePath("/users");
}
