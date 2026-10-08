import { describe, expect, it } from 'vite-plus/test';
import {
  initialPlanChangeFormValues,
  PLAN_CHANGE_REFUSAL_FIELDS,
  planChangeFormSchema,
  planChangeValuesToBody,
} from '../plan-change.schema';

describe('what the plan change dialog opens with', () => {
  it('has no plan chosen, and does not let one go without a plan', () => {
    expect(initialPlanChangeFormValues).toEqual({ licensePriceId: '' });

    const result = planChangeFormSchema.safeParse(initialPlanChangeFormValues);

    expect(result.success).toBe(false);
    expect(result.success ? [] : result.error.issues.map(({ message }) => message)).toEqual([
      'Pages.Customers.Instances.Detail.Billing.PlanChange.Errors.target',
    ]);
  });

  it('goes with a plan', () => {
    expect(planChangeFormSchema.safeParse({ licensePriceId: 'price-business' }).success).toBe(
      true,
    );
  });
});

describe('the body of a plan change', () => {
  it('names the price the subscription moves to, and nothing else', () => {
    expect(planChangeValuesToBody({ licensePriceId: 'price-business' })).toEqual({
      licensePriceId: 'price-business',
    });
  });
});

describe('where a refusal of the plan change is shown', () => {
  it('puts the refusals about the plan on the plan, and leaves the ones about the subscription above the buttons', () => {
    expect(Object.keys(PLAN_CHANGE_REFUSAL_FIELDS.byCode).sort()).toEqual([
      'SchedulePlanChange.CurrencyMismatch',
      'SchedulePlanChange.LicenseNotPublished',
      'SchedulePlanChange.PriceDeprecated',
      'SchedulePlanChange.PriceNotFlatFee',
      'SchedulePlanChange.PriceNotFound',
      'SchedulePlanChange.SamePrice',
    ]);
    for (const left of [
      'SchedulePlanChange.TrialInProgress',
      'SchedulePlanChange.CancellationScheduled',
      'SchedulePlanChange.AddonIncompatible',
    ]) {
      expect(PLAN_CHANGE_REFUSAL_FIELDS.byCode).not.toHaveProperty(left);
    }
  });

  it('puts a refusal the API locates on the plan on the plan', () => {
    expect(PLAN_CHANGE_REFUSAL_FIELDS.byLocation).toEqual({ licensePriceId: 'licensePriceId' });
  });
});
