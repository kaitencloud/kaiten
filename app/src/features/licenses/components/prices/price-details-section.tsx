import { useStore } from '@tanstack/react-form';
import { useTranslation } from 'react-i18next';
import { withForm } from '@/hooks/form';
import { CURRENCY_EXPONENTS } from '@/lib/currency-exponents';
import { BILLING_PERIOD_LABEL_KEYS } from '../../utils/license-price-labels';
import {
  BILLING_PERIODS,
  type BillingPeriod,
  isMeteredModel,
} from '../../utils/license-price.utils';
import { priceFormOpts } from './price-form-options';

type PriceDetailsSectionProps = {
  /** The version already bills in this currency: the form takes it and locks it. */
  currencyLocked: boolean;
};

const CURRENCIES = [...CURRENCY_EXPONENTS.keys()].sort();

/**
 * What names a price and says what it is charged in: its billing period (a flat
 * fee only, a metered price bills on the subscription's own), its currency, which
 * is the version's once it has a price, and the label of its line on an invoice.
 */
export const PriceDetailsSection = withForm({
  ...priceFormOpts,
  props: {} as PriceDetailsSectionProps,
  render: function PriceDetailsSectionRender({ currencyLocked, form }) {
    const { t } = useTranslation();
    const model = useStore(form.store, (state) => state.values.billingModel);
    const currency = useStore(form.store, (state) => state.values.currency);

    return (
      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          {isMeteredModel(model) ? null : (
            <form.AppField name="billingPeriod">
              {(field) => (
                <field.SelectField
                  description={t(
                    'Pages.Licenses.Prices.Form.Descriptions.period',
                  )}
                  getOptionLabel={(option) =>
                    t(BILLING_PERIOD_LABEL_KEYS[option as BillingPeriod])
                  }
                  label={t('Pages.Licenses.Prices.Form.Labels.period')}
                  options={[...BILLING_PERIODS]}
                  required
                />
              )}
            </form.AppField>
          )}
          <form.AppField name="currency">
            {(field) =>
              currencyLocked ? (
                <field.TextField
                  description={t(
                    'Pages.Licenses.Prices.Form.Descriptions.currencyLocked',
                    { currency },
                  )}
                  disabled
                  label={t('Pages.Licenses.Prices.Form.Labels.currency')}
                />
              ) : (
                <field.ComboboxField
                  description={t(
                    'Pages.Licenses.Prices.Form.Descriptions.currency',
                  )}
                  getOptionLabel={(code: unknown) => String(code)}
                  getOptionValue={(code: unknown) => String(code)}
                  label={t('Pages.Licenses.Prices.Form.Labels.currency')}
                  options={CURRENCIES}
                  placeholder={t(
                    'Pages.Licenses.Prices.Form.Placeholders.currency',
                  )}
                  required
                  searchPlaceholder={t(
                    'Pages.Licenses.Prices.Form.Placeholders.currencySearch',
                  )}
                />
              )
            }
          </form.AppField>
        </div>
        <form.AppField name="displayLabel">
          {(field) => (
            <field.TextField
              description={t('Pages.Licenses.Prices.Form.Descriptions.label')}
              label={t('Pages.Licenses.Prices.Form.Labels.label')}
              placeholder={t('Pages.Licenses.Prices.Form.Placeholders.label')}
            />
          )}
        </form.AppField>
      </div>
    );
  },
});
