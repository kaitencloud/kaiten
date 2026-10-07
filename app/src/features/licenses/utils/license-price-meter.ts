import type { TFunction } from 'i18next';
import type { Entitlement, LicenseEntitlement, Price } from '@/api-client';
import { RESET_PERIOD_UNIT_KEYS } from './license-price-labels';
import { type GrantAllowance, getGrantAllowance } from './license-price.utils';

type MeterLabels = Pick<
  Entitlement,
  'aggregationMethod' | 'name' | 'resetPeriod' | 'unitPlural'
>;

/**
 * What an overage bills against, in words: "Bills above 100,000 traces/month, up
 * to 200,000". The allowance is the limit the version grants and the most its
 * enforcement accepts above it.
 */
export function describeAllowance(
  allowance: GrantAllowance,
  entitlement: Pick<Entitlement, 'name' | 'unitPlural'> | undefined,
  period: string,
  slug: string,
  t: TFunction,
  locale: string,
): string {
  return t('Pages.Licenses.Prices.Meter.overage', {
    cap: allowance.cap.toLocaleString(locale),
    limit: allowance.limit.toLocaleString(locale),
    period,
    unit: entitlement?.unitPlural ?? entitlement?.name ?? slug,
  });
}

/**
 * What a usage price counts and when the count starts again. Only a sum or a
 * count is metered; a number is summed unless it says it is counted.
 */
export function describeUsage(
  entitlement: Pick<Entitlement, 'aggregationMethod'> | undefined,
  period: string,
  t: TFunction,
): string {
  return entitlement?.aggregationMethod === 'COUNT'
    ? t('Pages.Licenses.Prices.Meter.usageCount', { period })
    : t('Pages.Licenses.Prices.Meter.usageSum', { period });
}

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
      ? describeAllowance(
          allowance,
          entitlement,
          period,
          price.metered.entitlementSlug,
          t,
          locale,
        )
      : t('Pages.Licenses.Prices.Meter.overageUnknown');
  }

  return period ? describeUsage(entitlement, period, t) : undefined;
}
