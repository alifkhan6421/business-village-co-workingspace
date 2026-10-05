"use client";
import { useCallback, useMemo, useRef, useState, useTransition } from "react";
import dynamic from "next/dynamic";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, CalendarDays, Clock, Loader2, LogIn, Pencil, Users } from "lucide-react";
import type { EventInput } from "@fullcalendar/core";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { FormAlert } from "@/components/forms/form-alert";
import { useErrorText, useFieldErrorText } from "@/components/forms/use-error-text";
import { createClient } from "@/lib/supabase/client";
import { createGuestBooking, createMemberBooking } from "@/lib/booking/actions";
import { berlinDate, berlinTime, berlinToUtc, todayBerlin } from "@/lib/time";
import { localizeHref } from "@/lib/href";
import { estimatePrice, formatPrice } from "@/lib/price";
import type { CalendarSettings } from "@/components/calendar/base-calendar";
import type { Locale } from "@/i18n/routing";
import { BookingSteps } from "./booking-steps";

const BaseCalendar = dynamic(() => import("@/components/calendar/base-calendar").then((m) => m.BaseCalendar), {
  ssr: false,
  loading: () => <Skeleton className="h-[520px] w-full rounded-2xl" />,
});

type Props = {
  resource: { id: string; type: "workspace" | "room"; name: string; capacity: number; priceHourly?: number | null; priceDaily?: number | null };
  settings: CalendarSettings;
  user: { name: string; email: string } | null;
  initial?: { date?: string; start?: string; end?: string };
  returnPath: string;
};

type Step = "time" | "details" | "review";
type Guest = { firstName: string; lastName: string; email: string; phone: string; company: string; website: string };

const BUSY = "#c2410c";
const BLOCKED = "#94a3b8";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function timeOptions(start: string, end: string, step: number) {
  const toMin = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
  const out: string[] = [];
  for (let m = toMin(start); m <= toMin(end); m += step) out.push(`${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`);
  return out;
}

function firstBookableDay(weekdays: number[]) {
  const d = new Date();
  for (let i = 0; i < 8; i++) {
    const iso = ((d.getDay() + 6) % 7) + 1;
    if (weekdays.includes(iso)) break;
    d.setDate(d.getDate() + 1);
  }
  return berlinDate(d);
}

/**
 * Booking flow on public resource pages, for guests and members:
 * Space → Date & time → Details → Confirm. Guests never need an account.
 */
