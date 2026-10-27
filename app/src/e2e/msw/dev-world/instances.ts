import type {
  Customer,
  Entitlement,
  EntitlementUsage,
  Instance,
  License,
  LicenseEntitlement,
} from '@/api-client';
import type { MetadataFieldsQuery } from '@/api-client/graphql/graphql';
import { TEST_USER } from '../../../../e2e/app/_support/fixtures';
import { identityProvenance } from '../../../../e2e/app/_support/model/effective-entitlement';
import { bySlug } from './by-slug';
import { attioLink } from './catalog';
import { currentMonth, daysAgo, daysFromNow, minutesAgo } from './dates';

type MetadataFieldRow = MetadataFieldsQuery['metadataFields']['items'][number];

/** The typed metadata every instance declares. */
export const INSTANCE_METADATA_FIELDS: MetadataFieldRow[] = [
  {
    archivedAt: null,
    displayOrder: 1,
    id: 'field-environment',
    jsonSchema: { enum: ['production', 'staging'], type: 'string' },
    key: 'environment',
    label: 'Environment',
    resourceType: 'INSTANCE',
  },
  {
    archivedAt: null,
    displayOrder: 2,
    id: 'field-region',
    jsonSchema: { type: 'string' },
    key: 'region',
    label: 'Region',
    resourceType: 'INSTANCE',
  },
  {
    archivedAt: null,
    displayOrder: 3,
    id: 'field-managed',
    jsonSchema: { type: 'boolean' },
    key: 'managed',
    label: 'Managed',
    resourceType: 'INSTANCE',
  },
];

const buildInstance = ({
  ageInDays,
  customer,
  integrations,
  license,
  licenseDays: [startedDaysAgo, endsInDays],
  zone,
  ...instance
}: Pick<Instance, 'description' | 'metadata' | 'name' | 'status'> & {
  ageInDays: number;
  customer: Customer;
  integrations?: Instance['integrations'];
  license: License;
  licenseDays: [number, number];
  slug: string;
  zone?: string;
}): Instance => ({
  ...instance,
  createdAt: daysAgo(ageInDays),
  createdBy: TEST_USER,
  customerId: customer.id,
  customerSlug: customer.slug ?? customer.id,
  deploymentZoneId: zone && `deployment-zone-${zone}`,
  endLicenseDate: daysFromNow(endsInDays),
  id: `instance-${instance.slug}`,
  integrations,
  licenseId: license.id,
  licenseSlug: license.slug ?? license.id,
  startLicenseDate: daysAgo(startedDaysAgo),
  updatedAt: daysAgo(ageInDays),
  updatedBy: TEST_USER,
});

/**
 * Seven instances. Acme Legacy waits for a zone after a migration, and its
 * license ends within the month; Beta's trial ends sooner still; Gamma
 * Production was created this week and is not billed yet.
 */
