import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { getSession } from "@/lib/auth/session";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as { currentPassword?: unknown; newPassword?: unknown };
  const currentPassword = typeof body.currentPassword === "string" ? body.currentPassword : "";
  const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";

  if (newPassword.length < 8) {
    return NextResponse.json({ error: "New password must be at least 8 characters" }, { status: 400 });
  }

  const supabase = createServiceRoleClient();
  const { data: user } = await supabase
    .from("app_users")
    .select("password_hash")
    .eq("id", session.userId)
    .single();

  if (!user || !(await verifyPassword(currentPassword, user.password_hash))) {
    return NextResponse.json({ error: "Current password is incorrect" }, { status: 401 });
  }

  const { error } = await supabase
    .from("app_users")
    .update({ password_hash: await hashPassword(newPassword), updated_at: new Date().toISOString() })
    .eq("id", session.userId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
