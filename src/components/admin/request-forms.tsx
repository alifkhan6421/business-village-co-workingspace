"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Ban, CalendarClock, Check, CheckCheck, Eye, RefreshCw, RotateCcw, X } from "lucide-react";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SubmitButton } from "@/components/forms/submit-button";
import { FormAlert } from "@/components/forms/form-alert";
import { useServerForm } from "@/components/forms/use-server-form";
import { useErrorText, useFieldErrorText } from "@/components/forms/use-error-text";
import { addRequestNote, adjustRequestPrice, recalculateRequestPrice, saveRequestDetails, sendRequestMessage, setRequestStatus } from "@/lib/admin/requests";
import type { ActionResult } from "@/lib/action-result";

export type SpaceOption = { value: string; label: string; group: "room" | "workspace"; state: "free" | "busy" | "blocked" | "small" | "unavailable" };

function useAction(action: (prev: unknown, fd: FormData) => Promise<ActionResult>, success: string, after?: () => void) {
  const router = useRouter();
  const errorText = useErrorText();
  const fieldError = useFieldErrorText();
  const form = useServerForm(async (prev: unknown, fd: FormData) => {
    const res = await action(prev, fd);
    if (res.ok) {
      toast.success(success);
      after?.();
      router.refresh();
    }
    return res;
  });
  const fe = (k: string) => (form.state && !form.state.ok ? fieldError(form.state.fieldErrors?.[k]) : undefined);
  const alert = form.state && !form.state.ok ? <FormAlert>{errorText(form.state.error)}</FormAlert> : null;
  return { ...form, fe, alert };
}

export function RequestDetailsForm({
  r,
  spaces,
  times,
}: {
  r: { id: string; resource: string; date: string; start: string; hours: number; participants: number; priceAdjusted: boolean };
  spaces: SpaceOption[];
  times: string[];
}) {
  const t = useTranslations("admin.requests");
  const tc = useTranslations("common");
  const { onSubmit, pending, fe, alert } = useAction(saveRequestDetails, t("saved"));
  const label = (o: SpaceOption) => `${o.label} · ${t(`spaceState.${o.state}`)}`;
  const timeList = times.includes(r.start) ? times : [...times, r.start].sort();
  return (
    <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-2" noValidate data-testid="request-details-form">
      <input type="hidden" name="id" value={r.id} />
      {alert ? <div className="sm:col-span-2">{alert}</div> : null}
      <Field label={t("assignSpace")} htmlFor="rq-space" className="sm:col-span-2" error={fe("resource")} hint={t("assignSpaceHint")}>
        <NativeSelect id="rq-space" name="resource" defaultValue={r.resource}>
          <option value="">{t("unassigned")}</option>
          <optgroup label={t("rooms")}>
            {spaces.filter((o) => o.group === "room").map((o) => (
              <option key={o.value} value={o.value}>{label(o)}</option>
            ))}
          </optgroup>
          <optgroup label={t("desks")}>
            {spaces.filter((o) => o.group === "workspace").map((o) => (
              <option key={o.value} value={o.value}>{label(o)}</option>
            ))}
          </optgroup>
        </NativeSelect>
      </Field>
      <Field label={tc("date")} htmlFor="rq-date" error={fe("date")}>
        <Input id="rq-date" type="date" name="date" defaultValue={r.date} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={tc("startTime")} htmlFor="rq-start" error={fe("start_time")}>
          <NativeSelect id="rq-start" name="start_time" defaultValue={r.start}>
            {timeList.map((x) => <option key={x} value={x}>{x}</option>)}
          </NativeSelect>
        </Field>
        <Field label={t("duration")} htmlFor="rq-hours" error={fe("hours")}>
          <NativeSelect id="rq-hours" name="hours" defaultValue={String(r.hours)}>
            {Array.from({ length: 24 }, (_, i) => i + 1).map((h) => <option key={h} value={h}>{t("hoursShort", { count: h })}</option>)}
          </NativeSelect>
        </Field>
      </div>
      <Field label={t("people")} htmlFor="rq-people" error={fe("participants")}>
        <Input id="rq-people" type="number" name="participants" min={1} max={1000} defaultValue={r.participants} />
      </Field>
      <Field label={t("changeNote")} htmlFor="rq-note">
        <Input id="rq-note" name="note" maxLength={2000} />
      </Field>
      <div className="flex flex-col gap-3 sm:col-span-2 sm:flex-row sm:items-center sm:justify-between">
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="recalculate" defaultChecked={!r.priceAdjusted} className="mt-0.5 h-4 w-4 accent-primary" />
          <span>
            {t("recalculateOnSave")}
            {r.priceAdjusted ? <span className="block text-xs text-muted-foreground">{t("recalculateAdjustedHint")}</span> : null}
          </span>
        </label>
        <SubmitButton pending={pending}>{tc("save")}</SubmitButton>
      </div>
    </form>
  );
}

