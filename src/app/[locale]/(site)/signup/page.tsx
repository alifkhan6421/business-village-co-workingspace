import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AuthShell } from "@/components/auth/auth-shell";
import { SignupForm } from "@/components/auth/signup-form";
import { buildMetadata } from "@/lib/seo";
import { localizeHref } from "@/lib/href";
import type { Locale } from "@/i18n/routing";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = (await params).locale as Locale;
  const t = await getTranslations({ locale, namespace: "auth" });
  return buildMetadata({ locale, internalPath: "/signup", title: t("signupTitle"), noindex: true });
}

export default async function SignupPage({ params }: Props) {
  const locale = (await params).locale as Locale;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "auth" });
  return (
    <AuthShell wide
      title={t("signupTitle")}
      subtitle={t("signupSubtitle")}
      footer={
        <>
          {t("haveAccount")}{" "}
          <a className="font-medium text-primary hover:underline" href={localizeHref("/login", locale)}>
            {t("loginInstead")}
          </a>
        </>
      }
    >
      <SignupForm />
    </AuthShell>
  );
}
