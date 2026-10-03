"use server";
import { z } from "zod";
import { adminAction, logActivity, revalidateSite } from "./common";
import { fail, zodFieldErrors, type ActionResult } from "@/lib/action-result";
import { checkbox, hrefSchema, isSafeHref, optString, reqString, slugSchema } from "@/lib/validation";
import { sanitizeRichText, stripHtml } from "@/lib/sanitize";
import { ICON_NAMES } from "@/lib/icons";
import { SECTION_CONFIG, SECTION_TYPES, isAllowedMapUrl } from "@/lib/cms-sections";
import type { Json } from "@/lib/supabase/database.types";

const LOCALES = ["de", "en"] as const;
const uuid = z.uuid();

// ------------------------------------------------------------------ pages
const metaSchema = z.object({
  id: z.uuid(),
  status: z.enum(["draft", "published"]),
  noindex: checkbox,
  canonical_url: z
    .string()
    .trim()
    .max(500, "tooLong")
    .refine((v) => !v || (v.startsWith("https://") && isSafeHref(v)), "invalidUrl"),
  seo_image_id: z.string().optional(),
  slug: z.string().optional(),
  page_type: z.enum(["standard", "landing", "legal"]).optional(),
  ...Object.fromEntries(
    LOCALES.flatMap((l) => [
      [`title_${l}`, l === "de" ? reqString(200) : optString(200)],
      [`seo_title_${l}`, optString(70)],
      [`seo_description_${l}`, optString(170)],
      [`og_title_${l}`, optString(95)],
      [`og_description_${l}`, optString(200)],
    ]),
  ),
});

export async function savePageMeta(_: unknown, fd: FormData): Promise<ActionResult> {
  return adminAction(async (ctx) => {
    const parsed = metaSchema.safeParse(Object.fromEntries(fd));
    if (!parsed.success) return fail("validation", zodFieldErrors(parsed.error));
    const v = parsed.data as Record<string, string | boolean | null | undefined> & z.infer<typeof metaSchema>;
    const { data: page } = await ctx.supabase.from("pages").select("id, is_system, slug, published_at").eq("id", v.id).single();
    if (!page) return fail("notFound");
    const update: Record<string, unknown> = {
      status: v.status,
      noindex: v.noindex,
      canonical_url: v.canonical_url || null,
      seo_image_id: v.seo_image_id && uuid.safeParse(v.seo_image_id).success ? v.seo_image_id : null,
      published_at: v.status === "published" ? page.published_at ?? new Date().toISOString() : page.published_at,
    };
    if (!page.is_system) {
      const slug = slugSchema.safeParse(v.slug);
      if (!slug.success) return fail("validation", { slug: "invalidSlug" });
      update.slug = slug.data;
      if (v.page_type) update.page_type = v.page_type;
    }
    const { error } = await ctx.supabase.from("pages").update(update as never).eq("id", v.id);
    if (error) return error.code === "23505" ? fail("validation", { slug: "slugTaken" }) : fail("unknown");
    const rows = LOCALES.map((l) => ({
      page_id: v.id,
      locale: l,
      title: (v[`title_${l}`] as string | null) ?? "",
      seo_title: (v[`seo_title_${l}`] as string | null) ?? "",
      seo_description: (v[`seo_description_${l}`] as string | null) ?? "",
      og_title: (v[`og_title_${l}`] as string | null) ?? "",
      og_description: (v[`og_description_${l}`] as string | null) ?? "",
    }));
    const { error: trErr } = await ctx.supabase.from("page_translations").upsert(rows, { onConflict: "page_id,locale" });
    if (trErr) return fail("unknown");
    await logActivity(ctx, "PAGE_UPDATED", "page", v.id, { slug: (update.slug as string) ?? page.slug });
    revalidateSite();
    return { ok: true };
  });
}

const createSchema = z.object({
  slug: slugSchema,
  title_de: reqString(200),
  title_en: optString(200),
  page_type: z.enum(["standard", "landing", "legal"]),
});

