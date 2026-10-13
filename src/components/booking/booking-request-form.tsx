"use client";
import { useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { CheckCircle2, Info, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { SubmitButton } from "@/components/forms/submit-button";
import { FormAlert } from "@/components/forms/form-alert";
import { useServerForm } from "@/components/forms/use-server-form";
import { useErrorText, useFieldErrorText } from "@/components/forms/use-error-text";
import { EstimateSummary } from "@/components/pricing/estimate-summary";
import { applicableEstimates, optionName, type PricingConfig } from "@/lib/pricing/calc";
import { submitBookingRequest } from "@/lib/booking-requests/actions";
import { localizeHref } from "@/lib/href";
import type { Locale } from "@/i18n/routing";

export type RequestFormSettings = {
  dayStart: string;
  dayEnd: string;
  slotMinutes: number;
  weekdays: number[];
  maxHours: number;
  maxDaysAhead: number;
  today: string;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const toMin = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
const fromMin = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/** ISO weekday (1 = Monday) of a YYYY-MM-DD date, independent of the browser's time zone. */
function isoWeekday(date: string) {
  const d = new Date(`${date}T12:00:00Z`);
  return ((d.getUTCDay() + 6) % 7) + 1;
}

/**
 * The one central booking request form. Visitors enter date, start time,
 * duration and participants, see the live estimate and send their contact
 * details. Nothing is reserved here: the team assigns a room afterwards.
 */
export function BookingRequestForm({
  config,
  settings,
  initial,
  room,
  user,
}: {
  config: PricingConfig;
  settings: RequestFormSettings;
  initial: { date?: string; start?: string; hours?: number; participants?: number; option?: string };
  room: { slug: string; name: string; capacity: number } | null;
  user: { name: string; email: string; phone: string; company: string } | null;
}) {
  const t = useTranslations("request");
  const tp = useTranslations("pricing");
  const tv = useTranslations("validation");
  const locale = useLocale() as Locale;
  const errorText = useErrorText();
  const fieldError = useFieldErrorText();
  const topRef = useRef<HTMLDivElement>(null);

  const [date, setDate] = useState(initial.date ?? "");
  const [start, setStart] = useState(initial.start ?? "09:00");
  const [hours, setHours] = useState(String(initial.hours ?? 2));
  const [participants, setParticipants] = useState(String(initial.participants ?? 1));
  const [option, setOption] = useState(initial.option ?? "");
  const [clientErrors, setClientErrors] = useState<Record<string, string>>({});

  const startTimes = useMemo(() => {
    const out: string[] = [];
    for (let m = toMin(settings.dayStart); m + 60 <= toMin(settings.dayEnd === "00:00" ? "24:00" : settings.dayEnd); m += settings.slotMinutes) out.push(fromMin(m));
    return out;
  }, [settings]);
  const dayEndMin = toMin(settings.dayEnd === "00:00" ? "24:00" : settings.dayEnd);
  const maxForStart = Math.max(1, Math.min(settings.maxHours, Math.floor((dayEndMin - toMin(start || settings.dayStart)) / 60)));
  const hourOptions = Array.from({ length: maxForStart }, (_, i) => i + 1);

  const h = Math.min(Math.max(1, Number(hours) || 1), maxForStart);
  const p = Number(participants);
  const inputValid = Number.isInteger(h) && h >= 1 && Number.isInteger(p) && p >= 1 && p <= 1000;
  const options = useMemo(() => (inputValid ? applicableEstimates(config, { hours: h, participants: p }) : []), [config, h, p, inputValid]);
  const estimate = options.find((o) => o.option.key === option) ?? options[0] ?? null;
  const closedDay = date && !settings.weekdays.includes(isoWeekday(date));
  const endLabel = start && inputValid ? fromMin(toMin(start) + h * 60).replace("24:00", "00:00") : "";

  const { state, pending, onSubmit, setState } = useServerForm(async (prev: unknown, fd: FormData) => {
    const res = await submitBookingRequest(prev, fd);
    topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    return res;
  });

  const validate = (fd: FormData) => {
    const e: Record<string, string> = {};
    if (!date) e.date = "required";
    else if (date < settings.today) e.date = "dateInPast";
    else if (closedDay) e.date = "closedDay";
    if (!String(fd.get("full_name") ?? "").trim()) e.full_name = "required";
    const email = String(fd.get("email") ?? "").trim();
    if (!email) e.email = "required";
    else if (!EMAIL_RE.test(email)) e.email = "invalidEmail";
    if (!(p >= 1 && p <= 1000 && Number.isInteger(p))) e.participants = "invalidNumber";
    return e;
  };

  if (state?.ok && state.data) {
    return (
      <div ref={topRef} className="scroll-mt-24 rounded-2xl border bg-card p-6 text-center shadow-lg sm:p-10" data-testid="request-success">
        <CheckCircle2 className="mx-auto h-12 w-12 text-primary" />
        <h2 className="mt-4 text-2xl font-extrabold tracking-tight">{t("successTitle")}</h2>
        <p className="mx-auto mt-3 max-w-xl text-foreground/80" data-testid="request-success-text">{t("successText")}</p>
        <p className="mt-6 text-sm text-muted-foreground">{t("yourReference")}</p>
        <p className="font-mono text-xl font-bold text-primary" data-testid="request-reference">{state.data.reference}</p>
        <p className="mx-auto mt-6 max-w-xl text-sm text-muted-foreground">{t("successEmail")}</p>
        <Button variant="outline" className="mt-8" onClick={() => setState(null)}>{t("another")}</Button>
      </div>
    );
  }

  const fe = (k: string) => fieldError(clientErrors[k] ?? (state && !state.ok ? state.fieldErrors?.[k] : undefined));

  return (
    <div ref={topRef} className="scroll-mt-24">
      <form
        onSubmit={(e) => {
          const errs = validate(new FormData(e.currentTarget));
          setClientErrors(errs);
          if (Object.keys(errs).length) {
            e.preventDefault();
            return;
          }
          onSubmit(e);
        }}
        noValidate
        className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]"
        data-testid="booking-request-form"
      >
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="option" value={estimate?.option.key ?? ""} />
        {room ? <input type="hidden" name="room" value={room.slug} /> : null}
        <div className="hidden" aria-hidden="true">
          <input type="text" name="website" tabIndex={-1} autoComplete="off" />
        </div>

        <div className="min-w-0 space-y-6 rounded-2xl border bg-card p-5 shadow-xs sm:p-8">
          {state && !state.ok ? <FormAlert>{state.error === "validation" ? tv("fixErrors") : errorText(state.error)}</FormAlert> : null}
          {room ? (
            <FormAlert kind="info">{t("fromRoom", { room: room.name, capacity: room.capacity })}</FormAlert>
          ) : null}

          <section className="space-y-4">
            <h2 className="text-lg font-semibold">{t("bookingInfo")}</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t("date")} htmlFor="rq-date" error={fe("date")} hint={closedDay ? t("closedDayHint") : undefined}>
                <Input id="rq-date" type="date" name="date" min={settings.today} value={date} onChange={(e) => setDate(e.target.value)} aria-invalid={!!fe("date")} required />
              </Field>
              <Field label={t("startTime")} htmlFor="rq-start" error={fe("start_time")}>
                <NativeSelect id="rq-start" name="start_time" value={start} onChange={(e) => setStart(e.target.value)}>
                  {startTimes.map((x) => (
                    <option key={x} value={x}>{x}</option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label={t("duration")} htmlFor="rq-hours" error={fe("hours")} hint={endLabel ? t("untilTime", { time: endLabel }) : undefined}>
                <NativeSelect id="rq-hours" name="hours" value={h} onChange={(e) => setHours(e.target.value)}>
                  {hourOptions.map((x) => (
                    <option key={x} value={x}>{t("hoursOption", { count: x })}</option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label={t("participants")} htmlFor="rq-participants" error={fe("participants")}>
                <Input id="rq-participants" type="number" inputMode="numeric" name="participants" min={1} max={1000} step={1} value={participants} onChange={(e) => setParticipants(e.target.value)} aria-invalid={!!fe("participants")} />
              </Field>
              {options.length > 1 ? (
                <Field label={tp("category")} htmlFor="rq-option" className="sm:col-span-2" hint={tp("categoryHint")}>
                  <NativeSelect id="rq-option" value={estimate?.option.key ?? ""} onChange={(e) => setOption(e.target.value)}>
                    {options.map((o) => (
                      <option key={o.option.key} value={o.option.key}>{optionName(o.option, locale)}</option>
                    ))}
                  </NativeSelect>
                </Field>
              ) : null}
            </div>
          </section>

          <section className="space-y-4 border-t pt-6">
            <h2 className="text-lg font-semibold">{t("contactInfo")}</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t("fullName")} htmlFor="rq-name" error={fe("full_name")} className="sm:col-span-2">
                <Input id="rq-name" name="full_name" autoComplete="name" maxLength={200} defaultValue={user?.name ?? ""} aria-invalid={!!fe("full_name")} required />
              </Field>
              <Field label={t("email")} htmlFor="rq-email" error={fe("email")}>
                <Input id="rq-email" name="email" type="email" inputMode="email" autoComplete="email" maxLength={254} defaultValue={user?.email ?? ""} aria-invalid={!!fe("email")} required />
              </Field>
              <Field label={t("phone")} htmlFor="rq-phone" error={fe("phone")}>
                <Input id="rq-phone" name="phone" type="tel" autoComplete="tel" maxLength={40} defaultValue={user?.phone ?? ""} />
              </Field>
              <Field label={t("company")} htmlFor="rq-company" className="sm:col-span-2" error={fe("company")}>
                <Input id="rq-company" name="company" autoComplete="organization" maxLength={200} defaultValue={user?.company ?? ""} />
              </Field>
              <Field label={t("message")} htmlFor="rq-message" className="sm:col-span-2" error={fe("message")}>
                <Textarea id="rq-message" name="message" rows={4} maxLength={2000} placeholder={t("messagePlaceholder")} />
              </Field>
            </div>
          </section>

          <p className="text-xs text-muted-foreground">
            {t.rich("privacyNote", {
              privacy: (c) => <a className="underline underline-offset-2" target="_blank" href={localizeHref("/privacy", locale)}>{c}</a>,
            })}
          </p>
          <SubmitButton pending={pending} pendingLabel={t("sending")} size="lg" className="w-full sm:w-auto" data-testid="submit-request">
            <Send /> {t("submit")}
          </SubmitButton>
        </div>

        <aside className="h-fit space-y-4 lg:sticky lg:top-24" aria-live="polite">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{t("yourEstimate")}</h2>
          <EstimateSummary estimate={estimate} settings={config.settings} />
          <p className="flex gap-2 rounded-xl bg-secondary/60 p-3 text-xs leading-relaxed text-foreground/80">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            {t("notAReservation")}
          </p>
        </aside>
      </form>
    </div>
  );
}
