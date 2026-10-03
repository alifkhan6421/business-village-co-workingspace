"use client";
import { useEffect } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { useServerForm } from "@/components/forms/use-server-form";
import { SubmitButton } from "@/components/forms/submit-button";
import { FormAlert } from "@/components/forms/form-alert";
import { useErrorText, useFieldErrorText } from "@/components/forms/use-error-text";
import { updatePassword } from "@/lib/auth-actions";

export function ResetForm() {
  const t = useTranslations("auth");
  const locale = useLocale();
  const errText = useErrorText();
  const fieldErr = useFieldErrorText();
  const { state, pending, onSubmit } = useServerForm(updatePassword);
  useEffect(() => {
    if (state?.ok && state.data) {
      toast.success(t("resetSuccess"));
      window.location.assign(state.data.redirectTo);
    }
  }, [state, t]);
  const fe = state && !state.ok ? state.fieldErrors ?? {} : {};
  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <input type="hidden" name="locale" value={locale} />
      {state && !state.ok && state.error !== "validation" ? <FormAlert>{errText(state.error)}</FormAlert> : null}
      <Field label={t("newPassword")} htmlFor="password" error={fieldErr(fe.password)} hint={t("passwordHint")}>
        <Input id="password" name="password" type="password" autoComplete="new-password" aria-invalid={!!fe.password} />
      </Field>
      <Field label={t("confirmPassword")} htmlFor="confirmPassword" error={fieldErr(fe.confirmPassword)}>
        <Input id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" aria-invalid={!!fe.confirmPassword} />
      </Field>
      <SubmitButton pending={pending} className="w-full" pendingLabel={t("resetButton")}>
        {t("resetButton")}
      </SubmitButton>
    </form>
  );
}
