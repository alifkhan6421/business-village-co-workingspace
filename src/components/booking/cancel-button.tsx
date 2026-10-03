"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useErrorText } from "@/components/forms/use-error-text";
import { cancelGuestBooking, cancelMyBooking } from "@/lib/booking/actions";

/** Cancel with confirmation, either by guest token or as the signed-in member. */
export function CancelBookingButton({ token, bookingId, reference, size = "default" }: { token?: string; bookingId?: string; reference: string; size?: "default" | "sm" }) {
  const t = useTranslations("booking");
  const tc = useTranslations("common");
  const errText = useErrorText();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const run = () =>
    start(async () => {
      const res = token ? await cancelGuestBooking(token) : await cancelMyBooking(bookingId!);
      if (res.ok) {
        toast.success(t("cancelled"));
        router.refresh();
      } else toast.error(errText(res.error));
    });
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={setOpen}
      trigger={
        <Button variant="outline" size={size} disabled={pending} className="border-destructive/40 text-destructive hover:bg-destructive/5" data-testid="cancel-booking">
          {pending ? <Loader2 className="animate-spin" /> : null}
          {t("cancelBooking")}
        </Button>
      }
      title={t("cancelConfirmTitle")}
      description={t("cancelConfirmText", { reference })}
      confirmLabel={t("cancelBooking")}
      cancelLabel={tc("back")}
      onConfirm={run}
    />
  );
}
