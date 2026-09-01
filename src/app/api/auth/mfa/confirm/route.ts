import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase";
import { verifyTotpCode } from "@/lib/auth/totp";
import { getSession } from "@/lib/auth/session";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as { factorId?: unknown; code?: unknown };
  const factorId = typeof body.factorId === "string" ? body.factorId : "";
  const code = typeof body.code === "string" ? body.code : "";

  const supabase = createServiceRoleClient();
  const { data: factor } = await supabase
    .from("app_mfa_factors")
    .select("id, secret")
    .eq("id", factorId)
    .eq("user_id", session.userId)
    .eq("status", "unverified")
    .maybeSingle();

  if (!factor || !(await verifyTotpCode(factor.secret, code))) {
    return NextResponse.json({ error: "Invalid code" }, { status: 401 });
  }

  const { error } = await supabase
    .from("app_mfa_factors")
    .update({ status: "verified", verified_at: new Date().toISOString() })
    .eq("id", factorId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
