import { Fragment } from "react";
import Link from "next/link";
import { createServiceRoleClient } from "@/lib/supabase";
import { getSession } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import type { Campaign } from "@/lib/types";
import { formatDate, formatDateTime } from "@/lib/format-date";
import { createCampaign } from "./actions";
import { DeleteCampaignButton } from "./delete-campaign-button";

const STATUS_STYLES: Record<Campaign["status"], string> = {
  draft: "bg-neutral-100 text-neutral-700",
  queued: "bg-purple-100 text-purple-800",
  scheduled: "bg-amber-100 text-amber-800",
  sending: "bg-blue-100 text-blue-800",
  sent: "bg-green-100 text-green-800",
};

type CampaignRow = Pick<Campaign, "id" | "name" | "subject" | "status" | "sent_at" | "scheduled_at" | "updated_at">;

const DRAFTS_GROUP = "Drafts";
const QUEUED_GROUP = "Queued -- preparing to send";

/** Groups by the date a campaign was sent (or is scheduled to send); drafts/queued have neither, so they get their own groups. */
function groupCampaigns(campaigns: CampaignRow[]): [string, CampaignRow[]][] {
  const sorted = [...campaigns].sort((a, b) => {
    const dateOf = (c: CampaignRow) => c.sent_at ?? c.scheduled_at ?? c.updated_at;
    return new Date(dateOf(b)).getTime() - new Date(dateOf(a)).getTime();
  });

  const drafts = sorted.filter((c) => c.status === "draft");
  const queued = sorted.filter((c) => c.status === "queued");
  const rest = sorted.filter((c) => c.status !== "draft" && c.status !== "queued");

  const groups = new Map<string, CampaignRow[]>();
  for (const c of rest) {
    const date = c.sent_at ?? c.scheduled_at;
    const label = date ? formatDate(date) : "Unknown date";
    const list = groups.get(label) ?? [];
    list.push(c);
    groups.set(label, list);
  }

  const entries: [string, CampaignRow[]][] = [...groups.entries()];
  if (queued.length > 0) entries.unshift([QUEUED_GROUP, queued]);
  if (drafts.length > 0) entries.unshift([DRAFTS_GROUP, drafts]);
  return entries;
}

export default async function CampaignsPage() {
  const session = await getSession();
  const canManageCampaigns = hasPermission(session, "manage_campaigns");

  const supabase = createServiceRoleClient();
  const { data: campaigns, error } = await supabase
    .from("marketing_email_campaigns")
    .select("id, name, subject, status, sent_at, scheduled_at, updated_at")
    .order("updated_at", { ascending: false })
    .returns<CampaignRow[]>();

  const groups = groupCampaigns(campaigns ?? []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-neutral-900">Campaigns</h1>
        <div className="flex items-center gap-2">
          {canManageCampaigns && (
            <a
              href="/api/campaigns/export"
              className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
            >
              Export CSV
            </a>
          )}
          {canManageCampaigns && (
            <form action={createCampaign}>
              <button
                type="submit"
                className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
              >
                New campaign
              </button>
            </form>
          )}
        </div>
      </div>

      {error && <p className="text-sm text-red-600">Failed to load campaigns: {error.message}</p>}

      <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-neutral-200 bg-neutral-50 text-left text-neutral-500">
            <tr>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Subject</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Updated</th>
              <th className="px-4 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {groups.map(([label, rows]) => (
              <Fragment key={label}>
                <tr>
                  <td colSpan={5} className="bg-neutral-50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                    {label}
                  </td>
                </tr>
                {rows.map((c) => (
                  <tr key={c.id} className="hover:bg-neutral-50">
                    <td className="px-4 py-3">
                      <Link
                        href={c.status === "draft" ? `/campaigns/${c.id}/edit` : `/campaigns/${c.id}/report`}
                        className="font-medium text-neutral-900 hover:underline"
                      >
                        {c.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-neutral-600">{c.subject ?? "—"}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-1 text-xs font-medium ${STATUS_STYLES[c.status]}`}>
                        {c.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-neutral-500">
                      {formatDateTime(c.updated_at)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {canManageCampaigns && <DeleteCampaignButton id={c.id} status={c.status} />}
                    </td>
                  </tr>
                ))}
              </Fragment>
            ))}
            {campaigns?.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-neutral-500">
                  No campaigns yet. Create one to get started.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
