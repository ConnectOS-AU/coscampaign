import type { SupabaseClient } from "@supabase/supabase-js";

export async function isCurrentUserAdmin(supabase: SupabaseClient): Promise<boolean> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const { data } = await supabase.from("marketing_email_admins").select("user_id").eq("user_id", user.id).maybeSingle();

  return data !== null;
}

export async function assertCurrentUserIsAdmin(supabase: SupabaseClient): Promise<void> {
  if (!(await isCurrentUserAdmin(supabase))) {
    throw new Error("Admin access required");
  }
}
