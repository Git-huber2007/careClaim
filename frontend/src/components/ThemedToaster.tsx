import { Toaster } from 'sonner';
import { useTheme } from '../lib/theme';

/** Toasts follow the page's theme. */
export function ThemedToaster() {
  return <Toaster position="bottom-right" theme={useTheme()} />;
}
