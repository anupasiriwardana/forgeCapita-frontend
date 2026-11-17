const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

function plural(n: number, unit: string): string {
  return `${n} ${unit}${n === 1 ? "" : "s"} ago`;
}

/** Human age of an ISO timestamp relative to `now` (epoch ms). Future dates clamp to "just now". */
export function formatAge(iso: string | null, now: number): string {
  if (!iso) return "never";
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "unknown";
  const diff = now - then;
  if (diff < MINUTE_MS) return "just now";
  if (diff < HOUR_MS) return plural(Math.floor(diff / MINUTE_MS), "minute");
  if (diff < DAY_MS) return plural(Math.floor(diff / HOUR_MS), "hour");
  return plural(Math.floor(diff / DAY_MS), "day");
}

/** Exact local date/time for a tooltip, or undefined when missing or invalid. */
export function exactTime(iso: string | null): string | undefined {
  if (!iso) return undefined;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? undefined : d.toLocaleString();
}
