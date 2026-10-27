import { useStore } from '@tanstack/react-form';
import { useTranslation } from 'react-i18next';
import { ChoiceButton } from '@/components/choice-button';
import { getVoucherTypeLabelKey, VOUCHER_TYPES } from '@/domains/billing';
import { withForm } from '@/hooks/form';
import { voucherFormOpts } from '../../schemas';

const TYPE_DETAIL_KEYS = {
  ENTITLEMENT_BOOST: 'Pages.Vouchers.Wizard.Type.Detail.ENTITLEMENT_BOOST',
  PRICE: 'Pages.Vouchers.Wizard.Type.Detail.PRICE',
  FLAG_GRANT: 'Pages.Vouchers.Extensions.flagDetail',
  COMPOSITE: 'Pages.Vouchers.Extensions.compositeDetail',
} as const satisfies Record<(typeof VOUCHER_TYPES)[number], string>;

/** The four contract types. Switching type keeps the other families as unsent input. */
export const TypeStep = withForm({
  ...voucherFormOpts,
  render: function TypeStepRender({ form }) {
    const { t } = useTranslation();
    const selected = useStore(form.store, (state) => state.values.voucherType);

    function renderType(type: (typeof VOUCHER_TYPES)[number]) {
      return (
        <ChoiceButton
          detail={t(TYPE_DETAIL_KEYS[type])}
          key={type}
          label={t(getVoucherTypeLabelKey(type))}
          onSelect={() => form.setFieldValue('voucherType', type)}
          selected={selected === type}
        />
      );
    }

    return (
      <div className="space-y-6">
        <div
          aria-label={t('Pages.Vouchers.Wizard.Type.label')}
          className="space-y-2"
          role="group"
        >
          <p className="text-sm font-medium">
            {t('Pages.Vouchers.Wizard.Type.label')}
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {VOUCHER_TYPES.map(renderType)}
          </div>
        </div>
        <form.AppField name="name">
          {(field) => (
            <field.TextField
              description={t('Pages.Vouchers.Wizard.Descriptions.name')}
              label={t('Pages.Vouchers.Wizard.Labels.name')}
              placeholder={t('Pages.Vouchers.Wizard.Placeholders.name')}
              required
            />
          )}
        </form.AppField>
        <form.AppField name="description">
          {(field) => (
            <field.TextAreaField
              description={t('Pages.Vouchers.Wizard.Descriptions.description')}
              label={t('Pages.Vouchers.Wizard.Labels.description')}
            />
          )}
        </form.AppField>
      </div>
    );
  },
});
