import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { searchEmployees } from "@/lib/employees";

export async function GET(request: Request) {
  const session = await getSession();
  if (!hasPermission(session, "manage_campaigns")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const query = new URL(request.url).searchParams.get("q") ?? "";
  const results = await searchEmployees(query);
  return NextResponse.json({ results });
}
