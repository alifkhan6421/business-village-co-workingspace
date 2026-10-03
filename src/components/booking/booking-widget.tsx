"use client";
import { useCallback, useMemo, useState, useTransition } from "react";
import dynamic from "next/dynamic";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { CalendarCheck, Loader2, LogIn, UserPlus, UserRound } from "lucide-react";
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
import type { CalendarSettings } from "@/components/calendar/base-calendar";
import type { Locale } from "@/i18n/routing";

const BaseCalendar = dynamic(() => import("@/components/calendar/base-calendar").then((m) => m.BaseCalendar), {
  ssr: false,
  loading: () => <Skeleton className="h-[520px] w-full" />,
});

type Props = {
  resource: { id: string; type: "workspace" | "room"; name: string; capacity: number };
  settings: CalendarSettings;
  user: { name: string; email: string } | null;
  initial?: { date?: string; start?: string; end?: string };
  returnPath: string;
};

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

/** Calendar-based booking for guests and members (public resource pages). */
export function BookingWidget({ resource, settings, user, initial, returnPath }: Props) {
  const t = useTranslations("booking");
  const tCal = useTranslations("calendar");
  const locale = useLocale() as Locale;
  const errText = useErrorText();
  const fieldErr = useFieldErrorText();

  const times = useMemo(() => timeOptions(settings.dayStart, settings.dayEnd, settings.slotMinutes), [settings]);
  const [date, setDate] = useState(initial?.date ?? "");
  const [start, setStart] = useState(initial?.start ?? "");
  const [end, setEnd] = useState(initial?.end ?? "");
  const [attendees, setAttendees] = useState(1);
  const [purpose, setPurpose] = useState("");
  const [step, setStep] = useState<"details" | "guest">("details");
  const [refreshKey, setRefreshKey] = useState(0);
  const [loadError, setLoadError] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();

  const startDate = date && start ? berlinToUtc(date, start) : null;
  const endDate = date && end ? berlinToUtc(date, end) : null;
  const selection = startDate && endDate && endDate > startDate ? { start: startDate, end: endDate } : null;

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
        backgroundColor: s.kind === "blocked" ? "#9ca3af" : "#b45309",
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
      setFieldErrors(res.fieldErrors ?? {});
      if (res.error === "booking.slot_unavailable" || res.error === "booking.resource_blocked") {
        toast.error(t("slotTaken"));
        setRefreshKey((k) => k + 1);
      }
    }
  };

  const bookAsMember = () => {
    setError(null);
    startTransition(async () => handleResult(await createMemberBooking(payload())));
  };

  const bookAsGuest = (fd: FormData) => {
    setError(null);
    startTransition(async () =>
      handleResult(
        await createGuestBooking({
          ...payload(),
          firstName: fd.get("firstName"),
          lastName: fd.get("lastName"),
          email: fd.get("email"),
          phone: fd.get("phone"),
          company: fd.get("company"),
          website: fd.get("website"),
        }),
      ),
    );
  };

  const hours = selection ? (selection.end.getTime() - selection.start.getTime()) / 3600000 : 0;
  const loginUrl = `${localizeHref("/login", locale)}?next=${encodeURIComponent(`${returnPath}?booking=1${date ? `&date=${date}&start=${start}&end=${end}` : ""}`)}`;
  const signupUrl = localizeHref("/signup", locale);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
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
          initialDate={initial?.date ?? firstBookableDay(settings.weekdays)}
        />
        <ul className="flex flex-wrap gap-4 text-xs text-muted-foreground">
          <li className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm border bg-background" /> {t("legendAvailable")}</li>
          <li className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm bg-[#b45309]" /> {t("legendBooked")}</li>
          <li className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm bg-[#9ca3af]" /> {t("legendBlocked")}</li>
          <li className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm bg-primary/30" /> {t("legendSelected")}</li>
        </ul>
      </div>

      <aside className="h-fit space-y-4 rounded-xl border bg-card p-5 shadow-sm lg:sticky lg:top-24" data-testid="booking-panel">
        <h3 className="flex items-center gap-2 font-semibold">
          <CalendarCheck className="h-5 w-5 text-primary" /> {t("panelTitle")} · {resource.name}
        </h3>
        {!selection ? <p className="text-sm text-muted-foreground">{t("pickSlot")}</p> : null}

        <div className="grid grid-cols-3 gap-2">
          <Field label={t("date")} htmlFor="bk-date" className="col-span-3">
            <Input id="bk-date" type="date" value={date} min={todayBerlin()} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label={t("start")} htmlFor="bk-start" className="col-span-3 sm:col-span-1 lg:col-span-3 xl:col-span-1">
            <NativeSelect id="bk-start" value={start} onChange={(e) => setStart(e.target.value)}>
              <option value="">–</option>
              {times.slice(0, -1).map((x) => <option key={x} value={x}>{x}</option>)}
            </NativeSelect>
          </Field>
          <Field label={t("end")} htmlFor="bk-end" className="col-span-3 sm:col-span-1 lg:col-span-3 xl:col-span-1">
            <NativeSelect id="bk-end" value={end} onChange={(e) => setEnd(e.target.value)}>
              <option value="">–</option>
              {times.slice(1).map((x) => <option key={x} value={x}>{x}</option>)}
            </NativeSelect>
          </Field>
          <Field label={t("attendees")} htmlFor="bk-att" className="col-span-3 sm:col-span-1 lg:col-span-3 xl:col-span-1" error={fieldErr(fieldErrors.attendees)}>
            <Input id="bk-att" type="number" min={1} max={resource.capacity} value={attendees} onChange={(e) => setAttendees(Math.max(1, Number(e.target.value) || 1))} />
          </Field>
        </div>
        {selection ? <p className="text-xs text-muted-foreground">{t("duration", { hours: hours.toLocaleString(locale) })} · {t("capacityHint", { count: resource.capacity })}</p> : null}
        <Field label={t("purpose")} htmlFor="bk-purpose">
          <Textarea id="bk-purpose" rows={2} maxLength={1000} value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder={t("purposePlaceholder")} />
        </Field>

        {error ? <FormAlert>{errText(error)}</FormAlert> : null}

        {user ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">{t("bookingAs", { name: user.name || user.email })}</p>
            <Button className="w-full" disabled={!selection || pending} onClick={bookAsMember} data-testid="confirm-member-booking">
              {pending ? <Loader2 className="animate-spin" /> : null}
              {pending ? t("booking") : t("confirmBooking")}
            </Button>
          </div>
        ) : step === "details" ? (
          <div className="space-y-3 border-t pt-4">
            <p className="text-sm font-medium">{t("howToBook")}</p>
            <Button className="w-full" disabled={!selection} onClick={() => setStep("guest")} data-testid="continue-as-guest">
              <UserRound /> {t("continueAsGuest")}
            </Button>
            <p className="text-xs text-muted-foreground">{t("guestHint")}</p>
            <div className="grid grid-cols-2 gap-2">
              <Button asChild variant="outline">
                <a href={loginUrl}><LogIn /> {t("loginToBook")}</a>
              </Button>
              <Button asChild variant="outline">
                <a href={signupUrl}><UserPlus /> {t("signupToBook")}</a>
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">{t("accountHint")}</p>
          </div>
        ) : (
          <form
            className="space-y-3 border-t pt-4"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              bookAsGuest(new FormData(e.currentTarget));
            }}
            data-testid="guest-form"
          >
            <p className="text-sm font-medium">{t("guestDetails")}</p>
            <div className="hidden" aria-hidden="true">
              <input name="website" tabIndex={-1} autoComplete="off" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Field label={t("firstName")} htmlFor="g-first" error={fieldErr(fieldErrors.firstName)}>
                <Input id="g-first" name="firstName" autoComplete="given-name" aria-invalid={!!fieldErrors.firstName} />
              </Field>
              <Field label={t("lastName")} htmlFor="g-last" error={fieldErr(fieldErrors.lastName)}>
                <Input id="g-last" name="lastName" autoComplete="family-name" aria-invalid={!!fieldErrors.lastName} />
              </Field>
            </div>
            <Field label={t("email")} htmlFor="g-email" error={fieldErr(fieldErrors.email)}>
              <Input id="g-email" name="email" type="email" autoComplete="email" aria-invalid={!!fieldErrors.email} />
            </Field>
            <Field label={t("phone")} htmlFor="g-phone" error={fieldErr(fieldErrors.phone)}>
              <Input id="g-phone" name="phone" type="tel" autoComplete="tel" />
            </Field>
            <Field label={t("company")} htmlFor="g-company">
              <Input id="g-company" name="company" autoComplete="organization" />
            </Field>
            <p className="text-xs text-muted-foreground">
              {t.rich("privacyNote", {
                terms: (c) => <a className="underline" target="_blank" href={localizeHref("/terms", locale)}>{c}</a>,
                privacy: (c) => <a className="underline" target="_blank" href={localizeHref("/privacy", locale)}>{c}</a>,
              })}
            </p>
            <div className="flex gap-2">
              <Button type="button" variant="ghost" onClick={() => setStep("details")}>{t("back")}</Button>
              <Button type="submit" className="flex-1" disabled={!selection || pending} data-testid="confirm-guest-booking">
                {pending ? <Loader2 className="animate-spin" /> : null}
                {pending ? t("booking") : t("confirmBooking")}
              </Button>
            </div>
          </form>
        )}
      </aside>
    </div>
  );
}
