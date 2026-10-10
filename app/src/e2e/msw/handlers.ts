import { HttpResponse, http } from 'msw/http';
import type { E2EMswConfig } from '../../../e2e/app/_support/contracts/msw-slots';
import { AuditTrailAppModel } from '../../../e2e/app/_support/model/audit-trail-app-model';
import { BillingAppModel } from '../../../e2e/app/_support/model/billing-app-model';
import { ConnectorAppModel } from '../../../e2e/app/_support/model/connector-app-model';
import { CustomerAppModel } from '../../../e2e/app/_support/model/customer-app-model';
import { DashboardAppModel } from '../../../e2e/app/_support/model/dashboard-app-model';
import { EntitlementAppModel } from '../../../e2e/app/_support/model/entitlement-app-model';
import { FeatureFlagAppModel } from '../../../e2e/app/_support/model/feature-flag-app-model';
import { InstanceAppModel } from '../../../e2e/app/_support/model/instance-app-model';
import { LicenseAppModel } from '../../../e2e/app/_support/model/license-app-model';
import { NotificationAppModel } from '../../../e2e/app/_support/model/notification-app-model';
import { NO_PLATFORM_FLAGS } from '../../../e2e/app/_support/model/platform-flags';
import type { LicenseCatalogue } from '../../../e2e/app/_support/model/graphql-operations';
import { ReleaseManagementAppModel } from '../../../e2e/app/_support/model/release-management-app-model';
import { auditTrailHandlers } from './audit-trail-handlers';
import { billingHandlers } from './billing-handlers';
import { connectorHandlers } from './connector-handlers';
import { customerHandlers } from './customer-handlers';
import { dashboardHandlers } from './dashboard-handlers';
import { entitlementHandlers } from './entitlement-handlers';
import { featureFlagHandlers } from './feature-flag-handlers';
import { flagEvaluationHandlers } from './flag-evaluation-handlers';
import { withFallbacksLast } from './handler-factory';
import { instanceHandlers } from './instance-handlers';
import { licenseHandlers } from './license-handlers';
import { notificationHandlers } from './notification-handlers';
import type { persistSlot } from './persistence';
import { releaseManagementHandlers } from './release-management-handlers';
import {
  integrationStubHandlers,
  noWebhooksServiceHandler,
} from './integration-stub-handlers';
import { shellHandlers } from './shell-handlers';

