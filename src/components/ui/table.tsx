import * as React from "react";
import { cn } from "@/lib/utils";

/** Phones show each row as a compact card when `stack` is set, instead of a sideways-scrolling table. */
const STACK =
  "max-md:[&_thead]:hidden max-md:[&_tbody]:block max-md:[&_tr]:flex max-md:[&_tr]:flex-wrap max-md:[&_tr]:items-center max-md:[&_tr]:gap-x-3 max-md:[&_tr]:gap-y-1 max-md:[&_tr]:px-4 max-md:[&_tr]:py-3 max-md:[&_td:not(.hidden)]:block max-md:[&_td]:p-0 max-md:[&_td:first-child]:basis-full";

export function Table({ className, wrapperClassName, stack, ...props }: React.TableHTMLAttributes<HTMLTableElement> & { wrapperClassName?: string; stack?: boolean }) {
  return (
    <div className={cn("relative w-full overflow-x-auto rounded-2xl border bg-card shadow-xs", wrapperClassName)}>
      <table className={cn("w-full caption-bottom text-sm", stack && STACK, className)} {...props} />
    </div>
  );
}
export function THead({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cn("bg-surface [&_tr]:border-b", className)} {...props} />;
}
export function TBody({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn("[&_tr:last-child]:border-0", className)} {...props} />;
}
export function TR({ className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn("border-b transition-colors hover:bg-surface", className)} {...props} />;
}
export function TH({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn("h-11 px-4 text-left align-middle text-xs font-medium text-muted-foreground whitespace-nowrap", className)}
      {...props}
    />
  );
}
export function TD({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn("px-4 py-3 align-middle", className)} {...props} />;
}
