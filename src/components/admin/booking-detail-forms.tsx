"use client";
import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { SubmitButton } from "@/components/forms/submit-button";
import { FormAlert } from "@/components/forms/form-alert";
import { useServerForm } from "@/components/forms/use-server-form";
import { useErrorText, useFieldErrorText } from "@/components/forms/use-error-text";
import { addBookingNote, adminCancelBooking, adminUpdateBooking, sendBookingMessage } from "@/lib/admin/bookings";
import type { CalendarSettings } from "@/components/calendar/base-calendar";
import type { ResourceOption } from "./admin-calendar";
import { timeList } from "./booking-create-form";

export function BookingEditForm({
  booking,
  resources,
  settings,
}: {
  booking: { id: string; type: "workspace" | "room"; resourceId: string; date: string; start: string; end: string; attendees: number; purpose: string; status: string };
  resources: ResourceOption[];
  settings: CalendarSettings;
}) {
  const t = useTranslations("admin.bookings");
  const tc = useTranslations("common");
  const ts = useTranslations("status");
  const errorText = useErrorText();
  const fieldError = useFieldErrorText();
  const router = useRouter();
  const [type, setType] = useState(booking.type);
  const times = useMemo(() => {
    const list = timeList(settings.dayStart, settings.dayEnd, settings.slotMinutes);
    for (const x of [booking.start, booking.end]) if (!list.includes(x)) list.push(x);
    return list.sort();
  }, [settings, booking.start, booking.end]);
  const { state, pending, onSubmit } = useServerForm(async (prev: unknown, fd: FormData) => {
    const res = await adminUpdateBooking(prev, fd);
    if (res.ok) {
      toast.success(t("saved"));
      router.refresh();
    }
    return res;
  });
  const fe = (k: string) => (state && !state.ok ? fieldError(state.fieldErrors?.[k]) : undefined);
  return (
    <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-2" noValidate data-testid="booking-edit-form">
      <input type="hidden" name="id" value={booking.id} />
      {state && !state.ok ? <FormAlert className="sm:col-span-2">{errorText(state.error)}</FormAlert> : null}
      <Field label={t("resourceType")} htmlFor="e-type">
        <NativeSelect id="e-type" name="type" value={type} onChange={(e) => setType(e.target.value as "workspace" | "room")}>
          <option value="workspace">{ts("bookingType.workspace")}</option>
          <option value="room">{ts("bookingType.room")}</option>
        </NativeSelect>
      </Field>
      <Field label={t("resourceLabel")} htmlFor="e-resource" error={fe("resource_id")}>
        <NativeSelect key={type} id="e-resource" name="resource_id" defaultValue={type === booking.type ? booking.resourceId : ""}>
          <option value="">—</option>
          {resources.filter((r) => r.type === type).map((r) => (
            <option key={r.id} value={r.id}>{r.name}</option>
          ))}
        </NativeSelect>
      </Field>
      <Field label={tc("date")} htmlFor="e-date" error={fe("date")}>
        <Input id="e-date" type="date" name="date" defaultValue={booking.date} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={tc("startTime")} htmlFor="e-start" error={fe("start_time")}>
          <NativeSelect id="e-start" name="start_time" defaultValue={booking.start}>
            {times.map((x) => <option key={x} value={x}>{x}</option>)}
          </NativeSelect>
        </Field>
        <Field label={tc("endTime")} htmlFor="e-end" error={fe("end_time")}>
          <NativeSelect id="e-end" name="end_time" defaultValue={booking.end}>
            {times.map((x) => <option key={x} value={x}>{x}</option>)}
          </NativeSelect>
        </Field>
      </div>
      <Field label={t("attendees")} htmlFor="e-att" error={fe("attendees")}>
        <Input id="e-att" type="number" name="attendees" min={1} max={500} defaultValue={booking.attendees} />
      </Field>
      <Field label={t("statusLabel")} htmlFor="e-status">
        <NativeSelect id="e-status" name="status" defaultValue={booking.status}>
          {["pending", "confirmed", "completed", "cancelled", "no_show"].map((s) => (
            <option key={s} value={s}>{ts(`booking.${s}`)}</option>
          ))}
        </NativeSelect>
      </Field>
      <Field label={t("purpose")} htmlFor="e-purpose" className="sm:col-span-2">
        <Textarea id="e-purpose" name="purpose" rows={2} maxLength={1000} defaultValue={booking.purpose} />
      </Field>
      <div className="flex flex-col gap-3 sm:col-span-2 sm:flex-row sm:items-center sm:justify-between">
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="notify" defaultChecked className="mt-0.5 h-4 w-4 accent-primary" />
          <span>
            {t("notifyCustomer")}
            <span className="block text-xs text-muted-foreground">{t("updatedHint")}</span>
          </span>
        </label>
        <SubmitButton pending={pending}>{tc("save")}</SubmitButton>
      </div>
    </form>
  );
}