export async function createPage(_: unknown, fd: FormData): Promise<ActionResult<{ id: string }>> {
  return adminAction(async (ctx) => {
    const parsed = createSchema.safeParse(Object.fromEntries(fd));
    if (!parsed.success) return fail("validation", zodFieldErrors(parsed.error));
    const v = parsed.data;
    const { data: page, error } = await ctx.supabase.from("pages").insert({ slug: v.slug, page_type: v.page_type, status: "draft", is_system: false }).select("id").single();
    if (error || !page) return error?.code === "23505" ? fail("validation", { slug: "slugTaken" }) : fail("unknown");
    await ctx.supabase.from("page_translations").insert([
      { page_id: page.id, locale: "de", title: v.title_de },
      { page_id: page.id, locale: "en", title: v.title_en ?? "" },
    ]);
    const { data: section } = await ctx.supabase
      .from("page_sections")
      .insert({ page_id: page.id, section_type: v.page_type === "legal" ? "text" : "page_header", display_order: 10 })
      .select("id")
      .single();
    if (section)
      await ctx.supabase.from("page_section_translations").insert([
        { section_id: section.id, locale: "de", title: v.title_de },
        { section_id: section.id, locale: "en", title: v.title_en ?? "" },
      ]);
    await logActivity(ctx, "PAGE_CREATED", "page", page.id, { slug: v.slug });
    return { ok: true, data: { id: page.id } };
  });
}

export async function deletePage(id: string): Promise<ActionResult> {
  return adminAction(async (ctx) => {
    const { data: page } = await ctx.supabase.from("pages").select("is_system, slug").eq("id", id).single();
    if (!page) return fail("notFound");
    if (page.is_system) return fail("forbidden");
    const { error } = await ctx.supabase.from("pages").delete().eq("id", id);
    if (error) return fail("unknown");
    await ctx.supabase.from("navigation_items").delete().in("href", [`/p/${page.slug}`]);
    await logActivity(ctx, "PAGE_DELETED", "page", id, { slug: page.slug });
    revalidateSite();
    return { ok: true };
  });
}

// ------------------------------------------------------------------ sections
export async function addSection(pageId: string, type: string): Promise<ActionResult<{ id: string }>> {
  return adminAction(async (ctx) => {
    if (!SECTION_TYPES.includes(type) || !uuid.safeParse(pageId).success) return fail("validation");
    const { data: last } = await ctx.supabase.from("page_sections").select("display_order").eq("page_id", pageId).order("display_order", { ascending: false }).limit(1).maybeSingle();
    const { data, error } = await ctx.supabase
      .from("page_sections")
      .insert({ page_id: pageId, section_type: type, display_order: (last?.display_order ?? 0) + 10 })
      .select("id")
      .single();
    if (error || !data) return fail("unknown");
    await ctx.supabase.from("page_section_translations").insert(LOCALES.map((l) => ({ section_id: data.id, locale: l })));
    await logActivity(ctx, "PAGE_UPDATED", "page", pageId, { section_added: type });
    revalidateSite();
    return { ok: true, data: { id: data.id } };
  });
}

function parseItems(raw: string, kind: "cards" | "faq"): Json[] | null {
  let arr: unknown;
  try {
    arr = JSON.parse(raw || "[]");
  } catch {
    return null;
  }
  if (!Array.isArray(arr) || arr.length > 24) return null;
  const out: Json[] = [];
  for (const it of arr) {
    if (typeof it !== "object" || !it) return null;
    const o = it as Record<string, unknown>;
    const s = (k: string, max: number) => (typeof o[k] === "string" ? (o[k] as string).trim().slice(0, max) : "");
    if (kind === "faq") {
      if (!s("question", 300) && !s("answer", 3000)) continue;
      out.push({ question: s("question", 300), answer: s("answer", 3000) });
    } else {
      if (!s("title", 200) && !s("text", 1000)) continue;
      const icon = s("icon", 40);
      out.push({ icon: ICON_NAMES.includes(icon) ? icon : "check", title: s("title", 200), text: s("text", 1000) });
    }
  }
  return out;
}

