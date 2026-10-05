import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { localizeHref } from "@/lib/href";
import { formatPrice } from "@/lib/price";
import { stockResource } from "@/lib/stock-photos";
import type { ResourceView } from "@/lib/resources";
import type { Locale } from "@/i18n/routing";

export async function ResourceCard({
  resource,
  locale,
  availability,
  bookQuery,
}: {
  resource: ResourceView;
  locale: Locale;
  /** true/false when a time range was searched, undefined otherwise */
  availability?: boolean;
  bookQuery?: string;
}) {
  const t = await getTranslations({ locale, namespace: "site" });
  const ts = await getTranslations({ locale, namespace: "status" });
  const base = resource.type === "workspace" ? "/coworking" : "/meeting-rooms";
  const href = localizeHref(`${base}/${resource.slug}`, locale) + (bookQuery ? `?${bookQuery}` : "");
  const cover = resource.cover ?? stockResource(resource.type, resource.slug, 800);
  const amenities = resource.amenities.slice(0, 4).map((a) => a.name);
  const rest = resource.amenities.length - amenities.length;
  const location = [resource.floor, resource.zone].filter(Boolean).join(" · ");
  const price = resource.priceHourly ?? resource.priceDaily;
  const priceUnit = resource.priceHourly !== null ? t("perHour") : t("perDay");

  return (
    <article
      className="group relative flex flex-col overflow-hidden rounded-2xl border bg-card shadow-xs transition-[box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:shadow-lg motion-reduce:transform-none"
      data-testid="resource-card"
    >
      <a href={href} className="relative block aspect-[4/3] overflow-hidden bg-muted" tabIndex={-1} aria-hidden="true">
        <Image
          src={cover.url}
          alt={cover.alt || resource.name}
          fill
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          className="object-cover transition-transform duration-500 group-hover:scale-[1.03] motion-reduce:transform-none"
          unoptimized={"stock" in cover}
          data-testid="resource-cover"
        />
        <span className="absolute left-3 top-3 rounded-full bg-white/95 px-2.5 py-1 text-xs font-semibold text-foreground shadow-xs backdrop-blur">
          {resource.type === "workspace" ? t("typeWorkspaceShort") : t("typeRoomShort")}
        </span>
        {availability !== undefined ? (
          <span className="absolute right-3 top-3">
            <Badge variant={availability ? "success" : "danger"} className="bg-white/95 shadow-xs">
              {availability ? t("availableAtTime") : t("notAvailableAtTime")}
            </Badge>
          </span>
        ) : resource.status !== "available" ? (
          <span className="absolute right-3 top-3">
            <Badge variant="warning" className="shadow-xs">{ts(`resource.${resource.status}`)}</Badge>
          </span>
        ) : null}
      </a>
      <div className="flex flex-1 flex-col p-5">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-[17px] font-semibold leading-snug tracking-tight">
            <a href={href} className="after:absolute after:inset-0 after:content-[''] focus-visible:outline-none">
              {resource.name}
            </a>
          </h3>
          {price !== null ? (
            <p className="shrink-0 text-right text-sm" data-testid="resource-price">
              <span className="font-bold">{formatPrice(price, locale)}</span>{" "}
              <span className="text-muted-foreground">{priceUnit}</span>
            </p>
          ) : null}
        </div>
        <p className="mt-1 flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Users className="h-3.5 w-3.5" aria-hidden="true" /> {t("upToPersons", { count: resource.capacity })}
          </span>
          {location ? <span aria-hidden="true">·</span> : null}
          {location ? <span>{location}</span> : null}
        </p>
        {resource.shortDescription ? <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-foreground/80">{resource.shortDescription}</p> : null}
        {amenities.length ? (
          <p className="mt-3 text-[13px] text-muted-foreground">
            {amenities.join(" · ")}
            {rest > 0 ? ` · ${t("moreAmenities", { count: rest })}` : ""}
          </p>
        ) : null}
        <div className="relative z-10 mt-auto grid grid-cols-2 gap-2 pt-5">
          <Button asChild variant="outline" size="sm">
            <a href={href}>{t("viewDetails")}</a>
          </Button>
          <Button asChild size="sm" disabled={availability === false}>
            <a href={`${href}#booking`}>{t("bookNow")}</a>
          </Button>
        </div>
      </div>
    </article>
  );
}
