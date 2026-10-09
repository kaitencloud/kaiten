import { useStore } from '@tanstack/react-form';
import { useTranslation } from 'react-i18next';
import { ChoiceButton } from '@/components/choice-button';
import {
  getVoucherTypeLabelKey,
  VOUCHER_TYPES,
  type VoucherType,
} from '@/domains/billing';
import { withForm } from '@/hooks/form';
import { voucherFormOpts } from '../../schemas';
import { LATER_VOUCHER_TYPES } from '../../utils/voucher-labels';

const TYPE_DETAIL_KEYS = {
  ENTITLEMENT_BOOST: 'Pages.Vouchers.Wizard.Type.Detail.ENTITLEMENT_BOOST',
  PRICE: 'Pages.Vouchers.Wizard.Type.Detail.PRICE',
} as const satisfies Record<VoucherType, string>;

const LATER_TYPE_LABEL_KEYS = {
  COMPOSITE: 'Pages.Vouchers.Wizard.Type.COMPOSITE',
  FLAG_GRANT: 'Pages.Vouchers.Wizard.Type.FLAG_GRANT',
} as const satisfies Record<(typeof LATER_VOUCHER_TYPES)[number], string>;

/**
 * The first step: what the voucher is called and what it is. Two kinds exist in this
 * release, a discount on the invoices and a boost of an entitlement; the two that come
 * later are shown, and say so, rather than left out. What the other kind had filled in
 * is kept in the form and never sent, so that switching back restores it.
 */
export const TypeStep = withForm({
  ...voucherFormOpts,
  render: function TypeStepRender({ form }) {
    const { t } = useTranslation();
    const selected = useStore(form.store, (state) => state.values.voucherType);

    function renderType(type: VoucherType) {
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

    function renderLaterType(type: (typeof LATER_VOUCHER_TYPES)[number]) {
      return (
        <ChoiceButton
          detail={t('Pages.Vouchers.Wizard.Type.later')}
          disabled
          key={type}
          label={t(LATER_TYPE_LABEL_KEYS[type])}
          onSelect={() => undefined}
          selected={false}
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
            {LATER_VOUCHER_TYPES.map(renderLaterType)}
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
