import { useStore } from '@tanstack/react-form';
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
    const voucherType = useStore(
      form.store,
      (state) => state.values.voucherType,
    );

    return (
      <div className="space-y-6">
        {voucherType === 'ENTITLEMENT_BOOST' ? (
          <BoostPanel entitlements={references.entitlements} form={form} />
        ) : (
          <DiscountPanel form={form} prices={references.prices} />
        )}
        <DurationFields form={form} />
      </div>
    );
  },
});
