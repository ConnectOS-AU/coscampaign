import { notFound } from "next/navigation";
import { createServiceRoleClient } from "@/lib/supabase";
import { getSession } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import type { Event, EventField, EventRegistration, EventRegistrationAnswer } from "@/lib/types";

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
  const { data: answers } = registrationIds.length
    ? await supabase
        .from("marketing_email_event_registration_answers")
        .select("*")
        .in("registration_id", registrationIds)
        .returns<EventRegistrationAnswer[]>()
    : { data: [] as EventRegistrationAnswer[] };

  const answersByRegistration = new Map<string, Map<string, string>>();
  for (const a of answers ?? []) {
    const byField = answersByRegistration.get(a.registration_id) ?? new Map<string, string>();
    byField.set(a.field_id, a.answer_text ?? "");
    answersByRegistration.set(a.registration_id, byField);
  }

  const confirmedCount = (registrations ?? []).filter((r) => r.status === "confirmed").length;
  const waitlistedCount = (registrations ?? []).length - confirmedCount;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-neutral-900">{event.name} — Registrations</h1>
        <p className="text-sm text-neutral-500">
          {confirmedCount} confirmed{waitlistedCount > 0 ? `, ${waitlistedCount} waitlisted` : ""}
        </p>
      </div>

      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-neutral-200 bg-neutral-50 text-left text-neutral-500">
            <tr>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">Status</th>
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
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      r.status === "confirmed" ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"
                    }`}
                  >
                    {r.status}
                  </span>
                </td>
                {(fields ?? []).map((f) => (
                  <td key={f.id} className="px-4 py-3 text-neutral-600">
                    {answersByRegistration.get(r.id)?.get(f.id) ?? ""}
                  </td>
                ))}
                <td className="px-4 py-3 text-neutral-500">{new Date(r.registered_at).toLocaleString("en-AU")}</td>
              </tr>
            ))}
            {(registrations ?? []).length === 0 && (
              <tr>
                <td colSpan={4 + (fields ?? []).length} className="px-4 py-8 text-center text-neutral-500">
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
