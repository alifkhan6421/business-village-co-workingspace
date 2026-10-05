"use client";
import { useEffect } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useServerForm } from "@/components/forms/use-server-form";
import { SubmitButton } from "@/components/forms/submit-button";
import { FormAlert } from "@/components/forms/form-alert";
import { useErrorText, useFieldErrorText } from "@/components/forms/use-error-text";
import { resendVerification, signIn } from "@/lib/auth-actions";
import { localizeHref } from "@/lib/href";
import type { Locale } from "@/i18n/routing";

export function LoginForm({ next, linkError }: { next?: string; linkError?: boolean }) {
  const t = useTranslations("auth");
  const locale = useLocale() as Locale;
  const errText = useErrorText();
  const fieldErr = useFieldErrorText();
  const { state, pending, onSubmit } = useServerForm(signIn);
  const { state: resendState, onSubmit: resendSubmit } = useServerForm(resendVerification);

  useEffect(() => {
    if (state?.ok && state.data?.redirectTo) window.location.assign(state.data.redirectTo);
  }, [state]);

  const fe = state && !state.ok ? state.fieldErrors ?? {} : {};
  return (
    <div className="space-y-4">
      {linkError ? <FormAlert>{t("linkError")}</FormAlert> : null}
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <input type="hidden" name="locale" value={locale} />
        {next ? <input type="hidden" name="next" value={next} /> : null}
        {state && !state.ok ? <FormAlert>{errText(state.error)}</FormAlert> : null}
        <Field label={t("email")} htmlFor="email" error={fieldErr(fe.email)}>
          <Input id="email" name="email" type="email" autoComplete="email" required aria-invalid={!!fe.email} />
        </Field>
        <Field label={t("password")} htmlFor="password" error={fieldErr(fe.password)}>
          <Input id="password" name="password" type="password" autoComplete="current-password" required aria-invalid={!!fe.password} />
        </Field>
        <div className="flex justify-end">
          <a href={localizeHref("/forgot-password", locale)} className="text-sm font-medium text-primary hover:underline">
            {t("forgotPassword")}
          </a>
        </div>
        <SubmitButton pending={pending} size="lg" className="w-full" pendingLabel={t("loginButton")}>
          {t("loginButton")}
        </SubmitButton>
      </form>
      {state && !state.ok && state.error === "auth.emailNotConfirmed" ? (
        <form onSubmit={resendSubmit} className="space-y-2">
          <input type="hidden" name="locale" value={locale} />
          <Input type="email" name="email" placeholder={t("email")} aria-label={t("email")} />
          <Button type="submit" variant="outline" className="w-full">
            {t("resendVerification")}
          </Button>
          {resendState?.ok ? <FormAlert kind="success">{t("verificationResent")}</FormAlert> : null}
        </form>
      ) : null}
    </div>
  );
}
