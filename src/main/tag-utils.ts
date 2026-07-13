/**
 * Pure utility functions for the deploy tag scheme.
 * Extracted here so they can be unit-tested independently of Electron/git.
 */

/**
 * Convert a Date to the deploy tag timestamp component: YYYY-MM-DDTHHMZ
 *
 * Example: new Date("2026-07-13T10:34:00.000Z") → "2026-07-13T1034Z"
 *
 * The colon between hours and minutes is removed so the tag is a valid git
 * ref on all platforms (Windows disallows colons in file names).
 */
export function formatDeployTimestamp(date: Date): string {
  const iso = date.toISOString(); // e.g. "2026-07-13T10:34:00.000Z"
  return iso.slice(0, 13) + iso.slice(14, 16) + "Z";
  //          "2026-07-13T10"  +  "34"           + "Z"
  //          ↑ 0–12            ↑ 14–15 (skip ':' at 13)
}

/**
 * Build a full deploy tag name for a given environment and timestamp.
 * Example: ("prod", "2026-07-13T1034Z") → "prod/2026-07-13T1034Z"
 */
export function buildDeployTag(env: string, ts: string): string {
  return `${env}/${ts}`;
}

/**
 * Given a git ref name and a list of known environment names, return the
 * matching environment name — or null if no match.
 *
 * Handles two formats:
 *   Old flat tags:         "prod"                   → "prod"
 *   New timestamped tags:  "prod/2026-07-13T1034Z"  → "prod"
 *
 * Matching is case-insensitive. The trailing slash in the prefix check
 * ensures "prod/..." cannot accidentally match "preprod".
 */
export function parseEnvFromRef(refName: string, envNames: string[]): string | null {
  const normalized = refName.toLowerCase();
  const envs = envNames.map((e) => ({ raw: e, lower: e.toLowerCase() }));

  // Exact match — old flat-tag scheme ("prod" === "prod")
  const exact = envs.find(({ lower }) => lower === normalized);
  if (exact) return exact.raw;

  // Prefix match — new timestamped scheme ("prod/2026-07-13T1034Z".startsWith("prod/"))
  const prefix = envs.find(({ lower }) => normalized.startsWith(`${lower}/`));
  if (prefix) return prefix.raw;

  return null;
}
