import { useEffect, useRef } from 'react';

/**
 * Puts the focus on an alert when it appears, or on whatever takes the place of the
 * control that had it. A dialog disables its confirmation while the API answers, and
 * the button that was focused loses the focus with it: without this the keyboard
 * lands on nothing, and a screen reader says nothing of the refusal, or of the
 * confirmation that replaced the form. The element, which gives itself a `tabIndex`
 * of -1 for it, takes the focus without joining the tab order.
 */
export function useAlertFocus(enabled: boolean, error: unknown) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (enabled) {
      ref.current?.focus();
    }
  }, [enabled, error]);

  return ref;
}
