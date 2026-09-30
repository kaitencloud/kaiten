import type {
  Instance as ApiInstance,
  DeploymentZone,
  Release,
} from '@/api-client';
import type { GetInstancesWithRelationsQuery } from '@/api-client/graphql/graphql';
import type { ReleaseManagementOverviewRelease } from '@/domains/release-management';
import { ATTIO_CONNECTOR_NAME } from '@/domains/crm-sync';
import type { Customer as CustomerTableRow } from '@/domains/customer-management';
import {
  storyActor,
  storyCustomers,
  storyLastWeek,
  storyLicenses,
  storyNextMonth,
  storyNow,
  storyUser,
  storyYesterday,
} from './storybook-core-fixtures';

export const storyInstances = [
  {
    createdAt: storyLastWeek,
    createdBy: storyUser,
    customerId: storyCustomers[0].id,
    customerSlug: storyCustomers[0].slug,
    deploymentZoneId: 'zone-production-eu',
    description: 'Primary production workspace for Acme.',
    endLicenseDate: storyNextMonth,
    id: 'instance-acme-production',
    licenseId: storyLicenses[0].id,
    licenseSlug: storyLicenses[0].slug,
    metadata: {
      region: 'eu-west-1',
      tier: 'enterprise',
    },
    name: 'Acme Production',
    slug: 'acme-production',
    startLicenseDate: '2026-03-24T08:00:00.000Z',
    status: 'HEALTHY',
    updatedAt: storyYesterday,
    updatedBy: storyUser,
  },
  {
    createdAt: storyLastWeek,
    createdBy: storyUser,
    customerId: storyCustomers[1].id,
    customerSlug: storyCustomers[1].slug,
    deploymentZoneId: 'zone-staging',
    description: 'Integration sandbox for Nova.',
    endLicenseDate: '2026-06-24T08:00:00.000Z',
    id: 'instance-nova-sandbox',
    licenseId: storyLicenses[1].id,
    licenseSlug: storyLicenses[1].slug,
    metadata: {
      region: 'us-east-1',
      tier: 'trial',
    },
    name: 'Nova Sandbox',
    slug: 'nova-sandbox',
    startLicenseDate: storyLastWeek,
    status: 'DEGRADED',
    updatedAt: storyNow,
    updatedBy: storyUser,
  },
] satisfies ApiInstance[];

export const storyLegacyInstance = {
  ...storyInstances[1],
  name: 'Nova Legacy',
  slug: 'nova-legacy',
} satisfies ApiInstance;

export const storyInstanceRows = [
  {
    createdAt: storyInstances[0].createdAt,
    customer: {
      id: storyCustomers[0].id,
      name: storyCustomers[0].name,
      slug: storyCustomers[0].slug,
    },
    customerId: storyCustomers[0].id,
    deploymentZoneId: storyInstances[0].deploymentZoneId ?? null,
    description: storyInstances[0].description,
    endLicenseDate: storyInstances[0].endLicenseDate,
    license: {
      id: storyLicenses[0].id,
      name: storyLicenses[0].name,
      type: 'PAID',
    },
    licenseId: storyLicenses[0].id,
    metadata: storyInstances[0].metadata,
    integrations: {
      [ATTIO_CONNECTOR_NAME]: {
        external_id: 'rec_workspace_acme',
        synced_at: storyYesterday,
      },
    },
    name: storyInstances[0].name,
    slug: storyInstances[0].slug,
    startLicenseDate: storyInstances[0].startLicenseDate,
    status: storyInstances[0].status,
    lifecycleStage: 'ACTIVE',
  },
  {
    createdAt: storyInstances[1].createdAt,
    customer: {
      id: storyCustomers[1].id,
      name: storyCustomers[1].name,
      slug: storyCustomers[1].slug,
    },
    customerId: storyCustomers[1].id,
    deploymentZoneId: storyInstances[1].deploymentZoneId ?? null,
    description: storyInstances[1].description,
    endLicenseDate: storyInstances[1].endLicenseDate,
    license: {
      id: storyLicenses[1].id,
      name: storyLicenses[1].name,
      type: 'TRIAL',
    },
    licenseId: storyLicenses[1].id,
    metadata: storyInstances[1].metadata,
    integrations: {},
    name: storyInstances[1].name,
    slug: storyInstances[1].slug,
    startLicenseDate: storyInstances[1].startLicenseDate,
    status: storyInstances[1].status,
    lifecycleStage: 'AT_RISK',
  },
  {
    createdAt: storyLegacyInstance.createdAt,
    customer: {
      id: storyCustomers[1].id,
      name: storyCustomers[1].name,
      slug: storyCustomers[1].slug,
    },
    customerId: storyCustomers[1].id,
    deploymentZoneId: null,
    description: storyLegacyInstance.description,
    endLicenseDate: storyLegacyInstance.endLicenseDate,
    license: {
      id: storyLicenses[1].id,
      name: storyLicenses[1].name,
      type: 'TRIAL',
    },
    licenseId: storyLicenses[1].id,
    metadata: storyLegacyInstance.metadata,
    integrations: {},
    name: storyLegacyInstance.name,
    slug: storyLegacyInstance.slug,
    startLicenseDate: storyLegacyInstance.startLicenseDate,
    status: storyLegacyInstance.status,
    lifecycleStage: 'CHURNED',
  },
] satisfies GetInstancesWithRelationsQuery['instances']['items'];

