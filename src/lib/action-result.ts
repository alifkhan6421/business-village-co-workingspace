import { z } from "zod";

export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

/** Converts zod issues (whose messages are translation keys) to a field map. */
export function zodFieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".");
    if (!out[key]) out[key] = normalizeIssue(issue);
  }
  return out;
}

function normalizeIssue(issue: z.core.$ZodIssue): string {
  // Our schemas always pass translation keys as messages; fall back to generic keys.
  if (issue.message && /^[a-zA-Z]+$/.test(issue.message)) return issue.message;
  if (issue.code === "too_small") return "required";
  if (issue.code === "too_big") return "tooLong";
  return "invalidValue";
}

export function fail(error: string, fieldErrors?: Record<string, string>): ActionResult<never> {
  return { ok: false, error, fieldErrors };
}

/** Maps a Postgres/Supabase error raised by our functions to a translation key. */
export function dbErrorKey(err: { message?: string; code?: string } | null | undefined, namespace = "booking"): string {
  if (!err) return "unknown";
  const msg = (err.message ?? "").trim();
  if (err.code === "42501" || msg === "forbidden") return "forbidden";
  if (err.code === "23505") return "slugTaken";
  if (/^[a-z_]+$/.test(msg)) return namespace ? `${namespace}.${msg}` : msg;
  return "unknown";
}
