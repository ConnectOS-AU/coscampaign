import { notFound } from "next/navigation";
import { createServiceRoleClient } from "@/lib/supabase";
import type { Campaign, CampaignLink, EngagementPixel, TrackingEvent } from "@/lib/types";
import { READ_DEPTH_LABELS } from "@/lib/types";
import { formatDateTime } from "@/lib/format-date";
import { ResendPanel } from "./resend-panel";

function countUnique(events: TrackingEvent[], type: string): number {
  return new Set(events.filter((e) => e.event_type === type).map((e) => e.contact_email)).size;
}

function countAll(events: TrackingEvent[], type: string): number {
  return events.filter((e) => e.event_type === type).length;
}

type ActivityRow = {
  key: string;
  contact_email: string | null;
  label: string;
  url: string | null;
  when: string | null;
};

export default async function CampaignReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = createServiceRoleClient();

  const [{ data: campaign }, { data: events }, { data: links }, { data: pixels }] = await Promise.all([
    supabase.from("marketing_email_campaigns").select("*").eq("id", id).single<Campaign>(),
    supabase
      .from("marketing_email_tracking_events")
      .select("*")
      .eq("campaign_id", id)
      .order("occurred_at", { ascending: false })
      .limit(500)
      .returns<TrackingEvent[]>(),
    supabase
      .from("marketing_email_campaign_links")
      .select("*")
      .eq("campaign_id", id)
      .returns<CampaignLink[]>(),
    supabase
      .from("marketing_email_engagement_pixels")
      .select("*")
      .eq("campaign_id", id)
      .returns<EngagementPixel[]>(),
  ]);

  if (!campaign) {
    notFound();
  }

  const allEvents = events ?? [];
  const allPixels = pixels ?? [];

  const funnel = {
    processed: countAll(allEvents, "processed"),
    delivered: countAll(allEvents, "delivered"),
    opens: countAll(allEvents, "open"),
    uniqueOpens: countUnique(allEvents, "open"),
    clicks: countAll(allEvents, "click"),
    uniqueClicks: countUnique(allEvents, "click"),
    bounces: countAll(allEvents, "bounce"),
    unsubscribes: countAll(allEvents, "unsubscribe"),
  };

  const clickCountsByUrl = new Map<string, number>();
  const clickersByUrl = new Map<string, Set<string>>();
  for (const e of allEvents) {
    if (e.event_type === "click" && e.url) {
      clickCountsByUrl.set(e.url, (clickCountsByUrl.get(e.url) ?? 0) + 1);
      if (e.contact_email) {
        const clickers = clickersByUrl.get(e.url) ?? new Set<string>();
        clickers.add(e.contact_email);
        clickersByUrl.set(e.url, clickers);
      }
    }
  }

  // Read depth: highest segment pixel that fired per recipient, as a proxy
  // for how far they scrolled. Only recipients whose email client downloaded
  // images produce any signal here.
  const maxSegmentByContact = new Map<string, 1 | 2 | 3 | 4>();
  for (const p of allPixels) {
    const current = maxSegmentByContact.get(p.contact_email) ?? 0;
    if (p.segment > current) {
      maxSegmentByContact.set(p.contact_email, p.segment);
    }
  }
  const readers = [...maxSegmentByContact.values()];
  const avgReadDepthPct =
    readers.length > 0 ? Math.round((readers.reduce((sum, s) => sum + s, 0) / readers.length / 4) * 100) : null;
  const segmentReachCounts = ([1, 2, 3, 4] as const).map((seg) => ({
    segment: seg,
    label: READ_DEPTH_LABELS[seg],
    count: readers.filter((s) => s >= seg).length,
  }));

  // Per-recipient status, used both for display and to compute resend targets.
  const statusByContact = new Map<
    string,
    { delivered: boolean; opened: boolean; clicked: boolean; bounced: boolean }
  >();
  for (const e of allEvents) {
    if (!e.contact_email) continue;
    const status = statusByContact.get(e.contact_email) ?? {
      delivered: false,
      opened: false,
      clicked: false,
      bounced: false,
    };
    if (e.event_type === "delivered") status.delivered = true;
    if (e.event_type === "open") status.opened = true;
    if (e.event_type === "click") status.clicked = true;
    if (e.event_type === "bounce" || e.event_type === "dropped") status.bounced = true;
    statusByContact.set(e.contact_email, status);
  }
  const allContactEmails = new Set([...statusByContact.keys(), ...maxSegmentByContact.keys()]);
  const recipients = [...allContactEmails].map((email) => {
    const status = statusByContact.get(email) ?? {
      delivered: false,
      opened: false,
      clicked: false,
      bounced: false,
    };
    const maxSegment = maxSegmentByContact.get(email);
    return {
      email,
      ...status,
      readDepthPct: maxSegment ? Math.round((maxSegment / 4) * 100) : null,
    };
  });
  const notOpened = recipients.filter((r) => r.delivered && !r.opened).map((r) => r.email);
  const notReceived = recipients.filter((r) => !r.delivered).map((r) => r.email);

  // Recipients are only ever known by email at this point (tracking events /
  // pixels carry no employee identifier) -- look each one up against the
  // employee directory to attach Client Name and COSID where they match.
  const { data: employeeMatches } =
    recipients.length > 0
      ? await supabase
          .from("cosphere_active_employees")
          .select("office_email, client_name, employee_id")
          .in(
            "office_email",
            recipients.map((r) => r.email),
          )
      : { data: [] as { office_email: string; client_name: string | null; employee_id: string }[] };

  const employeeByEmail = new Map(
    (employeeMatches ?? []).map((e) => [e.office_email.toLowerCase(), e]),
  );
  const recipientsWithIdentity = recipients.map((r) => {
    const match = employeeByEmail.get(r.email.toLowerCase());
    return {
      ...r,
      clientName: match?.client_name ?? null,
      cosid: match?.employee_id ?? null,
    };
  });

  const activity: ActivityRow[] = [
    ...allEvents.map((e) => ({
      key: e.id,
      contact_email: e.contact_email,
      label: e.event_type,
      url: e.url,
      when: e.occurred_at,
    })),
    ...allPixels.map((p) => ({
      key: p.id,
      contact_email: p.contact_email,
      label: `read depth: ${READ_DEPTH_LABELS[p.segment]}`,
      url: null,
      when: p.fired_at,
    })),
  ].sort((a, b) => new Date(b.when ?? 0).getTime() - new Date(a.when ?? 0).getTime());

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900">{campaign.name}</h1>
          <p className="text-sm text-neutral-500">{campaign.subject}</p>
        </div>
        {campaign.status !== "draft" && campaign.status !== "queued" && (
          <ResendPanel campaignId={id} recipients={recipients} notOpened={notOpened} notReceived={notReceived} />
        )}
      </div>

      {campaign.status === "queued" && (
        <div className="rounded-lg border border-purple-200 bg-purple-50 p-4 text-sm text-purple-800">
          Preparing to send -- SendGrid is importing the recipient list. This page will show delivery stats once
          it's actually sent, usually within a few minutes; refresh to check.
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
        <Stat label="Delivered" value={funnel.delivered} />
        <Stat label="Opened" value={funnel.uniqueOpens} sub={`${funnel.opens} total opens`} />
        <Stat label="Clicked" value={funnel.uniqueClicks} sub={`${funnel.clicks} total clicks`} />
        <Stat label="Bounced / Unsub" value={funnel.bounces + funnel.unsubscribes} />
        <Stat
          label="Avg. read depth"
          value={avgReadDepthPct ?? 0}
          sub={avgReadDepthPct === null ? "No signal yet" : `across ${readers.length} recipients`}
          suffix="%"
        />
      </div>

      <section className="space-y-2">
        <h2 className="text-lg font-medium text-neutral-900">Read depth</h2>
        <p className="text-xs text-neutral-500">
          Estimated from invisible tracking pixels placed at 25/50/75/100% through the email body — email
          clients block scripts, so this only fires when a recipient&apos;s client downloads images.
        </p>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {segmentReachCounts.map((s) => (
            <div key={s.segment} className="rounded-lg border border-neutral-200 bg-white p-4">
              <p className="text-sm text-neutral-500">Reached {s.label}</p>
              <p className="text-2xl font-semibold text-neutral-900">{s.count}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-medium text-neutral-900">Recipients</h2>
        <p className="text-xs text-neutral-500">Per-recipient status and estimated read depth.</p>
        <div className="max-h-96 overflow-y-auto overflow-x-auto rounded-lg border border-neutral-200 bg-white">
          <table className="w-full text-sm">
            <thead className="sticky top-0 border-b border-neutral-200 bg-neutral-50 text-left text-neutral-500">
              <tr>
                <th className="px-4 py-2 font-medium">Recipient</th>
                <th className="px-4 py-2 font-medium">Client</th>
                <th className="px-4 py-2 font-medium">COSID</th>
                <th className="px-4 py-2 font-medium">Delivered</th>
                <th className="px-4 py-2 font-medium">Opened</th>
                <th className="px-4 py-2 font-medium">Clicked</th>
                <th className="px-4 py-2 font-medium">Read depth</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {[...recipientsWithIdentity]
                .sort((a, b) => (b.readDepthPct ?? -1) - (a.readDepthPct ?? -1))
                .map((r) => (
                  <tr key={r.email}>
                    <td className="px-4 py-2 text-neutral-700">{r.email}</td>
                    <td className="px-4 py-2 text-neutral-500">{r.clientName ?? "—"}</td>
                    <td className="px-4 py-2 text-neutral-500">{r.cosid ?? "—"}</td>
                    <td className="px-4 py-2 text-neutral-500">{r.bounced ? "bounced" : r.delivered ? "yes" : "—"}</td>
                    <td className="px-4 py-2 text-neutral-500">{r.opened ? "yes" : "—"}</td>
                    <td className="px-4 py-2 text-neutral-500">{r.clicked ? "yes" : "—"}</td>
                    <td className="px-4 py-2 text-neutral-500">
                      {r.readDepthPct !== null ? (
                        <span className="inline-flex items-center gap-2">
                          <span className="h-1.5 w-16 overflow-hidden rounded-full bg-neutral-100">
                            <span
                              className="block h-full rounded-full bg-neutral-900"
                              style={{ width: `${r.readDepthPct}%` }}
                            />
                          </span>
                          {r.readDepthPct}%
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              {recipients.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-neutral-500">
                    No recipient activity recorded yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-medium text-neutral-900">Link clicks</h2>
        <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-neutral-200 bg-neutral-50 text-left text-neutral-500">
              <tr>
                <th className="px-4 py-2 font-medium">URL</th>
                <th className="px-4 py-2 font-medium">Clicks</th>
                <th className="px-4 py-2 font-medium">Clicked by</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {(links ?? [])
                .map((l) => ({ ...l, clicks: clickCountsByUrl.get(l.url) ?? 0 }))
                .sort((a, b) => b.clicks - a.clicks)
                .map((l) => {
                  const clickers = [...(clickersByUrl.get(l.url) ?? [])];
                  return (
                    <tr key={l.id}>
                      <td className="max-w-md truncate px-4 py-2 text-neutral-700" title={l.url}>
                        {l.label ?? l.url}
                      </td>
                      <td className="px-4 py-2 text-neutral-500">{l.clicks}</td>
                      <td className="px-4 py-2 text-neutral-500">
                        {clickers.length === 0 ? (
                          "—"
                        ) : (
                          <ul className="space-y-1">
                            {clickers.map((email) => {
                              const match = employeeByEmail.get(email.toLowerCase());
                              return (
                                <li key={email}>
                                  <span className="text-neutral-700">{email}</span>
                                  {match && (
                                    <span className="text-neutral-400">
                                      {" "}
                                      — {match.client_name ?? "—"} · {match.employee_id}
                                    </span>
                                  )}
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </td>
                    </tr>
                  );
                })}
              {(links ?? []).length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-6 text-center text-neutral-500">
                    No links tracked yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-medium text-neutral-900">Recent activity</h2>
        <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-neutral-200 bg-neutral-50 text-left text-neutral-500">
              <tr>
                <th className="px-4 py-2 font-medium">Recipient</th>
                <th className="px-4 py-2 font-medium">Client</th>
                <th className="px-4 py-2 font-medium">COSID</th>
                <th className="px-4 py-2 font-medium">Event</th>
                <th className="px-4 py-2 font-medium">URL</th>
                <th className="px-4 py-2 font-medium">When</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {activity.slice(0, 150).map((e) => {
                const match = e.contact_email ? employeeByEmail.get(e.contact_email.toLowerCase()) : undefined;
                return (
                  <tr key={e.key}>
                    <td className="px-4 py-2 text-neutral-700">{e.contact_email}</td>
                    <td className="px-4 py-2 text-neutral-500">{match?.client_name ?? "—"}</td>
                    <td className="px-4 py-2 text-neutral-500">{match?.employee_id ?? "—"}</td>
                    <td className="px-4 py-2 text-neutral-700">{e.label}</td>
                    <td className="max-w-xs truncate px-4 py-2 text-neutral-500" title={e.url ?? undefined}>
                      {e.url ?? "—"}
                    </td>
                    <td className="px-4 py-2 text-neutral-500">
                      {formatDateTime(e.when)}
                    </td>
                  </tr>
                );
              })}
              {activity.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-neutral-500">
                    No tracking events yet. Make sure the SendGrid Event Webhook is configured and pointed at
                    /api/webhooks/sendgrid.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value, sub, suffix }: { label: string; value: number; sub?: string; suffix?: string }) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4">
      <p className="text-sm text-neutral-500">{label}</p>
      <p className="text-2xl font-semibold text-neutral-900">
        {value.toLocaleString()}
        {suffix}
      </p>
      {sub && <p className="text-xs text-neutral-400">{sub}</p>}
    </div>
  );
}
