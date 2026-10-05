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
      <P.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=open]:fade-in-0" />
      <P.Content
        className={cn(
          "fixed inset-y-0 z-50 flex w-[88vw] max-w-sm flex-col gap-4 overflow-y-auto bg-background p-5 shadow-xl data-[state=open]:animate-in data-[state=open]:duration-200",
          side === "right" ? "right-0 border-l data-[state=open]:slide-in-from-right" : "left-0 border-r data-[state=open]:slide-in-from-left",
          className,
        )}
        {...props}
      >
        {children}
        <P.Close className="absolute right-3 top-3 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
          <X className="h-5 w-5" />
          <span className="sr-only">{closeLabel}</span>
        </P.Close>
      </P.Content>
    </P.Portal>
  );
}
