"use client";
import * as React from "react";
import { Dialog as P } from "radix-ui";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export const Sheet = P.Root;
export const SheetTrigger = P.Trigger;
export const SheetClose = P.Close;
export const SheetTitle = P.Title;

export function SheetContent({
  className,
  children,
  side = "right",
  closeLabel = "Close",
  ...props
}: React.ComponentProps<typeof P.Content> & { side?: "left" | "right"; closeLabel?: string }) {
  return (
    <P.Portal>
      <P.Overlay className="fixed inset-0 z-50 bg-black/50" />
      <P.Content
        className={cn(
          "fixed inset-y-0 z-50 flex w-[85vw] max-w-sm flex-col gap-4 overflow-y-auto bg-background p-5 shadow-lg",
          side === "right" ? "right-0 border-l" : "left-0 border-r",
          className,
        )}
        {...props}
      >
        {children}
        <P.Close className="absolute right-4 top-4 rounded-sm opacity-70 hover:opacity-100">
          <X className="h-5 w-5" />
          <span className="sr-only">{closeLabel}</span>
        </P.Close>
      </P.Content>
    </P.Portal>
  );
}
