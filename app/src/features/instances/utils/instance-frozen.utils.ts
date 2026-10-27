import type { Instance } from '@/api-client';
import { getProblem } from '@/domains/billing';

/**
 * The refusal of the update of an instance that bills (409): while its
 * subscription lives, its customer and its license cannot change, since an
 * invoice is for one customer and one license version.
 */
export const INSTANCE_FROZEN_CODE = 'UpdateInstance.BillingActive';

/** The fields of the form the API freezes. */
export type FrozenField = 'customerId' | 'licenseSlug';

/** The step of the form each frozen field is on: the details, then the license. */
export const FROZEN_FIELD_STEPS = {
  customerId: 0,
  licenseSlug: 1,
} as const satisfies Record<FrozenField, number>;

/**
 * The frozen fields the person changed. The API says only that the customer or the
 * license may not change, and not which, so the form works it out from what it
 * opened with: those are the fields to mark.
 */
export function getChangedFrozenFields(
  values: Pick<Record<FrozenField, string>, FrozenField>,
  instance: Pick<Instance, 'customerId' | 'licenseSlug'>,
): FrozenField[] {
  const changed: FrozenField[] = [];
  if (values.customerId !== instance.customerId) {
    changed.push('customerId');
  }
  if (values.licenseSlug !== instance.licenseSlug) {
    changed.push('licenseSlug');
  }

  return changed;
}

/**
 * Whether a failure is that refusal, and the explanation the API gave, to show as
 * it wrote it. Any other failure is read as nothing, and keeps its message.
 */
export function readFrozenRefusal(
  error: unknown,
): { detail: string } | undefined {
  const problem = getProblem(error);

  return problem?.code === INSTANCE_FROZEN_CODE
    ? { detail: problem.detail || problem.title || INSTANCE_FROZEN_CODE }
    : undefined;
}
