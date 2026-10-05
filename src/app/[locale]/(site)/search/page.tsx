import type { Metadata } from "next";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { EmptyState } from "@/components/ui/states";
import { ResourceCard } from "@/components/resources/resource-card";
import { findAvailableIds, listResources } from "@/lib/resources";
import { berlinToUtc } from "@/lib/time";
import { buildMetadata } from "@/lib/seo";
import type { Locale } from "@/i18n/routing";

type Props = { params: Promise<{ locale: string }>; searchParams: Promise<Record<string, string | undefined>> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = (await params).locale as Locale;
  const t = await getTranslations({ locale, namespace: "site" });
  return buildMetadata({ locale, internalPath: "/search", title: t("searchResultsTitle"), noindex: true });
}

/** Results of the homepage availability search — real availability from the database. */
export default async function SearchPage({ params, searchParams }: Props) {
  const locale = (await params).locale as Locale;
  setRequestLocale(locale);
  const q = await searchParams;
  const t = await getTranslations({ locale, namespace: "site" });
  const format = await getFormatter({ locale });
  const type = q.type === "room" ? "room" : "workspace";
  const people = Math.max(1, Number(q.people) || 1);
  const from = q.date && q.start ? berlinToUtc(q.date, q.start) : null;
  const to = q.date && q.end ? berlinToUtc(q.date, q.end) : null;

  let content: React.ReactNode;
  if (!from || !to || to <= from) {
    content = <EmptyState title={t("searchMissing")} />;
  } else {
    const [all, ids] = await Promise.all([listResources(type, locale), findAvailableIds(type, from, to)]);
    const free = all.filter((r) => ids.has(r.id) && r.capacity >= people);
    const bookQuery = new URLSearchParams({ date: q.date!, start: q.start!, end: q.end! }).toString();
    content = (
      <>
        <p className="mb-6 text-muted-foreground">
          {t("searchResultsFor", { date: format.dateTime(from, "weekday"), start: format.dateTime(from, "time"), end: format.dateTime(to, "time") })} ·{" "}
          {t("resultsCount", { count: free.length })}
        </p>
        {free.length ? (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3" data-testid="search-results">
            {free.map((r) => (
              <ResourceCard key={r.id} resource={r} locale={locale} availability bookQuery={bookQuery} />
            ))}
          </div>
        ) : (
          <EmptyState title={t("noResults")} description={t("noResultsHint")} />
        )}
      </>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
      <h1 className="mb-2 text-3xl font-extrabold tracking-tight sm:text-4xl">
        {t("searchResultsTitle")} · {type === "room" ? t("typeRoom") : t("typeWorkspace")}
      </h1>
      {content}
    </div>
  );
}
