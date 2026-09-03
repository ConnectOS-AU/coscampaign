import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase";
import { getSession } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { cancelScheduledSingleSend } from "@/lib/sendgrid";
import type { Campaign } from "@/lib/types";

/**
 * Cancels a campaign before it actually goes out -- "queued" (still waiting
 * on the background worker/SendGrid contact import, nothing sent to SendGrid
 * yet) or "scheduled" (SendGrid has it queued for a future send_at). Once a
 * campaign is "sending" or "sent" there's no recall -- email already
 * delivered or in flight can't be pulled back by any ESP, so this is
 * deliberately not offered past that point.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!hasPermission(session, "manage_campaigns")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceRoleClient();
  const { data: campaign, error: fetchError } = await supabase
    .from("marketing_email_campaigns")
    .select("*")
    .eq("id", id)
    .single<Campaign>();

  if (fetchError || !campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  if (campaign.status !== "queued" && campaign.status !== "scheduled") {
    return NextResponse.json(
      { error: `Can't cancel a campaign that's already ${campaign.status}` },
      { status: 409 },
    );
  }

  if (campaign.status === "scheduled" && campaign.sendgrid_singlesend_id) {
    try {
      await cancelScheduledSingleSend(campaign.sendgrid_singlesend_id);
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Failed to cancel the scheduled send in SendGrid" },
        { status: 502 },
      );
    }
  }

  const { error: updateError } = await supabase
    .from("marketing_email_campaigns")
    .update({
      status: "draft",
      sendgrid_singlesend_id: null,
      sendgrid_pending_import_job_id: null,
      scheduled_at: null,
      queued_sender_id: null,
      queued_send_at: null,
      queued_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (updateError) {
    return NextResponse.json({ error: `Failed to update campaign: ${updateError.message}` }, { status: 500 });
  }

  return NextResponse.json({ status: "draft" });
}