/** Saves one section: shared settings + both languages, validated against SECTION_CONFIG. */
export async function saveSection(_: unknown, fd: FormData): Promise<ActionResult> {
  return adminAction(async (ctx) => {
    const id = String(fd.get("id") ?? "");
    if (!uuid.safeParse(id).success) return fail("notFound");
    const { data: section } = await ctx.supabase.from("page_sections").select("id, page_id, section_type, settings").eq("id", id).single();
    if (!section) return fail("notFound");
    const cfg = SECTION_CONFIG[section.section_type];
    if (!cfg) return fail("validation");
    const errors: Record<string, string> = {};
    const get = (k: string) => String(fd.get(k) ?? "").trim();

    // Keep unknown keys (e.g. resolved gallery data is never stored), overwrite configured ones.
    const settings: Record<string, Json> = {};
    for (const f of cfg.shared) {
      const name = `s_${f.key}`;
      if (f.kind === "href") {
        const v = get(name);
        if (v && !hrefSchema.safeParse(v).success) errors[name] = "invalidUrl";
        settings[f.key] = v;
      } else if (f.kind === "select") {
        const v = get(name);
        settings[f.key] = f.options.includes(v) ? v : f.options[0];
      } else if (f.kind === "bool") {
        settings[f.key] = checkbox.parse(fd.get(name));
      } else if (f.kind === "number") {
        const n = Number(get(name));
        if (get(name) && (!Number.isInteger(n) || n < f.min || n > f.max)) errors[name] = "invalidNumber";
        else if (get(name)) settings[f.key] = n;
      } else if (f.kind === "text") {
        const v = get(name);
        if (v.length > f.max) errors[name] = "tooLong";
        settings[f.key] = v;
      } else if (f.kind === "mapUrl") {
        const v = get(name);
        if (v && !isAllowedMapUrl(v)) errors[name] = "invalidUrl";
        settings[f.key] = v;
      } else if (f.kind === "mediaList" || f.kind === "amenityList") {
        const ids = fd.getAll(name).map(String).filter((x) => uuid.safeParse(x).success).slice(0, 60);
        settings[f.key] = ids;
      }
    }

    const update: { active: boolean; settings: Json; media_id?: string | null } = { active: checkbox.parse(fd.get("active")), settings };
    if (cfg.media) {
      const m = get("media_id");
      update.media_id = m && uuid.safeParse(m).success ? m : null;
    }

    const translations = [];
    for (const l of LOCALES) {
      const row = { section_id: id, locale: l, title: "", subtitle: "", content: "", data: {} as Record<string, Json> };
      for (const f of cfg.local) {
        const name = `${l}_${f.key}`;
        if (f.kind === "rich") row.content = sanitizeRichText(String(fd.get(name) ?? ""));
        else if (f.kind === "cards" || f.kind === "faq") {
          const items = parseItems(String(fd.get(name) ?? "[]"), f.kind);
          if (!items) errors[name] = "invalidValue";
          else row.data.items = items;
        } else if ("max" in f) {
          const v = stripHtml(get(name)).length ? get(name) : "";
          if (v.length > f.max) errors[name] = "tooLong";
          if ("data" in f) row.data[f.key] = v;
          else row[f.key as "title" | "subtitle"] = v;
        }
      }
      translations.push(row);
    }
    if (Object.keys(errors).length) return fail("validation", errors);

    const { error } = await ctx.supabase.from("page_sections").update(update as never).eq("id", id);
    if (error) return fail("unknown");
    const { error: trErr } = await ctx.supabase.from("page_section_translations").upsert(translations, { onConflict: "section_id,locale" });
    if (trErr) return fail("unknown");
    await logActivity(ctx, "PAGE_UPDATED", "page", section.page_id, { section: section.section_type });
    revalidateSite();
    return { ok: true };
  });
}

