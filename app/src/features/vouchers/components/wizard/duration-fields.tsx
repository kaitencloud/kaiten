import { useStore } from '@tanstack/react-form';
import { useTranslation } from 'react-i18next';
import { withForm } from '@/hooks/form';
import { voucherFormOpts } from '../../schemas';
import {
  DURATION_BLURB_KEYS,
  DURATION_LABEL_KEYS,
  VOUCHER_DURATIONS,
} from '../../utils/voucher-labels';

/**
 * How long an offer lasts. The unit a duration counts is part of the question, and it
 * differs by kind: a discount counts invoices, a boost counts billing periods, which
 * diverge once an instance changes plan, so the explanation under the field names the
 * one in force. The number is asked for only when the offer repeats.
 */
export const DurationFields = withForm({
  ...voucherFormOpts,
  render: function DurationFieldsRender({ form }) {
    const { t } = useTranslation();
    const duration = useStore(form.store, (state) => state.values.duration);
    const voucherType = useStore(
      form.store,
      (state) => state.values.voucherType,
    );
    const countsInvoices = voucherType === 'PRICE';

    return (
      <div className="grid gap-4 sm:grid-cols-2">
        <form.AppField name="duration">
          {(field) => (
            <field.SelectField
              description={t(DURATION_BLURB_KEYS[voucherType][duration])}
              getOptionLabel={(option) =>
                t(DURATION_LABEL_KEYS[option as typeof duration])
              }
              label={t('Pages.Vouchers.Wizard.Labels.duration')}
              options={[...VOUCHER_DURATIONS]}
              required
            />
          )}
        </form.AppField>
        {duration === 'REPEATING' ? (
          <form.AppField name="durationInPeriods">
            {(field) => (
              <field.NumberField
                description={t(
                  countsInvoices
                    ? 'Pages.Vouchers.Wizard.Descriptions.durationInInvoices'
                    : 'Pages.Vouchers.Wizard.Descriptions.durationInPeriods',
                )}
                label={t(
                  countsInvoices
                    ? 'Pages.Vouchers.Wizard.Labels.durationInInvoices'
                    : 'Pages.Vouchers.Wizard.Labels.durationInPeriods',
                )}
                min={1}
                required
                step={1}
              />
            )}
          </form.AppField>
        ) : null}
      </div>
    );
  },
});
