import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase";
import { getSession } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { createSingleSend, updateSingleSend, scheduleSingleSend, createList, upsertContactsToList, waitForContactImport } from "@/lib/sendgrid";
import { injectReadDepthPixels } from "@/lib/read-depth";
import { emptyEmployeeFilter, resolveEmployeeEmails } from "@/lib/employees";
import { resolveEventRegistrantEmails } from "@/lib/events";
import type { Campaign } from "@/lib/types";

/** Creates a fresh SendGrid list from an email set and waits for the import to finish. */
async function buildSendGridList(name: string, emails: string[]) {
  const startedAt = Date.now();
  const list = await createList(name);
  const importJob = await upsertContactsToList(list.id, emails);
  const importResult = await waitForContactImport(importJob.job_id);
  console.log(
    `[buildSendGridList] "${name}" (${emails.length} emails) -> ${importResult.status} in ${Date.now() - startedAt}ms`,
  );
  return { list, importResult };
}

function extractLinks(html: string): string[] {
  const hrefRegex = /href=["']([^"'#][^"']*)["']/gi;
  const urls = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = hrefRegex.exec(html)) !== null) {
    if (match[1].startsWith("http://") || match[1].startsWith("https://")) {
      urls.add(match[1]);
    }
  }
  return [...urls];
}

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

  // A resend draft already has a specific SendGrid list built from exact
  // tracking-history-derived emails (non-openers etc.) -- that can't be
  // expressed as an employee-directory filter, so it bypasses filter
  // resolution entirely and reuses the list the resend flow already built.
  const isResend = Boolean(campaign.resend_of_campaign_id);
  let recipientListId: string;
  let recipientCount: number;

  if (isResend) {
    const existingListId = campaign.sendgrid_list_ids?.[0];
    if (!existingListId) {
      return NextResponse.json({ error: "This resend draft is missing its recipient list" }, { status: 400 });
    }
    recipientListId = existingListId;
    recipientCount = 0; // Already known from the resend step; not re-fetched here.
  } else if (campaign.event_id) {
    // All registrants (confirmed + waitlisted) are eligible -- the
    // confirmed/waitlisted distinction only matters for event capacity.
    const emails = await resolveEventRegistrantEmails(campaign.event_id);
    if (emails.length === 0) {
      return NextResponse.json({ error: "This event has no registrants yet" }, { status: 400 });
    }

    try {
      const { list, importResult } = await buildSendGridList(
        `${campaign.name} (${new Date().toISOString().slice(0, 10)})`,
        emails,
      );
      if (importResult.status !== "completed") {
        return NextResponse.json(
          {
            error: `SendGrid is still processing the recipient list (status: ${importResult.status}). Wait a moment and try sending again.`,
          },
          { status: 202 },
        );
      }
      recipientListId = list.id;
      recipientCount = emails.length;
    } catch (err) {
      console.error(`[campaigns/${id}/send] Failed to prepare recipient list:`, err);
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Failed to prepare recipient list" },
        { status: 502 },
      );
    }
  } else if (campaign.individual_recipient_emails?.length) {
    const emails = campaign.individual_recipient_emails;

    try {
      const { list, importResult } = await buildSendGridList(
        `${campaign.name} (${new Date().toISOString().slice(0, 10)})`,
        emails,
      );
      if (importResult.status !== "completed") {
        return NextResponse.json(
          {
            error: `SendGrid is still processing the recipient list (status: ${importResult.status}). Wait a moment and try sending again.`,
          },
          { status: 202 },
        );
      }
      recipientListId = list.id;
      recipientCount = emails.length;
    } catch (err) {
      console.error(`[campaigns/${id}/send] Failed to prepare recipient list:`, err);
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Failed to prepare recipient list" },
        { status: 502 },
      );
    }
  } else {
    // Resolve recipients fresh from the employee directory at send time,
    // rather than at the moment the filter was picked, so the roster is
    // always current.
    const emails = await resolveEmployeeEmails({ ...emptyEmployeeFilter(), ...campaign.recipient_filter });
    if (emails.length === 0) {
      return NextResponse.json({ error: "No employees match the current recipient filters" }, { status: 400 });
    }

    try {
      const { list, importResult } = await buildSendGridList(
        `${campaign.name} (${new Date().toISOString().slice(0, 10)})`,
        emails,
      );
      if (importResult.status !== "completed") {
        return NextResponse.json(
          {
            error: `SendGrid is still processing the recipient list (status: ${importResult.status}). Wait a moment and try sending again.`,
          },
          { status: 202 },
        );
      }
      recipientListId = list.id;
      recipientCount = emails.length;
    } catch (err) {
      console.error(`[campaigns/${id}/send] Failed to prepare recipient list:`, err);
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Failed to prepare recipient list" },
        { status: 502 },
      );
    }
  }

  const sendStartedAt = Date.now();
  try {
    const singleSend = await createSingleSend({ name: campaign.name });

    // SendGrid substitutes {{email}} with the actual recipient address at send
    // time (it's a reserved Marketing Campaigns merge tag), which is what lets
    // each recipient's read-depth pixels resolve back to them individually.
    const origin = new URL(request.url).origin;
    const htmlWithReadDepth = injectReadDepthPixels(
      campaign.html_content,
      (segment) => `${origin}/api/track/pixel/${id}/{{email}}/${segment}`,
    );

    await updateSingleSend(singleSend.id, {
      name: campaign.name,
      send_to: {
        list_ids: [recipientListId],
      },
      email_config: {
        subject: campaign.subject,
        html_content: htmlWithReadDepth,
        sender_id: senderId,
        suppression_group_id: campaign.sendgrid_suppression_group_id ?? undefined,
      },
    });

    await scheduleSingleSend(singleSend.id, sendAt);

    const links = extractLinks(campaign.html_content);

    const { error: updateError } = await supabase
      .from("marketing_email_campaigns")
      .update({
        sendgrid_singlesend_id: singleSend.id,
        sendgrid_list_ids: [recipientListId],
        status: sendAt === "now" ? "sending" : "scheduled",
        scheduled_at: sendAt === "now" ? new Date().toISOString() : sendAt,
        sent_at: sendAt === "now" ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (updateError) {
      throw new Error(`Send succeeded in SendGrid but failed to update local record: ${updateError.message}`);
    }

    if (links.length > 0) {
      await supabase
        .from("marketing_email_campaign_links")
        .upsert(
          links.map((url) => ({ campaign_id: id, url })),
          { onConflict: "campaign_id,url", ignoreDuplicates: true },
        );
    }

    console.log(`[campaigns/${id}/send] Completed in ${Date.now() - sendStartedAt}ms`);
    return NextResponse.json({
      singleSendId: singleSend.id,
      status: sendAt === "now" ? "sending" : "scheduled",
      recipientCount,
    });
  } catch (err) {
    console.error(
      `[campaigns/${id}/send] Failed after ${Date.now() - sendStartedAt}ms creating/scheduling the single send:`,
      err,
    );
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to send campaign" },
      { status: 502 },
    );
  }
}
