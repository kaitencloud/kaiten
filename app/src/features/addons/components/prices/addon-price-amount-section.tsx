import { useStore } from '@tanstack/react-form';
import { useTranslation } from 'react-i18next';
import {
  getPriceAmountParts,
  getPriceUnitLabel,
  isMeteredModel,
  joinPriceAmount,
  meterOfEntitlement,
  meterOptionsFor,
  PriceMeterField,
  type PriceMeterSource,
  pickableOption,
} from '@/domains/billing';
import { withForm } from '@/hooks/form';
import { majorToMinorDecimal } from '@/lib/money';
import { addonPriceFormOpts } from '../../schemas/addon-price-form-options';

type AddonPriceAmountSectionProps = {
  source: PriceMeterSource;
};

/**
 * What a price charges: for a metered one, the entitlement it measures, then the amount,
 * typed in major units and kept as typed (a float would lose the decimals of a price per
 * unit), with a line that reads it back the way the price is read everywhere else
 * ("$10.00/month per unit", "$2.00 per 1M tokens"). The default flag is a flat fee's: it
 * is the price picked for its period when none is named.
 */
export const AddonPriceAmountSection = withForm({
  ...addonPriceFormOpts,
  props: {} as AddonPriceAmountSectionProps,
  render: function AddonPriceAmountSectionRender({ form, source }) {
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
    // Read back as the table will read it. A metered price with no entitlement picked
    // has no unit yet, so there is nothing to say.
    const reading =
      minor === null || (metered && !picked)
        ? undefined
        : joinPriceAmount(
            getPriceAmountParts(
              {
                billingPeriod: metered ? null : period,
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
            {() => (
              <PriceMeterField
                model={model}
                options={options}
                scope={source.overage}
              />
            )}
          </form.AppField>
        ) : null}
        <form.AppField name="amount">
          {(field) => (
            <field.MoneyField
              currency={currency}
              description={t(
                metered
                  ? model === 'OVERAGE'
                    ? 'Pages.Addons.Prices.Form.Descriptions.amountOverage'
                    : 'Pages.Addons.Prices.Form.Descriptions.amountUsage'
                  : 'Pages.Addons.Prices.Form.Descriptions.amount',
              )}
              label={
                unit
                  ? t('Pages.Addons.Prices.Form.Labels.amountPer', { unit })
                  : t('Pages.Addons.Prices.Form.Labels.amount')
              }
              placeholder={t('Pages.Addons.Prices.Form.Placeholders.amount')}
              required
            />
          )}
        </form.AppField>
        {reading && amount.trim() !== '' ? (
          <p className="-mt-3 text-sm text-muted-foreground">
            {t(
              metered
                ? 'Pages.Addons.Prices.Form.livePreviewMetered'
                : 'Pages.Addons.Prices.Form.livePreview',
              { price: reading },
            )}
          </p>
        ) : null}
        {metered ? null : (
          <form.AppField name="isDefault">
            {(field) => (
              <field.CheckboxField
                description={t(
                  'Pages.Addons.Prices.Form.Descriptions.isDefault',
                )}
                label={t('Pages.Addons.Prices.Form.Labels.isDefault')}
              />
            )}
          </form.AppField>
        )}
      </div>
    );
  },
});
