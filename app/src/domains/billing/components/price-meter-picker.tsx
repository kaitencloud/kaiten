import { useTranslation } from 'react-i18next';
import type { Entitlement } from '@/api-client';
import { ChoiceButton } from '@/components/choice-button';
import { Badge } from '@/components/ui/badge';
import FormField from '@/components/form/fields/form-field';
import RequiredMark from '@/components/form/required-mark';
import {
  describeAllowance,
  describeUsage,
  type MeterOption,
  meterOfEntitlement,
  type OverageScope,
} from '../logic/price-meter';
import { getPriceUnitLabel } from '../logic/price-display';
import { RESET_PERIOD_UNIT_KEYS } from '../logic/price-labels';
import type { BillingModel } from '../logic/price-types';
import { PriceStockHint } from './price-stock-hint';

type PriceMeterPickerProps = {
  model: BillingModel;
  onSelect: (entitlementSlug: string) => void;
  options: MeterOption[];
  /**
   * Whose price this is. A licence points a stock to the add-ons, where it is sold; the
   * price of an add-on is that sale already, so its hint says to bill the stock as a
   * flat fee with a quantity.
   */
  scope?: OverageScope;
  /** The slug of the entitlement picked, empty when none is. */
  value: string;
};

const unitOf = (
  entitlement: Entitlement,
  formatFactor: (n: number) => string,
) =>
  getPriceUnitLabel(meterOfEntitlement(entitlement), entitlement, formatFactor);

// What an option says of itself: why it cannot be picked, or, for an overage,
// the allowance and the cap it would bill against, or, for a usage price, what
// is counted and when it starts again.
function useOptionDetail() {
  const { i18n, t } = useTranslation();

  return (option: MeterOption, model: BillingModel): string | undefined => {
    if (option.disabledReason === 'stock') {
      return t('Features.Billing.Price.Meter.stock');
    }
    if (option.disabledReason === 'overageUnreachable') {
      return t('Features.Billing.Price.Meter.overageUnreachable');
    }
    const period = option.resetPeriod
      ? t(RESET_PERIOD_UNIT_KEYS[option.resetPeriod])
      : undefined;
    if (model === 'OVERAGE' && option.allowance && period) {
      return describeAllowance(
        option.allowance,
        option.entitlement,
        period,
        option.entitlementSlug,
        t,
        i18n.language,
      );
    }

    // An overage with no allowance to state, and not disabled, is an add-on's: it bills
    // above what the instance holds.
    if (model === 'OVERAGE') {
      return t('Features.Billing.Price.Meter.overageInstance');
    }

    return period ? describeUsage(option.entitlement, period, t) : undefined;
  };
}

/**
 * The entitlements a metered price may measure, which is a choice among what
 * the version grants. Only a flow can be metered: a stock (a number that never
 * resets, such as seats) is listed but disabled, with the way to sell it, and an
 * entitlement that cannot be rated at all is not listed. In an overage, a grant
 * whose overage can never be reached is disabled with the reason.
 */
export function PriceMeterPicker({
  model,
  onSelect,
  options,
  scope = 'license',
  value,
}: PriceMeterPickerProps) {
  const { i18n, t } = useTranslation();
  const detailOf = useOptionDetail();
  const hasStock = options.some((option) => option.disabledReason === 'stock');
  const formatFactor = (factor: number) => factor.toLocaleString(i18n.language);

  const renderOption = (option: MeterOption) => (
    <ChoiceButton
      detail={detailOf(option, model)}
      disabled={option.disabledReason !== undefined}
      key={option.entitlementSlug}
      label={option.entitlement.name}
      onSelect={() => onSelect(option.entitlementSlug)}
      selected={option.entitlementSlug === value}
      trailing={
        option.disabledReason === 'stock' ? null : (
          <Badge variant="outline">
            {t('Features.Billing.Price.perUnit', {
              unit: unitOf(option.entitlement, formatFactor),
            })}
          </Badge>
        )
      }
    />
  );

  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">
        {t('Features.Billing.Price.Meter.label')}
        <RequiredMark />
      </legend>
      {options.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {t('Features.Billing.Price.Meter.none')}
        </p>
      ) : (
        <div className="space-y-2">{options.map(renderOption)}</div>
      )}
      {hasStock ? <PriceStockHint scope={scope} /> : null}
    </fieldset>
  );
}

type PriceMeterFieldProps = Omit<PriceMeterPickerProps, 'onSelect' | 'value'>;

/**
 * The picker as a field of the form: the entitlement is the value of
 * `meteredEntitlementSlug`, and the message of the form, once the field was
 * touched, says when none is picked.
 */
export function PriceMeterField({
  model,
  options,
  scope,
}: PriceMeterFieldProps) {
  return (
    <FormField<string>>
      {(field) => (
        <PriceMeterPicker
          model={model}
          onSelect={field.handleChange}
          options={options}
          scope={scope}
          value={field.value}
        />
      )}
    </FormField>
  );
}
