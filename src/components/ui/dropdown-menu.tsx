"use client";
import * as React from "react";
import { DropdownMenu as P } from "radix-ui";
import { cn } from "@/lib/utils";

export const DropdownMenu = P.Root;
export const DropdownMenuTrigger = P.Trigger;

export function DropdownMenuContent({ className, sideOffset = 6, ...props }: React.ComponentProps<typeof P.Content>) {
  return (
    <P.Portal>
      <P.Content
        sideOffset={sideOffset}
        className={cn("z-50 min-w-[12rem] overflow-hidden rounded-xl border bg-popover p-1.5 text-popover-foreground shadow-lg data-[state=open]:animate-in data-[state=open]:fade-in-0", className)}
        {...props}
      />
    </P.Portal>
  );
}
export function DropdownMenuItem({ className, ...props }: React.ComponentProps<typeof P.Item>) {
  return (
    <P.Item
      className={cn(
        "relative flex cursor-pointer select-none items-center gap-2 rounded-lg px-2.5 py-2 text-sm outline-none transition-colors focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:size-4",
        className,
      )}
      {...props}
    />
  );
}
export function DropdownMenuLabel({ className, ...props }: React.ComponentProps<typeof P.Label>) {
  return <P.Label className={cn("px-2.5 py-1.5 text-sm font-semibold", className)} {...props} />;
}
export function DropdownMenuSeparator({ className, ...props }: React.ComponentProps<typeof P.Separator>) {
  return <P.Separator className={cn("-mx-1 my-1 h-px bg-muted", className)} {...props} />;
}
