import { useStore } from '@tanstack/react-form';
import { useTranslation } from 'react-i18next';
import { ChoiceButton } from '@/components/choice-button';
import FormField from '@/components/form/fields/form-field';
import { withForm } from '@/hooks/form';
import { CURRENCY_EXPONENTS } from '@/lib/currency-exponents';
import { voucherFormOpts } from '../../schemas';
import type { VoucherReferences } from '../../hooks/use-voucher-references';
import {
  APPLIES_TO_BLURB_KEYS,
  APPLIES_TO_LABEL_KEYS,
  APPLIES_TO_OPTIONS,
  DISCOUNT_TYPE_LABEL_KEYS,
  DISCOUNT_TYPES,
} from '../../utils/voucher-labels';
import { splitPriceSelection } from '../../utils/voucher-prices';
import { PricePicker } from './price-picker';

const CURRENCIES = [...CURRENCY_EXPONENTS.keys()].sort();

type DiscountPanelProps = {
  prices: VoucherReferences['prices'];
};

/**
 * The offer of a discount: how it is worked out, a percentage or an amount in one
 * currency, and what it applies to. Applying to chosen prices asks which, and only then
 * are the prices of every version read.
 */
export const DiscountPanel = withForm({
  ...voucherFormOpts,
  props: {} as DiscountPanelProps,
  render: function DiscountPanelRender({ form, prices }) {
    const { t } = useTranslation();
    const discountType = useStore(
      form.store,
      (state) => state.values.priceDiscountType,
    );
    const appliesTo = useStore(
      form.store,
      (state) => state.values.priceAppliesTo,
    );
    const currency = useStore(form.store, (state) => state.values.currency);
    const licensePriceIds = useStore(
      form.store,
      (state) => state.values.applicableLicensePriceIds,
    );
    const addonPriceIds = useStore(
      form.store,
      (state) => state.values.applicableAddonPriceIds,
    );

    return (
      <div className="space-y-6">
        <div
          aria-label={t('Pages.Vouchers.Wizard.Labels.discountType')}
          className="space-y-2"
          role="group"
        >
          <p className="text-sm font-medium">
            {t('Pages.Vouchers.Wizard.Labels.discountType')}
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {DISCOUNT_TYPES.map((type) => (
              <ChoiceButton
                key={type}
                label={t(DISCOUNT_TYPE_LABEL_KEYS[type])}
                onSelect={() => form.setFieldValue('priceDiscountType', type)}
                selected={discountType === type}
              />
            ))}
          </div>
        </div>
        {discountType === 'PERCENTAGE' ? (
          <form.AppField name="percentage">
            {(field) => (
              <field.TextField
                autoComplete="off"
                className="sm:max-w-xs"
                description={t('Pages.Vouchers.Wizard.Descriptions.percentage')}
                inputMode="decimal"
                label={t('Pages.Vouchers.Wizard.Labels.percentage')}
                placeholder={t('Pages.Vouchers.Wizard.Placeholders.percentage')}
                required
              />
            )}
          </form.AppField>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <form.AppField name="currency">
              {(field) => (
                <field.ComboboxField
                  description={t('Pages.Vouchers.Wizard.Descriptions.currency')}
                  getOptionLabel={(code: unknown) => String(code)}
                  getOptionValue={(code: unknown) => String(code)}
                  label={t('Pages.Vouchers.Wizard.Labels.currency')}
                  options={CURRENCIES}
                  placeholder={t('Pages.Vouchers.Wizard.Placeholders.currency')}
                  required
                  searchPlaceholder={t(
                    'Pages.Vouchers.Wizard.Placeholders.currencySearch',
                  )}
                />
              )}
            </form.AppField>
            <form.AppField name="amount">
              {(field) => (
                <field.MoneyField
                  currency={currency}
                  description={t('Pages.Vouchers.Wizard.Descriptions.amount')}
                  label={t('Pages.Vouchers.Wizard.Labels.amount')}
                  placeholder={t('Pages.Vouchers.Wizard.Placeholders.amount')}
                  required
                />
              )}
            </form.AppField>
          </div>
        )}
        <div
          aria-label={t('Pages.Vouchers.Wizard.Labels.appliesTo')}
          className="space-y-2"
          role="group"
        >
          <p className="text-sm font-medium">
            {t('Pages.Vouchers.Wizard.Labels.appliesTo')}
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {APPLIES_TO_OPTIONS.map((option) => (
              <ChoiceButton
                detail={t(APPLIES_TO_BLURB_KEYS[option])}
                key={option}
                label={t(APPLIES_TO_LABEL_KEYS[option])}
                onSelect={() => form.setFieldValue('priceAppliesTo', option)}
                selected={appliesTo === option}
              />
            ))}
          </div>
        </div>
        {appliesTo === 'SELECTED_PRICES' ? (
          <form.AppField name="applicableLicensePriceIds">
            {(licensePrices) => (
              <FormField<string[]>
                description={t('Pages.Vouchers.Wizard.Descriptions.prices')}
                label={t('Pages.Vouchers.Wizard.Labels.prices')}
                required
              >
                {() => (
                  <PricePicker
                    error={prices.error}
                    isPending={prices.isPending}
                    onChange={(checked) => {
                      const split = splitPriceSelection(
                        checked,
                        prices.options,
                        { addon: addonPriceIds, license: licensePriceIds },
                      );

                      licensePrices.handleChange(split.license);
                      form.setFieldValue(
                        'applicableAddonPriceIds',
                        split.addon,
                      );
                    }}
                    onRetry={prices.refetch}
                    options={prices.options}
                    value={[...licensePriceIds, ...addonPriceIds]}
                  />
                )}
              </FormField>
            )}
          </form.AppField>
        ) : null}
      </div>
    );
  },
});
