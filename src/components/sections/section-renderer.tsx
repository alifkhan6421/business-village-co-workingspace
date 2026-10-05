import { isAllowedMapUrl } from "@/lib/cms-sections";
import { getTranslations } from "next-intl/server";
import { Mail, MapPin, Phone, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/lib/icons";
import { localizeHref } from "@/lib/href";
import { pickLocalized } from "@/lib/localize";
import { arr, getSiteSettings, num, str, type SectionView } from "@/lib/cms";
import { getAmenities, listResources } from "@/lib/resources";
import { todayBerlin } from "@/lib/time";
import type { Locale } from "@/i18n/routing";
import { ResourceCard } from "@/components/resources/resource-card";
import { ResourceList, timeOptions, type ListSearchParams } from "@/components/resources/resource-list";
import {
  CtaSection,
  FaqSection,
  TestimonialsSection,
  FeaturesSection,
  GallerySection,
  HeroSection,
  ImageTextSection,
  LegalTextSection,
  PageHeaderSection,
  RichText,
  SectionHeading,
  StepsSection,
  TextSection,
} from "./basic";
import { AvailabilitySearch } from "./availability-search";
import { ContactForm } from "./contact-form";
import { MapEmbed } from "./map-embed";

export { isAllowedMapUrl };

async function FeaturedResources({ section, locale, type }: { section: SectionView; locale: Locale; type: "workspace" | "room" }) {
  const t = await getTranslations({ locale, namespace: "site" });
  const all = await listResources(type, locale);
  const featured = all.filter((r) => r.featured);
  const items = (featured.length ? featured : all).slice(0, num(section.settings.limit, 4));
  if (!items.length) return null;
  return (
    <section className="py-16 sm:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="mb-10 flex flex-wrap items-end justify-between gap-4 [&>div]:mb-0">
          <SectionHeading title={section.title} subtitle={section.subtitle} center={false} />
          <Button asChild variant="outline">
            <a href={localizeHref(type === "workspace" ? "/coworking" : "/meeting-rooms", locale)}>{str(section.data.cta_label) || t("showAll")}</a>
          </Button>
        </div>
        <div className={`grid gap-6 sm:grid-cols-2 lg:grid-cols-3 ${items.length >= 4 ? "xl:grid-cols-4" : ""}`}>
          {items.map((r) => (
            <ResourceCard key={r.id} resource={r} locale={locale} />
          ))}
        </div>
      </div>
    </section>
  );
}

async function AmenitiesSection({ section, locale }: { section: SectionView; locale: Locale }) {
  const amenities = await getAmenities(locale);
  const ids = arr<string>(section.settings.amenity_ids);
  const list = (ids.length ? amenities.filter((a) => ids.includes(a.id)) : amenities).slice(0, num(section.settings.limit, 12));
  if (!list.length) return null;
  return (
    <section className="bg-surface py-16 sm:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <SectionHeading title={section.title} subtitle={section.subtitle} />
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {list.map((a) => (
            <li key={a.id} className="flex min-w-0 items-center gap-3 rounded-2xl border bg-card p-3 shadow-xs sm:p-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-primary">
                <Icon name={a.icon} className="h-5 w-5" />
              </span>
              <span className="min-w-0 hyphens-auto break-words text-sm font-medium">{a.name}</span>
            </li>
          ))}
        </ul>
        {str(section.data.cta_label) ? (
          <div className="mt-10 text-center">
            <Button asChild variant="outline">
              <a href={localizeHref("/amenities", locale)}>{str(section.data.cta_label)}</a>
            </Button>
          </div>
        ) : null}
      </div>
    </section>
  );
}

async function AmenityListSection({ locale }: { locale: Locale }) {
  const ts = await getTranslations({ locale, namespace: "status" });
  const amenities = await getAmenities(locale);
  const groups = (["general", "workspace", "room"] as const).map((type) => ({ type, items: amenities.filter((a) => a.type === type) })).filter((g) => g.items.length);
  return (
    <section className="mx-auto max-w-7xl space-y-12 px-4 py-12 sm:px-6" data-testid="amenity-list">
      {groups.map((g) => (
        <div key={g.type}>
          <h2 className="mb-5 text-xl font-bold tracking-tight">{ts(`amenityType.${g.type}`)}</h2>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {g.items.map((a) => (
              <li key={a.id} className="flex gap-4 rounded-2xl border bg-card p-5 shadow-xs">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-secondary text-primary">
                  <Icon name={a.icon} className="h-5 w-5" />
                </span>
                <div>
                  <h3 className="font-semibold">{a.name}</h3>
                  {a.description ? <p className="mt-1 text-sm text-muted-foreground">{a.description}</p> : null}
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

async function ContactInfoSection({ section, locale }: { section: SectionView; locale: Locale }) {
  const s = await getSiteSettings(locale);
  const hours = pickLocalized(s as unknown as Record<string, unknown>, "opening_hours", locale);
  const label = (k: string, fallback: string) => str(section.data[k]) || fallback;
  const tc = await getTranslations({ locale, namespace: "common" });
  return (
    <div className="h-fit space-y-6 rounded-2xl border bg-surface p-6 sm:p-8" data-testid="contact-info">
      {section.title ? <h2 className="text-xl font-bold tracking-tight">{section.title}</h2> : null}
      <dl className="space-y-5 text-sm">
        {s.address_line_1 ? (
          <div className="flex gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-background text-primary shadow-xs ring-1 ring-border"><MapPin className="h-4 w-4" /></span>
            <div>
              <dt className="font-medium">{label("address_label", tc("address"))}</dt>
              <dd className="text-muted-foreground">
                {s.company_name}
                <br />
                {s.address_line_1}
                {s.address_line_2 ? <><br />{s.address_line_2}</> : null}
                <br />
                {s.postcode} {s.city}
                {s.country ? <><br />{s.country}</> : null}
              </dd>
            </div>
          </div>
        ) : null}
        {s.phone ? (
          <div className="flex gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-background text-primary shadow-xs ring-1 ring-border"><Phone className="h-4 w-4" /></span>
            <div>
              <dt className="font-medium">{label("phone_label", tc("phone"))}</dt>
              <dd><a className="text-muted-foreground hover:text-foreground" href={`tel:${s.phone.replace(/[^+0-9]/g, "")}`} data-testid="contact-phone">{s.phone}</a></dd>
            </div>
          </div>
        ) : null}
        {s.general_email ? (
          <div className="flex gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-background text-primary shadow-xs ring-1 ring-border"><Mail className="h-4 w-4" /></span>
            <div>
              <dt className="font-medium">{label("email_label", tc("email"))}</dt>
              <dd><a className="text-muted-foreground hover:text-foreground" href={`mailto:${s.general_email}`} data-testid="contact-email">{s.general_email}</a></dd>
            </div>
          </div>
        ) : null}
        {hours ? (
          <div className="flex gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-background text-primary shadow-xs ring-1 ring-border"><Clock className="h-4 w-4" /></span>
            <div>
              <dt className="font-medium">{label("hours_label", tc("openingHours"))}</dt>
              <dd className="whitespace-pre-line text-muted-foreground" data-testid="contact-hours">{hours}</dd>
            </div>
          </div>
        ) : null}
      </dl>
    </div>
  );
}

async function ImprintSection({ section, locale }: { section: SectionView; locale: Locale }) {
  const t = await getTranslations({ locale, namespace: "site.imprint" });
  const s = section.settings;
  const rows: [string, string][] = (
    [
      [t("legalName"), str(s.legal_name)],
      [t("representative"), str(s.representative)],
      [t("address"), str(s.address)],
      [t("contact"), [str(s.phone), str(s.email)].filter(Boolean).join("\n")],
      [t("registerCourt"), str(s.register_court)],
      [t("registerNumber"), str(s.register_number)],
      [t("vatId"), str(s.vat_id)],
      [t("responsible"), str(s.responsible_person)],
    ] as [string, string][]
  ).filter(([, v]) => v.trim());
  return (
    <section className="mx-auto max-w-3xl px-4 py-12 sm:px-6" data-testid="imprint">
      <h1 className="mb-8 text-3xl font-semibold tracking-tight" data-testid="page-title">{section.title}</h1>
      {rows.length ? (
        <dl className="mb-8 grid gap-x-6 gap-y-4 sm:grid-cols-[14rem_1fr]">
          {rows.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="font-medium">{k}</dt>
              <dd className="whitespace-pre-line text-muted-foreground">{v}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      <RichText html={section.content} />
    </section>
  );
}

/** Renders CMS sections in their configured order. */
export async function SectionRenderer({
  sections,
  locale,
  searchParams = {},
}: {
  sections: SectionView[];
  locale: Locale;
  searchParams?: ListSearchParams;
}) {
  const t = await getTranslations({ locale, namespace: "site" });
  const settings = await getSiteSettings(locale);
  const address = [settings.address_line_1, [settings.postcode, settings.city].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const times = timeOptions(settings.booking_day_start.slice(0, 5), settings.booking_day_end.slice(0, 5), settings.booking_slot_minutes);

  // Contact page: info + form (+ map) sit side by side.
  const contactInfo = sections.find((s) => s.type === "contact_info");
  const contactForm = sections.find((s) => s.type === "contact_form");

  const out: React.ReactNode[] = [];
  sections.forEach((s, index) => {
    const prev = sections[index - 1];
    const next = sections[index + 1];
    const key = s.id;
    switch (s.type) {
      case "hero":
        out.push(<HeroSection key={key} section={s} locale={locale} withSearch={next?.type === "availability_search"} />);
        break;
      case "availability_search":
        out.push(<AvailabilitySearch key={key} title={s.title} subtitle={s.subtitle} times={times} today={todayBerlin()} overlap={prev?.type === "hero"} />);
        break;
      case "page_header":
        out.push(<PageHeaderSection key={key} section={s} locale={locale} />);
        break;
      case "text":
      case "custom":
        out.push(sections.length === 1 ? <LegalTextSection key={key} section={s} locale={locale} /> : <TextSection key={key} section={s} locale={locale} />);
        break;
      case "image_text":
        out.push(<ImageTextSection key={key} section={s} locale={locale} />);
        break;
      case "features":
        out.push(<FeaturesSection key={key} section={s} locale={locale} />);
        break;
      case "steps":
        out.push(<StepsSection key={key} section={s} locale={locale} stepLabel={(n) => t("step", { number: n })} />);
        break;
      case "faq":
        out.push(<FaqSection key={key} section={s} locale={locale} />);
        break;
      case "testimonials":
        out.push(<TestimonialsSection key={key} section={s} locale={locale} />);
        break;
      case "cta":
        out.push(<CtaSection key={key} section={s} locale={locale} address={address} />);
        break;
      case "gallery":
        out.push(<GallerySection key={key} section={s} locale={locale} />);
        break;
      case "workspaces":
        out.push(<FeaturedResources key={key} section={s} locale={locale} type="workspace" />);
        break;
      case "rooms":
        out.push(<FeaturedResources key={key} section={s} locale={locale} type="room" />);
        break;
      case "amenities":
        out.push(<AmenitiesSection key={key} section={s} locale={locale} />);
        break;
      case "workspace_list":
        out.push(<ResourceList key={key} type="workspace" locale={locale} searchParams={searchParams} />);
        break;
      case "room_list":
        out.push(<ResourceList key={key} type="room" locale={locale} searchParams={searchParams} />);
        break;
      case "amenity_list":
        out.push(<AmenityListSection key={key} locale={locale} />);
        break;
      case "imprint":
        out.push(<ImprintSection key={key} section={s} locale={locale} />);
        break;
      case "contact_info":
        out.push(
          <section key={key} className="mx-auto grid max-w-7xl gap-8 px-4 py-12 sm:px-6 lg:grid-cols-[1fr_1.4fr] lg:gap-12 lg:py-16">
            <ContactInfoSection section={s} locale={locale} />
            {contactForm ? (
              <ContactForm title={contactForm.title} intro={contactForm.subtitle} successMessage={str(contactForm.data.success_message)} />
            ) : null}
          </section>,
        );
        break;
      case "contact_form":
        if (!contactInfo) {
          out.push(
            <section key={key} className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
              <ContactForm title={s.title} intro={s.subtitle} successMessage={str(s.data.success_message)} />
            </section>,
          );
        }
        break;
      case "map": {
        const url = str(s.settings.embed_url);
        if (url && isAllowedMapUrl(url)) {
          out.push(
            <section key={key} className="mx-auto max-w-7xl px-4 pb-12 sm:px-6">
              {s.title ? <h2 className="mb-4 text-xl font-bold tracking-tight">{s.title}</h2> : null}
              <MapEmbed url={url} title={s.title} />
            </section>,
          );
        }
        break;
      }
      default:
        break;
    }
  });
  return <>{out}</>;
}
