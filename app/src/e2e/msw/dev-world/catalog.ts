import type {
  Customer,
  CustomerIntegration,
  Entitlement,
  License,
  LicenseEntitlement,
} from '@/api-client';
import { ATTIO_CONNECTOR_NAME } from '@/domains/crm-sync';
import {
  buildCustomer,
  buildLicense,
  TEST_USER,
} from '../../../../e2e/app/_support/fixtures';
import { daysAgo, minutesAgo } from './dates';

/** A record's link to Attio, as the CRM sync leaves it on a customer or an instance. */
export const attioLink = (
  externalId: string,
  syncedAt: string,
  lastError?: string,
): Record<string, CustomerIntegration> => ({
  [ATTIO_CONNECTOR_NAME]: {
    external_id: externalId,
    ...(lastError ? { last_error: lastError } : {}),
    metadata: {},
    synced_at: syncedAt,
  },
});

/**
 * Three customers with instances, and Gamma Labs, signed this week, whose first
 * instance is not billed yet. Acme and Globex have a billing e-mail; Beta and
 * Gamma have none.
 */
export const createCustomers = (): Customer[] => [
  {
    ...buildCustomer({
      billingEmail: 'ap@acme.com',
      createdAt: daysAgo(420),
      domain: 'acme.com',
      externalCustomerId: 'crm-acme-001',
      id: 'customer-acme',
      name: 'Acme Corp',
      slug: 'acme-corp',
    }),
    integrations: attioLink('attio-company-acme', minutesAgo(95)),
  },
  buildCustomer({
    createdAt: daysAgo(150),
    domain: 'beta-industries.io',
    externalCustomerId: 'crm-beta-002',
    id: 'customer-beta',
    name: 'Beta Industries',
    slug: 'beta-industries',
  }),
  {
    ...buildCustomer({
      billingEmail: 'billing@globex.com',
      createdAt: daysAgo(45),
      domain: 'globex.com',
      externalCustomerId: 'crm-globex-003',
      id: 'customer-globex',
      name: 'Globex',
      slug: 'globex',
    }),
    integrations: attioLink('attio-company-globex', minutesAgo(95)),
  },
  buildCustomer({
    createdAt: daysAgo(4),
    id: 'customer-gamma',
    name: 'Gamma Labs',
    slug: 'gamma-labs',
  }),
];

const buildEntitlement = (
  entitlement: Pick<Entitlement, 'description' | 'name' | 'type'> &
    Partial<Entitlement> & { slug: string },
): Entitlement => ({
  aggregationMethod: 'COUNT',
  createdAt: daysAgo(500),
  id: `entitlement-${entitlement.slug}`,
  updatedAt: daysAgo(500),
  ...entitlement,
});

export const createEntitlements = (): Entitlement[] => [
  buildEntitlement({
    aggregationMethod: 'SUM',
    description: 'Calls to the public API, counted per calendar month',
    displayOrder: 1,
    name: 'API Calls',
    resetAnchor: 'CALENDAR',
    resetPeriod: 'MONTH',
    slug: 'api-calls',
    type: 'NUMBER',
    unitPlural: 'calls',
    unitSingular: 'call',
    warningThresholdPercent: 80,
  }),
  buildEntitlement({
    aggregationMethod: 'LATEST',
    description: 'Named users who can sign in',
    displayOrder: 2,
    name: 'Seats',
    slug: 'seats',
    type: 'NUMBER',
    unitPlural: 'seats',
    unitSingular: 'seat',
    warningThresholdPercent: 90,
  }),
  buildEntitlement({
    aggregationMethod: 'MAX',
    description: 'Disk space the instance stores its files on',
    displayOrder: 3,
    name: 'Storage',
    slug: 'storage-gb',
    type: 'NUMBER',
    unitPlural: 'GB',
    unitSingular: 'GB',
  }),
  buildEntitlement({
    description: 'Access to the advanced analytics dashboard',
    displayOrder: 4,
    name: 'Advanced Analytics',
    slug: 'advanced-analytics',
    type: 'BOOLEAN',
  }),
  buildEntitlement({
    description: 'Answers from the support team within four hours',
    displayOrder: 5,
    name: 'Priority Support',
    slug: 'priority-support',
    type: 'BOOLEAN',
  }),
];

type CommercialFields = Pick<
  License,
  | 'pricingType'
  | 'requiresPaymentMethod'
  | 'selfServeCtaUrl'
  | 'trialPeriodDays'
>;

const familyVersion = ({
  ageInDays,
  commercial,
  family,
  isDefault = false,
  lifecycleState,
  type = 'PAID',
  version,
  versionName,
}: {
  ageInDays: number;
  /** How the version is sold; a version left out is sold on request. */
  commercial?: CommercialFields;
  family: { description: string; name: string; slug: string };
  isDefault?: boolean;
  lifecycleState: License['lifecycleState'];
  type?: License['type'];
  version: number;
  versionName: string;
}): License => ({
  ...buildLicense({
    createdAt: daysAgo(ageInDays),
    description: family.description,
    familyId: `family-${family.slug}`,
    id: `license-${family.slug}-v${version}`,
    isDefault,
    lifecycleState,
    name: family.name,
    // A family takes the slug of the version that opened it, and later
    // versions are slugged after the family.
    slug: version === 1 ? family.slug : `${family.slug}-v${version}`,
    type,
    version: String(version),
    versionName,
  }),
  ...commercial,
});

