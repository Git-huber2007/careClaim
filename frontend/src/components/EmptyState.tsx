import type { ReactNode } from 'react';

interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  /** One or two sentences on why it is empty or what to do next. */
  children?: ReactNode;
  /** Buttons or links that lead out of the empty state. */
  actions?: ReactNode;
}

/** What a page or list shows when there is nothing in it: an icon, what is missing, and the way forward. */
export function EmptyState({ icon, title, children, actions }: EmptyStateProps) {
  return (
    <div className="p-10 text-center space-y-4">
      <div className="w-14 h-14 bg-pine/10 text-pine rounded-full flex items-center justify-center mx-auto">{icon}</div>
      <div className="max-w-md mx-auto space-y-1">
        <h2 className="text-xl font-sans font-semibold text-pine-deep">{title}</h2>
        {children && <p className="text-sm text-ink-soft leading-relaxed">{children}</p>}
      </div>
      {actions && <div className="flex flex-wrap justify-center gap-3 pt-2">{actions}</div>}
    </div>
  );
}
