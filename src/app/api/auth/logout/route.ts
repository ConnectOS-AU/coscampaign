import { NextResponse } from "next/server";
import { destroySession } from "@/lib/auth/session";
import { signOut } from "@/auth";

export async function POST() {
  await destroySession();
  // No-op if there was no Entra session to begin with.
  await signOut({ redirect: false }).catch(() => {});
  return NextResponse.json({ ok: true });
}
