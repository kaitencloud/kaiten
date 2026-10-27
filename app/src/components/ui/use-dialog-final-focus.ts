import { useRef } from 'react';
import { captureOpener, keepFocusAfterClose, type Opener } from '@/lib/dialog-opener';

type FinalFocus =
  | boolean
  | { current: HTMLElement | null }
  | ((closeType: '' | 'mouse' | 'touch' | 'pen' | 'keyboard') => boolean | HTMLElement | null | void);

/**
 * The `finalFocus` of a dialog: what the caller asked for, or the dialog's own return of the
 * focus, kept from being lost (see `keepFocusAfterClose` in `lib/dialog-opener`).
 * `rememberOpener` is called when the dialog opens, before the focus moves into it: what holds
 * the focus then, or the control the person used last, is what opened it.
 */
export function useDialogFinalFocus(finalFocus?: FinalFocus) {
  const opener = useRef<Opener | null>(null);

  return {
    finalFocus:
      finalFocus ??
      (() => {
        keepFocusAfterClose(opener.current);

        return true;
      }),
    rememberOpener: () => {
      opener.current = captureOpener();
    },
  };
}
