import { NextResponse } from "next/server";
import { EventWebhook, EventWebhookHeader } from "@sendgrid/eventwebhook";
import { createServiceRoleClient } from "@/lib/supabase";

export const runtime = "nodejs";

type SendGridEvent = {
  event: string;
  email?: string;
  timestamp?: number;
  sg_message_id?: string;
  url?: string;
  useragent?: string;
  ip?: string;
  singlesend_id?: string;
  // SendGrid's stock event payload doesn't reliably carry any Marketing
  // Campaigns identifier (confirmed by inspecting real captured payloads --
  // no singlesend_id was present even on delivered/processed events despite
  // docs suggesting it can appear). Sends now explicitly tag themselves with
  // their own campaign id as a category (see createSingleSend call sites),
  // which SendGrid always echoes back here regardless of event type.
  category?: string | string[];
  [key: string]: unknown;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function campaignIdFromCategory(category: string | string[] | undefined): string | null {
  const categories = Array.isArray(category) ? category : category ? [category] : [];
  return categories.find((c) => UUID_RE.test(c)) ?? null;
}

function verify(rawBody: string, signature: string, timestamp: string): boolean {
  const publicKey = process.env.SENDGRID_WEBHOOK_VERIFICATION_KEY;
  if (!publicKey) {
    throw new Error(
      "SENDGRID_WEBHOOK_VERIFICATION_KEY is not set. Enable Signed Event Webhook in SendGrid " +
        "(Settings > Mail Settings > Event Webhook) and copy the public key into env before this endpoint can be used.",
    );
  }
  const eventWebhook = new EventWebhook();
  const ecPublicKey = eventWebhook.convertPublicKeyToECDSA(publicKey);
  return eventWebhook.verifySignature(ecPublicKey, rawBody, signature, timestamp);
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get(EventWebhookHeader.SIGNATURE().toLowerCase()) ?? "";
  const timestamp = request.headers.get(EventWebhookHeader.TIMESTAMP().toLowerCase()) ?? "";

  let verified: boolean;
  try {
    verified = verify(rawBody, signature, timestamp);
  } catch (err) {
    console.error("SendGrid webhook verification misconfigured:", err);
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
  }

  if (!verified) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let events: SendGridEvent[];
  try {
    events = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const supabase = createServiceRoleClient();

  const singlesendIds = [...new Set(events.map((e) => e.singlesend_id).filter(Boolean))] as string[];
  const campaignIdBySinglesendId = new Map<string, string>();
  if (singlesendIds.length > 0) {
    const { data: campaigns } = await supabase
      .from("marketing_email_campaigns")
      .select("id, sendgrid_singlesend_id")
      .in("sendgrid_singlesend_id", singlesendIds);
    for (const c of campaigns ?? []) {
      campaignIdBySinglesendId.set(c.sendgrid_singlesend_id, c.id);
    }
  }

  const rows = events.map((e) => {
    const occurredAt = e.timestamp ? new Date(e.timestamp * 1000).toISOString() : null;
    const campaignId =
      campaignIdFromCategory(e.category) ?? (e.singlesend_id ? (campaignIdBySinglesendId.get(e.singlesend_id) ?? null) : null);
    return {
      campaign_id: campaignId,
      sendgrid_message_id: e.sg_message_id ?? null,
      contact_email: e.email ?? null,
      event_type: e.event,
      url: e.url ?? null,
      user_agent: e.useragent ?? null,
      ip: e.ip ?? null,
      occurred_at: occurredAt,
      raw_payload: e,
      dedupe_key: `${e.sg_message_id ?? ""}:${e.event}:${e.url ?? ""}:${occurredAt ?? ""}`,
    };
  });

  if (rows.length > 0) {
    const { error } = await supabase
      .from("marketing_email_tracking_events")
      .upsert(rows, { onConflict: "dedupe_key", ignoreDuplicates: true });

    if (error) {
      console.error("Failed to store SendGrid events:", error);
      return NextResponse.json({ error: "Failed to store events" }, { status: 500 });
    }
  }

  // "sending" has no automatic promotion to "sent" anywhere else in the app
  // -- a "processed" event is SendGrid's earliest signal that the send was
  // actually dispatched, so treat receiving one as confirmation this
  // campaign has gone out for real.
  const processedCampaignIds = [
    ...new Set(rows.filter((r) => r.event_type === "processed" && r.campaign_id).map((r) => r.campaign_id as string)),
  ];
  if (processedCampaignIds.length > 0) {
    const { error: statusError } = await supabase
      .from("marketing_email_campaigns")
      .update({ status: "sent" })
      .in("id", processedCampaignIds)
      .eq("status", "sending");
    if (statusError) {
      console.error("Failed to mark campaigns sent:", statusError);
    }
  }

  return NextResponse.json({ received: rows.length });
}
