import { useSyncExternalStore } from 'react';

export type Theme = 'light' | 'dark';

const KEY = 'careclaim-theme';
const listeners = new Set<() => void>();
const systemDark = window.matchMedia('(prefers-color-scheme: dark)');

/** The theme the reader chose, or the system's when they have not chosen. */
function current(): Theme {
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(KEY);
  } catch {
    // Storage is blocked (private mode): follow the system.
  }
  return stored === 'light' || stored === 'dark' ? stored : systemDark.matches ? 'dark' : 'light';
}

/** index.css keys the dark tokens off this attribute; index.html sets it once before the app loads. */
function apply() {
  document.documentElement.dataset.theme = current();
  listeners.forEach(listener => listener());
}

export function setTheme(theme: Theme) {
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    // Not remembered, but still applied for this visit.
    document.documentElement.dataset.theme = theme;
    listeners.forEach(listener => listener());
    return;
  }
  apply();
}

systemDark.addEventListener('change', apply);
// Paper is light: a printout uses the light tokens whatever the screen shows.
window.addEventListener('beforeprint', () => { document.documentElement.dataset.theme = 'light'; });
window.addEventListener('afterprint', apply);
apply();

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, () => (document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'));
}
