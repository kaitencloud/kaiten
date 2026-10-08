import { useTranslation } from 'react-i18next';
import type { InstanceBilling } from '@/api-client';
import { withForm } from '@/hooks/form';
import { planChangeFormOpts } from '../../../../../schemas/plan-change-form-options';
import {
  getPlanTargetBlock,
  type PlanTarget,
} from '../../../../../utils/plan-change.utils';
import { useDescribePlan } from './use-describe-plan';

type PlanChangeFieldsProps = {
  subscription: Pick<InstanceBilling, 'currency'>;
  targets: readonly PlanTarget[];
};

/**
 * The plan to move to, from the active flat fees of the versions on sale. A plan in
 * another currency stays in the list and cannot be chosen, and says why: the
 * invoice of the boundary bills the old plan and the new one together, in one
 * currency.
 */
export const PlanChangeFields = withForm({
  ...planChangeFormOpts,
  props: {} as PlanChangeFieldsProps,
  render: function PlanChangeFieldsRender({ form, subscription, targets }) {
    const { t } = useTranslation();
    const describe = useDescribePlan();
    const labelOf = (option: unknown) => {
      const target = option as PlanTarget;
      const plan = describe(target.price, target.license);
      const label = t(
        'Pages.Customers.Instances.Detail.Billing.PlanChange.option',
        {
          amount: plan.amount,
          price: plan.price,
          timing: plan.timing,
          version: plan.version,
        },
      );

      return getPlanTargetBlock(target, subscription) === 'currency'
        ? t(
            'Pages.Customers.Instances.Detail.Billing.PlanChange.optionBlocked',
            {
              currency: target.price.currency,
              label,
            },
          )
        : label;
    };

    return (
      <form.AppField name="licensePriceId">
        {(field) => (
          <field.SelectField
            description={t(
              'Pages.Customers.Instances.Detail.Billing.PlanChange.targetHint',
            )}
            getOptionLabel={labelOf}
            getOptionValue={(option) => (option as PlanTarget).price.id}
            isOptionDisabled={(option) =>
              getPlanTargetBlock(option as PlanTarget, subscription) !==
              undefined
            }
            label={t(
              'Pages.Customers.Instances.Detail.Billing.PlanChange.target',
            )}
            options={[...targets]}
            placeholder={t(
              'Pages.Customers.Instances.Detail.Billing.PlanChange.targetPlaceholder',
            )}
            required
          />
        )}
      </form.AppField>
    );
  },
});
