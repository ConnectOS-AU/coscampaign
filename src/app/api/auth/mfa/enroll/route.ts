import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase";
import { generateTotpSecret, generateTotpUri, generateQrCodeDataUrl } from "@/lib/auth/totp";
import { getSession } from "@/lib/auth/session";

export async function POST() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const supabase = createServiceRoleClient();

  // Clear out any abandoned unverified factor from a previous incomplete
  // enrollment so it doesn't linger forever.
  await supabase.from("app_mfa_factors").delete().eq("user_id", session.userId).eq("status", "unverified");

  const secret = generateTotpSecret();
  const { data: factor, error } = await supabase
    .from("app_mfa_factors")
    .insert({ user_id: session.userId, secret, status: "unverified" })
    .select("id")
    .single();

  if (error || !factor) {
    return NextResponse.json({ error: "Failed to start enrollment" }, { status: 500 });
  }

  const uri = generateTotpUri(session.email, secret);
  const qrCodeDataUrl = await generateQrCodeDataUrl(uri);

  return NextResponse.json({ factorId: factor.id, secret, qrCodeDataUrl });
}
