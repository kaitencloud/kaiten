import { useStore } from '@tanstack/react-form';
import { useTranslation } from 'react-i18next';
import { withForm } from '@/hooks/form';
import { majorToMinorDecimal } from '@/lib/money';
import {
  isMeteredModel,
  meterOfEntitlement,
} from '../../utils/license-price.utils';
import { priceFormOpts } from './price-form-options';
import {
  meterOptionsFor,
  type PriceMeterSource,
  pickableOption,
} from './price-meter-options';
import { PriceMeterField } from './price-meter-picker';
import {
  getPriceAmountParts,
  joinPriceAmount,
  getPriceUnitLabel,
} from '@/domains/billing';

type PriceAmountSectionProps = {
  source: PriceMeterSource;
};

/**
 * What a price charges: for a metered one, the entitlement it measures, then the
 * amount, typed in major units and kept as typed (a float would lose the decimals
 * of a price per unit), with a line that reads it back the way the price is read
 * everywhere else ("$2.00 per 1M tokens"). The default flag is a flat fee's: it is
 * the price picked for its period when none is named.
 */
export const PriceAmountSection = withForm({
  ...priceFormOpts,
  props: {} as PriceAmountSectionProps,
  render: function PriceAmountSectionRender({ form, source }) {
    const { i18n, t } = useTranslation();
    const model = useStore(form.store, (state) => state.values.billingModel);
    const slug = useStore(
      form.store,
      (state) => state.values.meteredEntitlementSlug,
    );
    const amount = useStore(form.store, (state) => state.values.amount);
    const currency = useStore(form.store, (state) => state.values.currency);
    const period = useStore(form.store, (state) => state.values.billingPeriod);
    const metered = isMeteredModel(model);
    const options = meterOptionsFor(source, model);
    const picked = pickableOption(options, slug)?.entitlement;
    const minor = majorToMinorDecimal(amount, currency);
    const unit = picked
      ? getPriceUnitLabel(meterOfEntitlement(picked), picked, (factor) =>
          factor.toLocaleString(i18n.language),
        )
      : undefined;
    // Read back as the table will read it. A metered price with no entitlement
    // picked has no unit yet, so there is nothing to say.
    const reading =
      minor === null || (metered && !picked)
        ? undefined
        : joinPriceAmount(
            getPriceAmountParts(
              {
                billingPeriod: metered ? undefined : period,
                currency,
                metered: picked ? meterOfEntitlement(picked) : undefined,
                unitAmountDecimal: minor,
              },
              picked,
              t,
              i18n.language,
            ),
          );

    return (
      <div className="space-y-5">
        {metered ? (
          <form.AppField name="meteredEntitlementSlug">
            {() => <PriceMeterField model={model} options={options} />}
          </form.AppField>
        ) : null}
        <form.AppField name="amount">
          {(field) => (
            <field.MoneyField
              currency={currency}
              description={t(
                metered
                  ? model === 'OVERAGE'
                    ? 'Pages.Licenses.Prices.Form.Descriptions.amountOverage'
                    : 'Pages.Licenses.Prices.Form.Descriptions.amountUsage'
                  : 'Pages.Licenses.Prices.Form.Descriptions.amountFlat',
              )}
              label={
                unit
                  ? t('Pages.Licenses.Prices.Form.Labels.amountPer', { unit })
                  : t('Pages.Licenses.Prices.Form.Labels.amount')
              }
              placeholder={t('Pages.Licenses.Prices.Form.Placeholders.amount')}
              required
            />
          )}
        </form.AppField>
        {reading && amount.trim() !== '' ? (
          <p className="-mt-3 text-sm text-muted-foreground">
            {t('Pages.Licenses.Prices.Form.livePreview', { price: reading })}
          </p>
        ) : null}
        {metered ? null : (
          <form.AppField name="isDefault">
            {(field) => (
              <field.CheckboxField
                description={t(
                  'Pages.Licenses.Prices.Form.Descriptions.isDefault',
                )}
                label={t('Pages.Licenses.Prices.Form.Labels.isDefault')}
              />
            )}
          </form.AppField>
        )}
      </div>
    );
  },
});
