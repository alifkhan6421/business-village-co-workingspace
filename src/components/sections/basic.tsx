import Image from "next/image";
import { ChevronDown, Quote } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/lib/icons";
import { localizeHref } from "@/lib/href";
import { sanitizeRichText } from "@/lib/sanitize";
import { arr, str, type SectionView, type MediaView } from "@/lib/cms";
import type { Locale } from "@/i18n/routing";
import { cn } from "@/lib/utils";
import { stockHero, stockResource } from "@/lib/stock-photos";

type P = { section: SectionView; locale: Locale };

export function SectionHeading({ title, subtitle, center = true }: { title?: string; subtitle?: string; center?: boolean }) {
  if (!title && !subtitle) return null;
  return (
    <div className={cn("mb-10 max-w-2xl", center && "mx-auto text-center")}>
      {title ? <h2 className="text-3xl font-bold tracking-tight sm:text-[2.125rem] sm:leading-tight">{title}</h2> : null}
      {subtitle ? <p className="mt-3 text-base leading-relaxed text-muted-foreground sm:text-lg">{subtitle}</p> : null}
    </div>
  );
}

export function RichText({ html, className }: { html: string; className?: string }) {
  const clean = sanitizeRichText(html);
  if (!clean) return null;
  return <div className={cn("prose-bv", className)} dangerouslySetInnerHTML={{ __html: clean }} />;
}

function LinkButton({ href, label, locale, variant = "default", size = "lg" }: { href: string; label: string; locale: Locale; variant?: "default" | "outline" | "secondary" | "white" | "glass"; size?: "lg" | "default" }) {
  if (!href || !label) return null;
  const external = href.startsWith("https://");
  return (
    <Button asChild variant={variant === "glass" ? "outline" : variant} size={size} className={variant === "glass" ? "border-white/30 bg-white/10 text-white shadow-none backdrop-blur hover:border-white/50 hover:bg-white/20" : undefined}>
      <a href={localizeHref(href, locale)} target={external ? "_blank" : undefined} rel={external ? "noopener noreferrer" : undefined}>
        {label}
      </a>
    </Button>
  );
}

export function HeroSection({ section, locale, withSearch = false }: P & { withSearch?: boolean }) {
  const { media, title, subtitle, data, settings } = section;
  const photo = media ?? stockHero();
  return (
    <section className="px-3 pt-3 sm:px-6 sm:pt-4" data-testid="hero">
      <div className="relative isolate mx-auto max-w-7xl overflow-hidden rounded-3xl bg-primary">
        <Image
          src={photo.url}
          alt={photo.alt}
          fill
          priority
          sizes="(max-width: 1280px) 100vw, 1280px"
          className="-z-10 object-cover"
          unoptimized={"stock" in photo}
          data-testid="hero-image"
        />
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-[oklch(0.2_0.04_165/0.88)] via-[oklch(0.2_0.04_165/0.6)] to-[oklch(0.2_0.04_165/0.15)]" />
        <div className={cn("max-w-2xl px-6 py-16 text-white sm:px-12 sm:py-20 lg:py-28", withSearch && "pb-32 sm:pb-36 lg:pb-40")}>
          {str(data.eyebrow) ? (
            <p className="mb-5 inline-flex rounded-full bg-white/12 px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-white/90 ring-1 ring-inset ring-white/20 backdrop-blur">
              {str(data.eyebrow)}
            </p>
          ) : null}
          <h1 className="text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl" data-testid="hero-title">
            {title}
          </h1>
          {subtitle ? <p className="mt-5 max-w-xl text-base leading-relaxed text-white/85 sm:text-lg">{subtitle}</p> : null}
          <div className="mt-8 flex flex-wrap gap-3">
            <LinkButton href={str(settings.primary_href)} label={str(data.primary_label)} locale={locale} variant="white" />
            <LinkButton href={str(settings.secondary_href)} label={str(data.secondary_label)} locale={locale} variant="glass" />
          </div>
        </div>
      </div>
    </section>
  );
}

