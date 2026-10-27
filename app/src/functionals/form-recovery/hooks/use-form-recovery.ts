import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { getSessionIdentity } from '@/lib/session-identity';
import { selectNotices, selectOffer } from '../logic/selectors';
import { createFormRecoverySession } from '../store/form-recovery-session';
import type { SessionToast } from '../store/session-context';
import type { FormRecovery, FormRecoveryDescriptor } from '../types';
import { useStore } from '@tanstack/react-store';
import type { i18n as I18n } from 'i18next';

/** The mark of the "Resume" button, for the initial focus of a dialog. */
export const RESUME_BUTTON_ATTRIBUTE = 'data-form-recovery-resume';

function focusOffer(): HTMLElement | boolean {
  return (
    document.querySelector<HTMLElement>(`[${RESUME_BUTTON_ATTRIBUTE}]`) ?? true
  );
}

/** How long a toast offers to undo a deliberate discard. */
const UNDO_TOAST_MS = 8_000;

export type UseFormRecoveryOptions<TValues> = {
  /** False on an edit form, or to finish a server draft: nothing is read or written. */
  enabled: boolean;
  /** What changes the meaning of the created object; '' by default. Never a secret. */
  context?: string;
  /** The real initial values, context prefill included. Frozen at mount. */
  pristine: TValues;
  /** The steps of the form when they vary; else those of the descriptor. */
  steps?: readonly string[];
};

function showUndoToast(i18n: I18n, kind: SessionToast, undo?: () => void) {
  const message =
    kind === 'discarded'
      ? i18n.t('Functionals.FormRecovery.toast.discarded')
      : kind === 'cancelled'
        ? i18n.t('Functionals.FormRecovery.toast.cancelled')
        : i18n.t('Functionals.FormRecovery.toast.replaced');

  toast(message, {
    duration: UNDO_TOAST_MS,
    action: undo
      ? { label: i18n.t('Functionals.FormRecovery.toast.undo'), onClick: undo }
      : undefined,
  });
}

/**
 * The door of the recovery of a creation form, mounted outside the subtree of
 * the form. It freezes at mount who is signed in, the scope and the initial
 * values: a `pristine` recomputed on every render from data that reloads would
 * move the reference during the visit, and an input could then be written or
 * dropped without the person doing anything.
 *
 * The subtree of the form gets `sessionKey` as its `key`: restoring is mounting
 * it again, so that what it derives is born consistent.
 */
export function useFormRecovery<
  TValues extends object,
  TRefs = void,
  TExtra = never,
>(
  descriptor: FormRecoveryDescriptor<TValues, TRefs, TExtra>,
  options: UseFormRecoveryOptions<TValues>,
): FormRecovery<TValues, TExtra> {
  const { i18n } = useTranslation();
  const [pristine] = useState(() => options.pristine);
  const [session] = useState(() =>
    createFormRecoverySession({
      descriptor,
      enabled: options.enabled,
      identity: options.enabled ? getSessionIdentity() : null,
      context: options.context ?? '',
      pristine,
      steps: options.steps ?? descriptor.steps ?? [],
      notify: (kind, undo) => showUndoToast(i18n, kind, undo),
    }),
  );

  useEffect(() => {
    session.start();
    return () => session.dispose();
  }, [session]);

  const state = useStore(session.store, (snapshot) => snapshot);
  const steps = options.steps ?? descriptor.steps ?? [];
  const stepKey = steps.join('|');

  return useMemo(() => {
    const { actions } = session;
    const info = {
      version: descriptor.version,
      steps,
      stepFields: descriptor.stepFields,
    };

    return {
      writer: state.writer,
      persistent: state.persistent && state.writer.status !== 'disabled',
      offer: selectOffer(state, info),
      notices: selectNotices(state),
      notes: state.notes,
      sessionKey: String(state.generation),
      pristine,
      restored: state.restored,
      focusOffer,
      resume: actions.resume,
      startOver: actions.startOver,
      showOther: actions.showOther,
      restoreSetAside: actions.restoreSetAside,
      keepHere: actions.keepHere,
      dismiss: actions.dismiss,
      send: actions.send,
      begin: actions.begin,
      complete: actions.complete,
      discard: actions.discard,
      restart: actions.restart,
      internals: {
        descriptor,
        steps,
        epoch: actions.getEpoch,
        sendStarted: actions.sendStarted,
        focusToken: state.focusToken,
        track: actions.track,
        flushOnUnmount: actions.flushOnUnmount,
        addNotes: actions.addNotes,
        clearOmitted: actions.clearOmitted,
      },
    } as FormRecovery<TValues, TExtra>;
  }, [session, state, pristine, descriptor, stepKey]);
}
