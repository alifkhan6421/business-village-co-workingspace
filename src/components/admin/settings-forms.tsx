"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Plus, Trash2 } from "lucide-react";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/forms/submit-button";
import { useAdminForm } from "./people-forms";
import { LocaleTabs } from "./locale-tabs";
import { ImageField, type ImageValue } from "./media-picker";
import { saveContactSettings, saveEmailTemplate, saveSiteSettings } from "@/lib/admin/settings";
import { timeList } from "./booking-create-form";

type S = Record<string, unknown> & { social_links?: { label: string; url: string }[] };
const s = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));

export function BusinessSettingsForm({ v, logo, favicon }: { v: S; logo: ImageValue; favicon: ImageValue }) {
  const t = useTranslations("admin.settings");
  const tc = useTranslations("admin.common");
  const { onSubmit, pending, fe, alert } = useAdminForm(saveSiteSettings.bind(null, "business"), t("saved"));
  const field = (name: string, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <Field label={label} htmlFor={`bs-${name}`} error={fe(name)}>
      <Input id={`bs-${name}`} name={name} defaultValue={s(v[name])} {...props} />
    </Field>
  );
  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate data-testid="business-settings">
      {alert}
      <div className="grid gap-3 sm:grid-cols-2">
        {field("company_name", t("companyName"), { maxLength: 120 })}
        {field("company_legal_name", t("legalName"), { maxLength: 200 })}
        {field("address_line_1", t("address1"), { maxLength: 200 })}
        {field("address_line_2", t("address2"), { maxLength: 200 })}
        {field("postcode", t("postcode"), { maxLength: 20 })}
        {field("city", t("city"), { maxLength: 100 })}
        {field("country", t("country"), { maxLength: 100 })}
        {field("phone", t("phone"), { maxLength: 40, type: "tel" })}
        {field("general_email", t("generalEmail"), { type: "email", maxLength: 254 })}
        {field("booking_email", t("bookingEmail"), { type: "email", maxLength: 254 })}
        {field("support_email", t("supportEmail"), { type: "email", maxLength: 254 })}
      </div>
      <div>
        <div className="mb-2 text-sm font-medium">{t("openingHours")}</div>
        <LocaleTabs
          missing={{ en: !s(v.opening_hours_en) }}
          de={<Textarea name="opening_hours_de" defaultValue={s(v.opening_hours_de)} rows={3} maxLength={1000} aria-label={`${t("openingHours")} (DE)`} />}
          en={<Textarea name="opening_hours_en" defaultValue={s(v.opening_hours_en)} rows={3} maxLength={1000} aria-label={`${t("openingHours")} (EN)`} />}
        />
      </div>
      <div>
        <div className="mb-2 text-sm font-medium">{t("banner")}</div>
        <p className="mb-2 text-xs text-muted-foreground">{t("bannerHint")}</p>
        <LocaleTabs
          de={<Input name="announcement_banner_de" defaultValue={s(v.announcement_banner_de)} maxLength={300} aria-label={`${t("banner")} (DE)`} />}
          en={<Input name="announcement_banner_en" defaultValue={s(v.announcement_banner_en)} maxLength={300} aria-label={`${t("banner")} (EN)`} />}
        />
      </div>
      <div className="grid gap-6 sm:grid-cols-2">
        <Field label={t("logo")}>
          <ImageField name="logo_media_id" value={logo} aspect="aspect-[3/1]" />
        </Field>
        <Field label={t("favicon")}>
          <ImageField name="favicon_media_id" value={favicon} aspect="aspect-square max-w-[8rem]" />
        </Field>
      </div>
      <div className="flex justify-end">
        <SubmitButton pending={pending}>{tc("saveChanges")}</SubmitButton>
      </div>
    </form>
  );
}

