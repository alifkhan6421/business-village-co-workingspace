import type { MetadataRoute } from "next";
import { createClient } from "@supabase/supabase-js";
import { appUrl, localizeHref } from "@/lib/href";
import type { Database } from "@/lib/supabase/database.types";

export const revalidate = 3600;

/** Published pages and public resources in both languages, with hreflang alternates. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const db = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  const [pages, ws, rooms] = await Promise.all([
    db.from("pages").select("slug, is_system, noindex, updated_at").eq("status", "published"),
    db.from("workspaces").select("slug, updated_at").eq("public_visible", true).neq("status", "disabled"),
    db.from("rooms").select("slug, updated_at").eq("public_visible", true).neq("status", "disabled"),
  ]);
  const paths: { path: string; updated: string }[] = [];
  for (const p of pages.data ?? []) {
    if (p.noindex) continue;
    paths.push({ path: p.slug === "home" ? "/" : p.is_system ? `/${p.slug}` : `/p/${p.slug}`, updated: p.updated_at });
  }
  for (const w of ws.data ?? []) paths.push({ path: `/coworking/${w.slug}`, updated: w.updated_at });
  for (const r of rooms.data ?? []) paths.push({ path: `/meeting-rooms/${r.slug}`, updated: r.updated_at });
  return paths.map(({ path, updated }) => ({
    url: appUrl(localizeHref(path, "de")),
    lastModified: new Date(updated),
    alternates: { languages: { de: appUrl(localizeHref(path, "de")), en: appUrl(localizeHref(path, "en")), "x-default": appUrl(localizeHref(path, "de")) } },
  }));
}
