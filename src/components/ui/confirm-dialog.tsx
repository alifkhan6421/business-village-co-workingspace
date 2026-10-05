"use client";
import * as React from "react";
import { AlertDialog as P } from "radix-ui";
import { buttonVariants } from "./button";
import { cn } from "@/lib/utils";

export function ConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel,
  cancelLabel,
  onConfirm,
  destructive = true,
  open,
  onOpenChange,
}: {
  trigger?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void | Promise<void>;
  destructive?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  return (
    <P.Root open={open} onOpenChange={onOpenChange}>
      {trigger ? <P.Trigger asChild>{trigger}</P.Trigger> : null}
      <P.Portal>
        <P.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px]" />
        <P.Content className="fixed left-1/2 top-1/2 z-50 grid w-[calc(100%-1.5rem)] max-w-md -translate-x-1/2 -translate-y-1/2 gap-4 rounded-2xl border bg-background p-6 shadow-xl">
          <P.Title className="text-lg font-semibold">{title}</P.Title>
          {description ? <P.Description className="text-sm text-muted-foreground">{description}</P.Description> : null}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <P.Cancel className={buttonVariants({ variant: "outline" })}>{cancelLabel}</P.Cancel>
            <P.Action
              className={cn(buttonVariants({ variant: destructive ? "destructive" : "default" }))}
              onClick={() => void onConfirm()}
            >
              {confirmLabel}
            </P.Action>
          </div>
        </P.Content>
      </P.Portal>
    </P.Root>
  );
}
