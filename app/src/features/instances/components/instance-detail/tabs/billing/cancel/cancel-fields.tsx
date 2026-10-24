import { useTranslation } from 'react-i18next';
import type { InstanceBilling } from '@/api-client';
import { formatBoundary } from '@/domains/billing';
import { withForm } from '@/hooks/form';
import { getProposedEndDate } from '../../../../../utils/cancellation.utils';
import { CancelExplanation } from './cancel-explanation';
import { CancelReasonField } from './cancel-reason-field';
import {
  CancelFollowUpFields,
  type CancelAddonsState,
} from './cancel-follow-up-fields';
import { cancelFormOpts } from '../../../../../schemas/cancel-form-options';

type CancelFieldsProps = {
  addons: CancelAddonsState;
  endLicenseDate: string | undefined;
  mayRemoveAddons: boolean;
  maySetEndDate: boolean;
  subscription: Pick<
    InstanceBilling,
    'cancelAtPeriodEnd' | 'currentPeriodEnd' | 'scheduledChange' | 'status'
  >;
};

const MODES = ['AT_PERIOD_END', 'IMMEDIATE'] as const;

/**
 * What the cancel dialog asks: when the subscription ends (a trial has no
 * choice, it ends at once), what that does, why, and what else to do beside it.
 */
export const CancelFields = withForm({
  ...cancelFormOpts,
  props: {} as CancelFieldsProps,
  render: function CancelFieldsRender({
    addons,
    endLicenseDate,
    form,
    mayRemoveAddons,
    maySetEndDate,
    subscription,
  }) {
    const { i18n, t } = useTranslation();
    const isTrial = subscription.status === 'TRIAL';

    return (
      <div className="space-y-5">
        {isTrial ? null : (
          <form.AppField
            listeners={{
              // A date the person has not touched follows the way it ends.
              onChange: ({ value }) => {
                if (!form.getFieldMeta('endDate')?.isDirty) {
                  // Not a change the person made: it leaves the field as it was.
                  form.setFieldValue(
                    'endDate',
                    getProposedEndDate(subscription, value),
                    { dontUpdateMeta: true },
                  );
                }
              },
            }}
            name="mode"
          >
            {(field) => (
              <field.SelectField
                getOptionLabel={(mode) =>
                  mode === 'IMMEDIATE'
                    ? t(
                        'Pages.Customers.Instances.Detail.Billing.Cancel.Mode.IMMEDIATE',
                      )
                    : t(
                        'Pages.Customers.Instances.Detail.Billing.Cancel.Mode.AT_PERIOD_END',
                        {
                          date: formatBoundary(
                            subscription.currentPeriodEnd,
                            i18n.language,
                          ),
                        },
                      )
                }
                label={t(
                  'Pages.Customers.Instances.Detail.Billing.Cancel.Fields.mode',
                )}
                options={[...MODES]}
                required
              />
            )}
          </form.AppField>
        )}
        <form.Subscribe selector={(state) => state.values.mode}>
          {(mode) => (
            <CancelExplanation mode={mode} subscription={subscription} />
          )}
        </form.Subscribe>
        <CancelReasonField form={form} />
        <CancelFollowUpFields
          addons={addons}
          endLicenseDate={endLicenseDate}
          form={form}
          mayRemoveAddons={mayRemoveAddons}
          maySetEndDate={maySetEndDate}
        />
      </div>
    );
  },
});
