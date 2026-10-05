"use client";
import { useLocale, useTranslations } from "next-intl";
import { MailCheck } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Field, FieldError } from "@/components/ui/label";
import { useServerForm } from "@/components/forms/use-server-form";
import { SubmitButton } from "@/components/forms/submit-button";
import { FormAlert } from "@/components/forms/form-alert";
import { useErrorText, useFieldErrorText } from "@/components/forms/use-error-text";
import { signUp } from "@/lib/auth-actions";
import { localizeHref } from "@/lib/href";
import type { Locale } from "@/i18n/routing";

export function SignupForm() {
  const t = useTranslations("auth");
  const tc = useTranslations("common");
  const locale = useLocale() as Locale;
  const errText = useErrorText();
  const fieldErr = useFieldErrorText();
  const { state, pending, onSubmit } = useServerForm(signUp);

  if (state?.ok) {
    return (
      <div className="space-y-3 text-center" data-testid="signup-success">
        <MailCheck className="mx-auto h-10 w-10 text-primary" />
        <h2 className="text-xl font-semibold">{t("signupSuccessTitle")}</h2>
        <p className="text-muted-foreground">{t("signupSuccessText")}</p>
      </div>
    );
  }

  const fe = state && !state.ok ? state.fieldErrors ?? {} : {};
  const link = (href: string) =>
    function LegalLink(chunks: React.ReactNode) {
      return (
        <a href={localizeHref(href, locale)} target="_blank" className="text-primary underline">
          {chunks}
        </a>
      );
    };
  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <input type="hidden" name="locale" value={locale} />
      {state && !state.ok ? <FormAlert>{errText(state.error)}</FormAlert> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("firstName")} htmlFor="firstName" error={fieldErr(fe.firstName)}>
          <Input id="firstName" name="firstName" autoComplete="given-name" required aria-invalid={!!fe.firstName} />
        </Field>
        <Field label={t("lastName")} htmlFor="lastName" error={fieldErr(fe.lastName)}>
          <Input id="lastName" name="lastName" autoComplete="family-name" required aria-invalid={!!fe.lastName} />
        </Field>
      </div>
      <Field label={t("email")} htmlFor="email" error={fieldErr(fe.email)}>
        <Input id="email" name="email" type="email" autoComplete="email" required aria-invalid={!!fe.email} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("company")} htmlFor="company" error={fieldErr(fe.company)}>
          <Input id="company" name="company" autoComplete="organization" required aria-invalid={!!fe.company} />
        </Field>
        <Field label={`${t("phone")} (${tc("optional")})`} htmlFor="phone" error={fieldErr(fe.phone)}>
          <Input id="phone" name="phone" type="tel" autoComplete="tel" aria-invalid={!!fe.phone} />
        </Field>
      </div>
      <Field label={t("password")} htmlFor="password" error={fieldErr(fe.password)} hint={t("passwordHint")}>
        <Input id="password" name="password" type="password" autoComplete="new-password" required aria-invalid={!!fe.password} />
      </Field>
      <Field label={t("confirmPassword")} htmlFor="confirmPassword" error={fieldErr(fe.confirmPassword)}>
        <Input id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" required aria-invalid={!!fe.confirmPassword} />
      </Field>
      <div className="space-y-2">
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="terms" className="mt-1 h-4 w-4 accent-[var(--primary)]" />
          <span>{t.rich("acceptTerms", { link: link("/terms") })}</span>
        </label>
        <FieldError message={fieldErr(fe.terms)} />
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="privacy" className="mt-1 h-4 w-4 accent-[var(--primary)]" />
          <span>{t.rich("acceptPrivacy", { link: link("/privacy") })}</span>
        </label>
        <FieldError message={fieldErr(fe.privacy)} />
      </div>
      <SubmitButton pending={pending} size="lg" className="w-full" pendingLabel={t("signupButton")}>
        {t("signupButton")}
      </SubmitButton>
    </form>
  );
}