export function PageHeaderSection({ section, locale }: P) {
  const { media, title, subtitle, data, settings } = section;
  return (
    <section className="relative isolate overflow-hidden border-b bg-surface" data-testid="page-header">
      {media ? (
        <>
          <Image src={media.url} alt={media.alt} fill priority sizes="100vw" className="-z-10 object-cover" />
          <div className="absolute inset-0 -z-10 bg-gradient-to-r from-[oklch(0.2_0.04_165/0.85)] to-[oklch(0.2_0.04_165/0.35)]" />
        </>
      ) : null}
      <div className={cn("mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-20", media && "text-white")}>
        <h1 className="max-w-3xl text-3xl font-extrabold tracking-tight sm:text-5xl" data-testid="page-title">
          {title}
        </h1>
        {subtitle ? <p className={cn("mt-4 max-w-2xl text-lg", media ? "text-white/85" : "text-muted-foreground")}>{subtitle}</p> : null}
        {str(data.cta_label) && str(settings.cta_href) ? (
          <div className="mt-6">
            <LinkButton href={str(settings.cta_href)} label={str(data.cta_label)} locale={locale} variant={media ? "white" : "default"} />
          </div>
        ) : null}
      </div>
    </section>
  );
}

export function TextSection({ section }: P) {
  return (
    <section className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      {section.title ? <h2 className="mb-4 text-2xl font-bold tracking-tight">{section.title}</h2> : null}
      {section.subtitle ? <p className="mb-4 text-muted-foreground">{section.subtitle}</p> : null}
      <RichText html={section.content} />
    </section>
  );
}

export function LegalTextSection({ section }: P) {
  return (
    <section className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <h1 className="mb-8 text-3xl font-extrabold tracking-tight sm:text-4xl" data-testid="page-title">{section.title}</h1>
      <RichText html={section.content} />
    </section>
  );
}

export function ImageTextSection({ section }: P) {
  const right = str(section.settings.image_position) === "right";
  const img = section.media ?? stockResource("workspace", section.id, 1200);
  return (
    <section className="mx-auto grid max-w-7xl items-center gap-10 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:gap-16 lg:py-20">
      <div className={cn("relative aspect-[4/3] overflow-hidden rounded-3xl bg-muted", right && "lg:order-2")}>
        <Image src={img.url} alt={img.alt} fill sizes="(max-width: 1024px) 100vw, 50vw" className="object-cover" unoptimized={"stock" in img} />
      </div>
      <div>
        {section.title ? <h2 className="text-3xl font-bold tracking-tight">{section.title}</h2> : null}
        {section.subtitle ? <p className="mt-3 text-lg text-muted-foreground">{section.subtitle}</p> : null}
        <RichText html={section.content} className="mt-5 text-muted-foreground" />
      </div>
    </section>
  );
}

