import { createServiceRoleClient } from "@/lib/supabase";

export type EmployeeRecipientFilter = {
  client_names: string[];
  calendar_names: string[];
  client_provinces: string[];
  client_countries: string[];
  work_arrangements: string[];
  current_provinces: string[];
  /** Ignores every facet below and targets all active employees. */
  override_all: boolean;
};

export function emptyEmployeeFilter(): EmployeeRecipientFilter {
  return {
    client_names: [],
    calendar_names: [],
    client_provinces: [],
    client_countries: [],
    work_arrangements: [],
    current_provinces: [],
    override_all: false,
  };
}

// work_arrangements/current_provinces live on cosphere_position_details and
// cosphere_contact_details respectively -- separate tables from
// cosphere_active_employees, joined here by employee_id (COSID), not columns
// on the same table like the other facets. There's no FK between them for
// PostgREST to auto-embed, so the join happens in-memory below rather than
// via a single query per facet the way the same-table facets work.
const COLUMN_BY_FACET = {
  client_names: "client_name",
  calendar_names: "calendar_name",
  client_provinces: "client_province_name",
  client_countries: "client_country_name",
  work_arrangements: "work_arrangement",
  current_provinces: "current_province_name",
} as const;

type FacetKey = keyof typeof COLUMN_BY_FACET;
const FACET_KEYS = Object.keys(COLUMN_BY_FACET) as FacetKey[];

type EnrichedEmployee = {
  employee_id: string;
  office_email: string | null;
  client_name: string | null;
  calendar_name: string | null;
  client_province_name: string | null;
  client_country_name: string | null;
  work_arrangement: string | null;
  current_province_name: string | null;
};

const PAGE_SIZE = 1000;

/**
 * Supabase/PostgREST caps any unranged select() at a project-configured max
 * rows (1000 by default) -- silently, with no error, no truncation flag on
 * the response. cosphere_active_employees (2449 rows), cosphere_position_details
 * (2671), and cosphere_contact_details (3409) all exceed that, so a plain
 * .select() against any of them would quietly drop everyone past row 1000 --
 * confirmed empirically while building this (a plain select() against
 * cosphere_active_employees returned exactly 1000 rows). Every fetch below
 * pages through with .range() until a short page signals the end.
 */
