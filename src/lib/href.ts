import { routing, type Locale } from "@/i18n/routing";

const templates = Object.keys(routing.pathnames) as (keyof typeof routing.pathnames)[];

function localizedTemplate(template: keyof typeof routing.pathnames, locale: Locale): string {
  const entry = routing.pathnames[template] as string | Record<Locale, string>;
  return typeof entry === "string" ? entry : entry[locale];
}

/**
 * Turns a CMS link ("/meeting-rooms", "/coworking/a-01?x=1", "https://…")
 * into the URL for the active locale ("/de/besprechungsraeume").
 */
export function localizeHref(href: string, locale: Locale): string {
  if (!href.startsWith("/")) return href; // absolute https link (validated on save)
  const [pathAndQuery, hash] = href.split("#");
  const [path, query] = pathAndQuery.split("?");
  const clean = path.replace(/\/+$/, "") || "/";
  // Already locale-prefixed?
  if (/^\/(de|en)(\/|$)/.test(clean)) return href;

  let localized: string | null = null;
  for (const template of templates) {
    const pattern = new RegExp("^" + template.replace(/\[[^\]]+\]/g, "([^/]+)") + "$");
    const m = clean.match(pattern);
    if (m) {
      let i = 1;
      localized = localizedTemplate(template, locale).replace(/\[[^\]]+\]/g, () => m[i++]);
      break;
    }
  }
  const base = `/${locale}${(localized ?? clean) === "/" ? "" : localized ?? clean}`;
  return base + (query ? `?${query}` : "") + (hash ? `#${hash}` : "");
}

/** Locale-prefixed path for routes that are not in the localized pathname map (admin area). */
export function adminPath(locale: Locale, path = "") {
  return `/${locale}/admin${path}`;
}

export function appUrl(path = "") {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  return base + path;
}

/**
 * Maps the current locale-prefixed path to the equivalent path in another
 * locale, translating localized slugs ("/de/kontakt" -> "/en/contact").
 */
export function switchLocalePath(pathname: string, to: Locale): string {
  const m = pathname.match(/^\/(de|en)(\/.*)?$/);
  if (!m) return `/${to}`;
  const from = m[1] as Locale;
  const rest = (m[2] ?? "/").replace(/\/+$/, "") || "/";
  for (const template of templates) {
    const fromTpl = localizedTemplate(template, from);
    const pattern = new RegExp("^" + fromTpl.replace(/\[[^\]]+\]/g, "([^/]+)") + "$");
    const mm = rest.match(pattern);
    if (mm) {
      let i = 1;
      const target = localizedTemplate(template, to).replace(/\[[^\]]+\]/g, () => mm[i++]);
      return `/${to}${target === "/" ? "" : target}`;
    }
  }
  return `/${to}${rest === "/" ? "" : rest}`;
}
