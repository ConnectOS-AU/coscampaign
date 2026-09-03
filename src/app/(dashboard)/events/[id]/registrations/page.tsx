import { notFound } from "next/navigation";
import { createServiceRoleClient } from "@/lib/supabase";
import { getSession } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import type { Event, EventField, EventRegistration, EventRegistrationAnswer, EventRegistrationGuest } from "@/lib/types";
import { formatDateTime } from "@/lib/format-date";

export default async function EventRegistrationsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();

  if (!hasPermission(session, "manage_events")) {
    return (
      <div className="rounded-lg border border-neutral-200 bg-white p-8 text-center">
        <p className="text-sm text-neutral-600">You don&apos;t have access to events.</p>
      </div>
    );
  }

  const supabase = createServiceRoleClient();
  const [{ data: event, error }, { data: fields }, { data: registrations }] = await Promise.all([
    supabase.from("marketing_email_events").select("*").eq("id", id).single<Event>(),
    supabase
      .from("marketing_email_event_fields")
      .select("*")
      .eq("event_id", id)
      .order("position")
      .returns<EventField[]>(),
    supabase
      .from("marketing_email_event_registrations")
      .select("*")
      .eq("event_id", id)
      .order("registered_at", { ascending: false })
      .returns<EventRegistration[]>(),
  ]);

  if (error || !event) {
    notFound();
  }

  const registrationIds = (registrations ?? []).map((r) => r.id);
  const [{ data: answers }, { data: guests }] = await Promise.all([
    registrationIds.length
      ? supabase
          .from("marketing_email_event_registration_answers")
          .select("*")
          .in("registration_id", registrationIds)
          .returns<EventRegistrationAnswer[]>()
      : Promise.resolve({ data: [] as EventRegistrationAnswer[] }),
    registrationIds.length
      ? supabase
          .from("marketing_email_event_registration_guests")
          .select("*")
          .in("registration_id", registrationIds)
          .returns<EventRegistrationGuest[]>()
      : Promise.resolve({ data: [] as EventRegistrationGuest[] }),
  ]);

  const answersByRegistration = new Map<string, Map<string, string>>();
  for (const a of answers ?? []) {
    const byField = answersByRegistration.get(a.registration_id) ?? new Map<string, string>();
    byField.set(a.field_id, a.answer_text ?? "");
    answersByRegistration.set(a.registration_id, byField);
  }

  const guestsByRegistration = new Map<string, EventRegistrationGuest[]>();
  for (const g of guests ?? []) {
    const list = guestsByRegistration.get(g.registration_id) ?? [];
    list.push(g);
    guestsByRegistration.set(g.registration_id, list);
  }

  const confirmedTickets = (registrations ?? [])
    .filter((r) => r.status === "confirmed")
    .reduce((sum, r) => sum + r.ticket_count, 0);
  const waitlistedTickets = (registrations ?? [])
    .filter((r) => r.status === "waitlisted")
    .reduce((sum, r) => sum + r.ticket_count, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900">{event.name} — Registrations</h1>
          <p className="text-sm text-neutral-500">
            {confirmedTickets} confirmed ticket{confirmedTickets === 1 ? "" : "s"}
            {waitlistedTickets > 0 ? `, ${waitlistedTickets} waitlisted` : ""}
          </p>
        </div>
        <a
          href={`/api/events/${id}/registrations/export`}
          className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
        >
          Export CSV
        </a>
      </div>

      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-neutral-200 bg-neutral-50 text-left text-neutral-500">
            <tr>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">COSID</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Verified</th>
              <th className="px-4 py-3 font-medium">Tickets</th>
              <th className="px-4 py-3 font-medium">Guests</th>
              {(fields ?? []).map((f) => (
                <th key={f.id} className="px-4 py-3 font-medium">
                  {f.field_label}
                </th>
              ))}
              <th className="px-4 py-3 font-medium">Registered</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {(registrations ?? []).map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-3 text-neutral-900">{r.name}</td>
                <td className="px-4 py-3 text-neutral-600">{r.email}</td>
                <td className="px-4 py-3 text-neutral-600">{r.cosid}</td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      r.status === "confirmed" ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"
                    }`}
                  >
                    {r.status}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      r.email_confirmed_at ? "bg-green-100 text-green-800" : "bg-neutral-100 text-neutral-600"
                    }`}
                  >
                    {r.email_confirmed_at ? "Verified" : "Pending"}
                  </span>
                </td>
                <td className="px-4 py-3 text-neutral-600">{r.ticket_count}</td>
                <td className="px-4 py-3 text-neutral-600">
                  {(guestsByRegistration.get(r.id) ?? []).length === 0
                    ? "—"
                    : (guestsByRegistration.get(r.id) ?? [])
                        .map((g) => `${g.name} (${g.relationship})`)
                        .join(", ")}
                </td>
                {(fields ?? []).map((f) => (
                  <td key={f.id} className="px-4 py-3 text-neutral-600">
                    {answersByRegistration.get(r.id)?.get(f.id) ?? ""}
                  </td>
                ))}
                <td className="px-4 py-3 text-neutral-500">{formatDateTime(r.registered_at)}</td>
              </tr>
            ))}
            {(registrations ?? []).length === 0 && (
              <tr>
                <td colSpan={8 + (fields ?? []).length} className="px-4 py-8 text-center text-neutral-500">
                  No registrations yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
