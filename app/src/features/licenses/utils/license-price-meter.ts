import type { TFunction } from 'i18next';
import type { Entitlement, LicenseEntitlement, Price } from '@/api-client';
import { RESET_PERIOD_UNIT_KEYS } from './license-price-labels';
import { getGrantAllowance } from './license-price.utils';

type MeterLabels = Pick<
  Entitlement,
  'aggregationMethod' | 'name' | 'resetPeriod' | 'unitPlural'
>;

/**
 * What a metered price measures, in a line under its entitlement. An overage
 * price states the allowance and the cap it bills against ("Bills above 100,000
 * traces/month, up to 200,000"), since that is what decides what it ever bills;
 * a usage price says what it counts and when the count starts again.
 */
export function describeMeter(
  price: Pick<Price, 'billingModel' | 'metered'>,
  entitlement: MeterLabels | undefined,
  grant: LicenseEntitlement | undefined,
  t: TFunction,
  locale: string,
): string | undefined {
  if (!price.metered) {
    return undefined;
  }
  const period = entitlement?.resetPeriod
    ? t(RESET_PERIOD_UNIT_KEYS[entitlement.resetPeriod])
    : undefined;
  if (price.billingModel === 'OVERAGE') {
    const allowance = getGrantAllowance(grant);

    return allowance && period
      ? t('Pages.Licenses.Prices.Meter.overage', {
          cap: allowance.cap.toLocaleString(locale),
          limit: allowance.limit.toLocaleString(locale),
          period,
          unit:
            entitlement?.unitPlural ??
            entitlement?.name ??
            price.metered.entitlementSlug,
        })
      : t('Pages.Licenses.Prices.Meter.overageUnknown');
  }

  if (!period) {
    return undefined;
  }

  // Only a sum or a count is metered; a number is summed unless it says otherwise.
  return entitlement?.aggregationMethod === 'COUNT'
    ? t('Pages.Licenses.Prices.Meter.usageCount', { period })
    : t('Pages.Licenses.Prices.Meter.usageSum', { period });
}
