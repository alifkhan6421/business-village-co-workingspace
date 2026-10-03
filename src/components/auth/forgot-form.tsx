"use client";
import { useLocale, useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { useServerForm } from "@/components/forms/use-server-form";
import { SubmitButton } from "@/components/forms/submit-button";
import { FormAlert } from "@/components/forms/form-alert";
import { useFieldErrorText } from "@/components/forms/use-error-text";
import { requestPasswordReset } from "@/lib/auth-actions";

export function ForgotForm() {
  const t = useTranslations("auth");
  const locale = useLocale();
  const fieldErr = useFieldErrorText();
  const { state, pending, onSubmit } = useServerForm(requestPasswordReset);
  if (state?.ok) return <FormAlert kind="success">{t("forgotSuccess")}</FormAlert>;
  const fe = state && !state.ok ? state.fieldErrors ?? {} : {};
  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <input type="hidden" name="locale" value={locale} />
      <Field label={t("email")} htmlFor="email" error={fieldErr(fe.email)}>
        <Input id="email" name="email" type="email" autoComplete="email" required aria-invalid={!!fe.email} />
      </Field>
      <SubmitButton pending={pending} className="w-full" pendingLabel={t("forgotButton")}>
        {t("forgotButton")}
      </SubmitButton>
    </form>
  );
}