export const storyCustomerRows = storyCustomers.map((customer, index) => {
  const instance = storyInstances[index];
  const licenseType = index === 0 ? 'PAID' : 'TRIAL';

  return {
    __typename: 'Customer',
    createdAt: customer.createdAt,
    domain: customer.domain ?? null,
    externalCustomerId: customer.externalCustomerId,
    integrations:
      index === 0
        ? {
            [ATTIO_CONNECTOR_NAME]: {
              external_id: 'rec_company_acme',
              synced_at: storyYesterday,
            },
          }
        : {},
    instances: [
      {
        __typename: 'Instance',
        description: instance.description,
        license: {
          __typename: 'License',
          type: licenseType,
        },
        name: instance.name,
        slug: instance.slug,
      },
    ],
    licenseTypes: [licenseType],
    name: customer.name,
    nbInstances: 1,
    slug: customer.slug,
    updatedAt: customer.updatedAt,
  };
}) satisfies CustomerTableRow[];

export const storyDeploymentZones = [
  {
    createdAt: storyLastWeek,
    createdBy: storyUser,
    description: 'European production cluster.',
    metadata: { region: 'eu-west-1' },
    id: 'zone-production-eu',
    name: 'Production EU',
    releaseId: 'release-1-5-0',
    slug: 'production-eu',
    type: 'production',
    updatedAt: storyYesterday,
    updatedBy: storyUser,
  },
  {
    createdAt: storyLastWeek,
    createdBy: storyUser,
    description: 'Staging cluster.',
    metadata: { region: 'us-east-1' },
    id: 'zone-staging',
    name: 'Staging',
    releaseId: 'release-1-5-0-rc1',
    slug: 'staging',
    type: 'staging',
    updatedAt: storyNow,
    updatedBy: storyUser,
  },
] satisfies DeploymentZone[];

export const storyReleases = [
  {
    components: [],
    createdAt: storyLastWeek,
    createdBy: storyUser,
    description: 'Stable production release.',
    id: 'release-1-5-0',
    slug: 'release-1-5-0',
    version: 'v1.5.0',
  },
  {
    components: [],
    createdAt: storyLastWeek,
    createdBy: storyUser,
    description: 'Release candidate in staging.',
    id: 'release-1-5-0-rc1',
    slug: 'release-1-5-0-rc1',
    version: 'v1.5.0-rc1',
  },
] satisfies Release[];

export const storyOverviewReleases = [
  {
    components: [],
    createdAt: storyReleases[0].createdAt,
    createdBy: storyActor,
    deploymentZones: [
      {
        createdAt: storyDeploymentZones[0].createdAt,
        description: storyDeploymentZones[0].description,
        id: storyDeploymentZones[0].id,
        name: storyDeploymentZones[0].name,
        releaseId: storyDeploymentZones[0].releaseId,
        slug: storyDeploymentZones[0].slug,
        type: storyDeploymentZones[0].type,
        updatedAt: storyDeploymentZones[0].updatedAt,
      },
    ],
    description: storyReleases[0].description,
    id: storyReleases[0].id,
    instances: [
      {
        customer: {
          id: storyCustomers[0].id,
          name: storyCustomers[0].name,
        },
        deploymentZoneId: storyDeploymentZones[0].id,
        description: storyInstances[0].description,
        id: storyInstances[0].id,
        name: storyInstances[0].name,
        slug: storyInstances[0].slug,
      },
    ],
    slug: storyReleases[0].slug,
    version: storyReleases[0].version,
  },
] satisfies ReleaseManagementOverviewRelease[];
