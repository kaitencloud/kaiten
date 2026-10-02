import type { License } from '@/api-client';
import type { GetAttioSyncedRecordsQuery } from '@/api-client/graphql/graphql';
import { ATTIO_CONNECTOR_NAME } from '@/domains/crm-sync';
import { AuditTrailAppModel } from '../../../../e2e/app/_support/model/audit-trail-app-model';
import { ConnectorAppModel } from '../../../../e2e/app/_support/model/connector-app-model';
import { CustomerAppModel } from '../../../../e2e/app/_support/model/customer-app-model';
import { DashboardAppModel } from '../../../../e2e/app/_support/model/dashboard-app-model';
import { EntitlementAppModel } from '../../../../e2e/app/_support/model/entitlement-app-model';
import { FeatureFlagAppModel } from '../../../../e2e/app/_support/model/feature-flag-app-model';
import { InstanceAppModel } from '../../../../e2e/app/_support/model/instance-app-model';
import { LicenseAppModel } from '../../../../e2e/app/_support/model/license-app-model';
import { NotificationAppModel } from '../../../../e2e/app/_support/model/notification-app-model';
import {
  type ReleaseManagementAppInstance,
  ReleaseManagementAppModel,
} from '../../../../e2e/app/_support/model/release-management-app-model';
import type { E2EMswConfig } from '../../../../e2e/app/_support/contracts/msw-slots';
import {
  createAuditTrail,
  createNotifications,
  NOTIFICATION_STREAM_TEMPLATES,
} from './activity';
import {
  createCustomers,
  createEntitlements,
  createLicenseEntitlements,
  createLicenses,
} from './catalog';
import { bySlug } from './by-slug';
import { createFeatureFlags } from './feature-flags';
import {
  createEntitlementUsages,
  createInstances,
  INSTANCE_METADATA_FIELDS,
} from './instances';
import { createReleaseTrain } from './release-train';

const STREAM_DEMO_INTERVAL_MS = 45_000;

/**
 * The records of the mocked console, each declared once: customers and the
 * catalogue (./catalog, ./feature-flags), then the releases and zones
 * (./release-train) and the instances that refer to them all (./instances). Every reference is by the id or slug
 * of a record declared here.
 */
export const createDevWorld = () => {
  const customers = createCustomers();
  const entitlements = createEntitlements();
  const licenses = createLicenses();
  const licenseEntitlements = createLicenseEntitlements(licenses, entitlements);
  const instances = createInstances(customers, licenses);

  return {
    ...createReleaseTrain(),
    customers,
    entitlementUsagesByInstance: createEntitlementUsages(
      instances,
      licenseEntitlements,
      entitlements,
    ),
    entitlements,
    featureFlags: createFeatureFlags(),
    instances,
    licenseEntitlements,
    licenses,
  };
};

type DevWorld = ReturnType<typeof createDevWorld>;

const toDashboardLicense = (license: License) => ({
  id: license.id,
  name: license.name,
  slug: license.slug ?? license.id,
  type: license.type,
});

/** The dashboard's counts and charts, over the same records. */
const dashboardData = ({
  customers,
  instances,
  licenses,
}: DevWorld): ConstructorParameters<typeof DashboardAppModel>[0] => ({
  customers: customers.map(({ createdAt, id, name, slug }) => ({
    createdAt,
    id,
    name,
    slug: slug ?? id,
  })),
  instances: instances.map((instance) => ({
    createdAt: instance.createdAt,
    customerId: instance.customerId,
    endLicenseDate: instance.endLicenseDate,
    id: instance.id,
    license: toDashboardLicense(bySlug(licenses, instance.licenseSlug)),
    licenseId: instance.licenseId,
    name: instance.name,
    slug: instance.slug ?? instance.id,
    startLicenseDate: instance.startLicenseDate,
  })),
  licenses: licenses.map(toDashboardLicense),
});

/** The customers and instances the CRM sync linked to Attio. */
const syncedWithAttio = ({
  customers,
  instances,
}: DevWorld): GetAttioSyncedRecordsQuery => {
  const synced = (
    records: Array<{
      id: string;
      integrations?: Record<string, unknown>;
      name: string;
      slug?: string;
    }>,
  ) => ({
    items: records
      .filter((record) => record.integrations?.[ATTIO_CONNECTOR_NAME])
      .map((record) => ({
        id: record.id,
        integrations: record.integrations ?? {},
        name: record.name,
        slug: record.slug ?? record.id,
      })),
  });
  return { customers: synced(customers), instances: synced(instances) };
};

/** The instances deployed on a zone, as the release pages list them. */
const deployedInstances = ({
  customers,
  instances,
}: DevWorld): ReleaseManagementAppInstance[] =>
  instances.flatMap((instance) =>
    instance.deploymentZoneId
      ? [
          {
            customer: {
              id: instance.customerId,
              name:
                customers.find(
                  (customer) => customer.id === instance.customerId,
                )?.name ?? null,
            },
            deploymentZoneId: instance.deploymentZoneId,
            description: instance.description,
            id: instance.id,
            name: instance.name,
            slug: instance.slug ?? instance.id,
          },
        ]
      : [],
  );

/**
 * The seed of every area, each the world seen through the model of that area,
 * so a link from one area to another leads to a record the other one knows.
 * Each model still keeps its own copy: what a page changes stays in the model
 * of its area, and another area keeps showing the record as it was seeded.
 * The platform flags stay off, as on a self-hosted deployment.
 */
export function createDevMockConfig(): E2EMswConfig {
  const world = createDevWorld();
  const instances = new InstanceAppModel({
    customers: world.customers,
    deploymentZones: world.deploymentZones,
    entitlementUsagesByInstance: world.entitlementUsagesByInstance,
    instances: world.instances,
    licenseEntitlements: world.licenseEntitlements,
    licenses: world.licenses,
    metadataFields: INSTANCE_METADATA_FIELDS,
  });

  return {
    auditTrail: new AuditTrailAppModel(
      createAuditTrail(world),
    ).serializeForMsw(),
    connectors: new ConnectorAppModel({
      syncedRecords: syncedWithAttio(world),
    }).serializeForMsw(),
    customers: new CustomerAppModel({
      customers: world.customers,
      instances: instances.getInstancesWithRelations().instances.items,
    }).serializeForMsw(),
    dashboard: new DashboardAppModel(dashboardData(world)).serializeForMsw(),
    entitlements: new EntitlementAppModel({
      entitlements: world.entitlements,
    }).serializeForMsw(),
    featureFlags: new FeatureFlagAppModel({
      featureFlags: world.featureFlags,
    }).serializeForMsw(),
    instances: instances.serializeForMsw(),
    licenses: new LicenseAppModel({
      entitlements: world.entitlements,
      licenses: world.licenses,
    }).serializeForMsw(),
    notifications: new NotificationAppModel({
      notifications: createNotifications(world.instances),
      streamDemoIntervalMs: STREAM_DEMO_INTERVAL_MS,
      streamDemoTemplates: NOTIFICATION_STREAM_TEMPLATES,
    }).serializeForMsw(),
    releaseManagement: new ReleaseManagementAppModel({
      components: world.components,
      deployments: world.deployments,
      deploymentZones: world.deploymentZones,
      instances: deployedInstances(world),
      releases: world.releases,
    }).serializeForMsw(),
  };
}
