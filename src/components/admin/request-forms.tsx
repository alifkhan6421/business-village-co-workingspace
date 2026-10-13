"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { SubmitButton } from "@/components/forms/submit-button";
import { FormAlert } from "@/components/forms/form-alert";
import { useServerForm } from "@/components/forms/use-server-form";
import { useErrorText, useFieldErrorText } from "@/components/forms/use-error-text";
import { EstimateSummary } from "@/components/pricing/estimate-summary";
import { SimpleTextForm } from "./booking-detail-forms";
import { timeList } from "./booking-create-form";
import {
  addBookingRequestNote,
  adjustBookingRequestPrice,
  sendBookingRequestMessage,
  setBookingRequestStatus,
  updateBookingRequestDetails,
  type RequestStatus,
} from "@/lib/admin/booking-requests";
import { applicableEstimates, optionName, type PricingConfig } from "@/lib/pricing/calc";
import type { CalendarSettings } from "@/components/calendar/base-calendar";
import type { Locale } from "@/i18n/routing";

export type RoomAvailability = { id: string; name: string; capacity: number; status: string; conflict: "free" | "booked" | "blocked"; conflictReference: string | null };

/** Mirrors the transitions allowed by admin_set_booking_request_status. */
export const TRANSITIONS: Record<RequestStatus, RequestStatus[]> = {
  pending: ["under_review", "confirmed", "alternative_proposed", "rejected", "cancelled"],
  under_review: ["confirmed", "alternative_proposed", "rejected", "cancelled", "pending"],
  alternative_proposed: ["confirmed", "alternative_proposed", "under_review", "rejected", "cancelled"],
  confirmed: ["completed", "cancelled"],
  rejected: ["under_review"],
  cancelled: [],
  completed: [],
};

const NOTIFY_DEFAULT: Partial<Record<RequestStatus, boolean>> = { confirmed: true, rejected: true, cancelled: true, alternative_proposed: true };

export function RequestDetailsForm({
  request,
  rooms,
  config,
  settings,
  editable,
}: {
  request: { id: string; date: string; start: string; hours: number; participants: number; roomId: string | null; option: string | null };
  rooms: RoomAvailability[];
  config: PricingConfig;
  settings: CalendarSettings & { maxHours: number };
  editable: boolean;
}) {
  const t = useTranslations("admin.requests");
  const tc = useTranslations("common");
  const tp = useTranslations("pricing");
  const locale = useLocale() as Locale;
  const errorText = useErrorText();
  const fieldError = useFieldErrorText();
  const router = useRouter();
  const [hours, setHours] = useState(String(request.hours));
  const [participants, setParticipants] = useState(String(request.participants));
  const [option, setOption] = useState(request.option ?? "");
  const [roomId, setRoomId] = useState(request.roomId ?? "");
  const times = useMemo(() => {
    const list = timeList(settings.dayStart, settings.dayEnd, settings.slotMinutes);
    if (!list.includes(request.start)) list.push(request.start);
    return list.sort();
  }, [settings, request.start]);
  const h = Number(hours);
  const p = Number(participants);
  const options = useMemo(() => (h >= 1 && p >= 1 ? applicableEstimates(config, { hours: h, participants: p }) : []), [config, h, p]);
  const estimate = options.find((o) => o.option.key === option) ?? options[0] ?? null;
  const room = rooms.find((r) => r.id === roomId);

  const { state, pending, onSubmit } = useServerForm(async (prev: unknown, fd: FormData) => {
    const res = await updateBookingRequestDetails(prev, fd);
    if (res.ok) {
      toast.success(t("saved"));
      router.refresh();
    }
    return res;
  });
  const fe = (k: string) => (state && !state.ok ? fieldError(state.fieldErrors?.[k]) : undefined);

  return (
    <form onSubmit={onSubmit} className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]" noValidate data-testid="request-details-form">
      <input type="hidden" name="id" value={request.id} />
      <input type="hidden" name="option" value={estimate?.option.key ?? ""} />
      <fieldset disabled={!editable} className="grid gap-3 sm:grid-cols-2">
        {state && !state.ok ? <FormAlert className="sm:col-span-2">{errorText(state.error)}</FormAlert> : null}
        <Field label={tc("date")} htmlFor="rd-date" error={fe("date")}>
          <Input id="rd-date" type="date" name="date" defaultValue={request.date} />
        </Field>
        <Field label={tc("startTime")} htmlFor="rd-start" error={fe("start_time")}>
          <NativeSelect id="rd-start" name="start_time" defaultValue={request.start}>
            {times.map((x) => <option key={x} value={x}>{x}</option>)}
          </NativeSelect>
        </Field>
        <Field label={t("duration")} htmlFor="rd-hours" error={fe("hours")}>
          <NativeSelect id="rd-hours" name="hours" value={hours} onChange={(e) => setHours(e.target.value)}>
            {Array.from({ length: Math.max(settings.maxHours, request.hours) }, (_, i) => i + 1).map((x) => (
              <option key={x} value={x}>{t("hoursCount", { count: x })}</option>
            ))}
          </NativeSelect>
        </Field>
        <Field label={t("participants")} htmlFor="rd-participants" error={fe("participants")}>
          <Input id="rd-participants" type="number" name="participants" min={1} max={1000} value={participants} onChange={(e) => setParticipants(e.target.value)} />
        </Field>
        <Field
          label={t("assignRoom")}
          htmlFor="rd-room"
          error={fe("assigned_room_id")}
          className="sm:col-span-2"
          hint={room && p > room.capacity ? t("overCapacity", { capacity: room.capacity }) : room && room.conflict !== "free" ? t("roomTaken") : t("assignRoomHint")}
        >
          <NativeSelect id="rd-room" name="assigned_room_id" value={roomId} onChange={(e) => setRoomId(e.target.value)} data-testid="assign-room">
            <option value="">{t("noRoom")}</option>
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} · {t("upTo", { count: r.capacity })} · {t(`availability.${r.conflict}`)}
              </option>
            ))}
          </NativeSelect>
        </Field>
        {options.length > 1 ? (
          <Field label={tp("category")} htmlFor="rd-option" className="sm:col-span-2">
            <NativeSelect id="rd-option" value={estimate?.option.key ?? ""} onChange={(e) => setOption(e.target.value)}>
              {options.map((o) => <option key={o.option.key} value={o.option.key}>{optionName(o.option, locale)}</option>)}
            </NativeSelect>
          </Field>
        ) : null}
        {editable ? (
          <div className="flex flex-col items-start gap-2 sm:col-span-2">
            <p className="text-xs text-muted-foreground">{t("recalcHint")}</p>
            <SubmitButton pending={pending} data-testid="save-request-details">{t("saveAndRecalc")}</SubmitButton>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground sm:col-span-2">{t("closedHint")}</p>
        )}
      </fieldset>
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("newCalculation")}</p>
        <EstimateSummary estimate={estimate} settings={config.settings} />
      </div>
    </form>
  );
}

