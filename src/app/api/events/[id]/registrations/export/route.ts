import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase";
import { getSession } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { toCsv, csvResponse } from "@/lib/csv";
import { formatDateTime } from "@/lib/format-date";
import type { Event, EventField, EventRegistration, EventRegistrationAnswer } from "@/lib/types";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!hasPermission(session, "manage_events")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceRoleClient();
  const [{ data: event }, { data: fields }, { data: registrations }] = await Promise.all([
    supabase.from("marketing_email_events").select("name").eq("id", id).single<Pick<Event, "name">>(),
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

  if (!event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
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

  const fieldColumns = (fields ?? [])
    .filter((f) => f.field_type !== "section")
    .map((f) => ({ key: `field_${f.id}`, label: f.field_label }));

  const columns = [
    { key: "name", label: "Name" },
    { key: "email", label: "Email" },
    { key: "cosid", label: "COSID" },
    { key: "status", label: "Status" },
    { key: "verified", label: "Verified" },
    ...fieldColumns,
    { key: "registered_at", label: "Registered At" },
  ];

  const rows = (registrations ?? []).map((r) => {
    const row: Record<string, unknown> = {
      name: r.name,
      email: r.email,
      cosid: r.cosid,
      status: r.status,
      verified: r.email_confirmed_at ? "Verified" : "Pending",
      registered_at: formatDateTime(r.registered_at),
    };
    for (const f of fieldColumns) {
      row[f.key] = answersByRegistration.get(r.id)?.get(f.key.replace(/^field_/, "")) ?? "";
    }
    return row;
  });

  return csvResponse(toCsv(rows, columns), `${event.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-registrations.csv`);
}
