"use client";
import { usePathname, useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

/** DE | EN switch. Goes through /api/locale so slugs are translated and the choice is saved. */
export function LanguageSwitcher({ className }: { className?: string }) {
  const locale = useLocale();
  const pathname = usePathname();
  const search = useSearchParams();
  const t = useTranslations("nav");
  const qs = search.toString();
  const href = (to: string) =>
    `/api/locale?to=${to}&path=${encodeURIComponent(pathname)}${qs ? `&search=${encodeURIComponent("?" + qs)}` : ""}`;

  return (
    <nav aria-label={t("languageSwitcher")} className={cn("flex items-center gap-1 text-sm font-medium", className)}>
      {(["de", "en"] as const).map((l, i) => (
        <span key={l} className="flex items-center gap-1">
          {i > 0 ? <span className="text-muted-foreground" aria-hidden="true">|</span> : null}
          {l === locale ? (
            <span aria-current="true" className="rounded px-1.5 py-0.5 text-primary">
              {l.toUpperCase()}
            </span>
          ) : (
            <a href={href(l)} hrefLang={l} lang={l} className="rounded px-1.5 py-0.5 text-muted-foreground hover:text-foreground">
              {l.toUpperCase()}
            </a>
          )}
        </span>
      ))}
    </nav>
  );
}
