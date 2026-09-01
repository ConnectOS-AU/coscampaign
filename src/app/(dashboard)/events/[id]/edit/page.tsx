import { notFound } from "next/navigation";
import { createServiceRoleClient } from "@/lib/supabase";
import { getSession } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import type { Event, EventField } from "@/lib/types";
import { EventEditor } from "./event-editor";

export default async function EditEventPage({ params }: { params: Promise<{ id: string }> }) {
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
  const [{ data: event, error }, { data: fields }] = await Promise.all([
    supabase.from("marketing_email_events").select("*").eq("id", id).single<Event>(),
    supabase
      .from("marketing_email_event_fields")
      .select("*")
      .eq("event_id", id)
      .order("position")
      .returns<EventField[]>(),
  ]);

  if (error || !event) {
    notFound();
  }

  return <EventEditor event={event} initialFields={fields ?? []} />;
}
