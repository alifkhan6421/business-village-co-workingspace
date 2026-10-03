import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowLeft, Layers, MapPin, Users, Hash } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { FormAlert } from "@/components/forms/form-alert";
import { RichText } from "@/components/sections/basic";
import { BookingWidget } from "@/components/booking/booking-widget";
import { Icon } from "@/lib/icons";
import { getResourceBySlug, type ResourceType } from "@/lib/resources";
import { getSiteSettings } from "@/lib/cms";
import { getCurrentUser } from "@/lib/auth";
import { localizeHref } from "@/lib/href";
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

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <a href={localizeHref(base, locale)} className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> {t("backToList")}
      </a>
      <div className="grid gap-10 lg:grid-cols-[1.6fr_1fr]">
        <Gallery images={resource.images} name={resource.name} />
        <div className="space-y-6">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight" data-testid="resource-name">{resource.name}</h1>
            {resource.shortDescription ? <p className="mt-2 text-lg text-muted-foreground">{resource.shortDescription}</p> : null}
          </div>
          <dl className="grid grid-cols-2 gap-4 rounded-xl border bg-card p-4 text-sm">
            <div className="flex gap-2"><Users className="h-4 w-4 text-primary" /><div><dt className="text-muted-foreground">{t("capacity")}</dt><dd className="font-medium">{t("upToPersons", { count: resource.capacity })}</dd></div></div>
            {resource.floor ? <div className="flex gap-2"><Layers className="h-4 w-4 text-primary" /><div><dt className="text-muted-foreground">{t("floor")}</dt><dd className="font-medium">{resource.floor}</dd></div></div> : null}
            {resource.zone ? <div className="flex gap-2"><MapPin className="h-4 w-4 text-primary" /><div><dt className="text-muted-foreground">{t("zone")}</dt><dd className="font-medium">{resource.zone}</dd></div></div> : null}
            {resource.deskNumber ? <div className="flex gap-2"><Hash className="h-4 w-4 text-primary" /><div><dt className="text-muted-foreground">{t("deskNumber")}</dt><dd className="font-medium">{resource.deskNumber}</dd></div></div> : null}
            {address ? <div className="col-span-2 flex gap-2"><MapPin className="h-4 w-4 text-primary" /><div><dt className="text-muted-foreground">{t("location")}</dt><dd className="font-medium">{[settings.company_name, resource.floor, address].filter(Boolean).join(", ")}</dd></div></div> : null}
          </dl>
          {resource.amenities.length ? (
            <div>
              <h2 className="mb-3 font-semibold">{t("amenities")}</h2>
              <ul className="flex flex-wrap gap-2" data-testid="resource-amenities">
                {resource.amenities.map((a) => (
                  <li key={a.id}>
                    <Badge variant="secondary" className="px-3 py-1 text-sm font-normal">
                      <Icon name={a.icon} className="h-4 w-4" /> {a.name}
                    </Badge>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </div>

      {resource.fullDescription ? (
        <section className="mt-10 max-w-3xl">
          <h2 className="mb-3 text-xl font-semibold">{t("description")}</h2>
          <RichText html={resource.fullDescription} />
        </section>
      ) : null}

      <section className="mt-12" id="booking">
        <h2 className="text-2xl font-semibold tracking-tight">{t("availabilityCalendar")}</h2>
        <p className="mb-6 mt-1 text-sm text-muted-foreground">{t("calendarHint")}</p>
        {resource.status !== "available" ? (
          <FormAlert kind="info">{t("statusNotBookable", { status: ts(`resource.${resource.status}`) })}</FormAlert>
        ) : (
          <BookingWidget
            resource={{ id: resource.id, type, name: resource.name, capacity: resource.capacity }}
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
