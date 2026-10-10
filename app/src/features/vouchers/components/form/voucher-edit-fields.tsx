import { useTranslation } from 'react-i18next';
import type { Voucher } from '@/api-client';
import { withForm } from '@/hooks/form';
import { voucherEditFormOpts } from '../../schemas';

type VoucherEditFieldsProps = {
  voucher: Pick<Voucher, 'redemptionsCount'>;
};

/** The four things a published voucher lets change: its name, its description, when it ends and how many times it can be redeemed. */
export const VoucherEditFields = withForm({
  ...voucherEditFormOpts,
  props: {} as VoucherEditFieldsProps,
  render: function VoucherEditFieldsRender({ form, voucher }) {
    const { t } = useTranslation();

    return (
      <div className="space-y-5">
        <form.AppField name="name">
          {(field) => (
            <field.TextField
              label={t('Pages.Vouchers.Wizard.Labels.name')}
              required
            />
          )}
        </form.AppField>
        <form.AppField name="description">
          {(field) => (
            <field.TextAreaField
              label={t('Pages.Vouchers.Wizard.Labels.description')}
            />
          )}
        </form.AppField>
        <form.AppField name="expiresAt">
          {(field) => (
            <field.DateTimeField
              description={t('Pages.Vouchers.Edit.Descriptions.expiresAt')}
              label={t('Pages.Vouchers.Wizard.Labels.expiresAt')}
            />
          )}
        </form.AppField>
        <form.AppField name="maxRedemptions">
          {(field) => (
            <field.NumberField
              description={t(
                'Pages.Vouchers.Edit.Descriptions.maxRedemptions',
                {
                  count: voucher.redemptionsCount,
                },
              )}
              label={t('Pages.Vouchers.Wizard.Labels.maxRedemptions')}
              min={1}
              step={1}
            />
          )}
        </form.AppField>
      </div>
    );
  },
});
