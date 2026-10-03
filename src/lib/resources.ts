import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/supabase/database.types";
import type { Locale } from "@/i18n/routing";
import { pickLocalized } from "@/lib/localize";
import { toMediaView, type MediaRow, type MediaView } from "@/lib/cms";

export type ResourceType = "workspace" | "room";

export type AmenityView = {
  id: string;
  slug: string;
  icon: string;
  type: string;
  name: string;
  description: string;
  displayOrder: number;
};

export type ResourceView = {
  id: string;
  type: ResourceType;
  name: string;
  slug: string;
  floor: string;
  zone: string;
  deskNumber: string | null;
  capacity: number;
  status: string;
  featured: boolean;
  publicVisible: boolean;
  shortDescription: string;
  fullDescription: string;
  cover: MediaView | null;
  images: MediaView[];
  amenities: AmenityView[];
};

type AmenityRow = Tables<"amenities"> & { amenity_translations: Tables<"amenity_translations">[] };

export function toAmenityView(a: AmenityRow, locale: Locale): AmenityView {
  const tr = a.amenity_translations.find((t) => t.locale === locale && t.name.trim()) ?? a.amenity_translations.find((t) => t.locale === "de");
  return {
    id: a.id,
    slug: a.slug,
    icon: a.icon,
    type: a.amenity_type,
    name: tr?.name ?? a.slug,
    description: tr?.description ?? "",
    displayOrder: a.display_order,
  };
}

export const getAmenities = cache(async (locale: Locale): Promise<AmenityView[]> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("amenities")
    .select("*, amenity_translations(*)")
    .eq("active", true)
    .order("display_order");
  return (data ?? []).map((a) => toAmenityView(a as AmenityRow, locale));
});

type ImageRow = { id: string; display_order: number; is_cover: boolean; media: MediaRow | null };

function mapResource(row: Record<string, unknown>, type: ResourceType, locale: Locale, amenities: AmenityView[]): ResourceView {
  const images = ((type === "workspace" ? row.workspace_images : row.room_images) as ImageRow[] | undefined) ?? [];
  const sorted = [...images].sort((a, b) => a.display_order - b.display_order);
  const coverRow = sorted.find((i) => i.is_cover) ?? sorted[0];
  const links = ((type === "workspace" ? row.workspace_amenities : row.room_amenities) as { amenity_id: string }[] | undefined) ?? [];
  const ids = new Set(links.map((l) => l.amenity_id));
  return {
    id: row.id as string,
    type,
    name: row.name as string,
    slug: row.slug as string,
    floor: (row.floor as string) ?? "",
    zone: (row.zone as string) ?? "",
    deskNumber: (row.desk_number as string | null) ?? null,
    capacity: row.capacity as number,
    status: row.status as string,
    featured: row.featured as boolean,
    publicVisible: row.public_visible as boolean,
    shortDescription: pickLocalized(row, "short_description", locale),
    fullDescription: pickLocalized(row, "full_description", locale),
    cover: toMediaView(coverRow?.media, locale),
    images: sorted.map((i) => toMediaView(i.media, locale)).filter(Boolean) as MediaView[],
    amenities: amenities.filter((a) => ids.has(a.id)),
  };
}

const WS_SELECT = "*, workspace_images(id, display_order, is_cover, media(*)), workspace_amenities(amenity_id)";
const ROOM_SELECT = "*, room_images(id, display_order, is_cover, media(*)), room_amenities(amenity_id)";

export const listResources = cache(async (type: ResourceType, locale: Locale): Promise<ResourceView[]> => {
  const supabase = await createClient();
  const amenities = await getAmenities(locale);
  const query =
    type === "workspace"
      ? supabase.from("workspaces").select(WS_SELECT).eq("public_visible", true).neq("status", "disabled")
      : supabase.from("rooms").select(ROOM_SELECT).eq("public_visible", true).neq("status", "disabled");
  const { data, error } = await query.order("display_order").order("name");
  if (error) throw error;
  return (data ?? []).map((r) => mapResource(r as unknown as Record<string, unknown>, type, locale, amenities));
});

export const getResourceBySlug = cache(async (type: ResourceType, slug: string, locale: Locale): Promise<ResourceView | null> => {
  const supabase = await createClient();
  const amenities = await getAmenities(locale);
  const query =
    type === "workspace"
      ? supabase.from("workspaces").select(WS_SELECT).eq("slug", slug).eq("public_visible", true).neq("status", "disabled")
      : supabase.from("rooms").select(ROOM_SELECT).eq("slug", slug).eq("public_visible", true).neq("status", "disabled");
  const { data } = await query.maybeSingle();
  if (!data) return null;
  return mapResource(data as unknown as Record<string, unknown>, type, locale, amenities);
});

/** IDs of resources free for the full range (server-side truth from the database). */
export async function findAvailableIds(type: ResourceType, start: Date, end: Date): Promise<Set<string>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("find_available_resources", {
    p_type: type,
    p_start: start.toISOString(),
    p_end: end.toISOString(),
  });
  if (error) throw error;
  return new Set((data ?? []) as unknown as string[]);
}
