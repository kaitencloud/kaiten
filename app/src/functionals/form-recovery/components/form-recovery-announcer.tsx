import type { FormRecovery } from '../types';
import { useRecoveryText } from './use-recovery-text';

export type FormRecoveryAnnouncerProps = {
  recovery: FormRecovery<any, any>;
  /** Labels of the steps, in order. */
  stepLabels?: readonly string[];
};

/**
 * A live region for screen readers, mounted next to the subtree that is
 * mounted again: it is there before the change, which a region mounted with
 * the new subtree would not be reliably announced for. Says "Entries restored,
 * step 3 of 4 (Eligibility)" after "Resume".
 */
export function FormRecoveryAnnouncer({
  recovery,
  stepLabels,
}: FormRecoveryAnnouncerProps) {
  const { t } = useRecoveryText();
  const { restored } = recovery;
  const total = recovery.internals.steps.length;

  let message = '';
  if (recovery.persistent && restored) {
    message =
      total > 0
        ? t('Functionals.FormRecovery.announce.resumedAtStep', {
            current: restored.stepIndex + 1,
            total,
            step: stepLabels?.[restored.stepIndex] ?? restored.stepIndex + 1,
          })
        : t('Functionals.FormRecovery.announce.resumed');
  }

  return (
    <div role="status" aria-live="polite" className="sr-only">
      {message}
    </div>
  );
}
