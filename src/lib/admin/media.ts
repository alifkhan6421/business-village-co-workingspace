"use server";
import sharp, { type OutputInfo } from "sharp";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { adminAction, revalidateSite } from "./common";
import { fail, zodFieldErrors, type ActionResult } from "@/lib/action-result";
import { optString } from "@/lib/validation";

export type MediaItem = {
  id: string;
  file_url: string;
  file_name: string;
  title: string;
  alt_text_de: string;
  alt_text_en: string;
  width: number | null;
  height: number | null;
  file_size: number;
  mime_type: string;
  created_at: string;
  usage_count?: number;
};

const MAX_BYTES = 8 * 1024 * 1024;
const MAX_EDGE = 2400;
const EXT: Record<string, string[]> = {
  "image/jpeg": ["jpg", "jpeg"],
  "image/png": ["png"],
  "image/webp": ["webp"],
  "image/avif": ["avif"],
};

/** Checks the file's leading bytes so a renamed file cannot pass as an image. */
function sniff(buf: Buffer): string | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  if (buf.toString("ascii", 4, 8) === "ftyp" && /^avi[fs]/.test(buf.toString("ascii", 8, 12))) return "image/avif";
  return null;
}

/** Uploads one image (the client sends files one by one). */
export async function uploadMedia(fd: FormData): Promise<ActionResult<MediaItem>> {
  return adminAction(async (ctx) => {
    const file = fd.get("file");
    if (!(file instanceof File) || file.size === 0) return fail("uploadFailed");
    if (file.size > MAX_BYTES) return fail("uploadTooLarge");
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    const declared = file.type;
    if (!EXT[declared] || !EXT[declared].includes(ext)) return fail("uploadInvalidType");
    const input = Buffer.from(await file.arrayBuffer());
    const actual = sniff(input);
    if (!actual || actual !== declared) return fail("uploadInvalidType");

    // Re-encode: strips EXIF (incl. GPS), applies orientation and caps the size.
    let out: Buffer;
    let info: OutputInfo;
    try {
      const pipeline = sharp(input, { limitInputPixels: 80_000_000 }).rotate().resize({
        width: MAX_EDGE,
        height: MAX_EDGE,
        fit: "inside",
        withoutEnlargement: true,
      });
      const res =
        actual === "image/png"
          ? await pipeline.png({ compressionLevel: 9 }).toBuffer({ resolveWithObject: true })
          : actual === "image/avif"
            ? await pipeline.avif({ quality: 60 }).toBuffer({ resolveWithObject: true })
            : actual === "image/webp"
              ? await pipeline.webp({ quality: 82 }).toBuffer({ resolveWithObject: true })
              : await pipeline.jpeg({ quality: 84, mozjpeg: true }).toBuffer({ resolveWithObject: true });
      out = res.data;
      info = res.info;
    } catch {
      return fail("uploadInvalidType");
    }

    const safeBase =
      file.name
        .replace(/\.[^.]+$/, "")
        .normalize("NFKD")
        .replace(/[^\w-]+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "")
        .toLowerCase()
        .slice(0, 60) || "image";
    const path = `uploads/${new Date().getUTCFullYear()}/${safeBase}-${randomUUID().slice(0, 8)}.${EXT[actual][0]}`;
    const { error: upErr } = await ctx.supabase.storage.from("media").upload(path, out, { contentType: actual, upsert: false });
    if (upErr) {
      console.error("[media upload]", upErr.message);
      return fail("uploadFailed");
    }
    const { data: pub } = ctx.supabase.storage.from("media").getPublicUrl(path);
    const title = String(fd.get("title") ?? "").trim().slice(0, 200) || safeBase.replace(/-/g, " ");
    const { data, error } = await ctx.supabase
      .from("media")
      .insert({
        file_name: file.name.slice(0, 200),
        file_url: pub.publicUrl,
        storage_path: path,
        mime_type: actual,
        file_size: out.length,
        width: info.width,
        height: info.height,
        title,
        alt_text_de: String(fd.get("alt_text_de") ?? "").trim().slice(0, 300),
        alt_text_en: String(fd.get("alt_text_en") ?? "").trim().slice(0, 300),
        uploaded_by: ctx.user.id,
      })
      .select("*")
      .single();
    if (error || !data) {
      await ctx.supabase.storage.from("media").remove([path]);
      return fail("uploadFailed");
    }
    return { ok: true, data };
  });
}

export async function listMedia(q = "", limit = 60, offset = 0): Promise<ActionResult<{ items: MediaItem[]; total: number }>> {
  return adminAction(async (ctx) => {
    let query = ctx.supabase.from("media").select("*", { count: "exact" }).order("created_at", { ascending: false });
    const term = q.trim().replace(/[%_,()]/g, " ").slice(0, 80);
    if (term) query = query.or(`file_name.ilike.%${term}%,title.ilike.%${term}%,alt_text_de.ilike.%${term}%,alt_text_en.ilike.%${term}%`);
    const { data, count, error } = await query.range(offset, offset + limit - 1);
    if (error) return fail("unknown");
    return { ok: true, data: { items: data ?? [], total: count ?? 0 } };
  });
}

const metaSchema = z.object({
  id: z.uuid(),
  title: optString(200),
  alt_text_de: optString(300),
  alt_text_en: optString(300),
});

export async function updateMedia(_: unknown, fd: FormData): Promise<ActionResult> {
  return adminAction(async (ctx) => {
    const parsed = metaSchema.safeParse(Object.fromEntries(fd));
    if (!parsed.success) return fail("validation", zodFieldErrors(parsed.error));
    const v = parsed.data;
    const { error } = await ctx.supabase
      .from("media")
      .update({ title: v.title ?? "", alt_text_de: v.alt_text_de ?? "", alt_text_en: v.alt_text_en ?? "" })
      .eq("id", v.id);
    if (error) return fail("unknown");
    revalidateSite();
    return { ok: true };
  });
}

export type MediaUsage = { usage_type: string; usage_id: string | null; label: string };

export async function getMediaUsage(id: string): Promise<ActionResult<MediaUsage[]>> {
  return adminAction(async (ctx) => {
    const { data, error } = await ctx.supabase.rpc("media_usage", { p_media_id: id });
    if (error) return fail("unknown");
    return { ok: true, data: (data ?? []) as MediaUsage[] };
  });
}

/** Deletes an image only if nothing references it any more. */
export async function deleteMedia(id: string): Promise<ActionResult> {
  return adminAction(async (ctx) => {
    const { data: usage, error: uErr } = await ctx.supabase.rpc("media_usage", { p_media_id: id });
    if (uErr) return fail("unknown");
    if (usage && usage.length > 0) return fail("mediaInUse");
    const { data: row } = await ctx.supabase.from("media").select("storage_path").eq("id", id).maybeSingle();
    if (!row) return fail("notFound");
    // FK constraints (on delete restrict) block deletion if a gallery picked it up in the meantime.
    const { error } = await ctx.supabase.from("media").delete().eq("id", id);
    if (error) return fail(error.code === "23503" ? "mediaInUse" : "unknown");
    await ctx.supabase.storage.from("media").remove([row.storage_path]);
    revalidateSite();
    return { ok: true };
  });
}
