import { useStore } from '@tanstack/react-form';
import { useTranslation } from 'react-i18next';
import { ChoiceButton } from '@/components/choice-button';
import {
  BILLING_MODEL_BLURB_KEYS,
  BILLING_MODEL_LABEL_KEYS,
  BILLING_MODELS,
  type BillingModel,
  isMeteredModel,
  meterOptionsFor,
  pickableOption,
  type PriceMeterSource,
} from '@/domains/billing';
import { withForm } from '@/hooks/form';
import { addonPriceFormOpts } from '../../schemas/addon-price-form-options';

type AddonPriceShapeSectionProps = {
  source: PriceMeterSource;
};

/**
 * How a price bills: a flat fee for a period, or what an entitlement the version grants
 * measured (usage from the first unit, or only what exceeds the limit). A metered price
 * is always billed in arrears, which the next section says. A field left over from
 * another shape is kept in the form and never sent.
 */
export const AddonPriceShapeSection = withForm({
  ...addonPriceFormOpts,
  props: {} as AddonPriceShapeSectionProps,
  render: function AddonPriceShapeSectionRender({ form, source }) {
    const { t } = useTranslation();
    const model = useStore(form.store, (state) => state.values.billingModel);
    const slug = useStore(
      form.store,
      (state) => state.values.meteredEntitlementSlug,
    );

    // The form keeps what the shape it was switched from had, so that switching back
    // restores it; what the body of the request sends is the mapper's job
    // (`addonPriceFormValuesToCreateBody`), which drops what a shape does not have.
    function selectModel(next: BillingModel) {
      form.setFieldValue('billingModel', next);
      form.setFieldValue(
        'billingTiming',
        isMeteredModel(next) ? 'ARREARS' : 'ADVANCE',
      );
      // Keep the entitlement picked while it still can be.
      if (
        isMeteredModel(next) &&
        !pickableOption(meterOptionsFor(source, next), slug)
      ) {
        form.setFieldValue('meteredEntitlementSlug', '');
      }
    }

    const renderModelOption = (option: BillingModel) => (
      <ChoiceButton
        detail={t(BILLING_MODEL_BLURB_KEYS[option])}
        key={option}
        label={t(BILLING_MODEL_LABEL_KEYS[option])}
        onSelect={() => selectModel(option)}
        selected={model === option}
      />
    );

    return (
      <div
        aria-label={t('Pages.Addons.Prices.Form.Labels.model')}
        className="space-y-2"
        role="group"
      >
        <p className="text-sm font-medium">
          {t('Pages.Addons.Prices.Form.Labels.model')}
        </p>
        <div className="grid gap-2 sm:grid-cols-3">
          {BILLING_MODELS.map(renderModelOption)}
        </div>
      </div>
    );
  },
});
