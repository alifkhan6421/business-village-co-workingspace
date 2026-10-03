import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { requireAdminPage } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { AdminShell } from "@/components/admin/admin-shell";
import { localizeHref } from "@/lib/href";
import type { Locale } from "@/i18n/routing";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Admin · Business Village", robots: { index: false, follow: false } };

export default async function AdminLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const locale = (await params).locale as Locale;
  setRequestLocale(locale);
  const { profile } = await requireAdminPage(locale);
  const supabase = await createClient();
  const { count: newInquiries } = await supabase
    .from("contact_requests")
    .select("id", { count: "exact", head: true })
    .eq("status", "new");
  return (
    <AdminShell
      userName={profile.full_name || profile.email}
      badges={{ inquiries: newInquiries ?? 0 }}
      siteHref={localizeHref("/", locale)}
    >
      {children}
    </AdminShell>
  );
}
