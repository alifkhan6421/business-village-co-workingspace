"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { adminAction, logActivity } from "./common";
import { dbErrorKey, fail, zodFieldErrors, type ActionResult } from "@/lib/action-result";
import { checkbox, emailSchema, optString, phoneSchema, reqString } from "@/lib/validation";
import { createAdminClient } from "@/lib/supabase/admin";
import { sanitizeRichText, stripHtml } from "@/lib/sanitize";
import { berlinToUtc } from "@/lib/time";

// ---------------------------------------------------------------- users
export async function setUserRole(userId: string, role: "admin" | "member"): Promise<ActionResult> {
  return adminAction(async (ctx) => {
    if (!["admin", "member"].includes(role) || !z.uuid().safeParse(userId).success) return fail("validation");
    const { error } = await ctx.supabase.rpc("admin_set_user_role", { p_user_id: userId, p_role: role });
    if (error) return fail(error.message === "last_admin" ? "lastAdmin" : dbErrorKey(error, ""));
    revalidatePath(`/[locale]/admin/users`, "page");
    return { ok: true };
  });
}

/** Suspends sign-in via Supabase Auth ban; existing bookings stay untouched. */
export async function setUserSuspended(userId: string, suspended: boolean): Promise<ActionResult> {
  return adminAction(async (ctx) => {
    if (!z.uuid().safeParse(userId).success) return fail("validation");
    if (userId === ctx.user.id) return fail("forbidden");
    const admin = createAdminClient();
    const { error } = await admin.auth.admin.updateUserById(userId, { ban_duration: suspended ? "876000h" : "none" });
    if (error) return fail("unknown");
    await logActivity(ctx, "USER_UPDATED", "user", userId, { suspended });
    return { ok: true };
  });
}

const profileSchema = z.object({
  id: z.uuid(),
  first_name: reqString(100),
  last_name: reqString(100),
  phone: phoneSchema,
  company: optString(200),
  department: optString(200),
  preferred_locale: z.enum(["de", "en"]),
});

export async function adminUpdateProfile(_: unknown, fd: FormData): Promise<ActionResult> {
  return adminAction(async (ctx) => {
    const parsed = profileSchema.safeParse(Object.fromEntries(fd));
    if (!parsed.success) return fail("validation", zodFieldErrors(parsed.error));
    const { id, ...rest } = parsed.data;
    const { error } = await ctx.supabase.from("profiles").update(rest).eq("id", id);
    if (error) return fail(dbErrorKey(error, ""));
    await logActivity(ctx, "USER_UPDATED", "user", id, { fields: Object.keys(rest) });
    return { ok: true };
  });
}

// ---------------------------------------------------------------- guests
const guestSchema = z.object({
  id: z.uuid(),
  first_name: reqString(100),
  last_name: reqString(100),
  email: emailSchema,
  phone: phoneSchema,
  company: optString(200),
  locale: z.enum(["de", "en"]),
});

export async function updateGuest(_: unknown, fd: FormData): Promise<ActionResult> {
  return adminAction(async (ctx) => {
    const parsed = guestSchema.safeParse(Object.fromEntries(fd));
    if (!parsed.success) return fail("validation", zodFieldErrors(parsed.error));
    const { id, ...rest } = parsed.data;
    const { error } = await ctx.supabase.from("guests").update({ ...rest, email: rest.email.toLowerCase() }).eq("id", id);
    if (error) return error.code === "23505" ? fail("validation", { email: "emailTaken" }) : fail(dbErrorKey(error, ""));
    await logActivity(ctx, "GUEST_UPDATED", "guest", id);
    return { ok: true };
  });
}

// ---------------------------------------------------------------- announcements
const dt = z
  .string()
  .trim()
  .refine((v) => !v || !isNaN(Date.parse(v)), "invalidDate");

const announcementSchema = z.object({
  id: z.string().optional(),
  title_de: reqString(200),
  title_en: optString(200),
  content_de: z.string().max(10000, "tooLong"),
  content_en: z.string().max(10000, "tooLong").optional(),
  publish_at: dt,
  expires_at: dt.optional(),
  active: checkbox,
});

/** datetime-local values are Berlin wall-clock time. */
function berlinLocalToIso(v: string | undefined) {
  if (!v) return null;
  const [date, time] = v.split("T");
  return berlinToUtc(date, (time ?? "00:00").slice(0, 5))?.toISOString() ?? null;
}

export async function saveAnnouncement(_: unknown, fd: FormData): Promise<ActionResult<{ id: string }>> {
  return adminAction(async (ctx) => {
    const parsed = announcementSchema.safeParse(Object.fromEntries(fd));
    if (!parsed.success) return fail("validation", zodFieldErrors(parsed.error));
    const v = parsed.data;
    if (!stripHtml(v.content_de)) return fail("validation", { content_de: "required" });
    const publish = berlinLocalToIso(v.publish_at) ?? new Date().toISOString();
    const expires = berlinLocalToIso(v.expires_at);
    if (expires && expires <= publish) return fail("validation", { expires_at: "endBeforeStart" });
    const row = {
      title_de: v.title_de,
      title_en: v.title_en ?? "",
      content_de: sanitizeRichText(v.content_de),
      content_en: sanitizeRichText(v.content_en ?? ""),
      publish_at: publish,
      expires_at: expires,
      active: v.active,
    };
    let id = v.id && z.uuid().safeParse(v.id).success ? v.id : undefined;
    if (id) {
      const { error } = await ctx.supabase.from("announcements").update(row).eq("id", id);
      if (error) return fail("unknown");
    } else {
      const { data, error } = await ctx.supabase.from("announcements").insert({ ...row, created_by: ctx.user.id }).select("id").single();
      if (error || !data) return fail("unknown");
      id = data.id;
    }
    await logActivity(ctx, "ANNOUNCEMENT_UPDATED", "announcement", id!, { title: v.title_de });
    revalidatePath("/", "layout");
    return { ok: true, data: { id: id! } };
  });
}

export async function deleteAnnouncement(id: string): Promise<ActionResult> {
  return adminAction(async (ctx) => {
    const { error } = await ctx.supabase.from("announcements").delete().eq("id", id);
    if (error) return fail("unknown");
    await logActivity(ctx, "ANNOUNCEMENT_UPDATED", "announcement", id, { deleted: true });
    revalidatePath("/", "layout");
    return { ok: true };
  });
}

// ---------------------------------------------------------------- inquiries
const inquirySchema = z.object({
  id: z.uuid(),
  status: z.enum(["new", "in_progress", "resolved"]),
  admin_notes: z.string().max(10000, "tooLong").optional(),
});

export async function updateInquiry(_: unknown, fd: FormData): Promise<ActionResult> {
  return adminAction(async (ctx) => {
    const parsed = inquirySchema.safeParse(Object.fromEntries(fd));
    if (!parsed.success) return fail("validation", zodFieldErrors(parsed.error));
    const { id, ...rest } = parsed.data;
    const { error } = await ctx.supabase.from("contact_requests").update({ status: rest.status, admin_notes: rest.admin_notes ?? "" }).eq("id", id);
    if (error) return fail("unknown");
    await logActivity(ctx, "INQUIRY_UPDATED", "contact_request", id, { status: rest.status });
    revalidatePath("/", "layout");
    return { ok: true };
  });
}
