"use server";
import { z } from "zod";
import { adminAction, revalidateSite } from "./common";
import { fail, zodFieldErrors, type ActionResult } from "@/lib/action-result";
import { checkbox, intSchema, optString, reqString, slugSchema } from "@/lib/validation";
import { ICON_NAMES } from "@/lib/icons";

const schema = z.object({
  id: z.string().optional(),
  slug: slugSchema,
  icon: z.string().refine((v) => ICON_NAMES.includes(v), "invalidValue"),
  amenity_type: z.enum(["workspace", "room", "general"], { message: "invalidValue" }),
  display_order: intSchema(0, 9999),
  active: checkbox,
  name_de: reqString(100),
  name_en: optString(100),
  description_de: optString(500),
  description_en: optString(500),
});

export async function saveAmenity(_: unknown, fd: FormData): Promise<ActionResult<{ id: string }>> {
  return adminAction(async (ctx) => {
    const parsed = schema.safeParse(Object.fromEntries(fd));
    if (!parsed.success) return fail("validation", zodFieldErrors(parsed.error));
    const v = parsed.data;
    const row = { slug: v.slug, icon: v.icon, amenity_type: v.amenity_type, display_order: v.display_order, active: v.active };
    let id = v.id && z.uuid().safeParse(v.id).success ? v.id : undefined;
    if (id) {
      const { error } = await ctx.supabase.from("amenities").update(row).eq("id", id);
      if (error) return error.code === "23505" ? fail("validation", { slug: "slugTaken" }) : fail("unknown");
    } else {
      const { data, error } = await ctx.supabase.from("amenities").insert(row).select("id").single();
      if (error || !data) return error?.code === "23505" ? fail("validation", { slug: "slugTaken" }) : fail("unknown");
      id = data.id;
    }
    const { error: trErr } = await ctx.supabase.from("amenity_translations").upsert(
      [
        { amenity_id: id!, locale: "de", name: v.name_de, description: v.description_de ?? "" },
        { amenity_id: id!, locale: "en", name: v.name_en ?? "", description: v.description_en ?? "" },
      ],
      { onConflict: "amenity_id,locale" },
    );
    if (trErr) return fail("unknown");
    revalidateSite();
    return { ok: true, data: { id: id! } };
  });
}

export async function setAmenityActive(id: string, active: boolean): Promise<ActionResult> {
  return adminAction(async (ctx) => {
    const { error } = await ctx.supabase.from("amenities").update({ active }).eq("id", id);
    if (error) return fail("unknown");
    revalidateSite();
    return { ok: true };
  });
}

/** Removing an amenity also removes it from every workspace/room (the UI warns with the count first). */
export async function deleteAmenity(id: string): Promise<ActionResult> {
  return adminAction(async (ctx) => {
    const { error } = await ctx.supabase.from("amenities").delete().eq("id", id);
    if (error) return fail("unknown");
    revalidateSite();
    return { ok: true };
  });
}

export async function reorderAmenities(ids: string[]): Promise<ActionResult> {
  return adminAction(async (ctx) => {
    const parsed = z.array(z.uuid()).max(500).safeParse(ids);
    if (!parsed.success) return fail("validation");
    for (const [i, id] of parsed.data.entries()) {
      const { error } = await ctx.supabase.from("amenities").update({ display_order: (i + 1) * 10 }).eq("id", id);
      if (error) return fail("unknown");
    }
    revalidateSite();
    return { ok: true };
  });
}
