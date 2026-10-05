import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

/** Progress indicator: Space → Date & time → Details → Confirm. `current` is the 0-based active step. */
export function BookingSteps({ current, labels, ariaLabel }: { current: number; labels: string[]; ariaLabel: string }) {
  return (
    <nav aria-label={ariaLabel}>
      <ol className="flex items-center gap-2 sm:gap-3">
        {labels.map((label, i) => {
          const done = i < current;
          const active = i === current;
          return (
            <li key={label} className={cn("flex min-w-0 items-center gap-2 sm:gap-3", i < labels.length - 1 && "flex-1")} aria-current={active ? "step" : undefined}>
              <span
                className={cn(
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold tabular-nums ring-1 ring-inset transition-colors",
                  done && "bg-primary text-primary-foreground ring-primary",
                  active && "bg-background text-primary ring-2 ring-primary",
                  !done && !active && "bg-background text-muted-foreground ring-border",
                )}
              >
                {done ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : i + 1}
              </span>
              <span className={cn("hidden text-sm font-medium sm:inline", active ? "shrink-0 text-foreground" : "truncate text-muted-foreground")}>{label}</span>
              {i < labels.length - 1 ? <span className={cn("h-px min-w-3 flex-1", done ? "bg-primary" : "bg-border")} aria-hidden="true" /> : null}
            </li>
          );
        })}
      </ol>
      <p className="mt-2.5 text-sm font-semibold sm:hidden">
        {current + 1}/{labels.length} · {labels[current]}
      </p>
    </nav>
  );
}
