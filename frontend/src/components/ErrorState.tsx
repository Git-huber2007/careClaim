import type { ReactNode } from 'react';

interface ErrorStateProps {
  title: string;
  message: string;
  /** The ways out: a retry, a link elsewhere. */
  children?: ReactNode;
}

/** A page or list that failed to load: what went wrong, and what the reader can do about it. */
export function ErrorState({ title, message, children }: ErrorStateProps) {
  return (
    <div className="w-full max-w-md mx-auto bg-paper p-8 rounded-lg border border-rule text-center space-y-4">
      <div className="text-xl font-sans font-semibold text-pine-deep">{title}</div>
      <div role="alert" className="text-sm text-vermilion font-mono bg-vermilion/5 border border-vermilion/20 p-3 rounded">{message}</div>
      {children && <div className="flex flex-wrap justify-center gap-3 pt-2">{children}</div>}
    </div>
  );
}
