import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase";
import { getSession } from "@/lib/auth/session";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const supabase = createServiceRoleClient();
  const { data: factors } = await supabase
    .from("app_mfa_factors")
    .select("id")
    .eq("user_id", session.userId)
    .eq("status", "verified");

  return NextResponse.json({ enabled: (factors?.length ?? 0) > 0 });
}
