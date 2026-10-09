import { useStore } from '@tanstack/react-form';
import { useTranslation } from 'react-i18next';
import {
  BILLING_PERIOD_LABEL_KEYS,
  BILLING_PERIODS,
  BILLING_TIMING_BLURB_KEYS,
  BILLING_TIMING_LABEL_KEYS,
  BILLING_TIMINGS,
  type BillingPeriod,
  type BillingTiming,
  getPriceAmountParts,
  joinPriceAmount,
} from '@/domains/billing';
import { withForm } from '@/hooks/form';
import { CURRENCY_EXPONENTS } from '@/lib/currency-exponents';
import { majorToMinorDecimal } from '@/lib/money';
import { addonPriceFormOpts } from '../../schemas/addon-price-form-options';
import { getDefaultPrice } from '../../utils/addon-price.utils';
import type { Price } from '@/api-client';

const CURRENCIES = [...CURRENCY_EXPONENTS.keys()].sort();

type AddonPriceFieldsProps = {
  /** The version already bills in this currency: the form takes it and locks it. */
  currencyLocked: boolean;
  /** The flat fees the version has, to know which period already has a default. */
  flatFees: readonly Price[];
};

/**
 * The fields of a price of an add-on: how often and when it is billed, the currency
 * (the version's, once it has a price), the amount per unit typed in major units and
 * read back the way the price is read everywhere else, the label of its line on an
 * invoice, and whether it is the default of its period. The default of a period is
 * the price that bills every instance holding the version on a subscription of that
 * period, and the first price of a period is one by default.
 */
export const AddonPriceFields = withForm({
  ...addonPriceFormOpts,
  props: {} as AddonPriceFieldsProps,
  render: function AddonPriceFieldsRender({ currencyLocked, flatFees, form }) {
    const { i18n, t } = useTranslation();
    const amount = useStore(form.store, (state) => state.values.amount);
    const currency = useStore(form.store, (state) => state.values.currency);
    const period = useStore(form.store, (state) => state.values.billingPeriod);
    const timing = useStore(form.store, (state) => state.values.billingTiming);
    const minor = majorToMinorDecimal(amount, currency);
    const reading =
      minor === null
        ? undefined
        : joinPriceAmount(
            getPriceAmountParts(
              {
                billingPeriod: period,
                currency,
                metered: undefined,
                unitAmountDecimal: minor,
              },
              undefined,
              t,
              i18n.language,
            ),
          );

    return (
      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <form.AppField
            listeners={{
              // The first price of a period is the one that bills it; a period that has
              // one is not replaced unless the person says so.
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
                description={t('Pages.Addons.Prices.Form.Descriptions.period')}
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
        <form.AppField name="amount">
          {(field) => (
            <field.MoneyField
              currency={currency}
              description={t('Pages.Addons.Prices.Form.Descriptions.amount')}
              label={t('Pages.Addons.Prices.Form.Labels.amount')}
              placeholder={t('Pages.Addons.Prices.Form.Placeholders.amount')}
              required
            />
          )}
        </form.AppField>
        {reading && amount.trim() !== '' ? (
          <p className="-mt-3 text-sm text-muted-foreground">
            {t('Pages.Addons.Prices.Form.livePreview', { price: reading })}
          </p>
        ) : null}
        <form.AppField name="displayLabel">
          {(field) => (
            <field.TextField
              description={t('Pages.Addons.Prices.Form.Descriptions.label')}
              label={t('Pages.Addons.Prices.Form.Labels.label')}
              placeholder={t('Pages.Addons.Prices.Form.Placeholders.label')}
            />
          )}
        </form.AppField>
        <form.AppField name="isDefault">
          {(field) => (
            <field.CheckboxField
              description={t('Pages.Addons.Prices.Form.Descriptions.isDefault')}
              label={t('Pages.Addons.Prices.Form.Labels.isDefault')}
            />
          )}
        </form.AppField>
      </div>
    );
  },
});
