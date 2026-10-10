import type { License } from '@/api-client';
import { STRIPE_CONNECTOR_NAME } from '@/domains/billing';
import type { GetAttioSyncedRecordsQuery } from '@/api-client/graphql/graphql';
import { ATTIO_CONNECTOR_NAME } from '@/domains/crm-sync';
import { AuditTrailAppModel } from '../../../../e2e/app/_support/model/audit-trail-app-model';
import { BillingAppModel } from '../../../../e2e/app/_support/model/billing-app-model';
import type { StripeStanding } from '../../../../e2e/app/_support/model/billing-capabilities';
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
import { createAddons } from './addons';
import { createBillingCapabilities, createBillingInvoices } from './billing';
import {
  createBillingBlocks,
  createBillingSubscriptions,
} from './subscriptions';
import { createRetentionStart, createUsageReports } from './usage-history';
import {
  createStripeInvoices,
  createStripeProviders,
  moveInvoiceToStripe,
  moveSubscriptionToStripe,
} from './stripe';
import { createPublishableKeys } from './publishable-keys';
import { createVouchers } from './vouchers';
import { bySlug } from './by-slug';
import { createFeatureFlags } from './feature-flags';
import {
  createEntitlementUsages,
  createInstances,
  INSTANCE_METADATA_FIELDS,
} from './instances';
import { createLicensePrices, BILLED_LICENSE_SLUGS } from './pricing';
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
    licensePrices: createLicensePrices(licenses),
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
export function createDevMockConfig({
  stripe = 'connected',
}: {
  /** Where the Stripe connector stands: connected to a test account unless the console is started with another. */
  stripe?: StripeStanding;
} = {}): E2EMswConfig {
  const world = createDevWorld();
  const stripeWorld = createStripeInvoices(world);
  const baseInvoices = createBillingInvoices(world);
  // Acme US collects through Stripe: its held renewal is Stripe's, and the invoices
  // before it were pushed there.
  const billingInvoices = {
    ...baseInvoices,
    invoices: [
      ...baseInvoices.invoices.map((invoice) =>
        invoice.id === 'inv-acme-us-held'
          ? moveInvoiceToStripe(invoice)
          : invoice,
      ),
      ...stripeWorld.invoices,
    ],
  };
  const baseSubscriptions = createBillingSubscriptions(world);
  const billingSubscriptions = {
    ...baseSubscriptions,
    subscriptions: baseSubscriptions.subscriptions.map((subscription) =>
      subscription.instanceSlug === 'acme-us'
        ? moveSubscriptionToStripe(subscription)
        : subscription,
    ),
  };
  const { addonCatalogue, attachments } = createAddons(world);
  const { boostedInstances, seed: voucherCatalogue } = createVouchers(world);
  const billingBlocks = createBillingBlocks(
    billingSubscriptions.subscriptions,
    billingInvoices.invoices,
  );
  const instances = new InstanceAppModel({
    billingBlocks: billingBlocks.instances,
    customers: world.customers,
    deploymentZones: world.deploymentZones,
    entitlementUsagesByInstance: world.entitlementUsagesByInstance,
    instances: world.instances,
    licenseEntitlements: world.licenseEntitlements,
    licenses: world.licenses,
    metadataFields: INSTANCE_METADATA_FIELDS,
    retentionStart: createRetentionStart(),
    usageReports: createUsageReports(),
  });

  const billing = new BillingAppModel({
    addonCatalogue,
    addons: attachments,
    capabilities: createBillingCapabilities(stripe),
    ...billingInvoices,
    ...billingSubscriptions,
    providerTruth: stripeWorld.providerTruth,
    providers: createStripeProviders(),
    publishableKeys: createPublishableKeys(),
    voucherCatalogue,
  });
  // An add-on, or a boost, applies at once, so the effective limits of the instances
  // that hold some already include what they add.
  for (const instanceSlug of new Set([
    ...Object.keys(attachments),
    ...boostedInstances,
  ])) {
    instances.applyAddonContributions(
      instanceSlug,
      billing.instanceAddons.contributionsOf(instanceSlug),
      billing.vouchers.boostsOf(instanceSlug),
    );
  }

  return {
    auditTrail: new AuditTrailAppModel(
      createAuditTrail(world),
    ).serializeForMsw(),
    billing: billing.serializeForMsw(),
    connectors: new ConnectorAppModel({
      // Saved with a restricted key of a test account, and active: what routes to
      // Stripe (Acme US) keeps it from being disconnected.
      stripe:
        stripe === 'connected' || stripe === 'connectedLive'
          ? {
              activated: true,
              livemode: stripe === 'connectedLive',
              settings: {
                connector_name: STRIPE_CONNECTOR_NAME,
                settings: {
                  autoFinalize: true,
                  automaticTax: false,
                  stripeSecretKey: '***',
                  taxBehavior: 'EXCLUSIVE',
                },
              },
            }
          : undefined,
      syncedRecords: syncedWithAttio(world),
    }).serializeForMsw(),
    customers: new CustomerAppModel({
      billingBlocks: billingBlocks.customers,
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
      billedVersions: BILLED_LICENSE_SLUGS,
      entitlements: world.entitlements,
      grants: world.licenseEntitlements,
      licenses: world.licenses,
      prices: world.licensePrices,
      // The family sold self-serve is the one a buyer finds in the public catalogue.
      publicFamilyIds: ['family-starter'],
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
