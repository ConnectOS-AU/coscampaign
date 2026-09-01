import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase";
import { verifyPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";

const GENERIC_ERROR = "Invalid email or password";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { email?: unknown; password?: unknown };
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!email || !password) {
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 401 });
  }

  const supabase = createServiceRoleClient();
  const { data: user } = await supabase
    .from("app_users")
    .select("id, password_hash")
    .eq("email", email)
    .maybeSingle();

  if (!user || !(await verifyPassword(password, user.password_hash))) {
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 401 });
  }

  await createSession(user.id);

  const { data: factors } = await supabase
    .from("app_mfa_factors")
    .select("id")
    .eq("user_id", user.id)
    .eq("status", "verified");

  return NextResponse.json({ needsMfa: (factors?.length ?? 0) > 0 });
}
