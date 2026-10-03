import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { SectionData } from "@/components/admin/section-editor";
import type { PageMeta } from "@/components/admin/page-editor";
import { mediaValues } from "./queries";
import type { Locale } from "@/i18n/routing";
import { toAmenityView } from "@/lib/resources";

type TrRow = { locale: string; title: string; subtitle: string; content: string; data: unknown };

export async function loadPageEditor(id: string, locale: Locale) {
  const supabase = await createClient();
  const { data: page } = await supabase
    .from("pages")
    .select("*, page_translations(*), page_sections(*, page_section_translations(*))")
    .eq("id", id)
    .maybeSingle();
  if (!page) return null;
  const sections = [...(page.page_sections ?? [])].sort((a, b) => a.display_order - b.display_order);
  const galleryIds = sections.flatMap((s) => {
    const ids = (s.settings as Record<string, unknown>)?.media_ids;
    return Array.isArray(ids) ? (ids as string[]) : [];
  });
  const media = await mediaValues([page.seo_image_id, ...sections.map((s) => s.media_id), ...galleryIds]);
  const tr = (rows: TrRow[], l: string) => {
    const r = rows.find((x) => x.locale === l);
    return { title: r?.title ?? "", subtitle: r?.subtitle ?? "", content: r?.content ?? "", data: (r?.data ?? {}) as Record<string, unknown> };
  };
  const ptr = (l: string) => {
    const r = (page.page_translations ?? []).find((x) => x.locale === l);
    return { title: r?.title ?? "", seo_title: r?.seo_title ?? "", seo_description: r?.seo_description ?? "", og_title: r?.og_title ?? "", og_description: r?.og_description ?? "" };
  };
  const meta: PageMeta = {
    id: page.id,
    slug: page.slug,
    page_type: page.page_type,
    status: page.status,
    is_system: page.is_system,
    noindex: page.noindex,
    canonical_url: page.canonical_url,
    seoImage: page.seo_image_id ? media[page.seo_image_id] ?? null : null,
    de: ptr("de"),
    en: ptr("en"),
  };
  const sectionData: SectionData[] = sections.map((s) => {
    const settings = (s.settings ?? {}) as Record<string, unknown>;
    const ids = Array.isArray(settings.media_ids) ? (settings.media_ids as string[]) : [];
    return {
      id: s.id,
      type: s.section_type,
      active: s.active,
      settings,
      media: s.media_id ? media[s.media_id] ?? null : null,
      gallery: ids.map((x) => media[x]).filter(Boolean),
      de: tr(s.page_section_translations as TrRow[], "de"),
      en: tr(s.page_section_translations as TrRow[], "en"),
    };
  });
  const { data: am } = await supabase.from("amenities").select("*, amenity_translations(*)").order("display_order");
  const amenities = (am ?? []).map((a) => {
    const v = toAmenityView(a as never, locale);
    return { id: v.id, name: v.name };
  });
  return { meta, sections: sectionData, amenities };
}

/** Public path of a page for "view page" links. */
export function publicPathFor(slug: string, isSystem: boolean) {
  if (slug === "home") return "/";
  return isSystem ? `/${slug}` : `/p/${slug}`;
}
