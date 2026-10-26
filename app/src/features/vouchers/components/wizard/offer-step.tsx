import { useStore } from '@tanstack/react-form';
import { useTranslation } from 'react-i18next';
import { FlagGrantsPanel } from './flag-grants-panel';
import { withForm } from '@/hooks/form';
import type { VoucherReferences } from '../../hooks/use-voucher-references';
import { voucherFormOpts } from '../../schemas';
import { BoostPanel } from './boost-panel';
import { DiscountPanel } from './discount-panel';
import { DurationFields } from './duration-fields';

type OfferStepProps = {
  references: VoucherReferences;
};

/**
 * The second step: the offer itself. A discount asks how it is worked out and what it
 * applies to, a boost which entitlements it changes and how, and both ask how long it
 * lasts.
 */
export const OfferStep = withForm({
  ...voucherFormOpts,
  props: {} as OfferStepProps,
  render: function OfferStepRender({ form, references }) {
    const { t } = useTranslation();
    const parts = useStore(form.store, (state) => state.values);
    const voucherType = useStore(
      form.store,
      (state) => state.values.voucherType,
    );

    return (
      <div className="space-y-6">
        {voucherType === 'COMPOSITE' && (
          <div className="space-y-3">
            <p>{t('Pages.Vouchers.Extensions.compositeRequired')}</p>
            <form.AppField name="hasPrice">
              {(field) => (
                <field.CheckboxField
                  label={t('Features.Billing.VoucherType.PRICE')}
                />
              )}
            </form.AppField>
            <form.AppField name="hasBoost">
              {(field) => (
                <field.CheckboxField
                  label={t('Features.Billing.VoucherType.ENTITLEMENT_BOOST')}
                />
              )}
            </form.AppField>
            <form.AppField name="hasFlags">
              {(field) => (
                <field.CheckboxField
                  label={t('Features.Billing.VoucherType.FLAG_GRANT')}
                />
              )}
            </form.AppField>
          </div>
        )}
        {(voucherType === 'ENTITLEMENT_BOOST' ||
          (voucherType === 'COMPOSITE' && parts.hasBoost)) && (
          <BoostPanel
            entitlements={references.entitlements}
            form={form}
            licenses={references.licenses}
          />
        )}
        {(voucherType === 'PRICE' ||
          (voucherType === 'COMPOSITE' && parts.hasPrice)) && (
          <DiscountPanel form={form} prices={references.prices} />
        )}
        {(voucherType === 'FLAG_GRANT' ||
          (voucherType === 'COMPOSITE' && parts.hasFlags)) && (
          <FlagGrantsPanel form={form} flags={references.flags} />
        )}
        <DurationFields form={form} />
      </div>
    );
  },
});
