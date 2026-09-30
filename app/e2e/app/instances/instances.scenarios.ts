import type { Instance, LicenseEntitlement } from '@/api-client';
import {
  buildCustomer,
  buildDeploymentZone,
  buildLicense,
  TEST_USER,
} from '../_support/fixtures';
import { InstanceAppModel } from '../_support/model/instance-app-model';

const buildInstance = ({
  createdAt = '2026-03-02T09:00:00.000Z',
  customerId,
  customerSlug,
  deploymentZoneId,
  description,
  endLicenseDate = '2027-03-01T00:00:00.000Z',
  id,
  licenseId,
  licenseSlug,
  metadata = {},
  name,
  slug,
  startLicenseDate = '2026-03-01T00:00:00.000Z',
  status = 'HEALTHY',
  updatedAt = createdAt,
}: {
  createdAt?: string;
  customerId: string;
  customerSlug: string;
  deploymentZoneId?: string;
  description: string;
  endLicenseDate?: string;
  id: string;
  licenseId: string;
  licenseSlug: string;
  metadata?: Record<string, unknown>;
  name: string;
  slug: string;
  startLicenseDate?: string;
  status?: Instance['status'];
  updatedAt?: string;
}): Instance => ({
  createdAt,
  createdBy: TEST_USER,
  customerId,
  customerSlug,
  deploymentZoneId,
  description,
  endLicenseDate,
  id,
  licenseId,
  licenseSlug,
  metadata,
  name,
  slug,
  startLicenseDate,
  status,
  updatedAt,
  updatedBy: TEST_USER,
});

const buildLicenseEntitlement = ({
  entitlementName,
  entitlementSlug,
  licenseId,
  licenseSlug,
  limitCapExceededOveragePercent,
  value,
}: {
  entitlementName: string;
  entitlementSlug: string;
  licenseId: string;
  licenseSlug: string;
  // Left off for a hard limit, so the default matches what the API derives
  // from an unspecified percent.
  limitCapExceededOveragePercent?: number;
  value: LicenseEntitlement['value'];
}): LicenseEntitlement => ({
  createdAt: '2026-03-01T09:00:00.000Z',
  createdBy: TEST_USER,
  entitlementName,
  entitlementSlug,
  entitlementType: value.type === 'number' ? 'NUMBER' : 'BOOLEAN',
  licenseId,
  licenseSlug,
  limitCapExceededOveragePercent:
    limitCapExceededOveragePercent ??
    (value.type === 'number' && value.value === -1 ? -1 : 0),
  updatedAt: '2026-03-01T09:00:00.000Z',
  updatedBy: TEST_USER,
  value,
});

// One field per UI type the renderer switches on, so a fixture exercises the
// typed rendering rather than just the string path.
const INSTANCE_METADATA_FIELDS = [
  {
    archivedAt: null,
    displayOrder: 1,
    id: 'field-environment',
    jsonSchema: { type: 'string', enum: ['production', 'staging'] },
    key: 'environment',
    label: 'Environment',
    resourceType: 'INSTANCE' as const,
  },
  {
    archivedAt: null,
    displayOrder: 2,
    id: 'field-region',
    jsonSchema: { type: 'string' },
    key: 'region',
    label: 'Region',
    resourceType: 'INSTANCE' as const,
  },
  {
    archivedAt: null,
    displayOrder: 3,
    id: 'field-seats',
    jsonSchema: { type: 'integer' },
    key: 'seats',
    label: 'Seats',
    resourceType: 'INSTANCE' as const,
  },
  {
    archivedAt: null,
    displayOrder: 4,
    id: 'field-managed',
    jsonSchema: { type: 'boolean' },
    key: 'managed',
    label: 'Managed',
    resourceType: 'INSTANCE' as const,
  },
];

