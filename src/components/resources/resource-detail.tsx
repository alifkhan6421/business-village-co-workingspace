import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowLeft, Clock, Hash, Info, Layers, MapPin, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { RichText } from "@/components/sections/basic";
import { BookingWidget } from "@/components/booking/booking-widget";
import { Icon } from "@/lib/icons";
import { getResourceBySlug, type ResourceType } from "@/lib/resources";
import { getSiteSettings } from "@/lib/cms";
import { getCurrentUser } from "@/lib/auth";
import { localizeHref } from "@/lib/href";
import { pickLocalized } from "@/lib/localize";
import { formatPrice } from "@/lib/price";
import { stockResource } from "@/lib/stock-photos";
import type { Locale } from "@/i18n/routing";
import { Gallery } from "./gallery";

export async function ResourceDetail({
  type,
  slug,
  locale,
  query,
}: {
  type: ResourceType;
  slug: string;
  locale: Locale;
  query: Record<string, string | string[] | undefined>;
}) {
  const resource = await getResourceBySlug(type, slug, locale);
  if (!resource) notFound();
  const [t, ts, settings, current] = await Promise.all([
    getTranslations({ locale, namespace: "site" }),
    getTranslations({ locale, namespace: "status" }),
    getSiteSettings(locale),
    getCurrentUser(),
  ]);
  const base = type === "workspace" ? "/coworking" : "/meeting-rooms";
  const q = (k: string) => (typeof query[k] === "string" ? (query[k] as string) : undefined);
  const address = [settings.address_line_1, [settings.postcode, settings.city].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const hours = pickLocalized(settings as unknown as Record<string, unknown>, "opening_hours", locale);
  const images = resource.images.length ? resource.images : [{ id: "stock", ...stockResource(type, resource.slug, 1600) }];
  const bookable = resource.status === "available";
  const meta = [resource.floor, resource.zone].filter(Boolean).join(" · ");
  // Members keep booking directly in the calendar; everyone else sends a request.
  const memberBooking = bookable && !!current;

  const prices = [
    resource.priceHourly !== null ? { label: t("hourly"), value: formatPrice(resource.priceHourly, locale), unit: t("perHour") } : null,
    resource.priceDaily !== null ? { label: t("daily"), value: formatPrice(resource.priceDaily, locale), unit: t("perDay") } : null,
  ].filter(Boolean) as { label: string; value: string; unit: string }[];

  return (
    <div className="mx-auto max-w-7xl px-4 pb-12 pt-6 sm:px-6 sm:pt-8">
      <a href={localizeHref(base, locale)} className="mb-5 inline-flex items-center gap-1.5 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> {t("backToList")}
      </a>

      {/* Desktop: photos and the room's details side by side, so everything fits on one screen. */}
      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] lg:gap-12">
        <Gallery images={images} name={resource.name} />

        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{type === "workspace" ? t("typeWorkspaceShort") : t("typeRoomShort")}</Badge>
            {!bookable ? <Badge variant="warning">{ts(`resource.${resource.status}`)}</Badge> : null}
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl" data-testid="resource-name">{resource.name}</h1>
          <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1"><Users className="h-4 w-4" /> {t("upToPersons", { count: resource.capacity })}</span>
            {meta ? <><span aria-hidden="true">·</span><span>{meta}</span></> : null}
            {settings.city ? <><span aria-hidden="true">·</span><span className="inline-flex items-center gap-1"><MapPin className="h-4 w-4" />{settings.city}</span></> : null}
          </p>

          {prices.length ? (
            <p className="mt-4 flex flex-wrap items-baseline gap-x-4 gap-y-1">
              {prices.map((p, i) => (
                <span key={p.label} className={i === 0 ? "text-2xl font-extrabold tracking-tight" : "text-sm text-muted-foreground"}>
                  {p.value} <span className={i === 0 ? "text-base font-medium text-muted-foreground" : ""}>{p.unit}</span>
                </span>
              ))}
            </p>
          ) : (
            <p className="mt-4 text-lg font-bold">{t("priceOnRequest")}</p>
          )}

          {resource.fullDescription ? (
            <RichText html={resource.fullDescription} className="mt-5 leading-relaxed text-foreground/80" />
          ) : resource.shortDescription ? (
            <p className="mt-5 leading-relaxed text-foreground/80">{resource.shortDescription}</p>
          ) : null}

          {resource.amenities.length ? (
            <section className="mt-6 border-t pt-6">
              <h2 className="mb-4 font-semibold">{t("amenities")}</h2>
              <ul className="grid grid-cols-2 gap-3" data-testid="resource-amenities">
                {resource.amenities.map((a) => (
                  <li key={a.id} className="flex items-center gap-2.5 text-sm">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-secondary text-primary">
                      <Icon name={a.icon} className="h-4 w-4" />
                    </span>
                    {a.name}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {!bookable ? (
            <p className="mt-6 text-sm text-muted-foreground">{t("statusNotBookable", { status: ts(`resource.${resource.status}`) })}</p>
          ) : null}
        </div>
      </div>

      <section className="mt-10 grid gap-6 border-t pt-8 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <h2 className="mb-2 flex items-center gap-2 font-semibold"><MapPin className="h-4 w-4 text-primary" /> {t("location")}</h2>
          <dl className="space-y-1.5 text-sm text-muted-foreground">
            <dd>{[settings.company_name, address].filter(Boolean).join(", ")}</dd>
            {resource.floor ? <dd className="flex items-center gap-1.5"><Layers className="h-3.5 w-3.5" /> {t("floor")}: {resource.floor}</dd> : null}
            {resource.zone ? <dd className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" /> {t("zone")}: {resource.zone}</dd> : null}
            {resource.deskNumber ? <dd className="flex items-center gap-1.5"><Hash className="h-3.5 w-3.5" /> {t("deskNumber")}: {resource.deskNumber}</dd> : null}
          </dl>
        </div>
        {hours ? (
          <div>
            <h2 className="mb-2 flex items-center gap-2 font-semibold"><Clock className="h-4 w-4 text-primary" /> {t("openingHours")}</h2>
            <p className="whitespace-pre-line text-sm text-muted-foreground">{hours}</p>
          </div>
        ) : null}
        <div>
          <h2 className="mb-2 flex items-center gap-2 font-semibold"><Info className="h-4 w-4 text-primary" /> {t("rules")}</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">{t("rulesText", { hours: settings.cancellation_cutoff_hours })}</p>
        </div>
      </section>

      {/* Guests only browse here; requests go through the booking request page (header button). */}
      {memberBooking && current ? (
        <section className="mt-16 scroll-mt-20 border-t pt-12" id="booking">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">{t("memberBookingTitle")}</h2>
            <p className="mb-8 mt-1 text-muted-foreground">{t("calendarHint")}</p>
            <BookingWidget
              resource={{ id: resource.id, type, name: resource.name, capacity: resource.capacity, priceHourly: resource.priceHourly, priceDaily: resource.priceDaily }}
              settings={{
                dayStart: settings.booking_day_start.slice(0, 5),
                dayEnd: settings.booking_day_end.slice(0, 5),
                slotMinutes: settings.booking_slot_minutes,
                weekdays: settings.booking_weekdays,
              }}
              user={{ name: current.profile.full_name ?? "", email: current.profile.email }}
              initial={{ date: q("date"), start: q("start"), end: q("end") }}
              returnPath={localizeHref(`${base}/${resource.slug}`, locale)}
            />
          </div>
        </section>
      ) : null}
    </div>
  );
}
