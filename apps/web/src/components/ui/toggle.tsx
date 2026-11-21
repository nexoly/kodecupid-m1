'use client';

export function Toggle({
  id,
  checked,
  onChange,
  label,
  disabled = false,
}: {
  id: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={[
        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors',
        // Invisible 44px-tall tap area around the 24px track.
        "after:absolute after:-inset-x-1 after:-inset-y-2.5 after:content-['']",
        'disabled:cursor-not-allowed disabled:opacity-50',
        checked ? 'bg-crimson' : 'bg-line',
      ].join(' ')}
    >
      <span
        aria-hidden
        className={[
          'inline-block size-4 rounded-full bg-white shadow transition-transform',
          checked ? 'translate-x-6' : 'translate-x-1',
        ].join(' ')}
      />
    </button>
  );
}

export function ToggleRow({
  id,
  checked,
  onChange,
  title,
  description,
  disabled,
}: {
  id: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  title: string;
  description?: string;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-navy">{title}</p>
        {description ? <p className="mt-0.5 text-xs text-muted">{description}</p> : null}
      </div>
      <Toggle id={id} checked={checked} onChange={onChange} label={title} disabled={disabled} />
    </div>
  );
}