export async function setSectionActive(id: string, active: boolean): Promise<ActionResult> {
  return adminAction(async (ctx) => {
    const { error } = await ctx.supabase.from("page_sections").update({ active }).eq("id", id);
    if (error) return fail("unknown");
    revalidateSite();
    return { ok: true };
  });
}

export async function deleteSection(id: string): Promise<ActionResult> {
  return adminAction(async (ctx) => {
    const { data: s } = await ctx.supabase.from("page_sections").select("page_id, section_type").eq("id", id).single();
    const { error } = await ctx.supabase.from("page_sections").delete().eq("id", id);
    if (error) return fail("unknown");
    if (s) await logActivity(ctx, "PAGE_UPDATED", "page", s.page_id, { section_removed: s.section_type });
    revalidateSite();
    return { ok: true };
  });
}

export async function reorderSections(pageId: string, ids: string[]): Promise<ActionResult> {
  return adminAction(async (ctx) => {
    const parsed = z.array(z.uuid()).max(100).safeParse(ids);
    if (!parsed.success) return fail("validation");
    for (const [i, id] of parsed.data.entries()) {
      const { error } = await ctx.supabase.from("page_sections").update({ display_order: (i + 1) * 10 }).eq("id", id).eq("page_id", pageId);
      if (error) return fail("unknown");
    }
    revalidateSite();
    return { ok: true };
  });
}

// ------------------------------------------------------------------ navigation
const navSchema = z.object({
  id: z.string().optional(),
  menu: z.enum(["header", "footer", "legal"]),
  label_de: reqString(80),
  label_en: optString(80),
  href: hrefSchema,
  open_in_new_tab: checkbox,
  active: checkbox,
});

export async function saveNavItem(_: unknown, fd: FormData): Promise<ActionResult> {
  return adminAction(async (ctx) => {
    const parsed = navSchema.safeParse(Object.fromEntries(fd));
    if (!parsed.success) return fail("validation", zodFieldErrors(parsed.error));
    const { id, ...v } = parsed.data;
    const row = { ...v, label_en: v.label_en ?? "" };
    if (id && uuid.safeParse(id).success) {
      const { error } = await ctx.supabase.from("navigation_items").update(row).eq("id", id);
      if (error) return fail("unknown");
    } else {
      const { data: last } = await ctx.supabase.from("navigation_items").select("display_order").eq("menu", v.menu).order("display_order", { ascending: false }).limit(1).maybeSingle();
      const { error } = await ctx.supabase.from("navigation_items").insert({ ...row, display_order: (last?.display_order ?? 0) + 10 });
      if (error) return fail("unknown");
    }
    await logActivity(ctx, "NAVIGATION_UPDATED", "navigation", null, { menu: v.menu, label: v.label_de });
    revalidateSite();
    return { ok: true };
  });
}

export async function deleteNavItem(id: string): Promise<ActionResult> {
  return adminAction(async (ctx) => {
    const { error } = await ctx.supabase.from("navigation_items").delete().eq("id", id);
    if (error) return fail("unknown");
    await logActivity(ctx, "NAVIGATION_UPDATED", "navigation", id, { deleted: true });
    revalidateSite();
    return { ok: true };
  });
}

export async function reorderNav(ids: string[]): Promise<ActionResult> {
  return adminAction(async (ctx) => {
    const parsed = z.array(z.uuid()).max(100).safeParse(ids);
    if (!parsed.success) return fail("validation");
    for (const [i, id] of parsed.data.entries()) await ctx.supabase.from("navigation_items").update({ display_order: (i + 1) * 10 }).eq("id", id);
    await logActivity(ctx, "NAVIGATION_UPDATED", "navigation", null, { reordered: true });
    revalidateSite();
    return { ok: true };
  });
}
