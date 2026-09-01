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