const TRANSITIONS: Record<string, string[]> = {
  pending: ["under_review", "confirmed", "alternative_proposed", "rejected"],
  under_review: ["confirmed", "alternative_proposed", "rejected"],
  alternative_proposed: ["confirmed", "under_review", "rejected", "cancelled"],
  confirmed: ["completed", "cancelled"],
  rejected: ["under_review"],
  cancelled: ["under_review"],
  completed: [],
};
const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  under_review: Eye,
  confirmed: Check,
  alternative_proposed: CalendarClock,
  rejected: X,
  cancelled: Ban,
  completed: CheckCheck,
};
const EMAILS = ["confirmed", "alternative_proposed", "rejected", "cancelled"];

export function RequestStatusActions({
  r,
}: {
  r: { id: string; status: string; hasSpace: boolean; reopen: boolean; altDate: string; altStart: string; altHours: number };
}) {
  const t = useTranslations("admin.requests");
  const ts = useTranslations("status.request");
  const tc = useTranslations("common");
  const [open, setOpen] = useState<string | null>(null);
  const { onSubmit, pending, fe, alert, setState } = useAction(setRequestStatus, t("statusChanged"), () => setOpen(null));
  const options = TRANSITIONS[r.status] ?? [];
  if (!options.length) return <p className="text-sm text-muted-foreground">{t("noActions")}</p>;
  const target = open;
  return (
    <div className="flex flex-wrap gap-2" data-testid="request-actions">
      {options.map((s) => {
        const Icon = r.reopen && s === "under_review" && ["rejected", "cancelled"].includes(r.status) ? RotateCcw : ICONS[s];
        const destructive = s === "rejected" || s === "cancelled";
        return (
          <Button
            key={s}
            variant={s === "confirmed" ? "default" : "outline"}
            className={destructive ? "text-destructive hover:text-destructive" : undefined}
            onClick={() => {
              setState(null);
              setOpen(s);
            }}
            data-testid={`action-${s}`}
          >
            <Icon /> {t(`actions.${s}`)}
          </Button>
        );
      })}
      <Dialog open={target !== null} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent closeLabel={tc("close")}>
          {target ? (
            <form onSubmit={onSubmit} className="space-y-4" noValidate data-testid="status-form">
              <DialogHeader>
                <DialogTitle>{t(`actions.${target}`)}</DialogTitle>
                <DialogDescription>{t(`actionHints.${target}`)}</DialogDescription>
              </DialogHeader>
              <input type="hidden" name="id" value={r.id} />
              <input type="hidden" name="status" value={target} />
              {alert}
              {target === "confirmed" && !r.hasSpace ? <FormAlert>{t("assignFirst")}</FormAlert> : null}
              {target === "alternative_proposed" ? (
                <div className="grid grid-cols-2 gap-3">
                  <Field label={tc("date")} htmlFor="alt-date" className="col-span-2" error={fe("alt_date")}>
                    <Input id="alt-date" type="date" name="alt_date" defaultValue={r.altDate} />
                  </Field>
                  <Field label={tc("startTime")} htmlFor="alt-start" error={fe("alt_start")}>
                    <Input id="alt-start" type="time" name="alt_start" step={900} defaultValue={r.altStart} />
                  </Field>
                  <Field label={t("duration")} htmlFor="alt-hours" error={fe("alt_hours")}>
                    <Input id="alt-hours" type="number" name="alt_hours" min={1} max={24} defaultValue={r.altHours} />
                  </Field>
                </div>
              ) : null}
              <Field
                label={target === "rejected" || target === "cancelled" ? t("reasonRequired") : t("noteForCustomer")}
                htmlFor="st-note"
                error={fe("note")}
                hint={EMAILS.includes(target) ? t("noteInEmail") : t("noteInternal")}
              >
                <Textarea id="st-note" name="note" rows={3} maxLength={2000} />
              </Field>
              {EMAILS.includes(target) ? (
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="notify" defaultChecked className="h-4 w-4 accent-primary" />
                  {t("notifyCustomer", { status: ts(target) })}
                </label>
              ) : null}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpen(null)}>{tc("back")}</Button>
                <SubmitButton pending={pending} variant={target === "rejected" || target === "cancelled" ? "destructive" : "default"} disabled={target === "confirmed" && !r.hasSpace}>
                  {t(`actions.${target}`)}
                </SubmitButton>
              </DialogFooter>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function RecalculateButton({ id }: { id: string }) {
  const t = useTranslations("admin.requests");
  const errorText = useErrorText();
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      data-testid="recalculate-price"
      onClick={() =>
        start(async () => {
          const res = await recalculateRequestPrice(id);
          if (!res.ok) toast.error(errorText(res.error));
          else {
            toast.success(t("recalculated"));
            router.refresh();
          }
        })
      }
    >
      <RefreshCw className={pending ? "animate-spin" : undefined} /> {t("recalculate")}
    </Button>
  );
}

export function AdjustPriceForm({ id, current }: { id: string; current: string }) {
  const t = useTranslations("admin.requests");
  const ref = useRef<HTMLFormElement>(null);
  const { onSubmit, pending, fe, alert } = useAction(adjustRequestPrice, t("priceAdjusted"), () => ref.current?.reset());
  return (
    <form ref={ref} onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-[10rem_minmax(0,1fr)_auto] sm:items-end" noValidate data-testid="adjust-price-form">
      <input type="hidden" name="id" value={id} />
      {alert ? <div className="sm:col-span-3">{alert}</div> : null}
      <Field label={t("manualGross")} htmlFor="adj-gross" error={fe("gross")}>
        <Input id="adj-gross" name="gross" inputMode="decimal" placeholder={current} />
      </Field>
      <Field label={t("adjustReason")} htmlFor="adj-reason" error={fe("reason")}>
        <Input id="adj-reason" name="reason" maxLength={1000} />
      </Field>
      <SubmitButton pending={pending} variant="secondary">{t("adjust")}</SubmitButton>
    </form>
  );
}

function TextForm({ action, id, field, placeholder, button, success, testId }: { action: (p: unknown, fd: FormData) => Promise<ActionResult>; id: string; field: string; placeholder: string; button: string; success: string; testId: string }) {
  const ref = useRef<HTMLFormElement>(null);
  const { onSubmit, pending, alert } = useAction(action, success, () => ref.current?.reset());
  return (
    <form ref={ref} onSubmit={onSubmit} className="space-y-2" data-testid={testId}>
      <input type="hidden" name="request_id" value={id} />
      {alert}
      <Textarea name={field} rows={3} placeholder={placeholder} aria-label={placeholder} maxLength={5000} required />
      <div className="flex justify-end">
        <SubmitButton pending={pending} size="sm">{button}</SubmitButton>
      </div>
    </form>
  );
}

export function RequestNoteForm({ id }: { id: string }) {
  const t = useTranslations("admin.requests");
  return <TextForm action={addRequestNote} id={id} field="note" placeholder={t("notePlaceholder")} button={t("addNote")} success={t("noteAdded")} testId="request-note-form" />;
}

export function RequestMessageForm({ id }: { id: string }) {
  const t = useTranslations("admin.requests");
  return <TextForm action={sendRequestMessage} id={id} field="message" placeholder={t("messagePlaceholder")} button={t("sendMessage")} success={t("messageSent")} testId="request-message-form" />;
}
