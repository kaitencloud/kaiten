import type { FormRecovery } from '../types';
import { useRecoveryText } from './use-recovery-text';

export type FormRecoveryAnnouncerProps = {
  recovery: FormRecovery<any, any>;
  /** Labels of the steps, in order. */
  stepLabels?: readonly string[];
};

/**
 * The live regions for screen readers, mounted next to the subtree that is
 * mounted again: they are there before the change, which a region mounted with
 * its text would not be reliably announced for. The polite one says "Entries
 * restored, step 3 of 4 (Eligibility)" after "Resume". The assertive one says
 * what stops a duplicate: that the last submission may have gone through, or
 * that these entries were sent from another tab. The visible warnings stay
 * where they are, for whoever reads the page.
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

  const warning = !recovery.persistent
    ? ''
    : recovery.notices.some((notice) => notice.kind === 'unknownOutcome')
      ? t('Functionals.FormRecovery.announce.unknownOutcome')
      : recovery.notices.some((notice) => notice.kind === 'sentElsewhere')
        ? t('Functionals.FormRecovery.announce.sentElsewhere')
        : '';

  return (
    <>
      <div role="status" aria-live="polite" className="sr-only">
        {message}
      </div>
      <div
        role="status"
        aria-live="assertive"
        aria-atomic="true"
        className="sr-only"
      >
        {warning}
      </div>
    </>
  );
}
