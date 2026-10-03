import "server-only";
import type { Metadata } from "next";
import type { Locale } from "@/i18n/routing";
import { appUrl, localizeHref } from "@/lib/href";
import { getSiteSettings, type MediaView, type PageView } from "@/lib/cms";
import { pickLocalized } from "@/lib/localize";

/**
 * Builds per-locale metadata with hreflang alternates. `internalPath` is the
 * unlocalized route ("/meeting-rooms/berlin-room").
 */
export async function buildMetadata(opts: {
  locale: Locale;
  internalPath: string;
  page?: PageView | null;
  title?: string;
  description?: string;
  image?: MediaView | null;
  noindex?: boolean;
}): Promise<Metadata> {
  const settings = await getSiteSettings(opts.locale);
  const s = settings as unknown as Record<string, unknown>;
  const defaultTitle = pickLocalized(s, "default_seo_title", opts.locale) || settings.company_name;
  const defaultDescription = pickLocalized(s, "default_seo_description", opts.locale);

  const title = opts.page?.seoTitle || opts.title || opts.page?.title || defaultTitle;
  const description = opts.page?.seoDescription || opts.description || defaultDescription;
  const image = opts.page?.seoImage ?? opts.image ?? settings.defaultSeoImage;
  const url = appUrl(localizeHref(opts.internalPath, opts.locale));

  return {
    title,
    description,
    metadataBase: new URL(appUrl("/")),
    alternates: {
      canonical: opts.page?.canonicalUrl || url,
      languages: {
        de: appUrl(localizeHref(opts.internalPath, "de")),
        en: appUrl(localizeHref(opts.internalPath, "en")),
        "x-default": appUrl(localizeHref(opts.internalPath, "de")),
      },
    },
    openGraph: {
      title: opts.page?.ogTitle || title,
      description: opts.page?.ogDescription || description,
      url,
      siteName: settings.company_name,
      locale: opts.locale === "de" ? "de_DE" : "en_GB",
      alternateLocale: opts.locale === "de" ? ["en_GB"] : ["de_DE"],
      type: "website",
      images: image ? [{ url: image.url, alt: image.alt, width: image.width ?? undefined, height: image.height ?? undefined }] : undefined,
    },
    robots: opts.noindex || opts.page?.noindex ? { index: false, follow: true } : undefined,
    icons: settings.favicon ? { icon: settings.favicon.url } : undefined,
  };
}
