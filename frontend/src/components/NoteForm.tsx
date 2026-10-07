interface NoteAction {
  label: string;
  onClick: () => void;
}

interface NoteFormProps {
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
  placeholder: string;
  busy: boolean;
  secondary: NoteAction;
  primary: NoteAction;
}

/** A short note with its two actions: a patient raising a dispute, or a hospital answering one. */
export function NoteForm({ value, onChange, ariaLabel, placeholder, busy, secondary, primary }: NoteFormProps) {
  return (
    <div className="space-y-2">
      <textarea
        rows={2}
        maxLength={1000} // the API's limit on a dispute note or response
        value={value}
        onChange={e => onChange(e.target.value)}
        aria-label={ariaLabel}
        placeholder={placeholder}
        className="w-full bg-paper border border-rule rounded px-3 py-2 text-sm text-ink resize-y focus:outline-none focus:border-pine"
      />
      <div className="flex flex-wrap justify-end gap-2">
        <button
          type="button"
          onClick={secondary.onClick}
          disabled={busy}
          className="border border-rule bg-paper hover:bg-rule/40 text-pine-deep rounded px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50"
        >
          {secondary.label}
        </button>
        <button
          type="button"
          onClick={primary.onClick}
          disabled={busy}
          className="bg-pine hover:bg-pine-deep text-bone rounded px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50"
        >
          {primary.label}
        </button>
      </div>
    </div>
  );
}
