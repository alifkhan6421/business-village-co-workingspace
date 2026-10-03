import Image from "next/image";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/lib/icons";
import { localizeHref } from "@/lib/href";
import { sanitizeRichText } from "@/lib/sanitize";
import { arr, str, type SectionView, type MediaView } from "@/lib/cms";
import type { Locale } from "@/i18n/routing";
import { cn } from "@/lib/utils";

type P = { section: SectionView; locale: Locale };

export function SectionHeading({ title, subtitle, center = true }: { title?: string; subtitle?: string; center?: boolean }) {
  if (!title && !subtitle) return null;
  return (
    <div className={cn("mb-8 max-w-2xl", center && "mx-auto text-center")}>
      {title ? <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h2> : null}
      {subtitle ? <p className="mt-3 text-muted-foreground">{subtitle}</p> : null}
    </div>
  );
}

export function RichText({ html, className }: { html: string; className?: string }) {
  const clean = sanitizeRichText(html);
  if (!clean) return null;
  return <div className={cn("prose-bv", className)} dangerouslySetInnerHTML={{ __html: clean }} />;
}

function LinkButton({ href, label, locale, variant = "default", size = "lg" }: { href: string; label: string; locale: Locale; variant?: "default" | "outline" | "secondary"; size?: "lg" | "default" }) {
  if (!href || !label) return null;
  const external = href.startsWith("https://");
  return (
    <Button asChild variant={variant} size={size}>
      <a href={localizeHref(href, locale)} target={external ? "_blank" : undefined} rel={external ? "noopener noreferrer" : undefined}>
        {label}
      </a>
    </Button>
  );
}

export function HeroSection({ section, locale }: P) {
  const { media, title, subtitle, data, settings } = section;
  return (
    <section className="relative overflow-hidden" data-testid="hero">
      <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 py-14 sm:px-6 lg:grid-cols-2 lg:py-20">
        <div className="space-y-6">
          {str(data.eyebrow) ? <p className="text-sm font-semibold uppercase tracking-widest text-primary">{str(data.eyebrow)}</p> : null}
          <h1 className="text-4xl font-semibold leading-tight tracking-tight sm:text-5xl" data-testid="hero-title">
            {title}
          </h1>
          {subtitle ? <p className="max-w-xl text-lg text-muted-foreground">{subtitle}</p> : null}
          <div className="flex flex-wrap gap-3">
            <LinkButton href={str(settings.primary_href)} label={str(data.primary_label)} locale={locale} />
            <LinkButton href={str(settings.secondary_href)} label={str(data.secondary_label)} locale={locale} variant="outline" />
          </div>
        </div>
        <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-gradient-to-br from-primary/80 via-primary to-emerald-900 shadow-xl">
          {media ? (
            <Image src={media.url} alt={media.alt} fill priority sizes="(max-width: 1024px) 100vw, 50vw" className="object-cover" data-testid="hero-image" />
          ) : null}
        </div>
      </div>
    </section>
  );
}

export function PageHeaderSection({ section, locale }: P) {
  const { media, title, subtitle, data, settings } = section;
  return (
    <section className="relative isolate overflow-hidden border-b bg-secondary/50" data-testid="page-header">
      {media ? (
        <>
          <Image src={media.url} alt={media.alt} fill priority sizes="100vw" className="-z-10 object-cover" />
          <div className="absolute inset-0 -z-10 bg-gradient-to-r from-black/70 to-black/30" />
        </>
      ) : null}
      <div className={cn("mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-20", media && "text-white")}>
        <h1 className="max-w-3xl text-3xl font-semibold tracking-tight sm:text-4xl" data-testid="page-title">
          {title}
        </h1>
        {subtitle ? <p className={cn("mt-4 max-w-2xl text-lg", media ? "text-white/85" : "text-muted-foreground")}>{subtitle}</p> : null}
        {str(data.cta_label) && str(settings.cta_href) ? (
          <div className="mt-6">
            <LinkButton href={str(settings.cta_href)} label={str(data.cta_label)} locale={locale} variant={media ? "secondary" : "default"} />
          </div>
        ) : null}
      </div>
    </section>
  );
}

export function TextSection({ section }: P) {
  return (
    <section className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      {section.title ? <h2 className="mb-4 text-2xl font-semibold tracking-tight">{section.title}</h2> : null}
      {section.subtitle ? <p className="mb-4 text-muted-foreground">{section.subtitle}</p> : null}
      <RichText html={section.content} />
    </section>
  );
}

