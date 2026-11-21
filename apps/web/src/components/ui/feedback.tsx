import type { ReactNode } from 'react';

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-sm text-muted" role="status">
      <span
        aria-hidden
        className="size-4 animate-spin rounded-full border-2 border-navy/20 border-t-navy"
      />
      <span>{label}</span>
    </span>
  );
}

export function LoadingBlock({ label = 'Loading…', rows = 3 }: { label?: string; rows?: number }) {
  return (
    <div className="space-y-3" role="status" aria-label={label}>
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }).map((_, index) => (
        <div
          key={index}
          className="h-16 animate-pulse rounded-card border border-line bg-white"
          aria-hidden
        />
      ))}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
  icon = '✷',
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="rounded-card border border-dashed border-line bg-white/70 p-10 text-center">
      <div aria-hidden className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-alabaster text-xl text-navy">
        {icon}
      </div>
      <h3 className="text-base font-semibold text-navy">{title}</h3>
      {description ? <p className="mx-auto mt-1 max-w-md text-sm text-muted">{description}</p> : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}

export function ErrorState({
  title = 'Something went wrong',
  message,
  onRetry,
}: {
  title?: string;
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div
      role="alert"
      className="rounded-card border border-crimson/25 bg-crimson-soft p-5 text-sm text-navy"
    >
      <p className="font-semibold">{title}</p>
      <p className="mt-1 text-charcoal">{message}</p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 rounded-full border border-crimson/30 bg-white px-4 py-1.5 text-sm font-medium text-crimson"
        >
          Try again
        </button>
      ) : null}
    </div>
  );
}

export function Alert({
  tone = 'info',
  title,
  children,
}: {
  tone?: 'info' | 'success' | 'warning' | 'danger';
  title?: string;
  children: ReactNode;
}) {
  const tones = {
    info: 'border-navy/15 bg-navy/5 text-navy',
    success: 'border-emerald-600/20 bg-emerald-50 text-emerald-900',
    warning: 'border-warn/30 bg-warn-soft text-navy',
    danger: 'border-crimson/30 bg-crimson-soft text-navy',
  } as const;

  return (
    <div role="status" className={`rounded-xl border p-3.5 text-sm ${tones[tone]}`}>
      {title ? <p className="font-semibold">{title}</p> : null}
      <div className={title ? 'mt-1' : undefined}>{children}</div>
    </div>
  );
}

/** `gold` is Service Gold: use it only for verification badges (brand rule). */
type BadgeTone = 'neutral' | 'success' | 'warning' | 'danger' | 'gold' | 'navy';

export function Badge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: BadgeTone;
}) {
  const tones: Record<BadgeTone, string> = {
    neutral: 'bg-alabaster text-charcoal border-line',
    success: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    warning: 'bg-warn-soft text-warn border-warn/30',
    danger: 'bg-crimson-soft text-crimson border-crimson/25',
    gold: 'bg-gold-soft text-navy border-gold/50',
    navy: 'bg-navy text-white border-navy',
  };

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium ${tones[tone]}`}
    >
      {children}
    </span>
  );
}
