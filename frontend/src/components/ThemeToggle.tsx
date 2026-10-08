import { Moon, Sun } from 'lucide-react';
import { setTheme, useTheme } from '../lib/theme';

export function ThemeToggle({
  className = '',
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  const theme = useTheme();

  return (
    <div
      role="group"
      aria-label="Theme selection"
      className={`inline-flex items-center p-0.5 rounded-lg border border-rule bg-bone text-xs font-mono select-none ${className}`}
    >
      <button
        type="button"
        onClick={() => setTheme('light')}
        aria-pressed={theme === 'light'}
        aria-label="Switch to light mode"
        title="Light mode"
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
          theme === 'light'
            ? 'bg-paper text-pine-deep font-semibold shadow-xs border border-rule/70'
            : 'text-ink-soft hover:text-ink hover:bg-paper/50 border border-transparent'
        }`}
      >
        <Sun size={13} className={theme === 'light' ? 'text-amber' : 'text-ink-soft'} />
        {!compact && <span>Light</span>}
      </button>
      <button
        type="button"
        onClick={() => setTheme('dark')}
        aria-pressed={theme === 'dark'}
        aria-label="Switch to dark mode"
        title="Dark mode"
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
          theme === 'dark'
            ? 'bg-paper text-amber font-semibold shadow-xs border border-rule/70'
            : 'text-ink-soft hover:text-ink hover:bg-paper/50 border border-transparent'
        }`}
      >
        <Moon size={13} className={theme === 'dark' ? 'text-pine' : 'text-ink-soft'} />
        {!compact && <span>Dark</span>}
      </button>
    </div>
  );
}
