"use client";
import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Input, NativeSelect } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/forms/submit-button";
import { FormAlert } from "@/components/forms/form-alert";
import { useServerForm } from "@/components/forms/use-server-form";
import { useErrorText, useFieldErrorText } from "@/components/forms/use-error-text";
import { requestPasswordReset, updateProfile } from "@/lib/auth-actions";
import { switchLocalePath } from "@/lib/href";
import type { Profile } from "@/lib/auth";

export function ProfileForm({ profile, locale }: { profile: Profile; locale: "de" | "en" }) {
  const t = useTranslations("account");
  const tc = useTranslations("common");
  const errText = useErrorText();
  const fieldErr = useFieldErrorText();
  const { state, pending, onSubmit } = useServerForm(updateProfile);
  const reset = useServerForm(requestPasswordReset);

  useEffect(() => {
    if (!state?.ok) return;
    toast.success(t("profileSaved"));
    // Switching the language moves the user to the same page in the new locale.
    const chosen = (document.getElementById("preferredLocale") as HTMLSelectElement | null)?.value;
    if (chosen && chosen !== locale) window.location.assign(switchLocalePath(window.location.pathname, chosen as "de" | "en"));
  }, [state, t, locale]);
  useEffect(() => {
    if (reset.state?.ok) toast.success(t("resetLinkSent"));
  }, [reset.state, t]);

  const fe = state && !state.ok ? state.fieldErrors ?? {} : {};
  return (
    <div className="grid gap-8 lg:grid-cols-[1.5fr_1fr]">
      <form onSubmit={onSubmit} className="space-y-6 rounded-2xl border bg-card p-6 shadow-xs sm:p-8" noValidate data-testid="profile-form">
        <h2 className="text-base font-bold tracking-tight">{t("personal")}</h2>
        {state && !state.ok ? <FormAlert>{errText(state.error)}</FormAlert> : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("firstName")} htmlFor="firstName" error={fieldErr(fe.firstName)}>
            <Input id="firstName" name="firstName" defaultValue={profile.first_name} />
          </Field>
          <Field label={t("lastName")} htmlFor="lastName" error={fieldErr(fe.lastName)}>
            <Input id="lastName" name="lastName" defaultValue={profile.last_name} />
          </Field>
        </div>
        <Field label={t("email")} htmlFor="email" hint={t("emailHint")}>
          <Input id="email" value={profile.email} disabled readOnly />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={`${t("phone")} (${tc("optional")})`} htmlFor="phone" error={fieldErr(fe.phone)}>
            <Input id="phone" name="phone" type="tel" defaultValue={profile.phone ?? ""} />
          </Field>
          <Field label={t("company")} htmlFor="company" error={fieldErr(fe.company)}>
            <Input id="company" name="company" defaultValue={profile.company ?? ""} />
          </Field>
          <Field label={`${t("department")} (${tc("optional")})`} htmlFor="department" error={fieldErr(fe.department)}>
            <Input id="department" name="department" defaultValue={profile.department ?? ""} />
          </Field>
        </div>
        <div className="border-t pt-6">
          <Field label={t("languageTitle")} htmlFor="preferredLocale" hint={t("languageHint")}>
            <NativeSelect id="preferredLocale" name="preferredLocale" defaultValue={profile.preferred_locale} className="max-w-xs">
              <option value="de">Deutsch</option>
              <option value="en">English</option>
            </NativeSelect>
          </Field>
        </div>
        <SubmitButton pending={pending}>{tc("save")}</SubmitButton>
      </form>
      <form id="settings" onSubmit={reset.onSubmit} className="h-fit scroll-mt-24 space-y-3 rounded-2xl border bg-card p-6 shadow-xs sm:p-8">
        <h2 className="text-base font-bold tracking-tight">{t("passwordTitle")}</h2>
        <p className="text-sm text-muted-foreground">{t("passwordHint")}</p>
        <input type="hidden" name="email" value={profile.email} />
        <input type="hidden" name="locale" value={locale} />
        <Button type="submit" variant="outline" disabled={reset.pending}>{t("sendResetLink")}</Button>
      </form>
    </div>
  );
}
