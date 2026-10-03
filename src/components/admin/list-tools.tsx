import Link from "next/link";
import { Search } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Input, NativeSelect } from "@/components/ui/input";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** GET search/filter bar; works without JavaScript. */
export async function ListFilters({
  q,
  placeholder,
  filters = [],
  hidden = {},
}: {
  q?: string;
  placeholder?: string;
  filters?: { name: string; value: string; label: string; options: { value: string; label: string }[] }[];
  hidden?: Record<string, string>;
}) {
  const t = await getTranslations("common");
  return (
    <form method="get" className="mb-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center" role="search">
      {Object.entries(hidden).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <div className="relative min-w-0 flex-1 sm:min-w-[16rem]">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input name="q" defaultValue={q} placeholder={placeholder ?? t("searchPlaceholder")} className="pl-9" aria-label={t("search")} />
      </div>
      {filters.map((f) => (
        <NativeSelect key={f.name} name={f.name} defaultValue={f.value} aria-label={f.label} className="sm:w-48">
          {f.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </NativeSelect>
      ))}
      <Button type="submit" variant="secondary">
        {t("filter")}
      </Button>
    </form>
  );
}

export async function Pagination({ page, total, perPage, makeHref }: { page: number; total: number; perPage: number; makeHref: (p: number) => string }) {
  const t = await getTranslations("admin.common");
  const pages = Math.max(1, Math.ceil(total / perPage));
  if (pages <= 1) return null;
  return (
    <nav className="mt-4 flex items-center justify-between gap-2 text-sm" aria-label="Pagination">
      <span className="text-muted-foreground">{t("page", { page, total: pages })}</span>
      <div className="flex gap-2">
        <Link
          href={makeHref(page - 1)}
          aria-disabled={page <= 1}
          className={cn(buttonVariants({ variant: "outline", size: "sm" }), page <= 1 && "pointer-events-none opacity-50")}
        >
          {t("prev")}
        </Link>
        <Link
          href={makeHref(page + 1)}
          aria-disabled={page >= pages}
          className={cn(buttonVariants({ variant: "outline", size: "sm" }), page >= pages && "pointer-events-none opacity-50")}
        >
          {t("next")}
        </Link>
      </div>
    </nav>
  );
}

export function buildHref(base: string, params: Record<string, string | number | undefined>) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "" && v !== "all") sp.set(k, String(v));
  const s = sp.toString();
  return s ? `${base}?${s}` : base;
}

/** Escapes user input for PostgREST `or()` ilike filters. */
export function searchTerm(q: string | undefined) {
  return (q ?? "").trim().replace(/[%_,()*\\]/g, " ").slice(0, 80);
}
