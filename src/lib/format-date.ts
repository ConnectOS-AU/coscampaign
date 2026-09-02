// Every displayed timestamp in the app and in outbound emails renders in
// Philippines time regardless of where the server or the viewer's browser
// actually is -- stored values stay UTC (ISO strings), this only affects
// display. Works identically in server and client components since Intl
// ships full ICU data in Node by default.
const MANILA_TZ = "Asia/Manila";

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return `${date.toLocaleString("en-PH", { timeZone: MANILA_TZ })} PHT`;
}

export function formatDate(
  value: string | Date | null | undefined,
  opts: Intl.DateTimeFormatOptions = { year: "numeric", month: "long", day: "numeric" },
): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-PH", { timeZone: MANILA_TZ, ...opts });
}
