import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase";
import { getSession } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { toCsv, csvResponse } from "@/lib/csv";
import { formatDateTime } from "@/lib/format-date";
import type { Campaign, TrackingEvent } from "@/lib/types";

const COLUMNS = [
  { key: "name", label: "Name" },
  { key: "subject", label: "Subject" },
  { key: "status", label: "Status" },
  { key: "sent_at", label: "Sent At" },
  { key: "scheduled_at", label: "Scheduled At" },
  { key: "delivered", label: "Delivered" },
  { key: "unique_opens", label: "Unique Opens" },
  { key: "total_opens", label: "Total Opens" },
  { key: "unique_clicks", label: "Unique Clicks" },
  { key: "total_clicks", label: "Total Clicks" },
  { key: "bounces", label: "Bounces" },
  { key: "unsubscribes", label: "Unsubscribes" },
];

export async function GET() {
  const session = await getSession();
  if (!hasPermission(session, "manage_campaigns")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceRoleClient();
  const [{ data: campaigns }, { data: events }] = await Promise.all([
    supabase
      .from("marketing_email_campaigns")
      .select("id, name, subject, status, sent_at, scheduled_at, updated_at")
      .order("updated_at", { ascending: false })
      .returns<Pick<Campaign, "id" | "name" | "subject" | "status" | "sent_at" | "scheduled_at" | "updated_at">[]>(),
    supabase
      .from("marketing_email_tracking_events")
      .select("campaign_id, event_type, contact_email")
      .not("campaign_id", "is", null)
      .returns<Pick<TrackingEvent, "campaign_id" | "event_type" | "contact_email">[]>(),
  ]);

  type Funnel = {
    delivered: number;
    total_opens: number;
    unique_opens: Set<string>;
    total_clicks: number;
    unique_clicks: Set<string>;
    bounces: number;
    unsubscribes: number;
  };
  const statsByCampaign = new Map<string, Funnel>();
  const emptyFunnel = (): Funnel => ({
    delivered: 0,
    total_opens: 0,
    unique_opens: new Set(),
    total_clicks: 0,
    unique_clicks: new Set(),
    bounces: 0,
    unsubscribes: 0,
  });

  for (const e of events ?? []) {
    if (!e.campaign_id) continue;
    const stats = statsByCampaign.get(e.campaign_id) ?? emptyFunnel();
    if (e.event_type === "delivered") stats.delivered++;
    if (e.event_type === "open") {
      stats.total_opens++;
      if (e.contact_email) stats.unique_opens.add(e.contact_email);
    }
    if (e.event_type === "click") {
      stats.total_clicks++;
      if (e.contact_email) stats.unique_clicks.add(e.contact_email);
    }
    if (e.event_type === "bounce" || e.event_type === "dropped") stats.bounces++;
    if (e.event_type === "unsubscribe") stats.unsubscribes++;
    statsByCampaign.set(e.campaign_id, stats);
  }

  const rows = (campaigns ?? []).map((c) => {
    const s = statsByCampaign.get(c.id) ?? emptyFunnel();
    return {
      name: c.name,
      subject: c.subject ?? "",
      status: c.status,
      sent_at: formatDateTime(c.sent_at),
      scheduled_at: formatDateTime(c.scheduled_at),
      delivered: s.delivered,
      unique_opens: s.unique_opens.size,
      total_opens: s.total_opens,
      unique_clicks: s.unique_clicks.size,
      total_clicks: s.total_clicks,
      bounces: s.bounces,
      unsubscribes: s.unsubscribes,
    };
  });

  return csvResponse(toCsv(rows, COLUMNS), "campaigns.csv");
}