/** The same first-match assembly in Node tests and in the browser. */
export function createMockHandlers(
  effectiveConfig: E2EMswConfig,
  // What Kaiten Cloud decides about the organization when no slot says: its
  // platform flags, and whether it is served webhooks. 'off' answers as a
  // self-hosted deployment would; 'passthrough' leaves it to the real stack.
  unmockedPlatform: 'off' | 'passthrough' = 'off',
  persist: typeof persistSlot = () => {},
  strict = false,
) {
  const auditTrail = effectiveConfig.auditTrail
    ? AuditTrailAppModel.fromSerialized(effectiveConfig.auditTrail)
    : null;
  const billing = effectiveConfig.billing
    ? BillingAppModel.fromSerialized(effectiveConfig.billing)
    : null;
  const connectors = effectiveConfig.connectors
    ? ConnectorAppModel.fromSerialized(effectiveConfig.connectors)
    : null;
  const customers = effectiveConfig.customers
    ? CustomerAppModel.fromSerialized(effectiveConfig.customers)
    : null;
  const dashboard = effectiveConfig.dashboard
    ? DashboardAppModel.fromSerialized(effectiveConfig.dashboard)
    : null;
  const entitlements = effectiveConfig.entitlements
    ? EntitlementAppModel.fromSerialized(effectiveConfig.entitlements)
    : null;
  const featureFlags = effectiveConfig.featureFlags
    ? FeatureFlagAppModel.fromSerialized(effectiveConfig.featureFlags)
    : null;
  const instances = effectiveConfig.instances
    ? InstanceAppModel.fromSerialized(effectiveConfig.instances)
    : null;
  const licenses = effectiveConfig.licenses
    ? LicenseAppModel.fromSerialized(effectiveConfig.licenses)
    : null;
  const notifications = effectiveConfig.notifications
    ? NotificationAppModel.fromSerialized(effectiveConfig.notifications)
    : null;
  const releaseManagement = effectiveConfig.releaseManagement
    ? ReleaseManagementAppModel.fromSerialized(
        effectiveConfig.releaseManagement,
      )
    : null;
  // Stripe is billing's provider and the connectors' connector: when the page
  // serves both, connecting it in one is seen by the other, and the billing
  // e-mail of a customer typed on its page is the one a move to Stripe finds.
  if (billing && connectors) {
    connectors.setStripeWorld({
      hasMappedCustomers: () => billing.providers.hasCustomers(),
      onConnected: (livemode) => {
        billing.setStripeConnection(true, livemode);
        persist('billing', billing.serializeForMsw());
      },
      onDisconnected: () => {
        billing.setStripeConnection(false);
        persist('billing', billing.serializeForMsw());
      },
      routing: () => billing.stripeRouting(),
      standing: () => billing.stripeStanding(),
    });
  }
  if (billing && customers) {
    billing.setEmailSource((customerSlug) => {
      try {
        return customers.getCustomer(customerSlug).billingEmail;
      } catch {
        // A customer this page does not serve: billing's own copy answers.
        return undefined;
      }
    });
  }
  const flagEvaluations =
    effectiveConfig.flagEvaluations ??
    (unmockedPlatform === 'off' ? NO_PLATFORM_FLAGS : null);

  // Where the licenses and their prices are, for the one document of billing that
  // reads both: the slot of the licenses has them, and a page with instances and
  // billing has the licenses of its instances and the prices billing knows.
  // Whichever answers `GET /licenses` answers here too.
  const licenseCatalogue: LicenseCatalogue | undefined = licenses
    ? {
        licenses: () => licenses.listLicenses(),
        prices: (slug, filter) => licenses.listPrices(slug, filter),
      }
    : instances && billing
      ? {
          licenses: () => instances.listLicenses(),
          prices: (slug, filter) =>
            billing.subscriptions.listPrices(slug, filter),
        }
      : undefined;

  // Preserve first-match ownership and the original slot registration order.
  // Explicit sibling fallbacks are sorted last, after all installed owners.
  const handlers = [
    ...(auditTrail ? auditTrailHandlers(auditTrail) : []),
    ...(billing
      ? billingHandlers(
          billing,
          () => persist('billing', billing.serializeForMsw()),
          // An add-on, or a boost, applies at once: the instances, when this page
          // serves them, read the effective values of the instance it changed again.
          instances
            ? {
                syncEffectiveValues: (instanceSlug) => {
                  instances.applyAddonContributions(
                    instanceSlug,
                    billing.instanceAddons.contributionsOf(instanceSlug),
                    billing.vouchers.boostsOf(instanceSlug),
                  );
                  persist('instances', instances.serializeForMsw());
                },
              }
            : undefined,
          licenseCatalogue,
        )
      : []),
    ...(licenses
      ? licenseHandlers(licenses, () =>
          persist('licenses', licenses.serializeForMsw()),
        )
      : []),
    ...(connectors
      ? connectorHandlers(connectors, () =>
          persist('connectors', connectors.serializeForMsw()),
        )
      : []),
    ...(customers
      ? customerHandlers(customers, () =>
          persist('customers', customers.serializeForMsw()),
        )
      : []),
    ...(dashboard ? dashboardHandlers(dashboard) : []),
    ...(entitlements
      ? entitlementHandlers(entitlements, () =>
          persist('entitlements', entitlements.serializeForMsw()),
        )
      : []),
    ...(featureFlags
      ? featureFlagHandlers(featureFlags, () =>
          persist('featureFlags', featureFlags.serializeForMsw()),
        )
      : []),
    ...(flagEvaluations ? flagEvaluationHandlers(flagEvaluations) : []),
    ...(instances
      ? instanceHandlers(instances, () =>
          persist('instances', instances.serializeForMsw()),
        )
      : []),
    ...(notifications
      ? notificationHandlers(notifications, () =>
          persist('notifications', notifications.serializeForMsw()),
        )
      : []),
    ...(releaseManagement
      ? releaseManagementHandlers(releaseManagement, () =>
          persist('releaseManagement', releaseManagement.serializeForMsw()),
        )
      : []),
    ...(effectiveConfig.integrationStubs
      ? integrationStubHandlers(effectiveConfig.integrationStubs)
      : []),
    // After the stubs, which say otherwise: no saas-api, no webhooks.
    ...(unmockedPlatform === 'off' ? [noWebhooksServiceHandler] : []),
  ];
  return [...withFallbacksLast(handlers), ...(strict ? shellHandlers() : [])];
}

export const undeclaredApiRequest = http.all(
  /\/api(?:\/|$)/,
  async ({ request }) => {
    const operation = request.url.endsWith('/graphql')
      ? (
          (await request
            .clone()
            .json()
            .catch(() => ({}))) as { operationName?: string } | null
        )?.operationName
      : undefined;
    console.error(
      `[MSW] Unhandled API request: ${request.method} ${request.url}${operation ? ` (${operation})` : ''}`,
    );
    return HttpResponse.error();
  },
);