export function LegalTextSection({ section }: P) {
  return (
    <section className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <h1 className="mb-6 text-3xl font-semibold tracking-tight" data-testid="page-title">{section.title}</h1>
      <RichText html={section.content} />
    </section>
  );
}

export function ImageTextSection({ section }: P) {
  const right = str(section.settings.image_position) === "right";
  return (
    <section className="mx-auto grid max-w-7xl items-center gap-10 px-4 py-14 sm:px-6 lg:grid-cols-2">
      <div className={cn("relative aspect-[4/3] overflow-hidden rounded-2xl bg-muted", right && "lg:order-2")}>
        {section.media ? <Image src={section.media.url} alt={section.media.alt} fill sizes="(max-width: 1024px) 100vw, 50vw" className="object-cover" /> : null}
      </div>
      <div>
        {section.title ? <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">{section.title}</h2> : null}
        {section.subtitle ? <p className="mt-3 text-muted-foreground">{section.subtitle}</p> : null}
        <RichText html={section.content} className="mt-4" />
      </div>
    </section>
  );
}

export function FeaturesSection({ section }: P) {
  const items = arr<{ icon?: string; title?: string; text?: string }>(section.data.items);
  return (
    <section className="bg-secondary/40 py-16">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <SectionHeading title={section.title} subtitle={section.subtitle} />
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {items.map((item, i) => (
            <div key={i} className="rounded-xl border bg-card p-6 shadow-sm">
              <span className="mb-4 flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Icon name={item.icon} className="h-5 w-5" />
              </span>
              <h3 className="font-semibold">{item.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{item.text}</p>
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
    <section className="py-16">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <SectionHeading title={section.title} subtitle={section.subtitle} />
        <ol className={cn("grid gap-6", vertical ? "mx-auto max-w-3xl" : "sm:grid-cols-2 lg:grid-cols-5")}>
          {items.map((item, i) => (
            <li key={i} className={cn("relative rounded-xl border bg-card p-5", vertical && "flex gap-5")}>
              <span className="mb-3 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <Icon name={item.icon} className="h-5 w-5" />
              </span>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-primary">{stepLabel(i + 1)}</p>
                <h3 className="mt-1 font-semibold">{item.title}</h3>
                <p className="mt-1.5 text-sm text-muted-foreground">{item.text}</p>
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
    <section className="py-16">
      <div className="mx-auto max-w-3xl px-4 sm:px-6">
        <SectionHeading title={section.title} subtitle={section.subtitle} />
        <div className="divide-y rounded-xl border bg-card">
          {items.map((item, i) => (
            <details key={i} className="group p-5 [&_summary::-webkit-details-marker]:hidden">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium">
                {item.question}
                <ChevronDown className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180" />
              </summary>
              <p className="mt-3 whitespace-pre-line text-sm text-muted-foreground">{item.answer}</p>
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
    <section className="px-4 py-12 sm:px-6">
      <div
        className={cn(
          "relative mx-auto flex max-w-7xl flex-col items-start gap-6 overflow-hidden rounded-2xl p-8 sm:p-12 md:flex-row md:items-center md:justify-between",
          variant === "primary" && "bg-primary text-primary-foreground",
          variant === "contact" && "bg-accent text-accent-foreground",
          variant === "muted" && "border bg-card",
        )}
      >
        {section.media ? (
          <Image src={section.media.url} alt={section.media.alt} fill sizes="100vw" className="-z-0 object-cover opacity-20" />
        ) : null}
        <div className="relative max-w-2xl">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">{section.title}</h2>
          {section.subtitle ? <p className="mt-2 opacity-85">{section.subtitle}</p> : null}
          {showAddress ? <p className="mt-3 text-sm font-medium opacity-90">{address}</p> : null}
        </div>
        <div className="relative">
          <LinkButton href={str(section.settings.button_href)} label={str(section.data.button_label)} locale={locale} variant={variant === "primary" ? "secondary" : "default"} />
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
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {images.map((m) => (
          <div key={m.id} className="relative aspect-[4/3] overflow-hidden rounded-xl bg-muted">
            <Image src={m.url} alt={m.alt} fill sizes="(max-width: 768px) 50vw, 33vw" className="object-cover" />
          </div>
        ))}
      </div>
    </section>
  );
}
