import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { Tables, Json } from "@/lib/supabase/database.types";
import type { Locale } from "@/i18n/routing";
import { pickLocalized } from "@/lib/localize";

export type MediaRow = Tables<"media">;
export type MediaView = { id: string; url: string; alt: string; width: number | null; height: number | null; title: string };

export function toMediaView(m: MediaRow | null | undefined, locale: Locale): MediaView | null {
  if (!m) return null;
  return {
    id: m.id,
    url: m.file_url,
    alt: pickLocalized(m as unknown as Record<string, unknown>, "alt_text", locale) || m.title || "",
    width: m.width,
    height: m.height,
    title: m.title,
  };
}

export type JsonObject = { [key: string]: Json | undefined };

export type SectionView = {
  id: string;
  type: string;
  settings: JsonObject;
  media: MediaView | null;
  title: string;
  subtitle: string;
  content: string;
  data: JsonObject;
};

export type PageView = {
  id: string;
  slug: string;
  pageType: string;
  status: string;
  title: string;
  seoTitle: string;
  seoDescription: string;
  ogTitle: string;
  ogDescription: string;
  seoImage: MediaView | null;
  canonicalUrl: string | null;
  noindex: boolean;
  updatedAt: string;
  sections: SectionView[];
};

type SectionTr = Tables<"page_section_translations">;

function isEmptyTranslation(tr: SectionTr | undefined) {
  if (!tr) return true;
  return !tr.title.trim() && !tr.subtitle.trim() && !tr.content.trim() && Object.keys((tr.data as object) ?? {}).length === 0;
}

/** A page with its active sections in display order. Falls back to German per section. */
export const getPage = cache(async (slug: string, locale: Locale): Promise<PageView | null> => {
  const supabase = await createClient();
  const { data: page } = await supabase
    .from("pages")
    .select("*, page_translations(*), seo_image:media!pages_seo_image_id_fkey(*)")
    .eq("slug", slug)
    .maybeSingle();
  if (!page) return null;

  const { data: sections } = await supabase
    .from("page_sections")
    .select("*, page_section_translations(*), media(*)")
    .eq("page_id", page.id)
    .eq("active", true)
    .order("display_order");

  const trs = page.page_translations ?? [];
  const tr = trs.find((t) => t.locale === locale && t.title.trim()) ?? trs.find((t) => t.locale === "de");

  // Media referenced from section settings (e.g. gallery image lists).
  const settingsMediaIds = new Set<string>();
  for (const s of sections ?? []) {
    const ids = (s.settings as JsonObject)?.media_ids;
    if (Array.isArray(ids)) ids.forEach((id) => typeof id === "string" && settingsMediaIds.add(id));
  }
  const extraMedia = new Map<string, MediaRow>();
  if (settingsMediaIds.size) {
    const { data } = await supabase.from("media").select("*").in("id", [...settingsMediaIds]);
    data?.forEach((m) => extraMedia.set(m.id, m));
  }

  return {
    id: page.id,
    slug: page.slug,
    pageType: page.page_type,
    status: page.status,
    title: tr?.title ?? "",
    seoTitle: tr?.seo_title ?? "",
    seoDescription: tr?.seo_description ?? "",
    ogTitle: tr?.og_title ?? "",
    ogDescription: tr?.og_description ?? "",
    seoImage: toMediaView(page.seo_image as MediaRow | null, locale),
    canonicalUrl: page.canonical_url,
    noindex: page.noindex,
    updatedAt: page.updated_at,
    sections: (sections ?? []).map((s) => {
      const list = s.page_section_translations ?? [];
      const own = list.find((t) => t.locale === locale);
      const chosen = isEmptyTranslation(own) ? list.find((t) => t.locale === "de") ?? own : own;
      const settings = (s.settings as JsonObject) ?? {};
      if (Array.isArray(settings.media_ids)) {
        settings.gallery = settings.media_ids
          .map((id) => toMediaView(extraMedia.get(String(id)), locale))
          .filter(Boolean) as unknown as Json;
      }
      return {
        id: s.id,
        type: s.section_type,
        settings,
        media: toMediaView(s.media as MediaRow | null, locale),
        title: chosen?.title ?? "",
        subtitle: chosen?.subtitle ?? "",
        content: chosen?.content ?? "",
        data: (chosen?.data as JsonObject) ?? {},
      };
    }),
  };
});

export type SiteSettings = Tables<"site_settings"> & {
  logo: MediaView | null;
  footerLogo: MediaView | null;
  favicon: MediaView | null;
  defaultSeoImage: MediaView | null;
};

export const getSiteSettings = cache(async (locale: Locale): Promise<SiteSettings> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("site_settings")
    .select(
      "*, logo:media!site_settings_logo_media_id_fkey(*), footer_logo:media!site_settings_footer_logo_media_id_fkey(*), favicon:media!site_settings_favicon_media_id_fkey(*), seo_image:media!site_settings_default_seo_image_id_fkey(*)",
    )
    .eq("id", 1)
    .single();
  if (!data) throw new Error("site_settings row missing — run the database migrations");
  const { logo, footer_logo, favicon, seo_image, ...rest } = data;
  return {
    ...rest,
    logo: toMediaView(logo as MediaRow | null, locale),
    footerLogo: toMediaView(footer_logo as MediaRow | null, locale),
    favicon: toMediaView(favicon as MediaRow | null, locale),
    defaultSeoImage: toMediaView(seo_image as MediaRow | null, locale),
  };
});

export type NavItem = { id: string; label: string; href: string; newTab: boolean };

export const getNavigation = cache(async (locale: Locale) => {
  const supabase = await createClient();
  const { data } = await supabase.from("navigation_items").select("*").eq("active", true).order("display_order");
  const map = (menu: string): NavItem[] =>
    (data ?? [])
      .filter((i) => i.menu === menu)
      .map((i) => ({
        id: i.id,
        label: pickLocalized(i as unknown as Record<string, unknown>, "label", locale),
        href: i.href,
        newTab: i.open_in_new_tab,
      }));
  return { header: map("header"), footer: map("footer"), legal: map("legal") };
});

export function str(v: Json | undefined, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}
export function num(v: Json | undefined, fallback: number): number {
  return typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" && !isNaN(Number(v)) ? Number(v) : fallback;
}
export function arr<T = JsonObject>(v: Json | undefined): T[] {
  return Array.isArray(v) ? (v as unknown as T[]) : [];
}
