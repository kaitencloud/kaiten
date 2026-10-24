import { Link } from '@tanstack/react-router';
import { createContext, use, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  type FormRecovery,
  FormRecoveryAlert,
  type FormRecoveryFormApi,
  FormRecoveryNotes,
  FormRecoverySubmitWarning,
  useFormRecoveryForm,
} from '@/functionals/form-recovery';
import type { MetadataFieldDescriptor } from '@/functionals/metadata-fields';
import {
  useStepStackContext,
  useStepStackStepState,
} from '@/functionals/step-stack';
import type { InstanceFormValues } from '../../utils/instance-form.shared';
import {
  INSTANCE_RECOVERY_STEP_LABEL_KEYS,
  type InstanceRecoveryReferences,
} from './instance-recovery';

/** The recovery of a creation, for the cards of the stack; null on an edit. */
const InstanceRecoveryContext =
  createContext<FormRecovery<InstanceFormValues> | null>(null);

export const InstanceRecoveryProvider = InstanceRecoveryContext.Provider;

/**
 * The adapter between the form and its recovery, inside the stack: it reads the step
 * the stack shows, and the furthest one reached, and hands today's metadata fields to
 * the recovery, which keeps out a value whose field is a secret.
 */
export function InstanceFormRecovery({
  form,
  metadataFields,
  recovery,
}: {
  form: FormRecoveryFormApi<InstanceFormValues>;
  metadataFields: readonly MetadataFieldDescriptor[] | undefined;
  recovery: FormRecovery<InstanceFormValues>;
}) {
  const { activeIndex } = useStepStackContext();
  const [furthest, setFurthest] = useState(
    recovery.restored?.furthestIndex ?? activeIndex,
  );
  // Adjusted while rendering, not in an effect: the step reached is known now.
  if (activeIndex > furthest) {
    setFurthest(activeIndex);
  }
  useFormRecoveryForm<InstanceFormValues, InstanceRecoveryReferences>(
    recovery,
    form,
    {
      furthestIndex: Math.max(furthest, activeIndex),
      references: metadataFields === undefined ? {} : { metadataFields },
      stepIndex: activeIndex,
    },
  );

  return null;
}

function InstanceListLink() {
  const { t } = useTranslation();

  return (
    <Button
      nativeButton={false}
      render={<Link to="/customers/instances" />}
      size="sm"
      variant="outline"
    >
      {t('Common.viewList')}
    </Button>
  );
}

/**
 * The offer, the notes of a restore and the warning of a send that may have gone
 * through, in the card the stack shows: the cards behind it are drawn faded, so what
 * the person must read is in the active one only.
 */
export function InstanceRecoveryNotices() {
  const { t } = useTranslation();
  const recovery = use(InstanceRecoveryContext);
  const { isActive } = useStepStackStepState();

  if (!recovery || !isActive) {
    return null;
  }

  return (
    <div className="space-y-4">
      <FormRecoveryAlert
        recovery={recovery}
        stepLabels={INSTANCE_RECOVERY_STEP_LABEL_KEYS.map((key) => t(key))}
      >
        <InstanceListLink />
      </FormRecoveryAlert>
      <FormRecoveryNotes recovery={recovery} />
      <FormRecoverySubmitWarning recovery={recovery}>
        <InstanceListLink />
      </FormRecoverySubmitWarning>
    </div>
  );
}
