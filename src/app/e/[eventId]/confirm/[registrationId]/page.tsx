import { createServiceRoleClient } from "@/lib/supabase";
import { buildEventIcs } from "@/lib/ics";
import { formatDateTime } from "@/lib/format-date";
import type { Event, EventRegistration } from "@/lib/types";

export default async function ConfirmRegistrationPage({
  params,
}: {
  params: Promise<{ eventId: string; registrationId: string }>;
}) {
  const { eventId, registrationId } = await params;
  const supabase = createServiceRoleClient();

  const [{ data: event }, { data: registration }] = await Promise.all([
    supabase.from("marketing_email_events").select("*").eq("id", eventId).single<Event>(),
    supabase
      .from("marketing_email_event_registrations")
      .select("*")
      .eq("id", registrationId)
      .eq("event_id", eventId)
      .maybeSingle<EventRegistration>(),
  ]);

  if (!event || !registration) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-50 px-4">
        <p className="text-sm text-neutral-600">This confirmation link is invalid or has been removed.</p>
      </div>
    );
  }

  const alreadyConfirmed = registration.email_confirmed_at !== null;
  if (!alreadyConfirmed) {
    await supabase
      .from("marketing_email_event_registrations")
      .update({ email_confirmed_at: new Date().toISOString() })
      .eq("id", registrationId);
  }

  const icsDataUrl = `data:text/calendar;charset=utf-8,${encodeURIComponent(buildEventIcs(event))}`;

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-50 px-4 py-12">
      <div className="w-full max-w-lg rounded-lg border border-neutral-200 bg-white p-8 text-center shadow-sm">
        <h1 className="text-xl font-semibold text-neutral-900">{event.name}</h1>
        <p className="mt-2 text-sm font-medium text-green-700">
          {alreadyConfirmed ? "You've already confirmed this registration." : "Registration confirmed!"}
        </p>
        <div className="mt-3 space-y-0.5 text-sm text-neutral-500">
          {event.starts_at && <p>{formatDateTime(event.starts_at)}</p>}
          {event.location && <p>{event.location}</p>}
        </div>
        {registration.status === "waitlisted" && (
          <p className="mt-3 text-sm text-amber-700">
            You&apos;re on the waitlist — we&apos;ll reach out if a spot opens up.
          </p>
        )}
        <a
          href={icsDataUrl}
          download={`${event.name}.ics`}
          className="mt-6 inline-block rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
        >
          Add to calendar
        </a>
      </div>
    </div>
  );
}
