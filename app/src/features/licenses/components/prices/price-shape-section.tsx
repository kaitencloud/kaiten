import { useStore } from '@tanstack/react-form';
import { useTranslation } from 'react-i18next';
import { withForm } from '@/hooks/form';
import {
  BILLING_MODEL_BLURB_KEYS,
  BILLING_MODEL_LABEL_KEYS,
  BILLING_TIMING_BLURB_KEYS,
  BILLING_TIMING_LABEL_KEYS,
} from '../../utils/license-price-labels';
import {
  BILLING_MODELS,
  BILLING_TIMINGS,
  type BillingModel,
  type BillingTiming,
  isMeteredModel,
} from '../../utils/license-price.utils';
import {
  meterOptionsFor,
  type PriceMeterSource,
  pickableOption,
} from './price-meter-options';
import { priceFormOpts } from './price-form-options';
import { PriceOptionButton } from './price-option-button';

type PriceShapeSectionProps = {
  /** An existing price keeps its shape: the API changes neither model nor currency. */
  isEditing: boolean;
  source: PriceMeterSource;
};

/**
 * How a price bills: its shape, then when. A metered price is always billed in
 * arrears, since usage cannot be billed before it happens, so the choice of
 * timing is locked on it, and said to be. A field left over from another shape is
 * kept in the form and never sent.
 */
export const PriceShapeSection = withForm({
  ...priceFormOpts,
  props: {} as PriceShapeSectionProps,
  render: function PriceShapeSectionRender({ form, isEditing, source }) {
    const { t } = useTranslation();
    const model = useStore(form.store, (state) => state.values.billingModel);
    const timing = useStore(form.store, (state) => state.values.billingTiming);
    const slug = useStore(
      form.store,
      (state) => state.values.meteredEntitlementSlug,
    );
    const metered = isMeteredModel(model);

    // The form keeps what the shape it was switched from had, so that switching
    // back restores it; what the body of the request sends is the mapper's job
    // (`priceFormValuesToCreateBody`), which drops what a shape does not have.
    function selectModel(next: BillingModel) {
      form.setFieldValue('billingModel', next);
      form.setFieldValue(
        'billingTiming',
        isMeteredModel(next) ? 'ARREARS' : 'ADVANCE',
      );
      // Keep the entitlement picked while it still can be: an overage may not
      // bill on a grant a usage price may.
      if (
        isMeteredModel(next) &&
        !pickableOption(meterOptionsFor(source, next), slug)
      ) {
        form.setFieldValue('meteredEntitlementSlug', '');
      }
    }

    const renderModelOption = (option: BillingModel) => (
      <PriceOptionButton
        detail={t(BILLING_MODEL_BLURB_KEYS[option])}
        disabled={isEditing}
        key={option}
        label={t(BILLING_MODEL_LABEL_KEYS[option])}
        onSelect={() => selectModel(option)}
        selected={model === option}
      />
    );
    const renderTimingOption = (option: BillingTiming) => (
      <PriceOptionButton
        detail={t(BILLING_TIMING_BLURB_KEYS[option])}
        disabled={metered}
        key={option}
        label={t(BILLING_TIMING_LABEL_KEYS[option])}
        onSelect={() => form.setFieldValue('billingTiming', option)}
        selected={timing === option}
      />
    );

    return (
      <div className="space-y-5">
        <div
          aria-label={t('Pages.Licenses.Prices.Form.Labels.model')}
          className="space-y-2"
          role="group"
        >
          <p className="text-sm font-medium">
            {t('Pages.Licenses.Prices.Form.Labels.model')}
          </p>
          <div className="grid gap-2 sm:grid-cols-3">
            {BILLING_MODELS.map(renderModelOption)}
          </div>
          {isEditing ? (
            <p className="text-xs text-muted-foreground">
              {t('Pages.Licenses.Prices.Form.Descriptions.modelLocked')}
            </p>
          ) : null}
        </div>

        <div
          aria-label={t('Pages.Licenses.Prices.Form.Labels.timing')}
          className="space-y-2"
          role="group"
        >
          <p className="text-sm font-medium">
            {t('Pages.Licenses.Prices.Form.Labels.timing')}
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {BILLING_TIMINGS.map(renderTimingOption)}
          </div>
          {metered ? (
            <p className="text-xs text-muted-foreground">
              {t('Pages.Licenses.Prices.Form.Descriptions.timingLocked')}
            </p>
          ) : null}
        </div>
      </div>
    );
  },
});