export const createInstances = (
  customers: Customer[],
  licenses: License[],
): Instance[] => {
  const acme = bySlug(customers, 'acme-corp');
  const beta = bySlug(customers, 'beta-industries');
  const globex = bySlug(customers, 'globex');
  const gamma = bySlug(customers, 'gamma-labs');
  const production = (region: string) => ({
    environment: 'production',
    managed: true,
    region,
  });
  const synced = (slug: string, lastError?: string) =>
    attioLink(`attio-workspace-${slug}`, minutesAgo(95), lastError);

  return [
    buildInstance({
      ageInDays: 400,
      customer: acme,
      description: 'Primary production environment',
      integrations: synced('acme-production'),
      license: bySlug(licenses, 'enterprise-v2'),
      licenseDays: [180, 185],
      metadata: production('eu-west-1'),
      name: 'Acme Production',
      slug: 'acme-production',
      status: 'HEALTHY',
      zone: 'production-eu',
    }),
    buildInstance({
      ageInDays: 170,
      customer: acme,
      description: 'US production environment',
      license: bySlug(licenses, 'enterprise-v2'),
      licenseDays: [170, 195],
      metadata: production('us-east-1'),
      name: 'Acme US',
      slug: 'acme-us',
      status: 'HEALTHY',
      zone: 'production-us',
    }),
    buildInstance({
      ageInDays: 410,
      customer: acme,
      description: 'Former production environment, waiting for a new zone',
      license: bySlug(licenses, 'enterprise'),
      licenseDays: [345, 20],
      metadata: { ...production('eu-west-3'), managed: false },
      name: 'Acme Legacy',
      slug: 'acme-legacy',
      status: 'MAINTENANCE',
    }),
    buildInstance({
      ageInDays: 20,
      customer: beta,
      description: 'Trial environment',
      license: bySlug(licenses, 'trial'),
      licenseDays: [20, 10],
      metadata: { environment: 'staging', managed: false, region: 'eu-west-1' },
      name: 'Beta Staging',
      slug: 'beta-staging',
      status: 'DEGRADED',
      zone: 'staging',
    }),
    buildInstance({
      ageInDays: 40,
      customer: globex,
      description: 'Primary production environment',
      integrations: synced('globex-production'),
      license: bySlug(licenses, 'business'),
      licenseDays: [40, 325],
      metadata: production('us-east-1'),
      name: 'Globex Production',
      slug: 'globex-production',
      status: 'HEALTHY',
      zone: 'production-us',
    }),
    buildInstance({
      ageInDays: 38,
      customer: globex,
      description: 'Validation environment',
      integrations: synced(
        'globex-staging',
        'The Attio record was deleted; the next sync recreates it',
      ),
      license: bySlug(licenses, 'starter-v2'),
      licenseDays: [38, 327],
      metadata: { ...production('us-east-1'), environment: 'staging' },
      name: 'Globex Staging',
      slug: 'globex-staging',
      status: 'HEALTHY',
      zone: 'staging',
    }),
    buildInstance({
      ageInDays: 3,
      customer: gamma,
      description: 'Production environment, not billed yet',
      license: bySlug(licenses, 'starter-v2'),
      licenseDays: [3, 362],
      metadata: production('eu-west-3'),
      name: 'Gamma Production',
      slug: 'gamma-production',
      status: 'HEALTHY',
    }),
  ];
};

// What each instance has used of its numeric grants. Beta's trial is at its
// limits, Acme Production nears its seats, and Globex Production is past its
// soft limit on API calls.
const USAGE: Record<string, Record<string, number>> = {
  'acme-production': { 'api-calls': 412_350, seats: 238, 'storage-gb': 3_120 },
  'acme-us': { 'api-calls': 120_400, seats: 80, 'storage-gb': 900 },
  'acme-legacy': { 'api-calls': 18_200, seats: 40, 'storage-gb': 300 },
  'beta-staging': { 'api-calls': 1_000, seats: 3 },
  'globex-production': { 'api-calls': 104_200, seats: 50, 'storage-gb': 120 },
  'globex-staging': { 'api-calls': 2_300, seats: 4, 'storage-gb': 12 },
  'gamma-production': { 'api-calls': 1_200, seats: 6, 'storage-gb': 4 },
};

/** Each instance's usage, measured against the grants of its license. */
export const createEntitlementUsages = (
  instances: Instance[],
  licenseEntitlements: LicenseEntitlement[],
  entitlements: Entitlement[],
): Record<string, EntitlementUsage[]> =>
  Object.fromEntries(
    instances.map((instance) => {
      const slug = instance.slug ?? instance.id;
      const usages = licenseEntitlements
        .filter((grant) => grant.licenseId === instance.licenseId)
        .flatMap((grant): EntitlementUsage[] => {
          const used = USAGE[slug]?.[grant.entitlementSlug ?? ''];
          if (used === undefined) {
            return [];
          }
          const entitlement = bySlug(entitlements, grant.entitlementSlug ?? '');
          return [
            {
              ...(entitlement.resetPeriod === 'MONTH' ? currentMonth() : {}),
              entitlementId: entitlement.id,
              entitlementSlug: grant.entitlementSlug ?? '',
              licenseId: grant.licenseId,
              licenseSlug: grant.licenseSlug,
              source: 'license',
              limit: grant.value,
              // What the API serves for each row: the percent that applies, and the
              // provenance of a limit that only the license grants. The instances that
              // hold add-ons or boosts have theirs composed (`applyAddonContributions`).
              limitCapExceededOveragePercent:
                grant.limitCapExceededOveragePercent ??
                (grant.value.type === 'number' && grant.value.value === -1
                  ? -1
                  : 0),
              provenance: identityProvenance(grant),
              value: { type: 'number', value: used },
            },
          ];
        });
      return [slug, usages];
    }),
  );
