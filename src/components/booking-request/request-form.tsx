"use client";
import { useMemo, useRef, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { CalendarDays, CheckCircle2, Clock, DoorOpen, Loader2, Send, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { FormAlert } from "@/components/forms/form-alert";
import { useErrorText, useFieldErrorText } from "@/components/forms/use-error-text";
import { EstimatePanel } from "@/components/pricing/estimate-panel";
import { activeCategories, CategoryPicker } from "@/components/pricing/category-picker";
import { submitBookingRequest } from "@/lib/booking-requests/actions";
import { localizeHref } from "@/lib/href";
import { hourBounds, type PricingCategory, type PricingConfig } from "@/lib/pricing/calc";
import type { Locale } from "@/i18n/routing";

type Settings = { dayStart: string; dayEnd: string; slotMinutes: number; weekdays: number[]; maxDaysAhead: number };
type Contact = { fullName: string; email: string; phone: string; company: string; message: string; website: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const toMin = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
const fromMin = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/** ISO weekday (1 = Monday) of a "YYYY-MM-DD" date, independent of the browser's time zone. */
function isoWeekday(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  return ((new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7) + 1;
}

function addDays(date: string, days: number) {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export function BookingRequestForm({
  config,
  settings,
  today,
  initial,
  room,
  user,
}: {
  config: PricingConfig;
  settings: Settings;
  today: string;
  initial: { date?: string; start?: string; hours?: number; people?: number; packageId?: string; category?: PricingCategory };
  room: { slug: string; name: string; capacity: number } | null;
  user: { name: string; email: string; phone: string; company: string } | null;
}) {
  const t = useTranslations("request");
  const locale = useLocale() as Locale;
  const errText = useErrorText();
  const fieldErr = useFieldErrorText();
  const topRef = useRef<HTMLDivElement>(null);
  const bounds = hourBounds(config);
  const dayLength = Math.floor((toMin(settings.dayEnd === "00:00" ? "24:00" : settings.dayEnd) - toMin(settings.dayStart)) / 60);
  const maxHours = Math.max(1, Math.min(bounds.max, dayLength || bounds.max));

  const [date, setDate] = useState(initial.date && initial.date >= today ? initial.date : "");
  const [start, setStart] = useState(initial.start ?? (toMin(settings.dayStart) <= 9 * 60 ? "09:00" : settings.dayStart));
  const [hours, setHours] = useState(Math.min(Math.max(initial.hours ?? 4, 1), maxHours));
  const [people, setPeople] = useState(initial.people ? String(initial.people) : room ? String(room.capacity) : "");
  const [packageId, setPackageId] = useState<string | null>(initial.packageId ?? null);
  // Public requests are for rooms only (meeting rooms, the event stairs or the entire venue).
  const [category, setCategory] = useState<PricingCategory>(
    config.packages.find((p) => p.id === initial.packageId)?.category ?? initial.category ?? activeCategories(config)[0] ?? "meeting",
  );
  const [contact, setContact] = useState<Contact>({
    fullName: user?.name ?? "",
    email: user?.email ?? "",
    phone: user?.phone ?? "",
    company: user?.company ?? "",
    message: "",
    website: "",
  });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const participants = Number(people);
  const validPeople = Number.isInteger(participants) && participants >= 1 && participants <= 1000;

  // Start times that leave room for the chosen duration before closing time.
  const startTimes = useMemo(() => {
    const out: string[] = [];
    const end = toMin(settings.dayEnd === "00:00" ? "24:00" : settings.dayEnd);
    for (let m = toMin(settings.dayStart); m + hours * 60 <= end; m += settings.slotMinutes) out.push(fromMin(m));
    return out;
  }, [settings, hours]);
  const startValue = startTimes.includes(start) ? start : (startTimes[0] ?? "");
  const endLabel = startValue ? fromMin(toMin(startValue) + hours * 60) : "";
  const maxDate = addDays(today, settings.maxDaysAhead);

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!date) errs.date = "required";
    else if (date < today) errs.date = "dateInPast";
    else if (date > maxDate) errs.date = "tooFarAhead";
    else if (!settings.weekdays.includes(isoWeekday(date))) errs.date = "closedDay";
    if (!startValue) errs.start = "required";
    if (!validPeople) errs.participants = "invalidNumber";
    if (!contact.fullName.trim()) errs.fullName = "required";
    if (!EMAIL_RE.test(contact.email.trim())) errs.email = contact.email.trim() ? "invalidEmail" : "required";
    if (contact.phone && !/^[+()0-9\s/-]*$/.test(contact.phone)) errs.phone = "invalidPhone";
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!validate()) {
      setError("validation");
      return;
    }
    startTransition(async () => {
      try {
        const res = await submitBookingRequest({
          date,
          start: startValue,
          hours,
          participants,
          spaceType: "room",
          packageId: packageId ?? "",
          room: room?.slug,
          ...contact,
          locale,
        });
        if (res.ok && res.data) {
          setDone(res.data.reference);
          requestAnimationFrame(() => topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
        } else if (!res.ok) {
          setError(res.error);
          setFieldErrors(res.fieldErrors ?? {});
        }
      } catch {
        setError("unknown");
      }
    });
  };

  const setC = (k: keyof Contact) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setContact((c) => ({ ...c, [k]: e.target.value }));
  const fe = (k: string) => fieldErr(fieldErrors[k]);
  const dateText = (k: string | undefined) => (k && ["dateInPast", "tooFarAhead", "closedDay"].includes(k) ? t(`errors.${k}`) : fieldErr(k));

  if (done) {
    return (
      <div ref={topRef} className="mx-auto max-w-2xl scroll-mt-24 rounded-2xl border bg-card p-6 text-center shadow-lg sm:p-10" data-testid="request-success">
        <CheckCircle2 className="mx-auto h-12 w-12 text-primary" />
        <h2 className="mt-4 text-2xl font-bold tracking-tight">{t("successTitle")}</h2>
        <p className="mt-3 text-foreground/80">{t("successText")}</p>
        <p className="mt-6 text-sm text-muted-foreground">{t("yourReference")}</p>
        <p className="font-mono text-xl font-bold text-primary" data-testid="request-reference">{done}</p>
        <p className="mt-6 text-sm text-muted-foreground">{t("successEmail", { email: contact.email })}</p>
        <Button asChild variant="outline" className="mt-8">
          <a href={localizeHref("/", locale)}>{t("backHome")}</a>
        </Button>
      </div>
    );
  }

  return (
    <div ref={topRef} className="scroll-mt-24">
      <form onSubmit={submit} noValidate className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem] lg:gap-10" data-testid="request-form">
        <div className="min-w-0 space-y-6">
          <section className="rounded-2xl border bg-card p-5 shadow-xs sm:p-8">
            <h2 className="text-lg font-semibold">{t("bookingInfo")}</h2>
            {room ? (
              <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
                <DoorOpen className="h-4 w-4" /> {t("fromRoom", { room: room.name })}
              </p>
            ) : null}
            <CategoryPicker
              config={config}
              value={category}
              onChange={(c) => {
                setCategory(c);
                setPackageId(null);
              }}
              className="mt-5"
            />
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <Field label={t("date")} htmlFor="rq-date" error={dateText(fieldErrors.date)}>
                <Input id="rq-date" type="date" value={date} min={today} max={maxDate} onChange={(e) => setDate(e.target.value)} aria-invalid={!!fieldErrors.date} required />
              </Field>
              <Field label={t("startTime")} htmlFor="rq-start" error={fe("start")} hint={endLabel ? t("endsAt", { time: endLabel }) : undefined}>
                <NativeSelect id="rq-start" value={startValue} onChange={(e) => setStart(e.target.value)}>
                  {startTimes.map((x) => (
                    <option key={x} value={x}>{x}</option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label={t("duration")} htmlFor="rq-hours">
                <NativeSelect id="rq-hours" value={hours} onChange={(e) => setHours(Number(e.target.value))}>
                  {Array.from({ length: maxHours }, (_, i) => i + 1).map((h) => (
                    <option key={h} value={h}>{t("hoursOption", { count: h })}</option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label={t("participants")} htmlFor="rq-people" error={fe("participants")}>
                <Input id="rq-people" type="number" inputMode="numeric" min={1} max={1000} value={people} onChange={(e) => setPeople(e.target.value)} aria-invalid={!!fieldErrors.participants} required />
              </Field>
            </div>
          </section>

          <section className="rounded-2xl border bg-card p-5 shadow-xs sm:p-8">
            <h2 className="text-lg font-semibold">{t("contactInfo")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t("contactHint")}</p>
            <div className="hidden" aria-hidden="true">
              <input name="website" tabIndex={-1} autoComplete="off" value={contact.website} onChange={setC("website")} />
            </div>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <Field label={t("fullName")} htmlFor="rq-name" className="sm:col-span-2" error={fe("fullName")}>
                <Input id="rq-name" autoComplete="name" value={contact.fullName} onChange={setC("fullName")} aria-invalid={!!fieldErrors.fullName} maxLength={200} required />
              </Field>
              <Field label={t("email")} htmlFor="rq-email" className="sm:col-span-2" error={fe("email")}>
                <Input id="rq-email" type="email" inputMode="email" autoComplete="email" value={contact.email} onChange={setC("email")} aria-invalid={!!fieldErrors.email} maxLength={254} required />
              </Field>
              <Field label={t("phoneOptional")} htmlFor="rq-phone" error={fe("phone")}>
                <Input id="rq-phone" type="tel" autoComplete="tel" value={contact.phone} onChange={setC("phone")} aria-invalid={!!fieldErrors.phone} maxLength={40} />
              </Field>
              <Field label={t("companyOptional")} htmlFor="rq-company">
                <Input id="rq-company" autoComplete="organization" value={contact.company} onChange={setC("company")} maxLength={200} />
              </Field>
              <Field label={t("messageOptional")} htmlFor="rq-message" className="sm:col-span-2">
                <Textarea id="rq-message" rows={4} maxLength={2000} value={contact.message} onChange={setC("message")} placeholder={t("messagePlaceholder")} />
              </Field>
            </div>
          </section>
        </div>

        <aside className="h-fit space-y-5 rounded-2xl border bg-surface p-5 lg:sticky lg:top-24 sm:p-6" data-testid="request-summary">
          <div>
            <h2 className="text-lg font-semibold">{t("summary")}</h2>
            <ul className="mt-3 space-y-2 text-sm">
              <li className="flex items-center gap-2.5">
                <CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" />
                {date
                  ? new Intl.DateTimeFormat(locale === "de" ? "de-DE" : "en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`))
                  : <span className="text-muted-foreground">{t("noDate")}</span>}
              </li>
              <li className="flex items-center gap-2.5 tabular-nums">
                <Clock className="h-4 w-4 shrink-0 text-muted-foreground" />
                {startValue ? `${startValue} – ${endLabel}` : "–"} · {t("hoursOption", { count: hours })}
              </li>
              <li className="flex items-center gap-2.5">
                <Users className="h-4 w-4 shrink-0 text-muted-foreground" />
                {validPeople ? t("peopleCount", { count: participants }) : "–"}
              </li>
            </ul>
          </div>
          <div className="border-t pt-5">
            <EstimatePanel config={config} hours={hours} participants={validPeople ? participants : 0} category={category} packageId={packageId} onPackageChange={setPackageId} locale={locale} />
          </div>
          {error ? <FormAlert>{error === "validation" ? t("fixErrors") : errText(error)}</FormAlert> : null}
          <p className="text-xs text-muted-foreground">
            {t.rich("privacyNote", {
              privacy: (c) => <a className="underline underline-offset-2" target="_blank" href={localizeHref("/privacy", locale)}>{c}</a>,
            })}
          </p>
          <Button type="submit" size="lg" className="w-full" disabled={pending} data-testid="submit-request">
            {pending ? <Loader2 className="animate-spin" /> : <Send />}
            {pending ? t("sending") : t("submit")}
          </Button>
          <p className="text-center text-xs text-muted-foreground">{t("notAReservation")}</p>
        </aside>
      </form>
    </div>
  );
}
