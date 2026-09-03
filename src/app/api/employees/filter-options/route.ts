import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { emptyEmployeeFilter, getEmployeeFilterOptions, type EmployeeRecipientFilter } from "@/lib/employees";

function toStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!hasPermission(session, "manage_campaigns")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as Partial<Record<keyof EmployeeRecipientFilter, unknown>>;
  const filter: EmployeeRecipientFilter = {
    ...emptyEmployeeFilter(),
    client_names: toStringArray(body.client_names),
    calendar_names: toStringArray(body.calendar_names),
    client_countries: toStringArray(body.client_countries),
    override_all: body.override_all === true,
  };

  const result = await getEmployeeFilterOptions(filter);
  return NextResponse.json(result);
}
