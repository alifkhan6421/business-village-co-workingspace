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
    <nav aria-label={t("languageSwitcher")} className={cn("flex items-center rounded-lg bg-muted p-0.5 text-xs font-semibold ring-1 ring-inset ring-border/60", className)}>
      {(["de", "en"] as const).map((l) =>
        l === locale ? (
          <span key={l} aria-current="true" className="rounded-md bg-background px-2 py-1 text-foreground shadow-xs">
            {l.toUpperCase()}
          </span>
        ) : (
          <a key={l} href={href(l)} hrefLang={l} lang={l} className="rounded-md px-2 py-1 text-muted-foreground transition-colors hover:text-foreground">
            {l.toUpperCase()}
          </a>
        ),
      )}
    </nav>
  );
}