export function BookingWidget({ resource, settings, user, initial, returnPath }: Props) {
  const t = useTranslations("booking");
  const tCal = useTranslations("calendar");
  const tv = useTranslations("validation");
  const locale = useLocale() as Locale;
  const errText = useErrorText();
  const fieldErr = useFieldErrorText();
  const topRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLElement>(null);

  const times = useMemo(() => timeOptions(settings.dayStart, settings.dayEnd, settings.slotMinutes), [settings]);
  const [date, setDate] = useState(initial?.date ?? "");
  const [start, setStart] = useState(initial?.start ?? "");
  const [end, setEnd] = useState(initial?.end ?? "");
  const [attendees, setAttendees] = useState(1);
  const [purpose, setPurpose] = useState("");
  const [guest, setGuest] = useState<Guest>({ firstName: "", lastName: "", email: "", phone: "", company: "", website: "" });
  const [step, setStep] = useState<Step>("time");
  const [refreshKey, setRefreshKey] = useState(0);
  const [loadError, setLoadError] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();

  const startDate = date && start ? berlinToUtc(date, start) : null;
  const endDate = date && end ? berlinToUtc(date, end) : null;
  const selection = startDate && endDate && endDate > startDate ? { start: startDate, end: endDate } : null;
  const hours = selection ? (selection.end.getTime() - selection.start.getTime()) / 3600000 : 0;

  const price = selection ? estimatePrice(hours, resource.priceHourly ?? null, resource.priceDaily ?? null) : null;

  const fetchEvents = useCallback(
    async (from: Date, to: Date): Promise<EventInput[]> => {
      const supabase = createClient();
      const { data, error } = await supabase.rpc("get_busy_slots", {
        p_type: resource.type,
        p_resource_id: resource.id,
        p_from: from.toISOString(),
        p_to: to.toISOString(),
      });
      if (error) throw error;
      setLoadError(false);
      return (data ?? []).map((s, i) => ({
        id: `busy-${i}`,
        start: s.start_at,
        end: s.end_at,
        title: s.kind === "blocked" ? tCal("blocked") : tCal("booked"),
        display: "block",
        backgroundColor: s.kind === "blocked" ? BLOCKED : BUSY,
        borderColor: "transparent",
        textColor: "#fff",
        classNames: [`bv-${s.kind}`],
      }));
    },
    [resource.id, resource.type, tCal],
  );
  const onLoadError = useCallback(() => setLoadError(true), []);

  const onSelect = (s: Date, e: Date) => {
    setDate(berlinDate(s));
    setStart(berlinTime(s));
    const endTime = berlinTime(e);
    setEnd(endTime === "00:00" ? "24:00" : endTime);
    setError(null);
    // On phones the time panel sits above the calendar: bring it back so "Continue" is in view.
    if (window.matchMedia("(max-width: 1023px)").matches) panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const go = (next: Step) => {
    setStep(next);
    setError(null);
    requestAnimationFrame(() => topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  const validateGuest = () => {
    const errs: Record<string, string> = {};
    if (!guest.firstName.trim()) errs.firstName = "required";
    if (!guest.lastName.trim()) errs.lastName = "required";
    if (!EMAIL_RE.test(guest.email.trim())) errs.email = guest.email.trim() ? "invalidEmail" : "required";
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const payload = () => ({
    type: resource.type,
    resourceId: resource.id,
    start: selection?.start.toISOString() ?? "",
    end: selection?.end.toISOString() ?? "",
    attendees,
    purpose,
    locale,
  });

  const handleResult = (res: Awaited<ReturnType<typeof createGuestBooking>>) => {
    if (res.ok && res.data) {
      toast.success(t("success", { reference: res.data.reference }));
      if (res.data.manageToken) {
        window.location.assign(localizeHref(`/booking/manage/${res.data.manageToken}`, locale) + "?new=1");
      } else {
        window.location.assign(localizeHref("/account/bookings", locale) + `?new=${encodeURIComponent(res.data.reference)}`);
      }
      return;
    }
    if (!res.ok) {
      setError(res.error);
      const fe = res.fieldErrors ?? {};
      setFieldErrors(fe);
      if (res.error === "booking.slot_unavailable" || res.error === "booking.resource_blocked") {
        toast.error(t("slotTaken"));
        setRefreshKey((k) => k + 1);
        go("time");
        setError(res.error);
      } else if (["firstName", "lastName", "email", "phone", "company"].some((k) => fe[k])) {
        go("details");
      }
    }
  };

  const confirm = () => {
    setError(null);
    startTransition(async () => {
      if (user) return handleResult(await createMemberBooking(payload()));
      handleResult(await createGuestBooking({ ...payload(), ...guest }));
    });
  };

  const loginUrl = `${localizeHref("/login", locale)}?next=${encodeURIComponent(`${returnPath}?booking=1${date ? `&date=${date}&start=${start}&end=${end}` : ""}#booking`)}`;
  const setG = (k: keyof Guest) => (e: React.ChangeEvent<HTMLInputElement>) => setGuest((g) => ({ ...g, [k]: e.target.value }));
  const stepIndex = step === "time" ? 1 : step === "details" ? 2 : 3;
  const dateLabel = selection ? new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Berlin" }).format(selection.start) : "";

  const summary = (
    <div className="space-y-4" data-testid="booking-summary">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("summary")}</p>
        <p className="mt-1 font-semibold">{resource.name}</p>
      </div>
      <ul className="space-y-2.5 text-sm">
        <li className="flex items-start gap-2.5">
          <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <span>{selection ? dateLabel : <span className="text-muted-foreground">{t("noSelection")}</span>}</span>
        </li>
        {selection ? (
          <li className="flex items-start gap-2.5">
            <Clock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="tabular-nums">
              {t("timeRange", { start, end })} <span className="text-muted-foreground">· {t("hoursShort", { hours: hours.toLocaleString(locale) })}</span>
            </span>
          </li>
        ) : null}
        <li className="flex items-start gap-2.5">
          <Users className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <span>{attendees} · <span className="text-muted-foreground">{t("capacityHint", { count: resource.capacity })}</span></span>
        </li>
      </ul>
      {price !== null ? (
        <div className="flex items-baseline justify-between border-t pt-4">
          <span className="text-sm text-muted-foreground">{t("estimatedPrice")}</span>
          <span className="text-lg font-bold tabular-nums" data-testid="booking-price">{formatPrice(price, locale)}</span>
        </div>
      ) : null}
    </div>
  );

  return (
    <div ref={topRef} className="scroll-mt-24 space-y-6">
      <BookingSteps
        current={stepIndex}
        labels={[t("stepSpace"), t("stepTime"), t("stepDetails"), t("stepConfirm")]}
        ariaLabel={t("progress")}
      />

      {step === "time" ? (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="min-w-0 space-y-3">
            {loadError ? <FormAlert>{t("loadError")}</FormAlert> : null}
            <BaseCalendar
              locale={locale}
              settings={settings}
              fetchEvents={fetchEvents}
              onError={onLoadError}
              selectable
              onSelect={onSelect}
              selection={selection}
              refreshKey={refreshKey}
              initialDate={date || initial?.date || firstBookableDay(settings.weekdays)}
            />
            <ul className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground">
              <li className="flex items-center gap-1.5"><span className="h-3 w-3 rounded border bg-background" /> {t("legendAvailable")}</li>
              <li className="flex items-center gap-1.5"><span className="h-3 w-3 rounded" style={{ background: BUSY }} /> {t("legendBooked")}</li>
              <li className="flex items-center gap-1.5"><span className="h-3 w-3 rounded" style={{ background: BLOCKED }} /> {t("legendBlocked")}</li>
              <li className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-primary/30" /> {t("legendSelected")}</li>
            </ul>
          </div>

          <aside ref={panelRef} className="order-first scroll-mt-24 h-fit space-y-5 rounded-2xl border bg-card p-5 shadow-md lg:order-none lg:sticky lg:top-24" data-testid="booking-panel">
            <div>
              <h3 className="font-semibold">{t("selectTimeTitle")}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{t("selectTimeHint")}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t("date")} htmlFor="bk-date" className="col-span-2">
                <Input id="bk-date" type="date" value={date} min={todayBerlin()} onChange={(e) => setDate(e.target.value)} />
              </Field>
              <Field label={t("start")} htmlFor="bk-start">
                <NativeSelect id="bk-start" value={start} onChange={(e) => setStart(e.target.value)}>
                  <option value="">–</option>
                  {times.slice(0, -1).map((x) => <option key={x} value={x}>{x}</option>)}
                </NativeSelect>
              </Field>
              <Field label={t("end")} htmlFor="bk-end">
                <NativeSelect id="bk-end" value={end} onChange={(e) => setEnd(e.target.value)}>
                  <option value="">–</option>
                  {times.slice(1).map((x) => <option key={x} value={x}>{x}</option>)}
                </NativeSelect>
              </Field>
              <Field label={t("attendees")} htmlFor="bk-att" className="col-span-2" error={fieldErr(fieldErrors.attendees)}>
                <Input id="bk-att" type="number" min={1} max={resource.capacity} value={attendees} onChange={(e) => setAttendees(Math.max(1, Number(e.target.value) || 1))} />
              </Field>
            </div>
            {selection ? (
              <div className="flex items-center justify-between rounded-xl bg-secondary px-3.5 py-2.5 text-sm text-secondary-foreground">
                <span className="font-medium tabular-nums">{t("hoursShort", { hours: hours.toLocaleString(locale) })}</span>
                {price !== null ? <span className="font-bold tabular-nums">{formatPrice(price, locale)}</span> : null}
              </div>
            ) : null}
            {error ? <FormAlert>{errText(error)}</FormAlert> : null}
            <Button
              size="lg"
              className="w-full"
              disabled={!selection}
              onClick={() => go(user ? "review" : "details")}
              data-testid={user ? "continue-to-review" : "continue-to-details"}
            >
              {t("continue")} <ArrowRight />
            </Button>
            {!user ? (
              <p className="text-center text-xs text-muted-foreground">
                {t("haveAccount")}{" "}
                <a href={loginUrl} className="font-semibold text-primary hover:underline">{t("loginInstead")}</a>
              </p>
            ) : null}
          </aside>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="min-w-0 rounded-2xl border bg-card p-5 shadow-xs sm:p-8">
            {step === "details" ? (
              <form
                className="space-y-5"
                noValidate
                onSubmit={(e) => {
                  e.preventDefault();
                  if (validateGuest()) go("review");
                }}
                data-testid="guest-form"
              >
                <div>
                  <h3 className="text-lg font-semibold">{t("detailsTitle")}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{t("detailsHint")}</p>
                </div>
                <div className="hidden" aria-hidden="true">
                  <input name="website" tabIndex={-1} autoComplete="off" value={guest.website} onChange={setG("website")} />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label={t("firstName")} htmlFor="g-first" error={fieldErr(fieldErrors.firstName)}>
                    <Input id="g-first" autoComplete="given-name" value={guest.firstName} onChange={setG("firstName")} aria-invalid={!!fieldErrors.firstName} />
                  </Field>
                  <Field label={t("lastName")} htmlFor="g-last" error={fieldErr(fieldErrors.lastName)}>
                    <Input id="g-last" autoComplete="family-name" value={guest.lastName} onChange={setG("lastName")} aria-invalid={!!fieldErrors.lastName} />
                  </Field>
                  <Field label={t("email")} htmlFor="g-email" className="sm:col-span-2" error={fieldErr(fieldErrors.email)}>
                    <Input id="g-email" type="email" inputMode="email" autoComplete="email" value={guest.email} onChange={setG("email")} aria-invalid={!!fieldErrors.email} />
                  </Field>
                  <Field label={t("phone")} htmlFor="g-phone" error={fieldErr(fieldErrors.phone)}>
                    <Input id="g-phone" type="tel" autoComplete="tel" value={guest.phone} onChange={setG("phone")} />
                  </Field>
                  <Field label={t("company")} htmlFor="g-company">
                    <Input id="g-company" autoComplete="organization" value={guest.company} onChange={setG("company")} />
                  </Field>
                  <Field label={t("purpose")} htmlFor="bk-purpose" className="sm:col-span-2">
                    <Textarea id="bk-purpose" rows={3} maxLength={1000} value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder={t("purposePlaceholder")} />
                  </Field>
                </div>
                {Object.keys(fieldErrors).length ? <p className="sr-only" role="alert">{tv("required")}</p> : null}
                <div className="flex flex-col-reverse gap-2 border-t pt-5 sm:flex-row sm:justify-between">
                  <Button type="button" variant="ghost" onClick={() => go("time")}>
                    <ArrowLeft /> {t("back")}
                  </Button>
                  <Button type="submit" size="lg" data-testid="continue-to-review">
                    {t("continue")} <ArrowRight />
                  </Button>
                </div>
              </form>
            ) : (
              <div className="space-y-6" data-testid="booking-review">
                <div>
                  <h3 className="text-lg font-semibold">{t("reviewTitle")}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{t("reviewHint")}</p>
                </div>
                <dl className="divide-y rounded-xl border">
                  <ReviewRow label={t("resource")} value={resource.name} />
                  <ReviewRow label={t("date")} value={dateLabel} onEdit={() => go("time")} editLabel={t("change")} />
                  <ReviewRow label={t("time")} value={`${t("timeRange", { start, end })} · ${t("hoursShort", { hours: hours.toLocaleString(locale) })}`} onEdit={() => go("time")} editLabel={t("change")} />
                  <ReviewRow label={t("attendees")} value={String(attendees)} />
                  <ReviewRow
                    label={t("customer")}
                    value={
                      user ? (
                        <>
                          {user.name || user.email}
                          <span className="block text-muted-foreground">{user.email}</span>
                        </>
                      ) : (
                        <>
                          {guest.firstName} {guest.lastName}
                          <span className="block text-muted-foreground">{guest.email}</span>
                        </>
                      )
                    }
                    onEdit={user ? undefined : () => go("details")}
                    editLabel={t("change")}
                  />
                  {user ? (
                    <div className="px-4 py-3">
                      <Field label={t("purpose")} htmlFor="bk-purpose">
                        <Textarea id="bk-purpose" rows={2} maxLength={1000} value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder={t("purposePlaceholder")} />
                      </Field>
                    </div>
                  ) : purpose ? (
                    <ReviewRow label={t("purpose")} value={purpose} />
                  ) : null}
                </dl>
                {error ? <FormAlert>{errText(error)}</FormAlert> : null}
                <p className="text-xs text-muted-foreground">
                  {t.rich("privacyNote", {
                    terms: (c) => <a className="underline underline-offset-2" target="_blank" href={localizeHref("/terms", locale)}>{c}</a>,
                    privacy: (c) => <a className="underline underline-offset-2" target="_blank" href={localizeHref("/privacy", locale)}>{c}</a>,
                  })}
                </p>
                <div className="flex flex-col-reverse gap-2 border-t pt-5 sm:flex-row sm:justify-between">
                  <Button type="button" variant="ghost" onClick={() => go(user ? "time" : "details")} disabled={pending}>
                    <ArrowLeft /> {t("back")}
                  </Button>
                  <Button size="lg" onClick={confirm} disabled={!selection || pending} data-testid="confirm-booking">
                    {pending ? <Loader2 className="animate-spin" /> : null}
                    {pending ? t("booking") : t("confirmBooking")}
                  </Button>
                </div>
              </div>
            )}
          </div>
          <aside className="h-fit rounded-2xl border bg-surface p-5 lg:sticky lg:top-24">
            {summary}
            {user && step === "review" ? <p className="mt-4 border-t pt-4 text-xs text-muted-foreground">{t("memberDetails")}</p> : null}
            {!user && step === "details" ? (
              <p className="mt-4 border-t pt-4 text-xs text-muted-foreground">
                <LogIn className="mr-1 inline h-3.5 w-3.5" />
                {t("haveAccount")}{" "}
                <a href={loginUrl} className="font-semibold text-primary hover:underline">{t("loginInstead")}</a>
              </p>
            ) : null}
          </aside>
        </div>
      )}
    </div>
  );
}

function ReviewRow({ label, value, onEdit, editLabel }: { label: string; value: React.ReactNode; onEdit?: () => void; editLabel?: string }) {
  return (
    <div className="flex items-start justify-between gap-4 px-4 py-3 text-sm">
      <div className="min-w-0">
        <dt className="text-muted-foreground">{label}</dt>
        <dd className="mt-0.5 break-words font-medium">{value}</dd>
      </div>
      {onEdit ? (
        <button type="button" onClick={onEdit} className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-primary hover:bg-secondary">
          <Pencil className="h-3 w-3" /> {editLabel}
        </button>
      ) : null}
    </div>
  );
}
