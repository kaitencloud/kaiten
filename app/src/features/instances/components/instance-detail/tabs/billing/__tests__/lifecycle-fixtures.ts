import type { InstanceAddon, InstanceBilling, Price } from '@/api-client';
import { graphqlOperationHandler } from '@/e2e/msw/handler-factory';
import { buildLicense } from '../../../../../../../../e2e/app/_support/fixtures/build-license';
import { buildPrice } from '../../../../../../../../e2e/app/_support/fixtures/build-pricing';
import {
  buildSubscription,
  PRO_MONTHLY_PRICE,
} from '../../../../../../../../e2e/app/_support/fixtures/build-subscription';
import { licensePriceOperations } from '../../../../../../../../e2e/app/_support/model/graphql-operations';

/** The instance the dialogs of the Billing tab are opened on, with everything an update sends back. */
export const INSTANCE = {
  customerId: 'customer-1',
  deploymentZoneId: 'zone-1',
  description: 'The production instance of Globex',
  endLicenseDate: '2027-12-31T00:00:00.000Z',
  id: 'ins-1',
  licenseId: 'license-business-2',
  metadata: { region: 'eu' },
  name: 'Globex Production',
  slug: 'globex-production',
  startLicenseDate: '2026-01-01T00:00:00.000Z',
};

/** The subscription of that instance: monthly, with the period closing on 27 October 2026. */
export const subscription = (
  overrides: Partial<Parameters<typeof buildSubscription>[0]> = {},
): InstanceBilling =>
  buildSubscription({
    anchorAt: '2026-08-28T00:00:00.000Z',
    currentPeriodEnd: '2026-10-27T00:00:00.000Z',
    currentPeriodStart: '2026-09-27T00:00:00.000Z',
    customerName: 'Globex',
    customerSlug: 'globex',
    instanceName: INSTANCE.name,
    instanceSlug: INSTANCE.slug,
    ...overrides,
  });

export const addon = (addonSlug: string, quantity = 1): InstanceAddon => ({
  addonId: `id-${addonSlug}`,
  addonSlug,
  attachedAt: '2026-09-01T00:00:00.000Z',
  familySlug: 'extras',
  id: `attachment-${addonSlug}`,
  name: addonSlug,
  prices: [],
  quantity,
});

/** The versions of the licenses of the organization, as the list of licenses reads them. */
export const PLAN_LICENSES = [
  buildLicense({
    description: 'Business',
    familyId: 'family-business',
    id: 'license-business-2',
    lifecycleState: 'PUBLISHED',
    name: 'Business',
    slug: 'business-v2',
    type: 'PAID',
    version: '2',
  }),
  buildLicense({
    description: 'Business',
    familyId: 'family-business',
    id: 'license-business-3',
    lifecycleState: 'PUBLISHED',
    name: 'Business',
    slug: 'business-v3',
    type: 'PAID',
    version: '3',
  }),
  buildLicense({
    description: 'Business',
    familyId: 'family-business',
    id: 'license-business-4',
    lifecycleState: 'DRAFT',
    name: 'Business',
    slug: 'business-v4',
    type: 'PAID',
    version: '4',
  }),
  buildLicense({
    description: 'Starter',
    familyId: 'family-starter',
    id: 'license-starter-1',
    lifecycleState: 'PUBLISHED',
    name: 'Starter',
    slug: 'starter-v1',
    type: 'PAID',
    version: '1',
  }),
];

/** The price the subscription of the fixtures is on. */
export const CURRENT_PRICE = PRO_MONTHLY_PRICE;

export const BUSINESS_V3_MONTHLY = buildPrice({
  billingPeriod: 'MONTHLY',
  displayLabel: 'Business, monthly',
  id: 'price-business-3-monthly',
  unitAmountDecimal: '14900',
});

export const BUSINESS_V2_ANNUAL = buildPrice({
  billingPeriod: 'ANNUAL',
  billingTiming: 'ARREARS',
  displayLabel: 'Business, annual',
  id: 'price-business-2-annual',
  unitAmountDecimal: '99000',
});

export const STARTER_EUR = buildPrice({
  billingPeriod: 'MONTHLY',
  currency: 'EUR',
  displayLabel: 'Starter, monthly',
  id: 'price-starter-eur',
  unitAmountDecimal: '900',
});

/** What each version prices: its prices, which the catalogue keeps the active ones of. */
export const PRICES_BY_LICENSE: Record<string, Price[]> = {
  'business-v2': [CURRENT_PRICE, BUSINESS_V2_ANNUAL],
  'business-v3': [
    BUSINESS_V3_MONTHLY,
    buildPrice({
      billingModel: 'USAGE_BASED',
      displayLabel: 'Per call',
      id: 'price-business-3-usage',
      unitAmountDecimal: '0.1',
    }),
  ],
  'business-v4': [
    buildPrice({
      displayLabel: 'Business draft',
      id: 'price-business-4-draft',
      unitAmountDecimal: '19900',
    }),
  ],
  'starter-v1': [STARTER_EUR],
};

/**
 * The versions with the prices each is sold at, as the one document the plans are read from
 * answers it (`GetLicensesWithPrices`): the handler, and the variables of each request it got.
 * `licenses` and `prices` are the world; the defaults are the plans of the fixtures.
 */
export function servePlans({
  licenses = PLAN_LICENSES,
  prices = PRICES_BY_LICENSE,
}: {
  licenses?: typeof PLAN_LICENSES;
  prices?: Record<string, Price[]>;
} = {}) {
  const requests: Array<Record<string, unknown> | undefined> = [];
  const operations = licensePriceOperations({
    licenses: () => [...licenses],
    prices: (slug, filter) =>
      (prices[slug] ?? []).filter((price) => price.status === filter.status),
  });
  const handler = graphqlOperationHandler({
    GetLicensesWithPrices: (variables) => {
      requests.push(variables);

      return operations.GetLicensesWithPrices(variables);
    },
  });

  return { handler, requests };
}
