import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase";
import { getSession } from "@/lib/auth/session";

export async function POST() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const supabase = createServiceRoleClient();
  const { error } = await supabase.from("app_mfa_factors").delete().eq("user_id", session.userId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
