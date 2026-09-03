import { createServiceRoleClient } from "@/lib/supabase";

export type EmployeeRecipientFilter = {
  client_names: string[];
  calendar_names: string[];
  client_provinces: string[];
  client_countries: string[];
  /** Ignores every facet below and targets all active employees. */
  override_all: boolean;
};

export function emptyEmployeeFilter(): EmployeeRecipientFilter {
  return {
    client_names: [],
    calendar_names: [],
    client_provinces: [],
    client_countries: [],
    override_all: false,
  };
}

const COLUMN_BY_FACET = {
  client_names: "client_name",
  calendar_names: "calendar_name",
  client_provinces: "client_province_name",
  client_countries: "client_country_name",
} as const;

type FacetKey = keyof typeof COLUMN_BY_FACET;
const FACET_KEYS = Object.keys(COLUMN_BY_FACET) as FacetKey[];

/**
 * Runs a select against cosphere_active_employees with every facet in the
 * filter applied except `excludeFacet` (if given). Excluding a facet's own
 * filter when computing that facet's available options is what makes the
 * picker a proper faceted/dynamic filter -- otherwise selecting a value
 * would immediately hide its own siblings.
 */
function queryEmployees(selectColumns: string, filter: EmployeeRecipientFilter, excludeFacet?: FacetKey) {
  const supabase = createServiceRoleClient();
  let query = supabase.from("cosphere_active_employees").select(selectColumns, { count: "exact" }).eq("status", "ACTIVE");

  if (filter.override_all) {
    return query;
  }

  for (const facet of FACET_KEYS) {
    if (facet === excludeFacet) continue;
    const values = filter[facet];
    if (values.length > 0) {
      query = query.in(COLUMN_BY_FACET[facet], values);
    }
  }

  return query;
}

export type EmployeeFilterOptions = {
  matchingCount: number;
  options: Record<FacetKey, string[]>;
};

export async function getEmployeeFilterOptions(filter: EmployeeRecipientFilter): Promise<EmployeeFilterOptions> {
  const [{ count }, ...facetResults] = await Promise.all([
    queryEmployees("employee_id", filter),
    ...FACET_KEYS.map((facet) => queryEmployees(COLUMN_BY_FACET[facet], filter, facet)),
  ]);

  const options = {} as Record<FacetKey, string[]>;
  FACET_KEYS.forEach((facet, i) => {
    const column = COLUMN_BY_FACET[facet];
    const rows = (facetResults[i].data ?? []) as unknown as Record<string, string | null>[];
    const values = new Set<string>();
    for (const row of rows) {
      const value = row[column];
      if (value) values.add(value);
    }
    options[facet] = [...values].sort();
  });

  return { matchingCount: count ?? 0, options };
}

export async function resolveEmployeeEmails(filter: EmployeeRecipientFilter): Promise<string[]> {
  const { data } = await queryEmployees("office_email", filter);
  const emails = new Set<string>();
  for (const row of (data ?? []) as unknown as { office_email: string | null }[]) {
    if (row.office_email) emails.add(row.office_email);
  }
  return [...emails];
}

export type EmployeeSearchResult = { name: string; email: string };

/** Live directory search for hand-picking specific people as campaign recipients. */
export async function searchEmployees(query: string): Promise<EmployeeSearchResult[]> {
  // Strip characters meaningful to PostgREST's or=() filter syntax (comma
  // separates conditions, parens nest them) so a search like "Smith, John"
  // doesn't produce a malformed filter -- this is search input, not SQL, so
  // there's no injection risk, just a robustness concern.
  const trimmed = query.trim().replace(/[,()]/g, " ");
  if (trimmed.length < 2) return [];

  const supabase = createServiceRoleClient();
  const { data } = await supabase
    .from("cosphere_active_employees")
    .select("staff_name, office_email")
    .eq("status", "ACTIVE")
    .not("office_email", "is", null)
    .or(`staff_name.ilike.%${trimmed}%,office_email.ilike.%${trimmed}%`)
    .limit(20);

  const seen = new Set<string>();
  const results: EmployeeSearchResult[] = [];
  for (const row of (data ?? []) as unknown as { staff_name: string | null; office_email: string | null }[]) {
    if (!row.office_email || seen.has(row.office_email)) continue;
    seen.add(row.office_email);
    results.push({ name: row.staff_name ?? row.office_email, email: row.office_email });
  }
  return results;
}

/**
 * Looks up first/last name for a batch of emails against the employee
 * directory, so SendGrid contacts can be upserted with real names attached
 * -- that's what lets {{first_name}}/{{last_name}} merge tags in campaign
 * content resolve per-recipient. Emails with no directory match are simply
 * absent from the returned map (the caller falls back to email-only).
 */
export async function resolveEmployeeNamesByEmail(
  emails: string[],
): Promise<Map<string, { firstName: string | null; lastName: string | null }>> {
  const map = new Map<string, { firstName: string | null; lastName: string | null }>();
  if (emails.length === 0) return map;

  const supabase = createServiceRoleClient();
  const { data } = await supabase
    .from("cosphere_active_employees")
    .select("office_email, first_name, last_name")
    .in("office_email", emails)
    .returns<{ office_email: string; first_name: string | null; last_name: string | null }[]>();

  for (const row of data ?? []) {
    map.set(row.office_email.toLowerCase(), { firstName: row.first_name, lastName: row.last_name });
  }
  return map;
}

/** Builds SendGrid contact-upsert payloads for a list of emails, attaching first/last name where the directory has a match. */
export async function buildContactUpserts(
  emails: string[],
): Promise<{ email: string; first_name?: string; last_name?: string }[]> {
  const namesByEmail = await resolveEmployeeNamesByEmail(emails);
  return emails.map((email) => {
    const name = namesByEmail.get(email.toLowerCase());
    return {
      email,
      first_name: name?.firstName ?? undefined,
      last_name: name?.lastName ?? undefined,
    };
  });
}

/** Resolves a COSID (employee_id, e.g. "COS0075") to the employee's verified name/email, for identity checks like event registration. */
export async function lookupEmployeeByCosid(cosid: string): Promise<{ name: string; email: string } | null> {
  const normalized = cosid.trim().toUpperCase();
  if (!normalized) return null;

  const supabase = createServiceRoleClient();
  const { data } = await supabase
    .from("cosphere_active_employees")
    .select("staff_name, office_email")
    .eq("employee_id", normalized)
    .eq("status", "ACTIVE")
    .maybeSingle<{ staff_name: string | null; office_email: string | null }>();

  if (!data?.office_email) return null;
  return { name: data.staff_name ?? data.office_email, email: data.office_email };
}
