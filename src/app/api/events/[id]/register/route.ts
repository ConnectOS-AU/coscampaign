import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase";
import { lookupEmployeeByCosid } from "@/lib/employees";
import { sendTransactionalEmail } from "@/lib/sendgrid";
import { buildEventEmailHtml } from "@/lib/event-email";
import type { Event, EventField } from "@/lib/types";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const body = (await request.json().catch(() => ({}))) as {
    name?: unknown;
    email?: unknown;
    cosid?: unknown;
    ticketCount?: unknown;
    guests?: unknown;
    answers?: unknown;
  };
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const cosid = typeof body.cosid === "string" ? body.cosid.trim().toUpperCase() : "";
  const answers: unknown[] = Array.isArray(body.answers) ? body.answers : [];
  const ticketCount = typeof body.ticketCount === "number" && Number.isInteger(body.ticketCount) ? body.ticketCount : 1;
  const rawGuests: unknown[] = Array.isArray(body.guests) ? body.guests : [];
  const guests = rawGuests
    .map((g) => ({
      name: typeof g === "object" && g !== null && typeof (g as { name?: unknown }).name === "string"
        ? (g as { name: string }).name.trim()
        : "",
      relationship:
        typeof g === "object" && g !== null && typeof (g as { relationship?: unknown }).relationship === "string"
          ? (g as { relationship: string }).relationship.trim()
          : "",
    }));

  if (!name || !email || !cosid) {
    return NextResponse.json({ error: "Name, email, and COSID are required" }, { status: 400 });
  }
  if (ticketCount < 1) {
    return NextResponse.json({ error: "Number of tickets must be at least 1" }, { status: 400 });
  }
  if (guests.length !== ticketCount - 1 || guests.some((g) => !g.name || !g.relationship)) {
    return NextResponse.json(
      { error: "Each additional guest needs a name and relationship" },
      { status: 400 },
    );
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
  if (ticketCount > event.max_tickets_per_person) {
    return NextResponse.json(
      { error: `This event allows at most ${event.max_tickets_per_person} ticket(s) per person` },
      { status: 400 },
    );
  }

  const { data: fields } = await supabase
    .from("marketing_email_event_fields")
    .select("*")
    .eq("event_id", id)
    .returns<EventField[]>();

  // A checkboxes field submits an array of selected options rather than a
  // single string -- joined here into the same answer_text column the way
  // every other field type stores its answer, no schema change needed for
  // what's a rarely-multi-valued field.
  const answersByFieldId = new Map<string, string>();
  for (const a of answers) {
    if (typeof a === "object" && a !== null && typeof (a as { field_id?: unknown }).field_id === "string") {
      const answerText = (a as { answer_text?: unknown }).answer_text;
      const value = Array.isArray(answerText)
        ? answerText.filter((v): v is string => typeof v === "string").join("; ")
        : typeof answerText === "string"
          ? answerText
          : "";
      answersByFieldId.set((a as { field_id: string }).field_id, value);
    }
  }

  for (const field of fields ?? []) {
    if (field.field_type === "section") continue; // a heading/divider, not a real input
    if (field.required && !answersByFieldId.get(field.id)?.trim()) {
      return NextResponse.json({ error: `"${field.field_label}" is required` }, { status: 400 });
    }
  }

  // Optimistic capacity check (sum then insert, not a locked transaction) --
  // acceptable for an internal tool's traffic; a burst of simultaneous
  // last-slot submissions could over-book by a small margin. Counts total
  // tickets (registrant + guests), not registration rows, so a multi-ticket
  // registration takes up its full claim -- and if there isn't room for all
  // of it, the whole registration (not just the overflow) goes to waitlist,
  // since a partially-confirmed group doesn't make sense.
  let status: "confirmed" | "waitlisted" = "confirmed";
  if (event.capacity !== null) {
    const { data: confirmedRows } = await supabase
      .from("marketing_email_event_registrations")
      .select("ticket_count")
      .eq("event_id", id)
      .eq("status", "confirmed")
      .returns<{ ticket_count: number }[]>();
    const confirmedTickets = (confirmedRows ?? []).reduce((sum, r) => sum + r.ticket_count, 0);
    if (confirmedTickets + ticketCount > event.capacity) {
      status = "waitlisted";
    }
  }

  const { data: registration, error: registrationError } = await supabase
    .from("marketing_email_event_registrations")
    .insert({ event_id: id, name, email, cosid, verified_email: employee.email, status, ticket_count: ticketCount })
    .select("id")
    .single();

  if (registrationError) {
    if (registrationError.code === "23505") {
      return NextResponse.json({ error: "You've already registered for this event" }, { status: 409 });
    }
    return NextResponse.json({ error: "Failed to record registration" }, { status: 500 });
  }

  if (guests.length > 0) {
    const { error: guestsError } = await supabase.from("marketing_email_event_registration_guests").insert(
      guests.map((g) => ({ registration_id: registration.id, name: g.name, relationship: g.relationship })),
    );
    if (guestsError) {
      return NextResponse.json({ error: "Registered, but failed to save guest details" }, { status: 500 });
    }
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

  try {
    // request.url reflects whatever origin the Node process actually sees,
    // which behind nginx/Cloudflare is the internal upstream address (e.g.
    // localhost:3000), not the public domain -- use the same env var the
    // background workers rely on for the same reason (see campaign-queue.ts).
    const origin = process.env.NEXT_PUBLIC_APP_URL;
    if (!origin) {
      throw new Error("NEXT_PUBLIC_APP_URL is not set -- required to build the confirmation link");
    }
    const confirmUrl = `${origin}/e/${id}/confirm/${registration.id}`;
    await sendTransactionalEmail({
      to: employee.email,
      subject: `Confirm your registration: ${event.name}`,
      html: buildEventEmailHtml({
        eventName: event.name,
        bodyHtml: `
          <p>Hi ${employee.name.split(" ")[0]},</p>
          <p>You (or someone using your COSID) registered for <strong>${event.name}</strong>${
            ticketCount > 1 ? ` (${ticketCount} tickets, including your guests)` : ""
          }${
            status === "waitlisted" ? " and are currently on the waitlist" : ""
          }. Click below to confirm this is really you within the next 72 hours, or the registration will be
          automatically cancelled.</p>
        `,
        cta: { text: "Confirm registration", url: confirmUrl },
        footerHtml: `<p style="color: #737373; font-size: 12px;">${confirmUrl}</p>`,
      }),
    });
  } catch (err) {
    // The registration itself succeeded; a failed confirmation email
    // shouldn't surface as a failed registration -- log and continue.
    console.error(`[events/${id}/register] Failed to send confirmation email:`, err);
  }

  return NextResponse.json({ status, verifiedEmail: employee.email });
}
