"use client";
import { useLocale, useTranslations } from "next-intl";
import { CheckCircle2 } from "lucide-react";
import { Input, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { SubmitButton } from "@/components/forms/submit-button";
import { FormAlert } from "@/components/forms/form-alert";
import { useServerForm } from "@/components/forms/use-server-form";
import { useErrorText, useFieldErrorText } from "@/components/forms/use-error-text";
import { submitContactRequest } from "@/lib/contact-actions";

export function ContactForm({ title, intro, successMessage }: { title: string; intro: string; successMessage: string }) {
  const t = useTranslations("site");
  const tc = useTranslations("common");
  const locale = useLocale();
  const errText = useErrorText();
  const fieldErr = useFieldErrorText();
  const { state, pending, onSubmit } = useServerForm(submitContactRequest);
  const fe = state && !state.ok ? state.fieldErrors ?? {} : {};

  return (
    <div className="rounded-2xl border bg-card p-6 shadow-md sm:p-8">
      {title ? <h2 className="text-xl font-bold tracking-tight">{title}</h2> : null}
      {intro ? <p className="mt-1 text-sm text-muted-foreground">{intro}</p> : null}
      {state?.ok ? (
        <div className="mt-6 flex flex-col items-center gap-3 rounded-2xl bg-emerald-50 px-6 py-10 text-center text-emerald-900" role="status" data-testid="contact-success">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-emerald-600 shadow-xs">
            <CheckCircle2 className="h-6 w-6" />
          </span>
          <p className="max-w-sm font-medium">{successMessage}</p>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate data-testid="contact-form">
          <input type="hidden" name="locale" value={locale} />
          <div className="hidden" aria-hidden="true">
            <input type="text" name="website" tabIndex={-1} autoComplete="off" />
          </div>
          {state && !state.ok ? <FormAlert>{errText(state.error)}</FormAlert> : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("contactFormName")} htmlFor="c-name" error={fieldErr(fe.name)}>
              <Input id="c-name" name="name" autoComplete="name" aria-invalid={!!fe.name} />
            </Field>
            <Field label={t("contactFormEmail")} htmlFor="c-email" error={fieldErr(fe.email)}>
              <Input id="c-email" name="email" type="email" autoComplete="email" aria-invalid={!!fe.email} />
            </Field>
            <Field label={`${t("contactFormCompany")} (${tc("optional")})`} htmlFor="c-company" error={fieldErr(fe.company)}>
              <Input id="c-company" name="company" autoComplete="organization" />
            </Field>
            <Field label={`${t("contactFormPhone")} (${tc("optional")})`} htmlFor="c-phone" error={fieldErr(fe.phone)}>
              <Input id="c-phone" name="phone" type="tel" autoComplete="tel" aria-invalid={!!fe.phone} />
            </Field>
          </div>
          <Field label={t("contactFormMessage")} htmlFor="c-message" error={fieldErr(fe.message)}>
            <Textarea id="c-message" name="message" rows={6} aria-invalid={!!fe.message} />
          </Field>
          <SubmitButton size="lg" className="w-full sm:w-auto" pending={pending} pendingLabel={t("contactSending")}>
            {t("contactSend")}
          </SubmitButton>
        </form>
      )}
    </div>
  );
}
