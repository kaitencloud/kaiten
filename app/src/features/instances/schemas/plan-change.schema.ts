import type { z } from 'zod';
import type { PlanChangeTarget } from '@/api-client';
import { zPlanChangeTarget } from '@/api-client/zod.gen';

const TARGET_ERROR_KEY =
  'Pages.Customers.Instances.Detail.Billing.PlanChange.Errors.target';

/** What the plan change dialog edits: the price the subscription moves to. */
export const planChangeFormSchema = zPlanChangeTarget.extend({
  licensePriceId: zPlanChangeTarget.shape.licensePriceId.min(
    1,
    TARGET_ERROR_KEY,
  ),
});

export type PlanChangeFormValues = z.infer<typeof planChangeFormSchema>;

export const initialPlanChangeFormValues: PlanChangeFormValues = {
  licensePriceId: '',
};

export const planChangeValuesToBody = (
  values: PlanChangeFormValues,
): PlanChangeTarget => ({ licensePriceId: values.licensePriceId });

/**
 * Where a refusal of the API is shown on the form. Each of these says the plan
 * itself cannot be chosen, and the API names the field in prose, so the code
 * says which it is. The refusals about the state of the subscription (a trial, a
 * cancellation, a closing period) are not about the plan and stay above the
 * buttons.
 */
export const PLAN_CHANGE_REFUSAL_FIELDS = {
  byCode: {
    'SchedulePlanChange.CurrencyMismatch': 'licensePriceId',
    'SchedulePlanChange.LicenseNotPublished': 'licensePriceId',
    'SchedulePlanChange.PriceDeprecated': 'licensePriceId',
    'SchedulePlanChange.PriceNotFlatFee': 'licensePriceId',
    'SchedulePlanChange.PriceNotFound': 'licensePriceId',
    'SchedulePlanChange.SamePrice': 'licensePriceId',
  },
  byLocation: { licensePriceId: 'licensePriceId' },
} as const;
