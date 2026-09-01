import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase";
import type { Event, EventField } from "@/lib/types";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const body = (await request.json().catch(() => ({}))) as {
    name?: unknown;
    email?: unknown;
    answers?: unknown;
  };
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const answers: unknown[] = Array.isArray(body.answers) ? body.answers : [];

  if (!name || !email) {
    return NextResponse.json({ error: "Name and email are required" }, { status: 400 });
  }

  const supabase = createServiceRoleClient();

  const { data: event } = await supabase
    .from("marketing_email_events")
    .select("*")
    .eq("id", id)
    .single<Event>();
  if (!event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }
  if (event.status !== "open") {
    return NextResponse.json({ error: "Registration is not open for this event" }, { status: 409 });
  }

  const { data: fields } = await supabase
    .from("marketing_email_event_fields")
    .select("*")
    .eq("event_id", id)
    .returns<EventField[]>();

  const answersByFieldId = new Map<string, string>();
  for (const a of answers) {
    if (typeof a === "object" && a !== null && typeof (a as { field_id?: unknown }).field_id === "string") {
      const answerText = (a as { answer_text?: unknown }).answer_text;
      answersByFieldId.set((a as { field_id: string }).field_id, typeof answerText === "string" ? answerText : "");
    }
  }

  for (const field of fields ?? []) {
    if (field.required && !answersByFieldId.get(field.id)?.trim()) {
      return NextResponse.json({ error: `"${field.field_label}" is required` }, { status: 400 });
    }
  }

  // Optimistic capacity check (count then insert, not a locked transaction) --
  // acceptable for an internal tool's traffic; a burst of simultaneous
  // last-slot submissions could over-book by a small margin.
  let status: "confirmed" | "waitlisted" = "confirmed";
  if (event.capacity !== null) {
    const { count } = await supabase
      .from("marketing_email_event_registrations")
      .select("id", { count: "exact", head: true })
      .eq("event_id", id)
      .eq("status", "confirmed");
    if ((count ?? 0) >= event.capacity) {
      status = "waitlisted";
    }
  }

  const { data: registration, error: registrationError } = await supabase
    .from("marketing_email_event_registrations")
    .insert({ event_id: id, name, email, status })
    .select("id")
    .single();

  if (registrationError) {
    if (registrationError.code === "23505") {
      return NextResponse.json({ error: "You've already registered for this event" }, { status: 409 });
    }
    return NextResponse.json({ error: "Failed to record registration" }, { status: 500 });
  }

  const rows = [...answersByFieldId.entries()].map(([field_id, answer_text]) => ({
    registration_id: registration.id,
    field_id,
    answer_text,
  }));

  if (rows.length > 0) {
    const { error: answersError } = await supabase.from("marketing_email_event_registration_answers").insert(rows);
    if (answersError) {
      return NextResponse.json({ error: "Registered, but failed to save some answers" }, { status: 500 });
    }
  }

  return NextResponse.json({ status });
}
