import { LoaderCircle } from 'lucide-react';

/** The "still loading" state every page shows: a spinner and a label, announced to screen readers. */
export function Loading({ label = 'Loading…', className = 'p-10' }: { label?: string; className?: string }) {
  return (
    <div role="status" className={`flex items-center justify-center gap-2 font-mono text-sm text-ink-soft ${className}`}>
      <LoaderCircle size={16} className="animate-spin" aria-hidden />
      {label}
    </div>
  );
}
