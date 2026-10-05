import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { ExternalLink, Image as ImageIcon, ImageOff, Pencil, Plus, Star, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { AdminPageHeader } from "./admin-shell";
import { ListFilters, searchTerm } from "./list-tools";
import { StatusBadge } from "./status-badge";
import { ResourceForm, type ResourceFormValues } from "./resource-form";
import { GalleryManager } from "./gallery-manager";
import { BlocksManager } from "./blocks-manager";
import { DeleteButton } from "./delete-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ResourceCardActions } from "./resource-card-actions";
import { formatPrice } from "@/lib/price";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/states";
import { deleteResource, type ResourceKind } from "@/lib/admin/resources";
import type { MediaItem } from "@/lib/admin/media";
import { localizeHref } from "@/lib/href";
import { todayBerlin } from "@/lib/time";
import { toAmenityView } from "@/lib/resources";
import type { Locale } from "@/i18n/routing";

const PLURAL = { workspace: "workspaces", room: "rooms" } as const;

type ImgRow = { display_order: number; is_cover: boolean; media: MediaItem | null };

export async function ResourceListPage({ kind, locale, q, status }: { kind: ResourceKind; locale: Locale; q?: string; status?: string }) {
  const t = await getTranslations({ locale, namespace: "admin" });
  const ts = await getTranslations({ locale, namespace: "status.resource" });
  const tt = await getTranslations({ locale, namespace: "status.bookingType" });
  const tsite = await getTranslations({ locale, namespace: "site" });
  const supabase = await createClient();
  const imgRel = kind === "workspace" ? "workspace_images(display_order, is_cover, media(*))" : "room_images(display_order, is_cover, media(*))";
  let query = supabase.from(PLURAL[kind]).select(`*, ${imgRel}`).order("display_order").order("name");
  const term = searchTerm(q);
  if (term) query = query.or(`name.ilike.%${term}%,slug.ilike.%${term}%,floor.ilike.%${term}%`);
  if (status && status !== "all") query = query.eq("status", status);
  const { data } = await query;
  const rows = (data ?? []) as unknown as (ResourceFormValues & { workspace_images?: ImgRow[]; room_images?: ImgRow[] })[];
  const base = `/${locale}/admin/${PLURAL[kind]}`;

  return (
    <>
      <AdminPageHeader
        title={kind === "workspace" ? t("resources.workspacesTitle") : t("resources.roomsTitle")}
        subtitle={kind === "workspace" ? t("resources.workspacesSubtitle") : t("resources.roomsSubtitle")}
        actions={
          <Link href={`${base}/new`} className={buttonVariants()}>
            <Plus /> {kind === "workspace" ? t("resources.newWorkspace") : t("resources.newRoom")}
          </Link>
        }
      />
      <ListFilters
        q={q}
        filters={[
          {
            name: "status",
            value: status ?? "all",
            label: t("common.status"),
            options: [{ value: "all", label: t("common.filterAll") }, ...["available", "maintenance", "disabled"].map((s) => ({ value: s, label: ts(s) }))],
          },
        ]}
      />
      {rows.length === 0 ? (
        <EmptyState title={t("common.noResults")} />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" data-testid="admin-resource-grid">
          {rows.map((r) => {
            const imgs = [...((kind === "workspace" ? r.workspace_images : r.room_images) ?? [])].sort((a, b) => a.display_order - b.display_order);
            const cover = imgs.find((i) => i.is_cover) ?? imgs[0];
            const hourly = r.price_hourly != null && r.price_hourly !== "" ? Number(r.price_hourly) : null;
            const daily = r.price_daily != null && r.price_daily !== "" ? Number(r.price_daily) : null;
            const publicHref = localizeHref(`/${kind === "workspace" ? "coworking" : "meeting-rooms"}/${r.slug}`, locale);
            return (
              <li key={r.id} className={cn("flex flex-col overflow-hidden rounded-2xl border bg-card shadow-xs", r.status === "disabled" && "opacity-70")}>
                <Link href={`${base}/${r.id}`} className="relative block aspect-[16/9] bg-muted" tabIndex={-1} aria-hidden="true">
                  {cover?.media ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={cover.media.file_url} alt="" loading="lazy" className="h-full w-full object-cover" />
                  ) : (
                    <span className="flex h-full items-center justify-center text-muted-foreground">
                      <ImageOff className="h-6 w-6" />
                    </span>
                  )}
                  <span className="absolute left-3 top-3 flex gap-1.5">
                    <StatusBadge kind="resource" value={r.status} />
                    {!r.public_visible ? <Badge variant="neutral">{t("common.hidden")}</Badge> : null}
                  </span>
                  {r.featured ? (
                    <span className="absolute right-3 top-3 rounded-full bg-white/95 p-1.5 shadow-xs" title={t("resources.featured")}>
                      <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-500" aria-label={t("resources.featured")} />
                    </span>
                  ) : null}
                </Link>
                <div className="flex flex-1 flex-col p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link href={`${base}/${r.id}`} className="block truncate font-semibold hover:underline">
                        {r.name}
                      </Link>
                      <p className="truncate text-xs text-muted-foreground">
                        {tt(kind)}
                        {r.floor ? ` · ${r.floor}` : ""}
                      </p>
                    </div>
                    <p className="shrink-0 text-right text-sm">
                      {hourly !== null ? (
                        <>
                          <span className="font-semibold">{formatPrice(hourly, locale)}</span>
                          <span className="text-muted-foreground"> {tsite("perHour")}</span>
                        </>
                      ) : daily !== null ? (
                        <>
                          <span className="font-semibold">{formatPrice(daily, locale)}</span>
                          <span className="text-muted-foreground"> {tsite("perDay")}</span>
                        </>
                      ) : (
                        <span className="text-muted-foreground">{t("resources.noPrice")}</span>
                      )}
                    </p>
                  </div>
                  <p className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <Users className="h-3.5 w-3.5" /> {r.capacity}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <ImageIcon className="h-3.5 w-3.5" /> {t("resources.imagesCount", { count: imgs.length })}
                    </span>
                  </p>
                  <div className="mt-auto flex gap-2 pt-4">
                    <Link href={`${base}/${r.id}`} className={buttonVariants({ variant: "outline", size: "sm", className: "flex-1" })}>
                      <Pencil /> {t("common.edit")}
                    </Link>
                    <ResourceCardActions kind={kind} id={r.id} name={r.name} status={r.status} publicHref={publicHref} />
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

export async function ResourceEditPage({ kind, locale, id }: { kind: ResourceKind; locale: Locale; id: string }) {
  const t = await getTranslations({ locale, namespace: "admin" });
  const supabase = await createClient();
  const isNew = id === "new";
  const base = `/${locale}/admin/${PLURAL[kind]}`;

  const { data: amenityRows } = await supabase.from("amenities").select("*, amenity_translations(*)").order("display_order");
  const amenities = (amenityRows ?? []).map((a) => {
    const v = toAmenityView(a as never, locale);
    return { id: v.id, name: a.active ? v.name : `${v.name} (${t("common.hidden")})`, icon: v.icon, type: v.type };
  });

  if (isNew) {
    return (
      <>
        <AdminPageHeader
          title={kind === "workspace" ? t("resources.newWorkspace") : t("resources.newRoom")}
          back={{ href: base, label: kind === "workspace" ? t("nav.workspaces") : t("nav.rooms") }}
        />
        <ResourceForm kind={kind} initial={null} amenities={amenities} selectedAmenities={[]} />
      </>
    );
  }

  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const rel =
    kind === "workspace"
      ? "workspace_images(display_order, is_cover, media(*)), workspace_amenities(amenity_id)"
      : "room_images(display_order, is_cover, media(*)), room_amenities(amenity_id)";
  const { data } = await supabase.from(PLURAL[kind]).select(`*, ${rel}`).eq("id", id).maybeSingle();
  if (!data) notFound();
  const row = data as unknown as ResourceFormValues & {
    workspace_images?: ImgRow[];
    room_images?: ImgRow[];
    workspace_amenities?: { amenity_id: string }[];
    room_amenities?: { amenity_id: string }[];
  };
  const imgs = [...((kind === "workspace" ? row.workspace_images : row.room_images) ?? [])].sort((a, b) => a.display_order - b.display_order);
  const selected = ((kind === "workspace" ? row.workspace_amenities : row.room_amenities) ?? []).map((a) => a.amenity_id);
  const nowIso = new Date().toISOString();
  const { data: blocks } = await supabase
    .from("resource_blocks")
    .select("id, start_at, end_at, reason, note")
    .eq(kind === "workspace" ? "workspace_id" : "room_id", id)
    .gte("end_at", nowIso)
    .order("start_at");
  const { count: bookingCount } = await supabase
    .from("bookings")
    .select("id", { count: "exact", head: true })
    .eq(kind === "workspace" ? "workspace_id" : "room_id", id);
  const publicHref = localizeHref(`/${kind === "workspace" ? "coworking" : "meeting-rooms"}/${row.slug}`, locale);

  return (
    <>
      <AdminPageHeader
        title={row.name}
        back={{ href: base, label: kind === "workspace" ? t("nav.workspaces") : t("nav.rooms") }}
        actions={
          <>
            <a href={publicHref} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: "outline", size: "sm" })}>
              <ExternalLink /> {t("resources.publicPage")}
            </a>
            <DeleteButton
              action={deleteResource.bind(null, kind, row.id)}
              name={row.name}
              redirectTo={base}
              disabled={(bookingCount ?? 0) > 0}
            />
          </>
        }
      />
      {(bookingCount ?? 0) > 0 ? <p className="-mt-3 mb-4 text-xs text-muted-foreground">{t("resources.deleteHasBookings")}</p> : null}
      <div className="space-y-6">
        <ResourceForm kind={kind} initial={row} amenities={amenities} selectedAmenities={selected} />
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("resources.images")}</CardTitle>
          </CardHeader>
          <CardContent>
            <GalleryManager
              kind={kind}
              resourceId={row.id}
              initial={imgs.map((i) => i.media).filter((m): m is MediaItem => !!m)}
              initialCoverId={imgs.find((i) => i.is_cover)?.media?.id ?? null}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("blocks.title")}</CardTitle>
            <CardDescription>{t("blocks.subtitle")}</CardDescription>
          </CardHeader>
          <CardContent>
            <BlocksManager kind={kind} resourceId={row.id} blocks={blocks ?? []} today={todayBerlin()} />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
