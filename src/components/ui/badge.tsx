import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap [&_svg]:size-3",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground",
        secondary: "border-transparent bg-secondary text-secondary-foreground",
        outline: "text-foreground",
        success: "border-emerald-600/15 bg-emerald-50 text-emerald-700",
        warning: "border-amber-600/20 bg-amber-50 text-amber-800",
        danger: "border-red-600/15 bg-red-50 text-red-700",
        info: "border-sky-600/15 bg-sky-50 text-sky-700",
        muted: "border-transparent bg-muted text-muted-foreground",
        neutral: "border-border bg-background text-foreground/80",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export function Badge({
  className,
  variant,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