export function BookingRulesForm({ v }: { v: S }) {
  const t = useTranslations("admin.settings");
  const tc = useTranslations("admin.common");
  const { onSubmit, pending, fe, alert } = useAdminForm(saveSiteSettings.bind(null, "booking"), t("saved"));
  const times = timeList("00:00", "24:00", 30);
  const weekdays = (v.booking_weekdays as number[]) ?? [];
  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {alert}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Field label={t("dayStart")} htmlFor="br-start" error={fe("booking_day_start")}>
          <NativeSelect id="br-start" name="booking_day_start" defaultValue={s(v.booking_day_start).slice(0, 5)}>
            {times.map((x) => <option key={x}>{x}</option>)}
          </NativeSelect>
        </Field>
        <Field label={t("dayEnd")} htmlFor="br-end" error={fe("booking_day_end")}>
          <NativeSelect id="br-end" name="booking_day_end" defaultValue={s(v.booking_day_end).slice(0, 5)}>
            {times.map((x) => <option key={x}>{x}</option>)}
          </NativeSelect>
        </Field>
        <Field label={t("slotMinutes")} htmlFor="br-slot" error={fe("booking_slot_minutes")}>
          <NativeSelect id="br-slot" name="booking_slot_minutes" defaultValue={s(v.booking_slot_minutes)}>
            {[15, 30, 60].map((x) => <option key={x}>{x}</option>)}
          </NativeSelect>
        </Field>
        <Field label={t("maxHours")} htmlFor="br-max" error={fe("booking_max_hours")}>
          <Input id="br-max" type="number" min={1} max={24} name="booking_max_hours" defaultValue={s(v.booking_max_hours)} />
        </Field>
        <Field label={t("maxDaysAhead")} htmlFor="br-days" error={fe("booking_max_days_ahead")}>
          <Input id="br-days" type="number" min={1} max={730} name="booking_max_days_ahead" defaultValue={s(v.booking_max_days_ahead)} />
        </Field>
        <Field label={t("cancellationCutoff")} htmlFor="br-cut" error={fe("cancellation_cutoff_hours")}>
          <Input id="br-cut" type="number" min={0} max={168} name="cancellation_cutoff_hours" defaultValue={s(v.cancellation_cutoff_hours)} />
        </Field>
      </div>
      <fieldset>
        <legend className="mb-2 text-sm font-medium">{t("weekdays")}</legend>
        <div className="flex flex-wrap gap-3">
          {[1, 2, 3, 4, 5, 6, 7].map((d) => (
            <label key={d} className="flex items-center gap-1.5 text-sm">
              <input type="checkbox" name="booking_weekdays" value={d} defaultChecked={weekdays.includes(d)} className="h-4 w-4 accent-primary" />
              {t(`weekdayNames.${d}`)}
            </label>
          ))}
        </div>
        {fe("booking_weekdays") ? <p className="mt-1 text-sm text-destructive">{fe("booking_weekdays")}</p> : null}
      </fieldset>
      <div className="flex justify-end">
        <SubmitButton pending={pending}>{tc("saveChanges")}</SubmitButton>
      </div>
    </form>
  );
}

export function ContactSettingsForm({ v }: { v: S }) {
  const t = useTranslations("admin.settings");
  const tc = useTranslations("admin.common");
  const { onSubmit, pending, fe, alert } = useAdminForm(saveContactSettings, t("saved"));
  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {alert}
      <Field label={t("destinationEmail")} htmlFor="cs-dest" error={fe("contact_destination_email")}>
        <Input id="cs-dest" type="email" name="contact_destination_email" defaultValue={s(v.contact_destination_email)} maxLength={254} />
      </Field>
      {(["contact_confirmation_enabled", "contact_admin_notification_enabled", "booking_admin_notification_enabled"] as const).map((k) => (
        <label key={k} className="flex items-center gap-2 text-sm">
          <input type="checkbox" name={k} defaultChecked={!!v[k]} className="h-4 w-4 accent-primary" />
          {t(k === "contact_confirmation_enabled" ? "confirmationEnabled" : k === "contact_admin_notification_enabled" ? "adminNotificationEnabled" : "bookingNotificationEnabled")}
        </label>
      ))}
      <p className="text-xs text-muted-foreground">{t("contactFormTextsHint")}</p>
      <div className="flex justify-end">
        <SubmitButton pending={pending}>{tc("saveChanges")}</SubmitButton>
      </div>
    </form>
  );
}

export type TemplatePair = { key: string; de: { subject: string; heading: string; intro: string; outro: string }; en: { subject: string; heading: string; intro: string; outro: string } };

export function EmailTemplatesForm({ templates }: { templates: TemplatePair[] }) {
  const t = useTranslations("admin.settings");
  const tl = useTranslations("admin.emailLogs.types");
  const [key, setKey] = useState(templates[0]?.key ?? "");
  const tpl = templates.find((x) => x.key === key);
  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">{t.raw("templateHint") as string}</p>
      <NativeSelect value={key} onChange={(e) => setKey(e.target.value)} aria-label={t("emailTemplates")} className="sm:w-80">
        {templates.map((x) => <option key={x.key} value={x.key}>{tl(x.key)}</option>)}
      </NativeSelect>
      {tpl ? <TemplateForm key={tpl.key} tpl={tpl} /> : null}
    </div>
  );
}

function TemplateForm({ tpl }: { tpl: TemplatePair }) {
  const t = useTranslations("admin.settings");
  const tc = useTranslations("admin.common");
  const { onSubmit, pending, fe, alert } = useAdminForm(saveEmailTemplate, t("saved"));
  const pane = (l: "de" | "en") => (
    <div className="space-y-3">
      <Field label={t("subject")} htmlFor={`et-s-${l}`} error={fe(`subject_${l}`)}>
        <Input id={`et-s-${l}`} name={`subject_${l}`} defaultValue={tpl[l].subject} maxLength={200} />
      </Field>
      <Field label={t("heading")} htmlFor={`et-h-${l}`} error={fe(`heading_${l}`)}>
        <Input id={`et-h-${l}`} name={`heading_${l}`} defaultValue={tpl[l].heading} maxLength={200} />
      </Field>
      <Field label={t("intro")} htmlFor={`et-i-${l}`} error={fe(`intro_${l}`)}>
        <Textarea id={`et-i-${l}`} name={`intro_${l}`} defaultValue={tpl[l].intro} rows={3} maxLength={2000} />
      </Field>
      <Field label={t("outro")} htmlFor={`et-o-${l}`} error={fe(`outro_${l}`)}>
        <Textarea id={`et-o-${l}`} name={`outro_${l}`} defaultValue={tpl[l].outro} rows={2} maxLength={2000} />
      </Field>
    </div>
  );
  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <input type="hidden" name="template_key" value={tpl.key} />
      {alert}
      <LocaleTabs de={pane("de")} en={pane("en")} missing={{ en: !tpl.en.subject }} />
      <div className="flex justify-end">
        <SubmitButton pending={pending}>{tc("saveChanges")}</SubmitButton>
      </div>
    </form>
  );
}

