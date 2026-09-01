import Link from "next/link";
import { createServiceRoleClient } from "@/lib/supabase";
import { getSession } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import type { Event } from "@/lib/types";
import { getEventRegistrantCounts } from "@/lib/events";
import { createEvent } from "./actions";
import { DeleteEventButton } from "./delete-event-button";

const STATUS_LABEL: Record<Event["status"], string> = {
  draft: "Draft",
  open: "Open",
  closed: "Closed",
};

export default async function EventsPage() {
  const session = await getSession();

  if (!hasPermission(session, "manage_events")) {
    return (
      <div className="rounded-lg border border-neutral-200 bg-white p-8 text-center">
        <p className="text-sm text-neutral-600">You don&apos;t have access to events.</p>
      </div>
    );
  }

  const supabase = createServiceRoleClient();
  const { data: events } = await supabase
    .from("marketing_email_events")
    .select("*")
    .order("updated_at", { ascending: false })
    .returns<Event[]>();

  const counts = await getEventRegistrantCounts((events ?? []).map((e) => e.id));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900">Events</h1>
          <p className="text-sm text-neutral-500">Create events, share registration links, and invite people.</p>
        </div>
        <form action={createEvent}>
          <button
            type="submit"
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
          >
            New event
          </button>
        </form>
      </div>

      <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-neutral-200 bg-neutral-50 text-left text-neutral-500">
            <tr>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Registrants</th>
              <th className="px-4 py-3 font-medium">Starts</th>
              <th className="px-4 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {(events ?? []).map((e) => {
              const c = counts.get(e.id) ?? { confirmed: 0, waitlisted: 0 };
              return (
                <tr key={e.id}>
                  <td className="px-4 py-3">
                    <Link href={`/events/${e.id}/edit`} className="font-medium text-neutral-900 hover:underline">
                      {e.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-neutral-600">{STATUS_LABEL[e.status]}</td>
                  <td className="px-4 py-3 text-neutral-600">
                    <Link href={`/events/${e.id}/registrations`} className="hover:underline">
                      {c.confirmed} confirmed{c.waitlisted > 0 ? `, ${c.waitlisted} waitlisted` : ""}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-neutral-500">
                    {e.starts_at ? new Date(e.starts_at).toLocaleString("en-AU") : "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <DeleteEventButton id={e.id} />
                  </td>
                </tr>
              );
            })}
            {(events ?? []).length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-neutral-500">
                  No events yet. Create one to get started.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
