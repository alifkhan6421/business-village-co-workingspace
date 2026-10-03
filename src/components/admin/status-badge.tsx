import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";

type Variant = "success" | "warning" | "danger" | "info" | "muted" | "secondary";
const VARIANTS: Record<string, Record<string, Variant>> = {
  booking: { pending: "warning", confirmed: "success", cancelled: "danger", completed: "muted", no_show: "secondary" },
  resource: { available: "success", maintenance: "warning", disabled: "muted" },
  inquiry: { new: "info", in_progress: "warning", resolved: "success" },
  email: { pending: "warning", sent: "success", failed: "danger" },
  page: { draft: "muted", published: "success" },
  role: { admin: "info", member: "secondary" },
};

export function StatusBadge({ kind, value }: { kind: keyof typeof VARIANTS; value: string }) {
  const t = useTranslations(`status.${kind}`);
  return <Badge variant={VARIANTS[kind]?.[value] ?? "secondary"}>{t.has(value) ? t(value) : value}</Badge>;
}
