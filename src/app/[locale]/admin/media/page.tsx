import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { AdminPageHeader } from "@/components/admin/admin-shell";
import { ListFilters, Pagination, buildHref, searchTerm } from "@/components/admin/list-tools";
import { MediaLibrary } from "@/components/admin/media-library";
import type { Locale } from "@/i18n/routing";

const PER_PAGE = 48;

export default async function MediaPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ q?: string; page?: string }> }) {
  const locale = (await params).locale as Locale;
  const sp = await searchParams;
  const t = await getTranslations({ locale, namespace: "admin.media" });
  const supabase = await createClient();
  const page = Math.max(1, Number(sp.page) || 1);
  let q = supabase.from("media").select("*", { count: "exact" }).order("created_at", { ascending: false });
  const term = searchTerm(sp.q);
  if (term) q = q.or(`file_name.ilike.%${term}%,title.ilike.%${term}%,alt_text_de.ilike.%${term}%,alt_text_en.ilike.%${term}%`);
  const [{ data, count }, { data: usage }] = await Promise.all([q.range((page - 1) * PER_PAGE, page * PER_PAGE - 1), supabase.rpc("media_usage_counts")]);
  const counts = Object.fromEntries((usage ?? []).map((u) => [u.media_id, Number(u.usage_count)]));
  return (
    <>
      <AdminPageHeader title={t("title")} subtitle={t("subtitle")} />
      <ListFilters q={sp.q} placeholder={t("searchPlaceholder")} />
      <MediaLibrary items={data ?? []} counts={counts} />
      <Pagination page={page} total={count ?? 0} perPage={PER_PAGE} makeHref={(p) => buildHref(`/${locale}/admin/media`, { q: sp.q, page: p })} />
    </>
  );
}
