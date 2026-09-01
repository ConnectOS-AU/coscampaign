import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase";
import { lookupEmployeeByCosid } from "@/lib/employees";
import { sendTransactionalEmail } from "@/lib/sendgrid";
import type { Event, EventField } from "@/lib/types";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const body = (await request.json().catch(() => ({}))) as {
    name?: unknown;
    email?: unknown;
    cosid?: unknown;
    answers?: unknown;
  };
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const cosid = typeof body.cosid === "string" ? body.cosid.trim().toUpperCase() : "";
  const answers: unknown[] = Array.isArray(body.answers) ? body.answers : [];

  if (!name || !email || !cosid) {
    return NextResponse.json({ error: "Name, email, and COSID are required" }, { status: 400 });
  }

  const employee = await lookupEmployeeByCosid(cosid);
  if (!employee) {
    return NextResponse.json(
      { error: "COSID not recognized. Please check your employee ID and try again." },
      { status: 400 },
    );
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
    .insert({ event_id: id, name, email, cosid, verified_email: employee.email, status })
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

  const origin = new URL(request.url).origin;
  const confirmUrl = `${origin}/e/${id}/confirm/${registration.id}`;
  try {
    await sendTransactionalEmail({
      to: employee.email,
      subject: `Confirm your registration: ${event.name}`,
      html: `
        <p>Hi ${employee.name.split(" ")[0]},</p>
        <p>You (or someone using your COSID) registered for <strong>${event.name}</strong>${
          status === "waitlisted" ? " and are currently on the waitlist" : ""
        }. Click below to confirm this is really you within the next 72 hours, or the registration will be
        automatically cancelled.</p>
        <p><a href="${confirmUrl}" style="background:#171717;color:#fff;padding:12px 24px;text-decoration:none;border-radius:6px;">Confirm registration</a></p>
        <p style="color:#737373;font-size:12px;">${confirmUrl}</p>
      `,
    });
  } catch (err) {
    // The registration itself succeeded; a failed confirmation email
    // shouldn't surface as a failed registration -- log and continue.
    console.error(`[events/${id}/register] Failed to send confirmation email:`, err);
  }

  return NextResponse.json({ status, verifiedEmail: employee.email });
}