// Self-serve with a card on file and a trial, self-serve for free, or a
// conversation: the three ways a version is sold.
const SELF_SERVE: CommercialFields = {
  pricingType: 'PAID',
  requiresPaymentMethod: true,
  trialPeriodDays: 14,
};
const FREE_TRIAL: CommercialFields = { pricingType: 'FREE' };
const CONTACT_SALES: CommercialFields = {
  pricingType: 'CUSTOM',
  selfServeCtaUrl: 'https://kaiten-sushi.example/contact-sales',
};

const TRIAL = {
  description: 'Thirty days to try the product',
  name: 'Trial',
  slug: 'trial',
};
const STARTER = {
  description: 'For a first production instance',
  name: 'Starter',
  slug: 'starter',
};
const BUSINESS = {
  description: 'Everything in Starter, with analytics',
  name: 'Business',
  slug: 'business',
};
const ENTERPRISE = {
  description: 'Unlimited API calls and priority support',
  name: 'Enterprise',
  slug: 'enterprise',
};

/**
 * Four families. Starter carries the whole lifecycle (v1 withdrawn, v2 the
 * default on sale, v3 being prepared); Enterprise sells two versions, and
 * Acme still runs one instance on the older.
 */
export const createLicenses = (): License[] => [
  familyVersion({
    ageInDays: 400,
    commercial: FREE_TRIAL,
    family: TRIAL,
    isDefault: true,
    lifecycleState: 'PUBLISHED',
    type: 'TRIAL',
    version: 1,
    versionName: '2026',
  }),
  familyVersion({
    ageInDays: 500,
    family: STARTER,
    lifecycleState: 'ARCHIVED',
    version: 1,
    versionName: '2025',
  }),
  familyVersion({
    ageInDays: 200,
    commercial: SELF_SERVE,
    family: STARTER,
    isDefault: true,
    lifecycleState: 'PUBLISHED',
    version: 2,
    versionName: '2026',
  }),
  familyVersion({
    ageInDays: 3,
    commercial: SELF_SERVE,
    family: STARTER,
    lifecycleState: 'DRAFT',
    version: 3,
    versionName: '2027',
  }),
  familyVersion({
    ageInDays: 120,
    commercial: { pricingType: 'PAID', requiresPaymentMethod: false },
    family: BUSINESS,
    isDefault: true,
    lifecycleState: 'PUBLISHED',
    version: 1,
    versionName: '2026',
  }),
  familyVersion({
    ageInDays: 480,
    family: ENTERPRISE,
    lifecycleState: 'PUBLISHED',
    version: 1,
    versionName: '2025',
  }),
  familyVersion({
    ageInDays: 180,
    commercial: CONTACT_SALES,
    family: ENTERPRISE,
    isDefault: true,
    lifecycleState: 'PUBLISHED',
    version: 2,
    versionName: '2026',
  }),
];

type Grant = number | boolean | { overagePercent: number; value: number };

// What each license version grants, by entitlement slug. -1 is unlimited; an
// overage percent makes a soft limit, which the API lets usage go past.
const GRANTS: Record<string, Record<string, Grant>> = {
  trial: { 'advanced-analytics': false, 'api-calls': 1_000, seats: 3 },
  starter: { 'api-calls': 5_000, seats: 5, 'storage-gb': 20 },
  'starter-v2': { 'api-calls': 10_000, seats: 10, 'storage-gb': 50 },
  'starter-v3': {
    'advanced-analytics': true,
    'api-calls': 20_000,
    seats: 15,
    'storage-gb': 100,
  },
  business: {
    'advanced-analytics': true,
    'api-calls': { overagePercent: 10, value: 100_000 },
    seats: 50,
    'storage-gb': 500,
  },
  enterprise: {
    'advanced-analytics': true,
    'api-calls': 500_000,
    'priority-support': true,
    seats: 200,
    'storage-gb': 2_000,
  },
  'enterprise-v2': {
    'advanced-analytics': true,
    'api-calls': -1,
    'priority-support': true,
    seats: 250,
    'storage-gb': { overagePercent: 20, value: 5_000 },
  },
};

const toLicenseEntitlement = (
  license: License,
  entitlement: Entitlement,
  grant: Grant,
): LicenseEntitlement => {
  const { overagePercent, value } =
    typeof grant === 'object'
      ? grant
      : { overagePercent: undefined, value: grant };
  return {
    createdAt: license.createdAt,
    createdBy: TEST_USER,
    entitlementName: entitlement.name,
    entitlementSlug: entitlement.slug,
    entitlementType: entitlement.type === 'BOOLEAN' ? 'BOOLEAN' : 'NUMBER',
    licenseId: license.id,
    licenseSlug: license.slug ?? license.id,
    limitCapExceededOveragePercent: overagePercent ?? (value === -1 ? -1 : 0),
    updatedAt: license.createdAt,
    updatedBy: TEST_USER,
    value:
      typeof value === 'number'
        ? { type: 'number', value }
        : { type: 'boolean', value },
  };
};

/** Every grant of every license version, in the catalogue's order. */
export const createLicenseEntitlements = (
  licenses: License[],
  entitlements: Entitlement[],
): LicenseEntitlement[] =>
  licenses.flatMap((license) =>
    entitlements.flatMap((entitlement) => {
      const grant = GRANTS[license.slug ?? '']?.[entitlement.slug ?? ''];
      return grant === undefined
        ? []
        : [toLicenseEntitlement(license, entitlement, grant)];
    }),
  );
