/** Centered card layout shared by login, signup, forgot and reset password. */
export function AuthShell({ title, subtitle, children, footer, wide = false }: { title: string; subtitle?: string; children: React.ReactNode; footer?: React.ReactNode; wide?: boolean }) {
  return (
    <div className="relative isolate overflow-hidden bg-surface">
      <div
        aria-hidden="true"
        className="absolute inset-x-0 top-0 -z-10 h-72 bg-[radial-gradient(60%_100%_at_50%_0%,color-mix(in_oklch,var(--primary)_10%,transparent),transparent)]"
      />
      <div className={`mx-auto flex min-h-[calc(100dvh-4rem)] ${wide ? "max-w-[540px]" : "max-w-[440px]"} flex-col justify-center gap-5 px-4 py-12 sm:py-16`}>
        <div className="rounded-2xl border bg-card p-6 shadow-lg sm:p-8">
          <div className="mb-7 text-center">
            <h1 className="text-2xl font-extrabold tracking-tight">{title}</h1>
            {subtitle ? <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">{subtitle}</p> : null}
          </div>
          {children}
        </div>
        {footer ? <div className="text-center text-sm text-muted-foreground">{footer}</div> : null}
      </div>
    </div>
  );
}
