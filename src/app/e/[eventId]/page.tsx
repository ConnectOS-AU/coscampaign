import { createServiceRoleClient } from "@/lib/supabase";
import type { Event, EventField } from "@/lib/types";
import { formatDateTime } from "@/lib/format-date";
import { EventRegistrationForm } from "./event-registration-form";

export default async function EventRegistrationPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;

  const supabase = createServiceRoleClient();
  const [{ data: event }, { data: fields }] = await Promise.all([
    supabase.from("marketing_email_events").select("*").eq("id", eventId).single<Event>(),
    supabase
      .from("marketing_email_event_fields")
      .select("*")
      .eq("event_id", eventId)
      .order("position")
      .returns<EventField[]>(),
  ]);

  if (!event) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-50 px-4">
        <p className="text-sm text-neutral-600">This event doesn&apos;t exist or has been removed.</p>
      </div>
    );
  }

  if (event.status !== "open") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-50 px-4">
        <div className="max-w-sm rounded-lg border border-neutral-200 bg-white p-8 text-center shadow-sm">
          <h1 className="text-lg font-semibold text-neutral-900">{event.name}</h1>
          <p className="mt-2 text-sm text-neutral-600">
            {event.status === "draft" ? "Registration hasn't opened yet." : "Registration is closed."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-50 px-4 py-12">
      <div className="w-full max-w-lg rounded-lg border border-neutral-200 bg-white p-8 shadow-sm">
        {event.banner_image_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={event.banner_image_url} alt="" className="mb-4 w-full rounded-md object-cover" />
        )}
        <h1 className="text-xl font-semibold text-neutral-900">{event.name}</h1>
        <div className="mt-1 space-y-0.5 text-sm text-neutral-500">
          {event.starts_at && <p>{formatDateTime(event.starts_at)}</p>}
          {event.location && <p>{event.location}</p>}
        </div>
        {event.description && <p className="mt-3 text-sm text-neutral-600">{event.description}</p>}
        <EventRegistrationForm
          eventId={eventId}
          fields={fields ?? []}
          accentColor={event.accent_color}
          maxTicketsPerPerson={event.max_tickets_per_person}
        />
      </div>
    </div>
  );
}
