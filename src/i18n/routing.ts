import { defineRouting } from "next-intl/routing";

export const locales = ["de", "en"] as const;
export type Locale = (typeof locales)[number];

export const routing = defineRouting({
  locales,
  defaultLocale: "de",
  localePrefix: "always",
  localeCookie: { name: "NEXT_LOCALE", maxAge: 60 * 60 * 24 * 365 },
  pathnames: {
    "/": "/",
    "/coworking": "/coworking",
    "/coworking/[slug]": "/coworking/[slug]",
    "/meeting-rooms": { de: "/besprechungsraeume", en: "/meeting-rooms" },
    "/meeting-rooms/[slug]": { de: "/besprechungsraeume/[slug]", en: "/meeting-rooms/[slug]" },
    "/amenities": { de: "/ausstattung", en: "/amenities" },
    "/how-it-works": { de: "/so-funktionierts", en: "/how-it-works" },
    "/contact": { de: "/kontakt", en: "/contact" },
    "/imprint": { de: "/impressum", en: "/imprint" },
    "/privacy": { de: "/datenschutz", en: "/privacy" },
    "/terms": { de: "/agb", en: "/terms" },
    "/search": { de: "/suche", en: "/search" },
    "/login": { de: "/anmelden", en: "/login" },
    "/signup": { de: "/registrieren", en: "/signup" },
    "/forgot-password": { de: "/passwort-vergessen", en: "/forgot-password" },
    "/reset-password": { de: "/passwort-zuruecksetzen", en: "/reset-password" },
    "/booking/manage/[token]": { de: "/buchung/verwalten/[token]", en: "/booking/manage/[token]" },
    "/p/[slug]": { de: "/seite/[slug]", en: "/page/[slug]" },
    "/account": { de: "/konto", en: "/account" },
    "/account/bookings": { de: "/konto/buchungen", en: "/account/bookings" },
    "/account/profile": { de: "/konto/profil", en: "/account/profile" },
  },
});

export type AppPathname = keyof typeof routing.pathnames;

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (locales as readonly string[]).includes(value);
}
