'use client';

export interface ChipOption<T extends string> {
  value: T;
  label: string;
}

export function SelectableChips<T extends string>({
  options,
  value,
  onChange,
  multiple = false,
  legend,
}: {
  options: ChipOption<T>[];
  value: T[] | T | null;
  onChange: (value: T[] | T) => void;
  multiple?: boolean;
  legend?: string;
}) {
  const selected = new Set<string>(
    multiple ? ((value as T[] | null) ?? []) : value ? [value as T] : [],
  );

  const toggle = (option: T) => {
    if (multiple) {
      const current = new Set((value as T[] | null) ?? []);
      if (current.has(option)) current.delete(option);
      else current.add(option);
      onChange([...current] as T[]);
    } else {
      onChange(option);
    }
  };

  return (
    <fieldset>
      {legend ? (
        <legend className="mb-2 text-sm font-medium text-navy">{legend}</legend>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const active = selected.has(option.value);
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={active}
              onClick={() => toggle(option.value)}
              className={[
                'min-h-11 rounded-full border px-3.5 py-2 text-sm font-medium transition-colors',
                active
                  ? 'border-crimson bg-crimson text-white'
                  : 'border-line bg-white text-charcoal hover:border-navy/30',
              ].join(' ')}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
