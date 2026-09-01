import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase";
import { getSession } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { createList, upsertContactsToList } from "@/lib/sendgrid";
import type { Campaign } from "@/lib/types";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session || !hasPermission(session, "manage_campaigns")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const supabase = createServiceRoleClient();

  const body = (await request.json().catch(() => ({}))) as { emails?: unknown };
  const rawEmails: unknown[] = Array.isArray(body.emails) ? body.emails : [];
  const emails: string[] = [
    ...new Set(rawEmails.filter((e): e is string => typeof e === "string" && e.length > 0)),
  ];

  if (emails.length === 0) {
    return NextResponse.json({ error: "No recipients selected" }, { status: 400 });
  }

  const { data: original, error: fetchError } = await supabase
    .from("marketing_email_campaigns")
    .select("*")
    .eq("id", id)
    .single<Campaign>();

  if (fetchError || !original) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }
  if (original.status === "draft") {
    return NextResponse.json({ error: "Only sent or scheduled campaigns can be resent" }, { status: 409 });
  }

  try {
    // Timestamp (not just date) + a random fragment so retrying a resend for
    // the same campaign on the same day never collides with a list an
    // earlier attempt already created (SendGrid rejects duplicate list names).
    const list = await createList(
      `Resend: ${original.name} (${new Date().toISOString()}-${Math.random().toString(36).slice(2, 8)})`,
    );

    // Not waiting for the import to finish here -- it's tracked on the draft
    // via sendgrid_pending_import_job_id, and the send queue (see
    // src/lib/campaign-queue.ts) waits for it once the user actually sends
    // this draft, the same way it does for every other recipient source.
    const importJob = await upsertContactsToList(list.id, emails);

    const { data: draft, error: insertError } = await supabase
      .from("marketing_email_campaigns")
      .insert({
        name: `${original.name} — Resend`,
        subject: original.subject,
        from_name: original.from_name,
        from_email: original.from_email,
        unlayer_design_json: original.unlayer_design_json,
        html_content: original.html_content,
        status: "draft",
        sendgrid_list_ids: [list.id],
        sendgrid_pending_import_job_id: importJob.job_id,
        sendgrid_segment_ids: [],
        sendgrid_suppression_group_id: original.sendgrid_suppression_group_id,
        resend_of_campaign_id: original.id,
        created_by: session.userId,
      })
      .select("id")
      .single();

    if (insertError) {
      throw new Error(`Resend list created in SendGrid, but failed to create draft campaign: ${insertError.message}`);
    }

    return NextResponse.json({ campaignId: draft.id, recipientCount: emails.length });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to prepare resend" },
      { status: 502 },
    );
  }
}