export function CancelBookingDialog({ bookingId }: { bookingId: string }) {
  const t = useTranslations("admin.bookings");
  const tc = useTranslations("common");
  const errorText = useErrorText();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const { state, pending, onSubmit } = useServerForm(async (prev: unknown, fd: FormData) => {
    const res = await adminCancelBooking(prev, fd);
    if (res.ok) {
      toast.success(t("cancelled"));
      setOpen(false);
      router.refresh();
    }
    return res;
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="text-destructive hover:text-destructive" data-testid="admin-cancel-booking">
          {t("cancel")}
        </Button>
      </DialogTrigger>
      <DialogContent closeLabel={tc("close")}>
        <form onSubmit={onSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{t("cancel")}</DialogTitle>
            <DialogDescription>{tc("cannotUndo")}</DialogDescription>
          </DialogHeader>
          <input type="hidden" name="id" value={bookingId} />
          {state && !state.ok ? <FormAlert>{errorText(state.error)}</FormAlert> : null}
          <Field label={t("cancelReason")} htmlFor="c-reason">
            <Textarea id="c-reason" name="reason" rows={3} maxLength={1000} />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="notify" defaultChecked className="h-4 w-4 accent-primary" />
            {t("notifyCustomer")}
          </label>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>{tc("back")}</Button>
            <SubmitButton pending={pending} variant="destructive">{t("cancel")}</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SimpleTextForm({
  action,
  hidden,
  field,
  placeholder,
  button,
  success,
  rows = 3,
  testId,
}: {
  action: (prev: unknown, fd: FormData) => Promise<import("@/lib/action-result").ActionResult>;
  hidden: Record<string, string>;
  field: string;
  placeholder: string;
  button: string;
  success: string;
  rows?: number;
  testId?: string;
}) {
  const errorText = useErrorText();
  const router = useRouter();
  const ref = useRef<HTMLFormElement>(null);
  const { state, pending, onSubmit } = useServerForm(async (prev: unknown, fd: FormData) => {
    const res = await action(prev, fd);
    if (res.ok) {
      toast.success(success);
      ref.current?.reset();
      router.refresh();
    }
    return res;
  });
  return (
    <form ref={ref} onSubmit={onSubmit} className="space-y-2" data-testid={testId}>
      {Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      {state && !state.ok ? <FormAlert>{errorText(state.error === "validation" ? "validation" : state.error)}</FormAlert> : null}
      <Textarea name={field} rows={rows} placeholder={placeholder} aria-label={placeholder} maxLength={5000} required />
      <div className="flex justify-end">
        <SubmitButton pending={pending} size="sm">{button}</SubmitButton>
      </div>
    </form>
  );
}

export function NoteForm({ bookingId }: { bookingId: string }) {
  const t = useTranslations("admin.bookings");
  return <SimpleTextForm action={addBookingNote} hidden={{ booking_id: bookingId }} field="note" placeholder={t("notesHint")} button={t("addNote")} success={t("addNote")} rows={2} testId="note-form" />;
}

export function MessageForm({ bookingId }: { bookingId: string }) {
  const t = useTranslations("admin.bookings");
  return <SimpleTextForm action={sendBookingMessage} hidden={{ booking_id: bookingId }} field="message" placeholder={t("messagePlaceholder")} button={t("sendMessage")} success={t("messageSent")} rows={4} testId="message-form" />;
}