async function fetchAllRows<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null }>): Promise<T[]> {
  const all: T[] = [];
  let from = 0;
  for (;;) {
    const { data } = await page(from, from + PAGE_SIZE - 1);
    const rows = data ?? [];
    all.push(...rows);
    if (rows.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return all;
}

const CACHE_TTL_MS = 2 * 60 * 1000;
let cache: { data: EnrichedEmployee[]; expiresAt: number } | null = null;

/**
 * Pulls active employees plus their work_arrangement (cosphere_position_details)
 * and current_province_name (cosphere_contact_details) joined in by
 * employee_id, deduplicating contact_details to its most-recently-modified
 * row per employee where more than one exists. No FK exists between these
 * tables for Postgres/PostgREST to join server-side, so this joins them in
 * memory -- fine at this app's scale (thousands, not millions, of rows).
 *
 * Cached for CACHE_TTL_MS since the live filter picker re-calls this on
 * every checkbox toggle and these are batch-synced HR tables, not
 * real-time data -- a couple of minutes of staleness there is harmless.
 * Pass forceFresh for anything that actually determines who a campaign
 * sends to (matches the "resolved fresh at send time" guarantee
 * resolveEmployeeEmails already documented before this cache existed).
 */
async function fetchEnrichedEmployees(forceFresh = false): Promise<EnrichedEmployee[]> {
  if (!forceFresh && cache && cache.expiresAt > Date.now()) {
    return cache.data;
  }

  const supabase = createServiceRoleClient();
  const [employees, positions, contacts] = await Promise.all([
    fetchAllRows<Omit<EnrichedEmployee, "work_arrangement" | "current_province_name">>((from, to) =>
      supabase
        .from("cosphere_active_employees")
        .select("employee_id, office_email, client_name, calendar_name, client_province_name, client_country_name")
        .eq("status", "ACTIVE")
        .range(from, to)
        .returns<Omit<EnrichedEmployee, "work_arrangement" | "current_province_name">[]>(),
    ),
    fetchAllRows<{ employee_id: string; work_arrangement: string | null }>((from, to) =>
      supabase
        .from("cosphere_position_details")
        .select("employee_id, work_arrangement")
        .range(from, to)
        .returns<{ employee_id: string; work_arrangement: string | null }[]>(),
    ),
    fetchAllRows<{ employee_id: string | null; current_province_name: string | null; modified_date: string | null; created_at: string }>(
      (from, to) =>
        supabase
          .from("cosphere_contact_details")
          .select("employee_id, current_province_name, modified_date, created_at")
          .range(from, to)
          .returns<
            { employee_id: string | null; current_province_name: string | null; modified_date: string | null; created_at: string }[]
          >(),
    ),
  ]);

  const workArrangementByEmployee = new Map<string, string | null>();
  for (const p of positions) {
    workArrangementByEmployee.set(p.employee_id, p.work_arrangement);
  }

  const provinceByEmployee = new Map<string, string | null>();
  const latestContactTimestamp = new Map<string, string>();
  for (const c of contacts) {
    if (!c.employee_id) continue;
    const timestamp = c.modified_date ?? c.created_at;
    const current = latestContactTimestamp.get(c.employee_id);
    if (!current || timestamp > current) {
      latestContactTimestamp.set(c.employee_id, timestamp);
      provinceByEmployee.set(c.employee_id, c.current_province_name);
    }
  }

  const enriched = employees.map((e) => ({
    ...e,
    work_arrangement: workArrangementByEmployee.get(e.employee_id) ?? null,
    current_province_name: provinceByEmployee.get(e.employee_id) ?? null,
  }));

  cache = { data: enriched, expiresAt: Date.now() + CACHE_TTL_MS };
  return enriched;
}

/** Applies every facet in the filter except `excludeFacet` (if given) -- excluding a facet's own filter when computing its own available options is what makes the picker a proper faceted/dynamic filter. */
function filterEmployees(rows: EnrichedEmployee[], filter: EmployeeRecipientFilter, excludeFacet?: FacetKey): EnrichedEmployee[] {
  if (filter.override_all) return rows;
  return rows.filter((row) =>
    FACET_KEYS.every((facet) => {
      if (facet === excludeFacet) return true;
      const values = filter[facet];
      if (values.length === 0) return true;
      const rowValue = row[COLUMN_BY_FACET[facet]];
      return rowValue !== null && values.includes(rowValue);
    }),
  );
}

export type EmployeeFilterOptions = {
  matchingCount: number;
  options: Record<FacetKey, string[]>;
};

export async function getEmployeeFilterOptions(filter: EmployeeRecipientFilter): Promise<EmployeeFilterOptions> {
  const rows = await fetchEnrichedEmployees();
  const matchingCount = filterEmployees(rows, filter).length;

  const options = {} as Record<FacetKey, string[]>;
  for (const facet of FACET_KEYS) {
    const column = COLUMN_BY_FACET[facet];
    const values = new Set<string>();
    for (const row of filterEmployees(rows, filter, facet)) {
      const value = row[column];
      if (value) values.add(value);
    }
    options[facet] = [...values].sort();
  }

  return { matchingCount, options };
}

/** Always fetches fresh (bypasses the cache in fetchEnrichedEmployees) -- this determines who a campaign actually sends to, so it must reflect the roster at send time, not up to CACHE_TTL_MS stale. */
export async function resolveEmployeeEmails(filter: EmployeeRecipientFilter): Promise<string[]> {
  const rows = await fetchEnrichedEmployees(true);
  const emails = new Set<string>();
  for (const row of filterEmployees(rows, filter)) {
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
