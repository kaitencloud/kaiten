import { useState } from 'react';
import type { AddonEntitlement } from '@/api-client';
import { handleBillingProblem, setProblemFieldError } from '@/domains/billing';
import { useAppForm } from '@/hooks/form';
import {
  grantFormValuesToAssignBody,
  grantFormValuesToUpdateBody,
  grantToFormValues,
  initialAddonGrantFormValues,
} from '../schemas';
import { addonGrantFormOpts } from '../schemas/addon-grant-form-options';
import { getAddonFreezeReason } from '../utils/addon-freeze.utils';
import { useAddonGrantMutations } from './use-addon-grant-mutations';

// The refusals of the API that are about one field of the form, by their code: the
// API names the field in prose, in `detail`, and does not locate it. Each is shown on
// its field, which is where the person is looking.
const FIELD_BY_CODE: Record<
  string,
  'entitlementSlug' | 'numberValue' | 'overagePercent'
> = {
  'AssignAddonEntitlement.AlreadyAssigned': 'entitlementSlug',
  'AssignAddonEntitlement.EntitlementNotFound': 'entitlementSlug',
  'AssignAddonEntitlement.InvalidLimitCapExceededOveragePercent':
    'overagePercent',
  'AssignAddonEntitlement.InvalidValue': 'numberValue',
  'UpdateAddonEntitlement.InvalidLimitCapExceededOveragePercent':
    'overagePercent',
  'UpdateAddonEntitlement.InvalidValue': 'numberValue',
};

type UseAddonGrantFormOptions = {
  addonSlug: string;
  /** The grant being edited; a new one when left out. */
  grant?: AddonEntitlement;
  /**
   * Called when the API refuses because the version cannot be changed where it is
   * (an instance with a live subscription holds it), with what it refused with: there
   * is nothing to correct in the form, and a new version is the way.
   */
  onFrozen: (error: unknown) => void;
  /** Called once the API accepted the grant. */
  onDone: () => void;
};

/**
 * The form of a grant, new or edited. It sends what the API takes -- the value of the
 * kind the entitlement is, how a number combines with the license's, and the overage
 * it allows, left out to inherit the license's -- and shows what the API refuses with:
 * the refusal about a field on that field, a version that can no longer be changed as
 * the way to a new one, anything else above the buttons, with the form left as it was
 * typed.
 */
export function useAddonGrantForm({
  addonSlug,
  grant,
  onDone,
  onFrozen,
}: UseAddonGrantFormOptions) {
  const { assign, update } = useAddonGrantMutations(addonSlug);
  const [failure, setFailure] = useState<unknown>(null);

  const form = useAppForm({
    ...addonGrantFormOpts,
    defaultValues: grant
      ? grantToFormValues(grant)
      : initialAddonGrantFormValues(),
    onSubmit: async ({ formApi, value }) => {
      setFailure(null);
      try {
        if (grant) {
          await update.mutateAsync({
            body: grantFormValuesToUpdateBody(value),
            path: { addonSlug, entitlementSlug: grant.entitlementSlug },
          });
        } else {
          await assign.mutateAsync({
            body: grantFormValuesToAssignBody(value),
            path: { addonSlug },
          });
        }
        onDone();
      } catch (error) {
        const problem = handleBillingProblem(error);
        if (getAddonFreezeReason(problem.code)) {
          onFrozen(error);

          return;
        }
        const field = FIELD_BY_CODE[problem.code ?? ''];
        if (field && problem.detail) {
          setProblemFieldError(formApi, field, problem.detail);

          return;
        }
        setFailure(error);
      }
    },
  });

  return { failure, form, isEditing: grant !== undefined };
}
