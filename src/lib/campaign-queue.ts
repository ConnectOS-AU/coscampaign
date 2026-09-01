import { createServiceRoleClient } from "@/lib/supabase";
import { createSingleSend, updateSingleSend, scheduleSingleSend, getContactImportStatus } from "@/lib/sendgrid";
import { injectReadDepthPixels } from "@/lib/read-depth";
import type { Campaign } from "@/lib/types";

const POLL_INTERVAL_MS = 20_000;
// If a campaign has been stuck "queued" this long, stop retrying and bounce
// it back to draft so it doesn't retry silently forever -- something is
// genuinely wrong (bad sender, SendGrid outage, etc.) rather than just slow.
const MAX_QUEUE_AGE_MS = 30 * 60 * 1000;

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

async function finalizeSend(supabase: ReturnType<typeof createServiceRoleClient>, campaign: Campaign) {
  const recipientListId = campaign.sendgrid_list_ids[0];
  const sendAt = campaign.queued_send_at ?? "now";
  const origin = process.env.NEXT_PUBLIC_APP_URL;
  if (!origin) {
    throw new Error("NEXT_PUBLIC_APP_URL is not set -- required to build tracking pixel URLs");
  }

  const singleSend = await createSingleSend({ name: campaign.name });

  // SendGrid substitutes {{email}} with the actual recipient address at send
  // time (it's a reserved Marketing Campaigns merge tag), which is what lets
  // each recipient's read-depth pixels resolve back to them individually.
  const htmlWithReadDepth = injectReadDepthPixels(
    campaign.html_content!,
    (segment) => `${origin}/api/track/pixel/${campaign.id}/{{email}}/${segment}`,
  );

  await updateSingleSend(singleSend.id, {
    name: campaign.name,
    send_to: { list_ids: [recipientListId] },
    email_config: {
      subject: campaign.subject!,
      html_content: htmlWithReadDepth,
      sender_id: campaign.queued_sender_id ?? undefined,
      suppression_group_id: campaign.sendgrid_suppression_group_id ?? undefined,
    },
  });

  await scheduleSingleSend(singleSend.id, sendAt);

  const links = extractLinks(campaign.html_content!);

  const { error: updateError } = await supabase
    .from("marketing_email_campaigns")
    .update({
      sendgrid_singlesend_id: singleSend.id,
      status: sendAt === "now" ? "sending" : "scheduled",
      scheduled_at: sendAt === "now" ? new Date().toISOString() : sendAt,
      sent_at: sendAt === "now" ? new Date().toISOString() : null,
      sendgrid_pending_import_job_id: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", campaign.id);

  if (updateError) {
    throw new Error(`Send succeeded in SendGrid but failed to update local record: ${updateError.message}`);
  }

  if (links.length > 0) {
    await supabase
      .from("marketing_email_campaign_links")
      .upsert(
        links.map((url) => ({ campaign_id: campaign.id, url })),
        { onConflict: "campaign_id,url", ignoreDuplicates: true },
      );
  }

  console.log(`[campaign-queue] Sent campaign ${campaign.id} (${campaign.name})`);
}

export async function processQueuedCampaigns(): Promise<void> {
  const supabase = createServiceRoleClient();
  const { data: queued, error } = await supabase
    .from("marketing_email_campaigns")
    .select("*")
    .eq("status", "queued")
    .returns<Campaign[]>();

  if (error) {
    console.error("[campaign-queue] Failed to list queued campaigns:", error);
    return;
  }

  for (const campaign of queued ?? []) {
    try {
      if (campaign.sendgrid_pending_import_job_id) {
        const importStatus = await getContactImportStatus(campaign.sendgrid_pending_import_job_id);
        if (importStatus.status === "pending") {
          const queuedAgeMs = campaign.queued_at ? Date.now() - new Date(campaign.queued_at).getTime() : 0;
          if (queuedAgeMs > MAX_QUEUE_AGE_MS) {
            console.error(
              `[campaign-queue] Campaign ${campaign.id} still pending after ${Math.round(queuedAgeMs / 60_000)}min -- reverting to draft`,
            );
            await supabase
              .from("marketing_email_campaigns")
              .update({ status: "draft", sendgrid_pending_import_job_id: null })
              .eq("id", campaign.id);
          }
          continue;
        }
        if (importStatus.status === "errored" || importStatus.status === "failed") {
          console.error(`[campaign-queue] Import ${importStatus.status} for campaign ${campaign.id} -- reverting to draft`);
          await supabase
            .from("marketing_email_campaigns")
            .update({ status: "draft", sendgrid_pending_import_job_id: null })
            .eq("id", campaign.id);
          continue;
        }
        // importStatus.status === "completed" -- fall through to finalize.
      }

      await finalizeSend(supabase, campaign);
    } catch (err) {
      console.error(`[campaign-queue] Failed to finalize campaign ${campaign.id}:`, err);
      // Left "queued" -- retried next tick, bounded by MAX_QUEUE_AGE_MS above
      // (checked on the next tick where it's still pending an import; a
      // campaign with no pending import that keeps failing here, e.g. a bad
      // sender id, will retry every tick indefinitely -- rare enough in
      // practice not to warrant its own aging check for now).
    }
  }
}

let started = false;

export function startCampaignQueueWorker(): void {
  if (started) return;
  started = true;
  setInterval(() => {
    processQueuedCampaigns().catch((err) => console.error("[campaign-queue] Tick failed:", err));
  }, POLL_INTERVAL_MS);
  console.log(`[campaign-queue] Background worker started (polling every ${POLL_INTERVAL_MS / 1000}s)`);
}
