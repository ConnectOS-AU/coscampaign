import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase";
import { verifyTotpCode } from "@/lib/auth/totp";
import { getSession, upgradeSessionToAal2 } from "@/lib/auth/session";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as { code?: unknown };
  const code = typeof body.code === "string" ? body.code : "";

  const supabase = createServiceRoleClient();
  const { data: factor } = await supabase
    .from("app_mfa_factors")
    .select("id, secret")
    .eq("user_id", session.userId)
    .eq("status", "verified")
    .maybeSingle();

  if (!factor || !(await verifyTotpCode(factor.secret, code))) {
    return NextResponse.json({ error: "Invalid code" }, { status: 401 });
  }

  await upgradeSessionToAal2();
  return NextResponse.json({ ok: true });
}