export function PriceAdjustDialog({ requestId, current, pricesIncludeVat }: { requestId: string; current: string; pricesIncludeVat: boolean }) {
  const t = useTranslations("admin.requests");
  const tc = useTranslations("common");
  const errorText = useErrorText();
  const fieldError = useFieldErrorText();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const { state, pending, onSubmit } = useServerForm(async (prev: unknown, fd: FormData) => {
    const res = await adjustBookingRequestPrice(prev, fd);
    if (res.ok) {
      toast.success(t("priceAdjusted"));
      setOpen(false);
      router.refresh();
    }
    return res;
  });
  const fe = (k: string) => (state && !state.ok ? fieldError(state.fieldErrors?.[k]) : undefined);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" data-testid="adjust-price">{t("adjustPrice")}</Button>
      </DialogTrigger>
      <DialogContent closeLabel={tc("close")}>
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <DialogHeader>
            <DialogTitle>{t("adjustPrice")}</DialogTitle>
            <DialogDescription>{t("adjustPriceHint")}</DialogDescription>
          </DialogHeader>
          <input type="hidden" name="id" value={requestId} />
          {state && !state.ok && state.error !== "validation" ? <FormAlert>{errorText(state.error)}</FormAlert> : null}
          <Field label={pricesIncludeVat ? t("amountGross") : t("amountNet")} htmlFor="pa-amount" error={fe("amount")}>
            <Input id="pa-amount" name="amount" inputMode="decimal" defaultValue={current} />
          </Field>
          <Field label={t("adjustReason")} htmlFor="pa-reason" error={fe("reason")}>
            <Textarea id="pa-reason" name="reason" rows={3} maxLength={1000} required />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>{tc("back")}</Button>
            <SubmitButton pending={pending}>{tc("save")}</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function StatusDialog({
  requestId,
  to,
  roomName,
  alt,
  settings,
}: {
  requestId: string;
  to: RequestStatus;
  roomName: string | null;
  alt: { date: string; start: string; hours: number };
  settings: CalendarSettings & { maxHours: number };
}) {
  const t = useTranslations("admin.requests");
  const tc = useTranslations("common");
  const errorText = useErrorText();
  const fieldError = useFieldErrorText();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const times = useMemo(() => timeList(settings.dayStart, settings.dayEnd, settings.slotMinutes), [settings]);
  const { state, pending, onSubmit } = useServerForm(async (prev: unknown, fd: FormData) => {
    const res = await setBookingRequestStatus(prev, fd);
    if (res.ok) {
      toast.success(t("statusSaved"));
      setOpen(false);
      router.refresh();
    }
    return res;
  });
  const fe = (k: string) => (state && !state.ok ? fieldError(state.fieldErrors?.[k]) : undefined);
  const emails = to in NOTIFY_DEFAULT;
  const danger = to === "rejected" || to === "cancelled";
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={to === "confirmed" ? "default" : danger ? "outline" : "secondary"} className={danger ? "text-destructive hover:text-destructive" : undefined} data-testid={`request-action-${to}`}>
          {t(`actions.${to}`)}
        </Button>
      </DialogTrigger>
      <DialogContent closeLabel={tc("close")}>
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <DialogHeader>
            <DialogTitle>{t(`actions.${to}`)}</DialogTitle>
            <DialogDescription>{to === "confirmed" ? t("confirmHint", { room: roomName ?? "—" }) : t(`actionHints.${to}`)}</DialogDescription>
          </DialogHeader>
          <input type="hidden" name="id" value={requestId} />
          <input type="hidden" name="status" value={to} />
          {state && !state.ok && state.error !== "validation" ? <FormAlert>{errorText(state.error)}</FormAlert> : null}
          {to === "alternative_proposed" ? (
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label={tc("date")} htmlFor="alt-date" error={fe("alt_date")}>
                <Input id="alt-date" type="date" name="alt_date" defaultValue={alt.date} />
              </Field>
              <Field label={tc("startTime")} htmlFor="alt-start" error={fe("alt_start")}>
                <NativeSelect id="alt-start" name="alt_start" defaultValue={alt.start}>
                  {times.map((x) => <option key={x} value={x}>{x}</option>)}
                </NativeSelect>
              </Field>
              <Field label={t("duration")} htmlFor="alt-hours" error={fe("alt_hours")}>
                <NativeSelect id="alt-hours" name="alt_hours" defaultValue={alt.hours}>
                  {Array.from({ length: Math.max(settings.maxHours, alt.hours) }, (_, i) => i + 1).map((x) => (
                    <option key={x} value={x}>{t("hoursCount", { count: x })}</option>
                  ))}
                </NativeSelect>
              </Field>
            </div>
          ) : null}
          <Field label={t("internalNote")} htmlFor="st-note" hint={t("internalNoteHint")}>
            <Textarea id="st-note" name="note" rows={2} maxLength={4000} />
          </Field>
          {emails ? (
            <>
              <Field label={t("customerMessage")} htmlFor="st-message" hint={t("customerMessageHint")}>
                <Textarea id="st-message" name="message" rows={3} maxLength={5000} />
              </Field>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="notify" defaultChecked className="h-4 w-4 accent-primary" />
                {t("notifyCustomer")}
              </label>
            </>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>{tc("back")}</Button>
            <SubmitButton pending={pending} variant={danger ? "destructive" : "default"} data-testid="confirm-status">{t(`actions.${to}`)}</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function RequestStatusActions({
  requestId,
  status,
  roomName,
  alt,
  settings,
}: {
  requestId: string;
  status: RequestStatus;
  roomName: string | null;
  alt: { date: string; start: string; hours: number };
  settings: CalendarSettings & { maxHours: number };
}) {
  const t = useTranslations("admin.requests");
  const next = TRANSITIONS[status] ?? [];
  if (!next.length) return <p className="text-sm text-muted-foreground">{t("noActions")}</p>;
  return (
    <div className="flex flex-wrap gap-2" data-testid="request-actions">
      {next.map((s) => (
        <StatusDialog key={s} requestId={requestId} to={s} roomName={roomName} alt={alt} settings={settings} />
      ))}
    </div>
  );
}

export function RequestNoteForm({ requestId }: { requestId: string }) {
  const t = useTranslations("admin.requests");
  return <SimpleTextForm action={addBookingRequestNote} hidden={{ id: requestId }} field="note" placeholder={t("notePlaceholder")} button={t("addNote")} success={t("noteAdded")} rows={2} testId="request-note-form" />;
}

export function RequestMessageForm({ requestId }: { requestId: string }) {
  const t = useTranslations("admin.requests");
  return <SimpleTextForm action={sendBookingRequestMessage} hidden={{ id: requestId }} field="message" placeholder={t("messagePlaceholder")} button={t("sendMessage")} success={t("messageSent")} rows={4} testId="request-message-form" />;
}
