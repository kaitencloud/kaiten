import { useTranslation } from 'react-i18next';
import type { Entitlement } from '@/api-client';
import { Badge } from '@/components/ui/badge';
import FormField from '@/components/form/fields/form-field';
import RequiredMark from '@/components/form/required-mark';
import {
  describeAllowance,
  describeUsage,
} from '../../utils/license-price-meter';
import {
  type MeterOption,
  meterOfEntitlement,
} from '../../utils/license-price.utils';
import { PriceOptionButton } from './price-option-button';
import {
  RESET_PERIOD_UNIT_KEYS,
  type BillingModel,
  getPriceUnitLabel,
} from '@/domains/billing';

type PriceMeterPickerProps = {
  model: BillingModel;
  onSelect: (entitlementSlug: string) => void;
  options: MeterOption[];
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
      return t('Pages.Licenses.Prices.Form.Meter.stock');
    }
    if (option.disabledReason === 'overageUnreachable') {
      return t('Pages.Licenses.Prices.Form.Meter.overageUnreachable');
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
  value,
}: PriceMeterPickerProps) {
  const { i18n, t } = useTranslation();
  const detailOf = useOptionDetail();
  const hasStock = options.some((option) => option.disabledReason === 'stock');
  const formatFactor = (factor: number) => factor.toLocaleString(i18n.language);

  const renderOption = (option: MeterOption) => (
    <PriceOptionButton
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
        {t('Pages.Licenses.Prices.Form.Labels.meter')}
        <RequiredMark />
      </legend>
      {options.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {t('Pages.Licenses.Prices.Form.Meter.none')}
        </p>
      ) : (
        <div className="space-y-2">{options.map(renderOption)}</div>
      )}
      {hasStock ? (
        <p className="text-xs text-muted-foreground">
          {t('Pages.Licenses.Prices.Form.Meter.stockHint')}
        </p>
      ) : null}
    </fieldset>
  );
}

type PriceMeterFieldProps = Omit<PriceMeterPickerProps, 'onSelect' | 'value'>;

/**
 * The picker as a field of the form: the entitlement is the value of
 * `meteredEntitlementSlug`, and the message of the form, once the field was
 * touched, says when none is picked.
 */
export function PriceMeterField({ model, options }: PriceMeterFieldProps) {
  return (
    <FormField<string>>
      {(field) => (
        <PriceMeterPicker
          model={model}
          onSelect={field.handleChange}
          options={options}
          value={field.value}
        />
      )}
    </FormField>
  );
}