const createBaseEntities = () => {
  const acme = buildCustomer({
    externalCustomerId: 'crm-acme-001',
    id: 'customer-acme',
    name: 'Acme Corp',
    slug: 'acme-corp',
  });
  const beta = buildCustomer({
    externalCustomerId: 'crm-beta-002',
    id: 'customer-beta',
    name: 'Beta Industries',
    slug: 'beta-industries',
  });
  const gamma = buildCustomer({
    externalCustomerId: 'crm-gamma-003',
    id: 'customer-gamma',
    name: 'Gamma Labs',
    slug: 'gamma-labs',
  });

  const enterprise = buildLicense({
    description: 'Enterprise production license',
    id: 'license-enterprise',
    isDefault: true,
    name: 'Enterprise',
    slug: 'enterprise',
    type: 'PAID',
    version: '2026.1',
    versionName: 'Spring 2026',
  });
  const growth = buildLicense({
    description: 'Growth plan for scaling environments',
    id: 'license-growth',
    name: 'Growth',
    slug: 'growth',
    type: 'PAID',
    version: '2026.2',
    versionName: 'Summer 2026',
  });
  const starter = buildLicense({
    description: 'Starter plan for staging environments',
    id: 'license-starter',
    name: 'Starter',
    slug: 'starter',
    type: 'TRIAL',
    version: '2026.1',
    versionName: 'Starter',
  });

  return {
    customers: [acme, beta, gamma],
    licenses: [enterprise, growth, starter],
  };
};

export function createInstancesListModel() {
  const { customers, licenses } = createBaseEntities();
  const [acme, beta] = customers;
  const [enterprise, growth, starter] = licenses;

  return new InstanceAppModel({
    customers: [acme, beta],
    instances: [
      buildInstance({
        customerId: acme.id,
        customerSlug: acme.slug ?? 'acme-corp',
        description: 'Primary production environment',
        id: 'instance-acme-production',
        licenseId: enterprise.id,
        licenseSlug: enterprise.slug ?? 'enterprise',
        name: 'Acme Production',
        slug: 'acme-production',
      }),
      buildInstance({
        customerId: beta.id,
        customerSlug: beta.slug ?? 'beta-industries',
        description: 'Staging environment',
        id: 'instance-beta-staging',
        licenseId: starter.id,
        licenseSlug: starter.slug ?? 'starter',
        name: 'Beta Staging',
        slug: 'beta-staging',
      }),
      buildInstance({
        customerId: acme.id,
        customerSlug: acme.slug ?? 'acme-corp',
        description: 'Retired legacy environment',
        id: 'instance-acme-legacy',
        licenseId: growth.id,
        licenseSlug: growth.slug ?? 'growth',
        name: 'Acme Legacy',
        slug: 'acme-legacy',
      }),
    ],
    licenseEntitlements: [
      buildLicenseEntitlement({
        entitlementName: 'API Calls',
        entitlementSlug: 'api-calls',
        licenseId: enterprise.id,
        licenseSlug: enterprise.slug ?? 'enterprise',
        value: { type: 'number', value: 1000 },
      }),
      // A soft limit: the API keeps accepting usage up to 1,200, so the tab
      // must not read this grant as exhausted at 1,000.
      buildLicenseEntitlement({
        entitlementName: 'Storage GB',
        entitlementSlug: 'storage-gb',
        licenseId: enterprise.id,
        licenseSlug: enterprise.slug ?? 'enterprise',
        limitCapExceededOveragePercent: 20,
        value: { type: 'number', value: 1000 },
      }),
    ],
    licenses,
  });
}

export function createEmptyInstancesModel() {
  const { customers, licenses } = createBaseEntities();

  return new InstanceAppModel({
    customers: customers.slice(0, 2),
    licenses,
  });
}

export function createCustomerScopedInstanceModel() {
  const { customers, licenses } = createBaseEntities();
  const [acme] = customers;

  return new InstanceAppModel({
    customers: [acme],
    licenses: licenses.slice(0, 2),
  });
}

