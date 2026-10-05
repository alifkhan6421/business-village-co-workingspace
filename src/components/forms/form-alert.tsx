import { AlertCircle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function FormAlert({ kind = "error", children, className }: { kind?: "error" | "success" | "info"; children: React.ReactNode; className?: string }) {
  if (!children) return null;
  return (
    <div
      role={kind === "error" ? "alert" : "status"}
      className={cn(
        "flex items-start gap-2.5 rounded-xl border px-3.5 py-3 text-sm",
        kind === "error" && "border-destructive/30 bg-destructive/5 text-destructive",
        kind === "success" && "border-emerald-600/20 bg-emerald-50 text-emerald-900",
        kind === "info" && "border-sky-600/20 bg-sky-50 text-sky-900",
        className,
      )}
    >
      {kind === "error" ? <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />}
      <div>{children}</div>
    </div>
  );
}