export function FeaturesSection({ section }: P) {
  const items = arr<{ icon?: string; title?: string; text?: string }>(section.data.items);
  return (
    <section className="py-16 sm:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <SectionHeading title={section.title} subtitle={section.subtitle} />
        <div className="grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
          {items.map((item, i) => (
            <div key={i}>
              <span className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-secondary text-primary ring-1 ring-inset ring-primary/10">
                <Icon name={item.icon} className="h-5 w-5" />
              </span>
              <h3 className="text-base font-semibold">{item.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function StepsSection({ section, stepLabel }: P & { stepLabel: (n: number) => string }) {
  const items = arr<{ icon?: string; title?: string; text?: string }>(section.data.items);
  const vertical = str(section.settings.layout) === "vertical";
  return (
    <section className="bg-surface py-16 sm:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <SectionHeading title={section.title} subtitle={section.subtitle} />
        <ol className={cn("grid gap-4", vertical ? "mx-auto max-w-3xl" : "sm:grid-cols-2 lg:grid-cols-5")}>
          {items.map((item, i) => (
            <li key={i} className={cn("relative rounded-2xl border bg-card p-6 shadow-xs", vertical && "flex gap-5")}>
              <div className="mb-5 flex items-center justify-between">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                  <Icon name={item.icon} className="h-5 w-5" />
                </span>
                <span className="text-xs font-semibold text-muted-foreground tabular-nums">{String(i + 1).padStart(2, "0")}</span>
              </div>
              <div>
                <p className="sr-only">{stepLabel(i + 1)}</p>
                <h3 className="font-semibold">{item.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{item.text}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

export function FaqSection({ section }: P) {
  const items = arr<{ question?: string; answer?: string }>(section.data.items);
  return (
    <section className="py-16 sm:py-24">
      <div className="mx-auto max-w-3xl px-4 sm:px-6">
        <SectionHeading title={section.title} subtitle={section.subtitle} />
        <div className="divide-y rounded-2xl border bg-card shadow-xs">
          {items.map((item, i) => (
            <details key={i} className="group px-5 py-4 sm:px-6 [&_summary::-webkit-details-marker]:hidden">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-lg py-1 font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                {item.question}
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted transition-transform group-open:rotate-180">
                  <ChevronDown className="h-4 w-4" />
                </span>
              </summary>
              <p className="mt-2 whitespace-pre-line pb-1 text-sm leading-relaxed text-muted-foreground">{item.answer}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

export function CtaSection({ section, locale, address }: P & { address?: string }) {
  const variant = str(section.settings.variant, "primary");
  const showAddress = section.settings.show_address === true && address;
  return (
    <section className="px-4 py-10 sm:px-6">
      <div
        className={cn(
          "relative isolate mx-auto flex max-w-7xl flex-col items-start gap-6 overflow-hidden rounded-3xl p-8 sm:p-12 md:flex-row md:items-center md:justify-between",
          variant === "primary" && "bg-primary text-primary-foreground",
          variant === "contact" && "border bg-secondary text-secondary-foreground",
          variant === "muted" && "border bg-surface",
        )}
      >
        {section.media ? (
          <Image src={section.media.url} alt={section.media.alt} fill sizes="100vw" className="-z-0 object-cover opacity-20" />
        ) : null}
        <div className="relative max-w-2xl">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">{section.title}</h2>
          {section.subtitle ? <p className="mt-2 text-base opacity-85 sm:text-lg">{section.subtitle}</p> : null}
          {showAddress ? <p className="mt-3 text-sm font-medium opacity-90">{address}</p> : null}
        </div>
        <div className="relative">
          <LinkButton href={str(section.settings.button_href)} label={str(section.data.button_label)} locale={locale} variant={variant === "primary" ? "white" : "default"} />
        </div>
      </div>
    </section>
  );
}

export function GallerySection({ section }: P) {
  const images = arr<MediaView>(section.settings.gallery);
  if (!images.length) return null;
  return (
    <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
      <SectionHeading title={section.title} subtitle={section.subtitle} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4">
        {images.map((m) => (
          <div key={m.id} className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-muted">
            <Image src={m.url} alt={m.alt} fill sizes="(max-width: 768px) 50vw, 33vw" className="object-cover" />
          </div>
        ))}
      </div>
    </section>
  );
}

export function TestimonialsSection({ section }: P) {
  const items = arr<{ quote?: string; name?: string; role?: string }>(section.data.items).filter((i) => i.quote);
  if (!items.length) return null;
  return (
    <section className="py-16 sm:py-24" data-testid="testimonials">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <SectionHeading title={section.title} subtitle={section.subtitle} />
        <ul className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {items.map((item, i) => (
            <li key={i}>
              <figure className="flex h-full flex-col rounded-2xl border bg-card p-6 shadow-xs sm:p-7">
                <Quote className="h-7 w-7 text-primary/30" aria-hidden="true" />
                <blockquote className="mt-4 flex-1 text-[15px] leading-relaxed text-foreground/90">{item.quote}</blockquote>
                {item.name || item.role ? (
                  <figcaption className="mt-6 flex items-center gap-3 border-t pt-5">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary text-sm font-bold text-primary" aria-hidden="true">
                      {(item.name ?? "?").trim().charAt(0).toUpperCase()}
                    </span>
                    <span className="min-w-0">
                      {item.name ? <span className="block truncate text-sm font-semibold">{item.name}</span> : null}
                      {item.role ? <span className="block truncate text-xs text-muted-foreground">{item.role}</span> : null}
                    </span>
                  </figcaption>
                ) : null}
              </figure>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
