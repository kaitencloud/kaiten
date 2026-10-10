import { Link } from '@tanstack/react-router';
import { type Ref, useImperativeHandle } from 'react';
import { useTranslation } from 'react-i18next';
import { useStepStack } from '@/functionals/step-stack';
import {
  type FrozenField,
  INSTANCE_FROZEN_CODE,
} from '../../utils/instance-frozen.utils';

/** What the form can ask of its step stack from outside it. */
export type InstanceFormStepsHandle = { goToStep: (index: number) => void };

/**
 * Hands the step stack to the form around it, which is outside the stack: a
 * refusal that comes back on submit has to take the person to the step whose
 * field it is about, and the submit is on the last one.
 */
export function InstanceFormStepsBridge({
  handleRef,
}: {
  handleRef: Ref<InstanceFormStepsHandle>;
}) {
  const { goToStep } = useStepStack();
  useImperativeHandle(handleRef, () => ({ goToStep }), [goToStep]);

  return null;
}

type FrozenFieldNoticeProps = {
  field: FrozenField;
  form: any;
  instanceSlug: string;
};

/**
 * Under a field the API froze, once it refused the change: where to go about it.
 * The refusal itself is the field's error, in the API's words; this adds the way
 * to the subscription, which is what has to end before the field can change. It
 * reads the error of the field, so it goes with it when the person changes the
 * field again.
 */
export function FrozenFieldNotice({
  field,
  form,
  instanceSlug,
}: FrozenFieldNoticeProps) {
  const { t } = useTranslation();

  return (
    <form.Subscribe
      selector={(state: any) =>
        state.fieldMeta[field]?.errorMap?.onServer?.code
      }
    >
      {(code: string | undefined) =>
        code === INSTANCE_FROZEN_CODE ? (
          <p className="text-sm" data-testid={`frozen-${field}`}>
            <Link
              className="underline underline-offset-4"
              params={{ instanceSlug }}
              to="/customers/instances/$instanceSlug/billing"
            >
              {t(
                'Pages.Customers.Instances.Mutation.Form.Frozen.openSubscription',
              )}
            </Link>
          </p>
        ) : null
      }
    </form.Subscribe>
  );
}