export function createEditableInstanceModel() {
  const { customers, licenses } = createBaseEntities();
  const [acme, beta] = customers;
  const [enterprise, growth] = licenses;

  return new InstanceAppModel({
    customers: [acme, beta],
    instances: [
      buildInstance({
        customerId: acme.id,
        customerSlug: acme.slug ?? 'acme-corp',
        description: 'Primary production environment',
        id: 'instance-acme-production',
        licenseId: enterprise.id,
        licenseSlug: enterprise.slug ?? 'enterprise',
        name: 'Acme Production',
        slug: 'acme-production',
      }),
    ],
    licenses: [enterprise, growth],
  });
}

/**
 * One orphan instance (no zone) and one already deployed, plus two zones to
 * pick from: the two halves of the deploy / migrate action.
 */
export function createDeployableInstanceModel() {
  const { customers, licenses } = createBaseEntities();
  const [acme, beta] = customers;
  const [enterprise, , starter] = licenses;

  const productionEu = buildDeploymentZone({
    description: 'Primary European production zone',
    id: 'zone-production-eu',
    name: 'Production EU',
    slug: 'production-eu',
    type: 'production',
  });
  const stagingEu = buildDeploymentZone({
    description: 'Shared European staging zone',
    id: 'zone-staging-eu',
    name: 'Staging EU',
    slug: 'staging-eu',
    type: 'staging',
  });

  return new InstanceAppModel({
    customers: [acme, beta],
    deploymentZones: [productionEu, stagingEu],
    instances: [
      buildInstance({
        customerId: acme.id,
        customerSlug: acme.slug ?? 'acme-corp',
        description: 'Primary production environment, not deployed yet',
        id: 'instance-acme-production',
        licenseId: enterprise.id,
        licenseSlug: enterprise.slug ?? 'enterprise',
        name: 'Acme Production',
        slug: 'acme-production',
      }),
      buildInstance({
        customerId: beta.id,
        customerSlug: beta.slug ?? 'beta-industries',
        deploymentZoneId: stagingEu.id,
        description: 'Staging environment already deployed',
        id: 'instance-beta-staging',
        licenseId: starter.id,
        licenseSlug: starter.slug ?? 'starter',
        name: 'Beta Staging',
        slug: 'beta-staging',
      }),
    ],
    licenses,
  });
}

/**
 * An org that declares typed instance metadata: drives the metadata card on the
 * detail page and the extra metadata step on the form. One instance carries a
 * key no field declares, which is legitimate on a tolerant resource and has to
 * survive both surfaces.
 */
export function createTypedMetadataInstanceModel() {
  const { customers, licenses } = createBaseEntities();
  const [acme] = customers;
  const [enterprise] = licenses;

  return new InstanceAppModel({
    customers: [acme],
    metadataFields: INSTANCE_METADATA_FIELDS,
    instances: [
      buildInstance({
        customerId: acme.id,
        customerSlug: acme.slug ?? 'acme-corp',
        description: 'Primary production environment',
        id: 'instance-acme-production',
        licenseId: enterprise.id,
        licenseSlug: enterprise.slug ?? 'enterprise',
        metadata: {
          environment: 'production',
          region: 'eu-west-3',
          seats: 250,
          managed: true,
          reported_by_saas: 'agent-7',
        },
        name: 'Acme Production',
        slug: 'acme-production',
      }),
    ],
    licenses,
  });
}

export function createDeletableInstanceModel() {
  const { customers, licenses } = createBaseEntities();
  const gamma = customers[2];
  const starter = licenses[2];

  return new InstanceAppModel({
    customers: [gamma],
    instances: [
      buildInstance({
        customerId: gamma.id,
        customerSlug: gamma.slug ?? 'gamma-labs',
        description: 'Ephemeral sandbox environment',
        id: 'instance-gamma-sandbox',
        licenseId: starter.id,
        licenseSlug: starter.slug ?? 'starter',
        name: 'Gamma Sandbox',
        slug: 'gamma-sandbox',
      }),
    ],
    licenses: [starter],
  });
}
