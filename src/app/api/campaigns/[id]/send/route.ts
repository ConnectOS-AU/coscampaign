import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase";
import { getSession } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { createList, upsertContactsToList } from "@/lib/sendgrid";
import { emptyEmployeeFilter, resolveEmployeeEmails } from "@/lib/employees";
import { resolveEventRegistrantEmails } from "@/lib/events";
import type { Campaign } from "@/lib/types";

/**
 * Kicks off (or reuses) a SendGrid list/import for this campaign and marks
 * it "queued" -- the background worker in src/lib/campaign-queue.ts (started
 * from src/instrumentation.ts) polls queued campaigns and finalizes the
 * actual send once SendGrid's contact import finishes. Nothing here blocks
 * on that import completing: previously this request waited synchronously
 * for it, which occasionally took well over a minute and caused the request
 * to time out with no useful error.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!hasPermission(session, "manage_campaigns")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const supabase = createServiceRoleClient();

  const body = await request.json().catch(() => ({}));
  const senderId: number | undefined = body.senderId;
  const sendAt: string = body.sendAt ?? "now";

  const { data: campaign, error: fetchError } = await supabase
    .from("marketing_email_campaigns")
    .select("*")
    .eq("id", id)
    .single<Campaign>();

  if (fetchError || !campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }
  if (campaign.status !== "draft") {
    return NextResponse.json({ error: `Campaign is already ${campaign.status}` }, { status: 409 });
  }
  if (!campaign.subject || !campaign.html_content) {
    return NextResponse.json({ error: "Subject and content are required" }, { status: 400 });
  }
  if (!senderId) {
    return NextResponse.json({ error: "senderId is required" }, { status: 400 });
  }
  if (!campaign.sendgrid_suppression_group_id) {
    return NextResponse.json(
      { error: "An unsubscribe group is required by SendGrid before a send can be scheduled" },
      { status: 400 },
    );
  }

  const isResend = Boolean(campaign.resend_of_campaign_id);
  let sendgridListId: string;
  let pendingImportJobId: string | null;

  if (isResend) {
    // A resend draft already has a specific SendGrid list built from exact
    // tracking-history-derived emails -- reuse it as-is. Its import may
    // still be in flight (the resend flow doesn't block on it either), so
    // carry over whatever pending job id it has; the queue worker below
    // waits for that the same way it does for every other recipient source.
    const existingListId = campaign.sendgrid_list_ids?.[0];
    if (!existingListId) {
      return NextResponse.json({ error: "This resend draft is missing its recipient list" }, { status: 400 });
    }
    sendgridListId = existingListId;
    pendingImportJobId = campaign.sendgrid_pending_import_job_id;
  } else {
    let emails: string[];
    if (campaign.event_id) {
      // All registrants (confirmed + waitlisted) are eligible -- the
      // confirmed/waitlisted distinction only matters for event capacity.
      emails = await resolveEventRegistrantEmails(campaign.event_id);
      if (emails.length === 0) {
        return NextResponse.json({ error: "This event has no registrants yet" }, { status: 400 });
      }
    } else if (campaign.individual_recipient_emails?.length) {
      emails = campaign.individual_recipient_emails;
    } else {
      // Resolve recipients fresh from the employee directory at send time,
      // rather than at the moment the filter was picked, so the roster is
      // always current.
      emails = await resolveEmployeeEmails({ ...emptyEmployeeFilter(), ...campaign.recipient_filter });
      if (emails.length === 0) {
        return NextResponse.json({ error: "No employees match the current recipient filters" }, { status: 400 });
      }
    }

    try {
      if (campaign.sendgrid_list_ids?.[0] && campaign.sendgrid_pending_import_job_id) {
        // A previous attempt already started building this list -- reuse it
        // rather than creating another (that's what previously built up a
        // real backlog of duplicate lists in the SendGrid account).
        sendgridListId = campaign.sendgrid_list_ids[0];
        pendingImportJobId = campaign.sendgrid_pending_import_job_id;
      } else {
        const name = `${campaign.name} (${new Date().toISOString()}-${Math.random().toString(36).slice(2, 8)})`;
        const list = await createList(name);
        const importJob = await upsertContactsToList(list.id, emails);
        sendgridListId = list.id;
        pendingImportJobId = importJob.job_id;
      }
    } catch (err) {
      console.error(`[campaigns/${id}/send] Failed to start recipient list:`, err);
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Failed to start preparing the recipient list" },
        { status: 502 },
      );
    }
  }

  const { error: updateError } = await supabase
    .from("marketing_email_campaigns")
    .update({
      status: "queued",
      sendgrid_list_ids: [sendgridListId],
      sendgrid_pending_import_job_id: pendingImportJobId,
      queued_sender_id: senderId,
      queued_send_at: sendAt,
      queued_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("status", "draft");

  if (updateError) {
    return NextResponse.json({ error: `Failed to queue send: ${updateError.message}` }, { status: 500 });
  }

  return NextResponse.json({ status: "queued" });
}
