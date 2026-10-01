import { useEffect, useRef, type RefObject } from 'react';

type InitialFocus = boolean | RefObject<HTMLElement | null> | ((type: '' | 'mouse' | 'touch' | 'pen' | 'keyboard') => boolean | HTMLElement | null | void);
const FIRST_INPUT = 'input:not([type="hidden"]):not([disabled]), textarea:not([disabled]), select:not([disabled]), [role="combobox"]:not([disabled]), [contenteditable="true"]';

// Form dialogs mount behind Suspense. Keep their input-first focus behavior
// without stealing focus after the user has moved to another control.
export function useDialogInitialFocus(initialFocus?: InitialFocus) {
  const contentRef = useRef<HTMLDivElement>(null);
  const stopRef = useRef<(() => void) | null>(null);
  useEffect(() => () => stopRef.current?.(), []);

  function handleInitialFocus(type: '' | 'mouse' | 'touch' | 'pen' | 'keyboard') {
    stopRef.current?.();
    if (typeof initialFocus === 'function') return initialFocus(type);
    if (typeof initialFocus === 'boolean') return initialFocus;
    if (initialFocus) return initialFocus.current;
    if (type === 'touch') return true;
    const content = contentRef.current;
    if (!content) return true;
    const input = content.querySelector<HTMLElement>(FIRST_INPUT);
    if (input) return input;

    const observer = new MutationObserver(() => {
      const next = content.querySelector<HTMLElement>(FIRST_INPUT);
      if (!next) return;
      const active = document.activeElement;
      if (!active || active === document.body || active === content || active.closest('[data-slot="dialog-close"]')) next.focus();
      stopRef.current?.();
    });
    const timeout = window.setTimeout(() => stopRef.current?.(), 3000);
    stopRef.current = () => {
      observer.disconnect();
      window.clearTimeout(timeout);
    };
    observer.observe(content, { childList: true, subtree: true });
    return true;
  }

  return { contentRef, handleInitialFocus };
}
