import "server-only";
import { cache } from "react";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/supabase/database.types";
import type { Locale } from "@/i18n/routing";

export type Profile = Tables<"profiles">;

/** Current user + profile, resolved server-side from the session cookie. */
export const getCurrentUser = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
  if (!profile) return null;
  return { user, profile };
});

export function loginPath(locale: Locale) {
  return locale === "de" ? "/de/anmelden" : "/en/login";
}

export async function requireUser(locale: Locale, next?: string) {
  const current = await getCurrentUser();
  if (!current) redirect(`${loginPath(locale)}${next ? `?next=${encodeURIComponent(next)}` : ""}`);
  return current;
}

/** Page-level guard: non-admins get a 404 so the admin area is not even revealed. */
export async function requireAdminPage(locale: Locale) {
  const current = await requireUser(locale, `/${locale}/admin`);
  if (current.profile.role !== "admin") notFound();
  return current;
}

export class ActionError extends Error {
  constructor(public key: string) {
    super(key);
  }
}

/** Server-action guard. RLS enforces the same rule again in the database. */
export async function assertAdmin() {
  const current = await getCurrentUser();
  if (!current) throw new ActionError("notAuthenticated");
  if (current.profile.role !== "admin") throw new ActionError("forbidden");
  const supabase = await createClient();
  return { ...current, supabase };
}

export async function assertUser() {
  const current = await getCurrentUser();
  if (!current) throw new ActionError("notAuthenticated");
  const supabase = await createClient();
  return { ...current, supabase };
}
