import type { License, Price } from '@/api-client';
import { buildPrice } from '../../../../e2e/app/_support/fixtures';
import { daysAgo } from './dates';

/**
 * What the licenses of the world bill. Prices hang on a license version: Starter
 * 2026 sells a monthly and an annual flat fee, with its API calls rated per
 * call on top; Business sells the same two fees and bills the calls above its
 * allowance; Starter 2027 is a draft with its first price to review. Enterprise
 * is sold on request, and its prices are the ones its contracts are pinned to:
 * $250.00 a month and $48,000.00 a year.
 */

const API_CALLS = {
  entitlementSlug: 'api-calls',
  saleUnitFactor: '1',
} as const;

// A price per call is a fraction of a cent, which is what `unitAmountDecimal`
// is for: 0.2 minor units of USD is $0.002.
export const createLicensePrices = (
  licenses: License[],
): Record<string, Price[]> => {
  const idOf = (slug: string) =>
    licenses.find((license) => license.slug === slug)?.id ?? slug;

  return {
    enterprise: [
      buildPrice({
        billingPeriod: 'MONTHLY',
        createdAt: daysAgo(480),
        displayLabel: 'Enterprise, monthly',
        displayOrder: 1,
        id: `${idOf('enterprise')}-monthly`,
        isDefault: true,
        unitAmountDecimal: '25000',
      }),
    ],
    'enterprise-v2': [
      buildPrice({
        billingPeriod: 'MONTHLY',
        createdAt: daysAgo(180),
        displayLabel: 'Enterprise, monthly',
        displayOrder: 1,
        id: `${idOf('enterprise-v2')}-monthly`,
        isDefault: true,
        unitAmountDecimal: '25000',
      }),
      buildPrice({
        billingPeriod: 'ANNUAL',
        createdAt: daysAgo(180),
        displayLabel: 'Enterprise, annual',
        displayOrder: 2,
        id: `${idOf('enterprise-v2')}-annual`,
        isDefault: true,
        unitAmountDecimal: '4800000',
      }),
    ],
    business: [
      buildPrice({
        billingPeriod: 'MONTHLY',
        createdAt: daysAgo(120),
        displayLabel: 'Business, monthly',
        displayOrder: 1,
        id: `${idOf('business')}-monthly`,
        isDefault: true,
        unitAmountDecimal: '9900',
      }),
      buildPrice({
        billingPeriod: 'ANNUAL',
        createdAt: daysAgo(120),
        displayLabel: 'Business, annual',
        displayOrder: 2,
        id: `${idOf('business')}-annual`,
        isDefault: true,
        unitAmountDecimal: '99000',
      }),
      buildPrice({
        billingModel: 'OVERAGE',
        createdAt: daysAgo(120),
        displayLabel: 'API calls, overage',
        displayOrder: 3,
        id: `${idOf('business')}-overage`,
        metered: API_CALLS,
        unitAmountDecimal: '0.1',
      }),
    ],
    starter: [
      buildPrice({
        billingPeriod: 'MONTHLY',
        createdAt: daysAgo(500),
        deprecatedAt: daysAgo(200),
        displayLabel: 'Starter, monthly (legacy)',
        displayOrder: 1,
        id: `${idOf('starter')}-monthly`,
        status: 'DEPRECATED',
        unitAmountDecimal: '1900',
      }),
    ],
    'starter-v2': [
      buildPrice({
        billingPeriod: 'MONTHLY',
        createdAt: daysAgo(200),
        displayLabel: 'Starter, monthly',
        displayOrder: 1,
        id: `${idOf('starter-v2')}-monthly`,
        isDefault: true,
        unitAmountDecimal: '2900',
      }),
      buildPrice({
        billingPeriod: 'ANNUAL',
        createdAt: daysAgo(200),
        displayLabel: 'Starter, annual',
        displayOrder: 2,
        id: `${idOf('starter-v2')}-annual`,
        isDefault: true,
        unitAmountDecimal: '29000',
      }),
      buildPrice({
        billingModel: 'USAGE_BASED',
        createdAt: daysAgo(200),
        displayLabel: 'API calls',
        displayOrder: 3,
        id: `${idOf('starter-v2')}-calls`,
        metered: API_CALLS,
        unitAmountDecimal: '0.2',
      }),
    ],
    'starter-v3': [
      buildPrice({
        billingPeriod: 'MONTHLY',
        createdAt: daysAgo(3),
        displayLabel: 'Starter, monthly',
        displayOrder: 1,
        id: `${idOf('starter-v3')}-monthly`,
        isDefault: true,
        unitAmountDecimal: '3900',
      }),
    ],
  };
};

/**
 * The versions a live subscription bills, whose grants and prices the API
 * freezes. Business is sold and subscribed to; Starter 2026 is on sale and not
 * yet billed, so a price can still be added to it.
 */
export const BILLED_LICENSE_SLUGS = ['business'];
