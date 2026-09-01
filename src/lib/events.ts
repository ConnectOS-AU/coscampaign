import { createServiceRoleClient } from "@/lib/supabase";

export async function resolveEventRegistrantEmails(eventId: string): Promise<string[]> {
  const supabase = createServiceRoleClient();
  const { data } = await supabase.from("marketing_email_event_registrations").select("email").eq("event_id", eventId);
  const emails = new Set<string>();
  for (const row of data ?? []) {
    if (row.email) emails.add(row.email);
  }
  return [...emails];
}

export type EventRegistrantCounts = { confirmed: number; waitlisted: number };

/**
 * Counts confirmed/waitlisted registrants for a set of events in one query,
 * for the events list page and the campaign editor's event picker.
 */
export async function getEventRegistrantCounts(eventIds: string[]): Promise<Map<string, EventRegistrantCounts>> {
  const counts = new Map<string, EventRegistrantCounts>();
  if (eventIds.length === 0) return counts;

  const supabase = createServiceRoleClient();
  const { data } = await supabase
    .from("marketing_email_event_registrations")
    .select("event_id, status")
    .in("event_id", eventIds);

  for (const row of data ?? []) {
    const entry = counts.get(row.event_id) ?? { confirmed: 0, waitlisted: 0 };
    if (row.status === "waitlisted") entry.waitlisted += 1;
    else entry.confirmed += 1;
    counts.set(row.event_id, entry);
  }
  return counts;
}
