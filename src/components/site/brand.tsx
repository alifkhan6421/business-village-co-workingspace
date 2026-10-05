import Image from "next/image";
import { cn } from "@/lib/utils";

type Logo = { url: string; alt?: string | null; width?: number | null; height?: number | null } | null | undefined;

/** Uploaded logo, or the BV monogram with the company name. */
export function Brand({ logo, name, className, priority }: { logo: Logo; name: string; className?: string; priority?: boolean }) {
  if (logo) {
    return (
      <Image
        src={logo.url}
        alt={logo.alt || name}
        width={logo.width ?? 160}
        height={logo.height ?? 40}
        className={cn("h-9 w-auto", className)}
        priority={priority}
      />
    );
  }
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-[13px] font-bold tracking-tight text-primary-foreground shadow-xs">
        BV
      </span>
      <span className="text-[17px] font-bold tracking-tight">{name}</span>
    </span>
  );
}
