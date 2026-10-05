import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowLeft, CalendarCheck, Clock, Hash, Info, Layers, MapPin, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormAlert } from "@/components/forms/form-alert";
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

  const prices = [
    resource.priceHourly !== null ? { label: t("hourly"), value: formatPrice(resource.priceHourly, locale), unit: t("perHour") } : null,
    resource.priceDaily !== null ? { label: t("daily"), value: formatPrice(resource.priceDaily, locale), unit: t("perDay") } : null,
  ].filter(Boolean) as { label: string; value: string; unit: string }[];

  return (
    <div className="mx-auto max-w-7xl px-4 pb-28 pt-6 sm:px-6 sm:pt-8 lg:pb-8">
      <a href={localizeHref(base, locale)} className="mb-5 inline-flex items-center gap-1.5 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> {t("backToList")}
      </a>

      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{type === "workspace" ? t("typeWorkspaceShort") : t("typeRoomShort")}</Badge>
            {!bookable ? <Badge variant="warning">{ts(`resource.${resource.status}`)}</Badge> : null}
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl" data-testid="resource-name">{resource.name}</h1>
          {resource.shortDescription ? <p className="mt-2 max-w-2xl text-lg text-foreground/75">{resource.shortDescription}</p> : null}
          <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1"><Users className="h-4 w-4" /> {t("upToPersons", { count: resource.capacity })}</span>
            {meta ? <><span aria-hidden="true">·</span><span>{meta}</span></> : null}
            {settings.city ? <><span aria-hidden="true">·</span><span className="inline-flex items-center gap-1"><MapPin className="h-4 w-4" />{settings.city}</span></> : null}
          </p>
        </div>
      </div>

      <Gallery images={images} name={resource.name} />

      <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-14">
        <div className="min-w-0 space-y-10">
          {resource.fullDescription || resource.shortDescription ? (
            <section>
              <h2 className="mb-3 text-xl font-bold tracking-tight">{t("description")}</h2>
              {resource.fullDescription ? (
                <RichText html={resource.fullDescription} className="leading-relaxed text-foreground/80" />
              ) : (
                <p className="leading-relaxed text-foreground/80">{resource.shortDescription}</p>
              )}
            </section>
          ) : null}

          {resource.amenities.length ? (
            <section className="border-t pt-10">
              <h2 className="mb-5 text-xl font-bold tracking-tight">{t("amenities")}</h2>
              <ul className="grid gap-3 sm:grid-cols-2" data-testid="resource-amenities">
                {resource.amenities.map((a) => (
                  <li key={a.id} className="flex items-center gap-3 text-[15px]">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-primary">
                      <Icon name={a.icon} className="h-5 w-5" />
                    </span>
                    {a.name}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="grid gap-6 border-t pt-10 sm:grid-cols-2">
            <div>
              <h2 className="mb-3 flex items-center gap-2 font-semibold"><MapPin className="h-4 w-4 text-primary" /> {t("location")}</h2>
              <ul className="space-y-1.5 text-sm text-muted-foreground">
                <li>{[settings.company_name, address].filter(Boolean).join(", ")}</li>
                {resource.floor ? <li className="flex items-center gap-1.5"><Layers className="h-3.5 w-3.5" /> {t("floor")}: {resource.floor}</li> : null}
                {resource.zone ? <li className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" /> {t("zone")}: {resource.zone}</li> : null}
                {resource.deskNumber ? <li className="flex items-center gap-1.5"><Hash className="h-3.5 w-3.5" /> {t("deskNumber")}: {resource.deskNumber}</li> : null}
              </ul>
            </div>
            {hours ? (
              <div>
                <h2 className="mb-3 flex items-center gap-2 font-semibold"><Clock className="h-4 w-4 text-primary" /> {t("openingHours")}</h2>
                <p className="whitespace-pre-line text-sm text-muted-foreground">{hours}</p>
              </div>
            ) : null}
            <div className="sm:col-span-2">
              <h2 className="mb-3 flex items-center gap-2 font-semibold"><Info className="h-4 w-4 text-primary" /> {t("rules")}</h2>
              <p className="text-sm leading-relaxed text-muted-foreground">{t("rulesText", { hours: settings.cancellation_cutoff_hours })}</p>
            </div>
          </section>
        </div>

        <aside className="hidden h-fit lg:sticky lg:top-24 lg:block">
          <div className="rounded-2xl border bg-card p-6 shadow-lg" data-testid="booking-cta">
            {prices.length ? (
              <div className="mb-5 space-y-2">
                {prices.map((p, i) => (
                  <p key={p.label} className={i === 0 ? "text-2xl font-extrabold tracking-tight" : "text-sm text-muted-foreground"}>
                    {p.value} <span className={i === 0 ? "text-base font-medium text-muted-foreground" : ""}>{p.unit}</span>
                  </p>
                ))}
              </div>
            ) : (
              <p className="mb-5 text-lg font-bold">{t("priceOnRequest")}</p>
            )}
            <ul className="mb-6 space-y-2.5 text-sm">
              <li className="flex items-center gap-2.5"><Users className="h-4 w-4 text-muted-foreground" /> {t("upToPersons", { count: resource.capacity })}</li>
              {resource.amenities.slice(0, 3).map((a) => (
                <li key={a.id} className="flex items-center gap-2.5"><Icon name={a.icon} className="h-4 w-4 text-muted-foreground" /> {a.name}</li>
              ))}
            </ul>
            {bookable ? (
              <Button asChild size="lg" className="w-full">
                <a href="#booking"><CalendarCheck /> {t("bookThis")}</a>
              </Button>
            ) : (
              <p className="text-sm text-muted-foreground">{t("statusNotBookable", { status: ts(`resource.${resource.status}`) })}</p>
            )}
          </div>
        </aside>
      </div>

      {bookable ? (
        <div className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-between gap-4 border-t bg-background/95 px-4 pt-3 shadow-[0_-8px_24px_-12px_rgb(16_32_26/0.18)] backdrop-blur pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] lg:hidden">
          <div className="min-w-0">
            {prices.length ? (
              <p className="truncate font-bold">
                {prices[0].value} <span className="text-sm font-medium text-muted-foreground">{prices[0].unit}</span>
              </p>
            ) : (
              <p className="truncate font-semibold">{t("priceOnRequest")}</p>
            )}
            <p className="truncate text-xs text-muted-foreground">{resource.name} · {t("upToPersons", { count: resource.capacity })}</p>
          </div>
          <Button asChild className="shrink-0">
            <a href="#booking">{t("bookThis")}</a>
          </Button>
        </div>
      ) : null}

      <section className="mt-16 scroll-mt-20 border-t pt-12" id="booking">
        <h2 className="text-2xl font-bold tracking-tight">{t("availabilityCalendar")}</h2>
        <p className="mb-8 mt-1 text-muted-foreground">{t("calendarHint")}</p>
        {!bookable ? (
          <FormAlert kind="info">{t("statusNotBookable", { status: ts(`resource.${resource.status}`) })}</FormAlert>
        ) : (
          <BookingWidget
            resource={{ id: resource.id, type, name: resource.name, capacity: resource.capacity, priceHourly: resource.priceHourly, priceDaily: resource.priceDaily }}
            settings={{
              dayStart: settings.booking_day_start.slice(0, 5),
              dayEnd: settings.booking_day_end.slice(0, 5),
              slotMinutes: settings.booking_slot_minutes,
              weekdays: settings.booking_weekdays,
            }}
            user={current ? { name: current.profile.full_name ?? "", email: current.profile.email } : null}
            initial={{ date: q("date"), start: q("start"), end: q("end") }}
            returnPath={localizeHref(`${base}/${resource.slug}`, locale)}
          />
        )}
      </section>
    </div>
  );
}
