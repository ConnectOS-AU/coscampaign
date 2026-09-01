import Link from "next/link";
import { createServiceRoleClient } from "@/lib/supabase";
import type { Campaign } from "@/lib/types";

const STATUS_STYLES: Record<Campaign["status"], string> = {
  draft: "bg-neutral-100 text-neutral-700",
  scheduled: "bg-amber-100 text-amber-800",
  sending: "bg-blue-100 text-blue-800",
  sent: "bg-green-100 text-green-800",
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const { month: monthParam } = await searchParams;

  const now = new Date();
  let year = now.getFullYear();
  let month = now.getMonth(); // 0-indexed

  if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
    const [y, m] = monthParam.split("-").map(Number);
    year = y;
    month = m - 1;
  }

  type CalendarCampaign = Pick<Campaign, "id" | "name" | "status" | "scheduled_at" | "sent_at" | "updated_at">;

  const supabase = createServiceRoleClient();
  const { data: campaigns } = await supabase
    .from("marketing_email_campaigns")
    .select("id, name, status, scheduled_at, sent_at, updated_at")
    .order("updated_at", { ascending: false })
    .returns<CalendarCampaign[]>();

  const dated: { campaign: CalendarCampaign; date: Date }[] = [];
  const unscheduled: CalendarCampaign[] = [];

  for (const c of campaigns ?? []) {
    const raw = c.scheduled_at ?? c.sent_at;
    if (raw) {
      dated.push({ campaign: c, date: new Date(raw) });
    } else {
      unscheduled.push(c);
    }
  }

  const campaignsByDay = new Map<string, typeof dated>();
  for (const entry of dated) {
    const key = dateKey(entry.date);
    const list = campaignsByDay.get(key) ?? [];
    list.push(entry);
    campaignsByDay.set(key, list);
  }

  const firstOfMonth = new Date(year, month, 1);
  const startOffset = firstOfMonth.getDay(); // 0 = Sunday
  const gridStart = new Date(year, month, 1 - startOffset);

  const cells: Date[] = [];
  for (let i = 0; i < 42; i++) {
    cells.push(new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i));
  }

  const prevMonthDate = new Date(year, month - 1, 1);
  const nextMonthDate = new Date(year, month + 1, 1);
  const prevMonthParam = `${prevMonthDate.getFullYear()}-${String(prevMonthDate.getMonth() + 1).padStart(2, "0")}`;
  const nextMonthParam = `${nextMonthDate.getFullYear()}-${String(nextMonthDate.getMonth() + 1).padStart(2, "0")}`;
  const todayKey = dateKey(now);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-neutral-900">Content calendar</h1>
        <div className="flex items-center gap-3">
          <Link
            href={`/calendar?month=${prevMonthParam}`}
            className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-100"
          >
            ← Prev
          </Link>
          <span className="text-sm font-medium text-neutral-900">
            {MONTH_NAMES[month]} {year}
          </span>
          <Link
            href={`/calendar?month=${nextMonthParam}`}
            className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-100"
          >
            Next →
          </Link>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
        <div className="grid grid-cols-7 border-b border-neutral-200 bg-neutral-50">
          {WEEKDAYS.map((d) => (
            <div key={d} className="px-2 py-2 text-center text-xs font-medium text-neutral-500">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((cellDate) => {
            const key = dateKey(cellDate);
            const inMonth = cellDate.getMonth() === month;
            const entries = campaignsByDay.get(key) ?? [];
            return (
              <div
                key={key}
                className={`min-h-[110px] border-b border-r border-neutral-100 p-1.5 last:border-r-0 ${
                  inMonth ? "bg-white" : "bg-neutral-50"
                }`}
              >
                <p
                  className={`mb-1 text-xs ${
                    key === todayKey
                      ? "inline-flex h-5 w-5 items-center justify-center rounded-full bg-neutral-900 font-semibold text-white"
                      : inMonth
                        ? "text-neutral-500"
                        : "text-neutral-300"
                  }`}
                >
                  {cellDate.getDate()}
                </p>
                <div className="space-y-1">
                  {entries.map(({ campaign: c }) => (
                    <Link
                      key={c.id}
                      href={c.status === "draft" ? `/campaigns/${c.id}/edit` : `/campaigns/${c.id}/report`}
                      className={`block truncate rounded px-1.5 py-0.5 text-xs font-medium ${STATUS_STYLES[c.status]}`}
                      title={c.name}
                    >
                      {c.name}
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <section className="space-y-2">
        <h2 className="text-lg font-medium text-neutral-900">Unscheduled drafts</h2>
        <div className="flex flex-wrap gap-2">
          {unscheduled.map((c) => (
            <Link
              key={c.id}
              href={`/campaigns/${c.id}/edit`}
              className={`rounded-full px-3 py-1 text-xs font-medium ${STATUS_STYLES[c.status]}`}
            >
              {c.name}
            </Link>
          ))}
          {unscheduled.length === 0 && <p className="text-sm text-neutral-500">None.</p>}
        </div>
      </section>
    </div>
  );
}
