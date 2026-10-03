"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { SubmitButton } from "@/components/forms/submit-button";
import { FormAlert } from "@/components/forms/form-alert";
import { useServerForm } from "@/components/forms/use-server-form";
import { useErrorText, useFieldErrorText } from "@/components/forms/use-error-text";
import { adminCalendarEvents, adminCreateBooking, searchMembers, type MemberOption } from "@/lib/admin/bookings";
import type { CalendarSettings } from "@/components/calendar/base-calendar";
import { berlinDateTimeParts } from "@/lib/berlin-parts";
import { toEventInput, type ResourceOption } from "./admin-calendar";

const BaseCalendar = dynamic(() => import("@/components/calendar/base-calendar").then((m) => m.BaseCalendar), {
  ssr: false,
  loading: () => <Skeleton className="h-[560px] w-full" />,
});

export function timeList(start: string, end: string, step: number) {
  const toMin = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
  const out: string[] = [];
  for (let m = toMin(start); m <= toMin(end); m += step) out.push(`${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`);
  return out;
}

export function BookingCreateForm({
  resources,
  settings,
  initial,
}: {
  resources: ResourceOption[];
  settings: CalendarSettings;
  initial: { type?: string; resource?: string; date?: string; start?: string; end?: string };
}) {
  const t = useTranslations("admin.bookings");
  const tc = useTranslations("common");
  const tt = useTranslations("status.bookingType");
  const tbk = useTranslations("booking");
  const errorText = useErrorText();
  const fieldError = useFieldErrorText();
  const router = useRouter();
  const locale = useLocale() as "de" | "en";

  const [type, setType] = useState<"workspace" | "room">(initial.type === "room" ? "room" : "workspace");
  const [resourceId, setResourceId] = useState(initial.resource ?? "");
  const [date, setDate] = useState(initial.date ?? "");
  const [start, setStart] = useState(initial.start ?? "");
  const [end, setEnd] = useState(initial.end ?? "");
  const [customer, setCustomer] = useState<"member" | "guest">("member");
  const [memberQ, setMemberQ] = useState("");
  const [members, setMembers] = useState<MemberOption[]>([]);
  const [memberId, setMemberId] = useState("");
  const [mailLocale, setMailLocale] = useState<"de" | "en">(locale);

  useEffect(() => {
    if (customer !== "member") return;
    const id = setTimeout(async () => {
      const r = await searchMembers(memberQ).catch(() => null);
      if (r?.ok && r.data) setMembers(r.data);
    }, 200);
    return () => clearTimeout(id);
  }, [memberQ, customer]);

  const options = resources.filter((r) => r.type === type);
  const resource = resources.find((r) => r.id === resourceId);
  const times = useMemo(() => timeList(settings.dayStart, settings.dayEnd, settings.slotMinutes), [settings]);

  const fetchEvents = useCallback(
    async (from: Date, to: Date) => {
      if (!resourceId) return [];
      const r = await adminCalendarEvents(from.toISOString(), to.toISOString(), { resourceId, statuses: ["pending", "confirmed"], blocks: true });
      if (!r.ok) throw new Error(r.error);
      return (r.data ?? []).map((e) => ({ ...toEventInput(e, t("guest")), display: "background" as const }));
    },
    [resourceId, t],
  );


  const { state, pending, onSubmit } = useServerForm(async (prev: unknown, fd: FormData) => {
    const res = await adminCreateBooking(prev, fd);
    if (res.ok && res.data) {
      toast.success(t("createdToast", { reference: res.data.reference }));
      router.push(`/${locale}/admin/bookings/${res.data.id}`);
    }
    return res;
  });
  const fe = (k: string) => (state && !state.ok ? fieldError(state.fieldErrors?.[k]) : undefined);

  return (
    <form onSubmit={onSubmit} className="grid gap-6 lg:grid-cols-[1fr_380px]" noValidate>
      <Card className="min-w-0">
        <CardHeader>
          <CardTitle className="text-base">{t("chooseResource")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t("resourceType")} htmlFor="type">
              <NativeSelect
                id="type"
                name="type"
                value={type}
                onChange={(e) => {
                  setType(e.target.value as "workspace" | "room");
                  setResourceId("");
                }}
              >
                <option value="workspace">{tt("workspace")}</option>
                <option value="room">{tt("room")}</option>
              </NativeSelect>
            </Field>
            <Field label={t("resourceLabel")} htmlFor="resource_id" error={fe("resource_id")}>
              <NativeSelect id="resource_id" name="resource_id" value={resourceId} onChange={(e) => setResourceId(e.target.value)} required data-testid="admin-resource-select">
                <option value="">—</option>
                {options.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} ({r.capacity})
                  </option>
                ))}
              </NativeSelect>
            </Field>
          </div>
          {resourceId ? (
            <BaseCalendar
              key={resourceId}
              locale={locale}
              settings={settings}
              fetchEvents={fetchEvents}
              selectable
              initialDate={date || undefined}
              onSelect={(s, e) => {
                const a = berlinDateTimeParts(s);
                const b = berlinDateTimeParts(e);
                setDate(a.date);
                setStart(a.time);
                setEnd(b.time);
              }}
            />
          ) : (
            <p className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">{t("createSubtitle")}</p>
          )}
        </CardContent>
      </Card>

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("bookingSection")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {state && !state.ok ? <FormAlert>{errorText(state.error)}</FormAlert> : null}
            <Field label={tc("date")} htmlFor="date" error={fe("date")}>
              <Input id="date" type="date" name="date" value={date} onChange={(e) => setDate(e.target.value)} required />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label={tc("startTime")} htmlFor="start_time" error={fe("start_time")}>
                <NativeSelect id="start_time" name="start_time" value={start} onChange={(e) => setStart(e.target.value)} required>
                  <option value="">—</option>
                  {times.slice(0, -1).map((x) => (
                    <option key={x} value={x}>{x}</option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label={tc("endTime")} htmlFor="end_time" error={fe("end_time")}>
                <NativeSelect id="end_time" name="end_time" value={end} onChange={(e) => setEnd(e.target.value)} required>
                  <option value="">—</option>
                  {times.slice(1).map((x) => (
                    <option key={x} value={x}>{x}</option>
                  ))}
                </NativeSelect>
              </Field>
            </div>
            <Field label={t("attendees")} htmlFor="attendees" error={fe("attendees")}>
              <Input id="attendees" type="number" name="attendees" min={1} max={resource?.capacity ?? 500} defaultValue={1} required />
            </Field>
            <Field label={t("purpose")} htmlFor="purpose" error={fe("purpose")}>
              <Textarea id="purpose" name="purpose" rows={2} maxLength={1000} />
            </Field>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("customerKind")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <input type="hidden" name="customer" value={customer} />
            <div className="flex gap-4 text-sm">
              {(["member", "guest"] as const).map((k) => (
                <label key={k} className="flex items-center gap-2">
                  <input type="radio" checked={customer === k} onChange={() => setCustomer(k)} className="accent-primary" />
                  {k === "member" ? t("existingMember") : t("newGuest")}
                </label>
              ))}
            </div>
            {customer === "member" ? (
              <>
                <Input value={memberQ} onChange={(e) => setMemberQ(e.target.value)} placeholder={tc("searchPlaceholder")} aria-label={t("selectMember")} />
                <Field label={t("selectMember")} htmlFor="user_id" error={fe("user_id")}>
                  <NativeSelect
                    id="user_id"
                    name="user_id"
                    value={memberId}
                    onChange={(e) => {
                      setMemberId(e.target.value);
                      const m = members.find((x) => x.id === e.target.value);
                      if (m) setMailLocale(m.locale === "en" ? "en" : "de");
                    }}
                    size={Math.min(6, Math.max(2, members.length))}
                    data-testid="admin-member-select"
                  >
                    {members.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name} · {m.email}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
              </>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                <Field label={tbk("firstName")} htmlFor="first_name" error={fe("first_name")}>
                  <Input id="first_name" name="first_name" autoComplete="off" maxLength={100} />
                </Field>
                <Field label={tbk("lastName")} htmlFor="last_name" error={fe("last_name")}>
                  <Input id="last_name" name="last_name" autoComplete="off" maxLength={100} />
                </Field>
                <Field label={tc("email")} htmlFor="g_email" error={fe("email")}>
                  <Input id="g_email" type="email" name="email" maxLength={254} />
                </Field>
                <Field label={tc("phone")} htmlFor="g_phone" error={fe("phone")}>
                  <Input id="g_phone" type="tel" name="phone" maxLength={40} />
                </Field>
                <Field label={tc("company")} htmlFor="g_company" error={fe("company")} className="sm:col-span-2 lg:col-span-1 xl:col-span-2">
                  <Input id="g_company" name="company" maxLength={200} />
                </Field>
              </div>
            )}
            <Field label={t("locale")} htmlFor="locale">
              <NativeSelect id="locale" name="locale" value={mailLocale} onChange={(e) => setMailLocale(e.target.value as "de" | "en")}>
                <option value="de">Deutsch</option>
                <option value="en">English</option>
              </NativeSelect>
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="notify" defaultChecked className="h-4 w-4 accent-primary" />
              {t("notifyCustomer")}
            </label>
            <SubmitButton pending={pending} className="w-full" data-testid="admin-create-booking">
              {t("createButton")}
            </SubmitButton>
          </CardContent>
        </Card>
      </div>
    </form>
  );
}