export function FooterSettingsForm({ v, footerLogo }: { v: S; footerLogo: ImageValue }) {
  const t = useTranslations("admin.footer");
  const tc = useTranslations("admin.common");
  const tcm = useTranslations("common");
  const { onSubmit, pending, fe, alert } = useAdminForm(saveSiteSettings.bind(null, "footer"), tc("updated"));
  const [links, setLinks] = useState<{ label: string; url: string }[]>(v.social_links ?? []);
  const pane = (l: "de" | "en") => (
    <div className="space-y-3">
      <Field label={t("description")} htmlFor={`ft-d-${l}`} error={fe(`footer_description_${l}`)}>
        <Textarea id={`ft-d-${l}`} name={`footer_description_${l}`} defaultValue={s(v[`footer_description_${l}`])} rows={3} maxLength={600} />
      </Field>
      <Field label={t("copyright")} htmlFor={`ft-c-${l}`} error={fe(`footer_copyright_${l}`)} hint={t("copyrightHint")}>
        <Input id={`ft-c-${l}`} name={`footer_copyright_${l}`} defaultValue={s(v[`footer_copyright_${l}`])} maxLength={200} />
      </Field>
    </div>
  );
  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      {alert}
      <LocaleTabs de={pane("de")} en={pane("en")} missing={{ en: !s(v.footer_description_en) }} />
      <Field label={t("footerLogo")}>
        <ImageField name="footer_logo_media_id" value={footerLogo} aspect="aspect-[3/1]" />
      </Field>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">{t("social")}</legend>
        {links.map((link, i) => (
          <div key={i} className="grid gap-2 sm:grid-cols-[10rem_1fr_auto]">
            <Input name="social_label" defaultValue={link.label} placeholder={t("socialLabel")} aria-label={t("socialLabel")} maxLength={40} />
            <Input name="social_url" defaultValue={link.url} placeholder={t("socialUrl")} aria-label={t("socialUrl")} maxLength={500} />
            <Button type="button" variant="ghost" size="icon" onClick={() => setLinks((x) => x.filter((_, j) => j !== i))} aria-label={tcm("delete")}>
              <Trash2 />
            </Button>
            {fe(`social_url_${i}`) || fe(`social_label_${i}`) ? <p className="text-sm text-destructive sm:col-span-3">{fe(`social_url_${i}`) || fe(`social_label_${i}`)}</p> : null}
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" onClick={() => setLinks((x) => [...x, { label: "", url: "" }])} disabled={links.length >= 12}>
          <Plus /> {t("addSocial")}
        </Button>
      </fieldset>
      <p className="text-xs text-muted-foreground">{t("linksHint")}</p>
      <div className="flex justify-end">
        <SubmitButton pending={pending}>{tc("saveChanges")}</SubmitButton>
      </div>
    </form>
  );
}

export function SeoDefaultsForm({ v, image }: { v: S; image: ImageValue }) {
  const t = useTranslations("admin.seo");
  const tc = useTranslations("admin.common");
  const { onSubmit, pending, fe, alert } = useAdminForm(saveSiteSettings.bind(null, "seo"), tc("updated"));
  const pane = (l: "de" | "en") => (
    <div className="space-y-3">
      <Field label={t("defaultTitle")} htmlFor={`seo-t-${l}`} error={fe(`default_seo_title_${l}`)}>
        <Input id={`seo-t-${l}`} name={`default_seo_title_${l}`} defaultValue={s(v[`default_seo_title_${l}`])} maxLength={70} />
      </Field>
      <Field label={t("defaultDescription")} htmlFor={`seo-d-${l}`} error={fe(`default_seo_description_${l}`)}>
        <Textarea id={`seo-d-${l}`} name={`default_seo_description_${l}`} defaultValue={s(v[`default_seo_description_${l}`])} rows={3} maxLength={170} />
      </Field>
    </div>
  );
  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {alert}
      <LocaleTabs de={pane("de")} en={pane("en")} missing={{ en: !s(v.default_seo_title_en) }} />
      <Field label={t("defaultImage")}>
        <ImageField name="default_seo_image_id" value={image} />
      </Field>
      <div className="flex justify-end">
        <SubmitButton pending={pending}>{tc("saveChanges")}</SubmitButton>
      </div>
    </form>
  );
}
