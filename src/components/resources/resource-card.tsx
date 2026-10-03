import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { ImageIcon, Layers, MapPin, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Icon } from "@/lib/icons";
import { localizeHref } from "@/lib/href";
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
  const shown = resource.amenities.slice(0, 4);
  const rest = resource.amenities.length - shown.length;

  return (
    <article className="group flex flex-col overflow-hidden rounded-xl border bg-card shadow-sm transition-shadow hover:shadow-md" data-testid="resource-card">
      <a href={href} className="relative block aspect-[4/3] overflow-hidden bg-muted" tabIndex={-1} aria-hidden="true">
        {resource.cover ? (
          <Image
            src={resource.cover.url}
            alt={resource.cover.alt || resource.name}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
            data-testid="resource-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <ImageIcon className="h-10 w-10" />
          </div>
        )}
        {availability !== undefined ? (
          <span className="absolute left-3 top-3">
            <Badge variant={availability ? "success" : "danger"}>{availability ? t("availableAtTime") : t("notAvailableAtTime")}</Badge>
          </span>
        ) : resource.status !== "available" ? (
          <span className="absolute left-3 top-3">
            <Badge variant="warning">{ts(`resource.${resource.status}`)}</Badge>
          </span>
        ) : null}
      </a>
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div>
          <h3 className="text-lg font-semibold">
            <a href={href} className="hover:text-primary">
              {resource.name}
            </a>
          </h3>
          {resource.shortDescription ? <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{resource.shortDescription}</p> : null}
        </div>
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {resource.floor ? (
            <li className="flex items-center gap-1">
              <Layers className="h-3.5 w-3.5" /> {resource.floor}
            </li>
          ) : null}
          {resource.zone ? (
            <li className="flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5" /> {resource.zone}
            </li>
          ) : null}
          <li className="flex items-center gap-1">
            <Users className="h-3.5 w-3.5" /> {t("upToPersons", { count: resource.capacity })}
          </li>
        </ul>
        {shown.length ? (
          <ul className="flex flex-wrap gap-1.5">
            {shown.map((a) => (
              <li key={a.id}>
                <Badge variant="secondary" className="font-normal">
                  <Icon name={a.icon} className="h-3 w-3" /> {a.name}
                </Badge>
              </li>
            ))}
            {rest > 0 ? (
              <li>
                <Badge variant="outline" className="font-normal">
                  {t("moreAmenities", { count: rest })}
                </Badge>
              </li>
            ) : null}
          </ul>
        ) : null}
        <div className="mt-auto flex gap-2 pt-2">
          <Button asChild className="flex-1" size="sm" disabled={availability === false}>
            <a href={href}>{availability === false ? t("viewDetails") : t("bookNow")}</a>
          </Button>
        </div>
      </div>
    </article>
  );
}
