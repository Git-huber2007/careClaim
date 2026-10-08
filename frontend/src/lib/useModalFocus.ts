import { useEffect, useRef } from 'react';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Keyboard behaviour for a modal dialog: focus moves into it when it opens,
 * Tab stays inside it, Escape closes it, and focus goes back to where it was
 * when it closes. Put the returned ref on the dialog element, with tabIndex={-1}.
 */
export function useModalFocus<T extends HTMLElement>(onClose: () => void) {
  const dialog = useRef<T>(null);
  // The latest onClose, so a parent that passes a new function each render does not reset the focus.
  const close = useRef(onClose);
  useEffect(() => { close.current = onClose; });

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    dialog.current?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') return close.current();
      if (e.key !== 'Tab' || !dialog.current) return;
      const stops = [...dialog.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (!stops.length) return e.preventDefault();
      const first = stops[0];
      const last = stops[stops.length - 1];
      const active = document.activeElement;
      // Wrap at either end, and pull focus back in if it is somewhere outside.
      if (e.shiftKey ? active === first || !dialog.current.contains(active) : active === last || !dialog.current.contains(active)) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      opener?.focus();
    };
  }, []);

  return dialog;
}
