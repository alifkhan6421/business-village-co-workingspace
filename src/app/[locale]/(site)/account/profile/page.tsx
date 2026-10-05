import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ProfileForm } from "@/components/account/profile-form";
import { requireUser } from "@/lib/auth";
import type { Locale } from "@/i18n/routing";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = (await params).locale as Locale;
  const t = await getTranslations({ locale, namespace: "account" });
  return { title: t("profileTitle"), robots: { index: false } };
}

export default async function ProfilePage({ params }: Props) {
  const locale = (await params).locale as Locale;
  setRequestLocale(locale);
  const { profile } = await requireUser(locale);
  const t = await getTranslations({ locale, namespace: "account" });
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">{t("profileTitle")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("profileSubtitle")}</p>
      </div>
      <ProfileForm profile={profile} locale={locale} />
    </div>
  );
}
