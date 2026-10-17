import { useStore } from '@tanstack/react-form';
import { useTranslation } from 'react-i18next';
import type { Price } from '@/api-client';
import {
  BILLING_PERIOD_LABEL_KEYS,
  BILLING_PERIODS,
  BILLING_TIMING_BLURB_KEYS,
  BILLING_TIMING_LABEL_KEYS,
  BILLING_TIMINGS,
  type BillingPeriod,
  type BillingTiming,
  isMeteredModel,
} from '@/domains/billing';
import { withForm } from '@/hooks/form';
import { CURRENCY_EXPONENTS } from '@/lib/currency-exponents';
import { addonPriceFormOpts } from '../../schemas/addon-price-form-options';
import { getDefaultPrice } from '../../utils/addon-price.utils';

const CURRENCIES = [...CURRENCY_EXPONENTS.keys()].sort();

type AddonPriceDetailsSectionProps = {
  /** The version already bills in this currency: the form takes it and locks it. */
  currencyLocked: boolean;
  /** The flat fees the version has, to know which period already has a default. */
  flatFees: readonly Price[];
};

/**
 * What names a price and says what it is charged in: for a flat fee, how often and when
 * it is billed (a metered price is always billed in arrears, on the subscription's own
 * period, and the section says so); the currency, which is the version's once it has a
 * price; and the label of its line on an invoice. The first flat fee of a period is its
 * default, since a priced add-on with no default for the period is refused on a
 * subscription of it.
 */
export const AddonPriceDetailsSection = withForm({
  ...addonPriceFormOpts,
  props: {} as AddonPriceDetailsSectionProps,
  render: function AddonPriceDetailsSectionRender({
    currencyLocked,
    flatFees,
    form,
  }) {
    const { t } = useTranslation();
    const model = useStore(form.store, (state) => state.values.billingModel);
    const currency = useStore(form.store, (state) => state.values.currency);
    const timing = useStore(form.store, (state) => state.values.billingTiming);

    return (
      <div className="space-y-5">
        {isMeteredModel(model) ? (
          <p className="text-xs text-muted-foreground">
            {t('Pages.Addons.Prices.Form.Descriptions.timingLocked')}
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <form.AppField
              listeners={{
                // The first price of a period is the one that bills it; a period that
                // has one is not replaced unless the person says so.
                onChange: ({ value }) =>
                  form.setFieldValue(
                    'isDefault',
                    getDefaultPrice(flatFees, value) === undefined,
                  ),
              }}
              name="billingPeriod"
            >
              {(field) => (
                <field.SelectField
                  description={t(
                    'Pages.Addons.Prices.Form.Descriptions.period',
                  )}
                  getOptionLabel={(option) =>
                    t(BILLING_PERIOD_LABEL_KEYS[option as BillingPeriod])
                  }
                  label={t('Pages.Addons.Prices.Form.Labels.period')}
                  options={[...BILLING_PERIODS]}
                  required
                />
              )}
            </form.AppField>
            <form.AppField name="billingTiming">
              {(field) => (
                <field.SelectField
                  description={t(BILLING_TIMING_BLURB_KEYS[timing])}
                  getOptionLabel={(option) =>
                    t(BILLING_TIMING_LABEL_KEYS[option as BillingTiming])
                  }
                  label={t('Pages.Addons.Prices.Form.Labels.timing')}
                  options={[...BILLING_TIMINGS]}
                  required
                />
              )}
            </form.AppField>
          </div>
        )}
        <form.AppField name="currency">
          {(field) =>
            currencyLocked ? (
              <field.TextField
                description={t(
                  'Pages.Addons.Prices.Form.Descriptions.currencyLocked',
                  { currency },
                )}
                disabled
                label={t('Pages.Addons.Prices.Form.Labels.currency')}
              />
            ) : (
              <field.ComboboxField
                description={t(
                  'Pages.Addons.Prices.Form.Descriptions.currency',
                )}
                getOptionLabel={(code: unknown) => String(code)}
                getOptionValue={(code: unknown) => String(code)}
                label={t('Pages.Addons.Prices.Form.Labels.currency')}
                options={CURRENCIES}
                placeholder={t(
                  'Pages.Addons.Prices.Form.Placeholders.currency',
                )}
                required
                searchPlaceholder={t(
                  'Pages.Addons.Prices.Form.Placeholders.currencySearch',
                )}
              />
            )
          }
        </form.AppField>
        <form.AppField name="displayLabel">
          {(field) => (
            <field.TextField
              description={t('Pages.Addons.Prices.Form.Descriptions.label')}
              label={t('Pages.Addons.Prices.Form.Labels.label')}
              placeholder={t('Pages.Addons.Prices.Form.Placeholders.label')}
            />
          )}
        </form.AppField>
      </div>
    );
  },
});
