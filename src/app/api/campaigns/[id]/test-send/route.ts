import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { sendTransactionalEmail } from "@/lib/sendgrid";

/**
 * Sends a one-off test copy of whatever's currently in the editor (not
 * necessarily saved yet) to the currently selected sender's own address, so
 * whoever's composing can see it land in an inbox before really sending.
 */
export async function POST(request: Request) {
  const session = await getSession();
  if (!hasPermission(session, "manage_campaigns")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as { subject?: unknown; html?: unknown; to?: unknown };
  const subject = typeof body.subject === "string" ? body.subject.trim() : "";
  const html = typeof body.html === "string" ? body.html : "";
  const to = typeof body.to === "string" ? body.to.trim() : "";

  if (!subject || !html || !to) {
    return NextResponse.json({ error: "Subject, content, and a sender address are required" }, { status: 400 });
  }

  try {
    await sendTransactionalEmail({ to, subject: `[TEST] ${subject}`, html });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to send test email" },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true });
}
