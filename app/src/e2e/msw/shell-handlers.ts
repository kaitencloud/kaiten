import { HttpResponse, http } from 'msw/http';
import {
  handleGetBillingCapabilities,
  handleGetConnectorSettings,
  handleGetFeatureFlags,
  handleGetInstances,
  handleGetLicenses,
  handleGetLicenseEntitlements,
  handleGetEntitlementsUsageMetrics,
  handleListDeploymentZones,
  handleListEntitlements,
  handleListReleases,
  handleListNotifications,
} from '@/api-client/msw.gen';
import { billingCapabilitiesProfiles } from '../../../e2e/app/_support/model/billing-capabilities';
import { NotificationAppModel } from '../../../e2e/app/_support/model/notification-app-model';

/** Explicit empty relations and sidebar preloads, after every installed owner. */
export function shellHandlers() {
  const empty = { hasMore: false, items: [] };
  return [
    // The shell reads the billing capabilities on every page, for the
    // navigation: where no spec installs the billing slot, billing is off.
    handleGetBillingCapabilities({
      body: billingCapabilitiesProfiles.disabled(),
    }),
    handleListDeploymentZones({ body: empty }),
    handleListReleases({ body: empty }),
    handleListEntitlements({ body: empty }),
    handleGetFeatureFlags({ body: empty }),
    handleGetInstances({ body: empty }),
    handleGetLicenses({ body: empty }),
    handleGetLicenseEntitlements({ body: empty }),
    handleGetEntitlementsUsageMetrics({ body: [] }),
    // No connector configured is a real 404, not an undeclared request.
    handleGetConnectorSettings(() =>
      HttpResponse.json({ message: 'not found' }, { status: 404 }),
    ),
    handleListNotifications({ body: new NotificationAppModel().listNotifications() }),
    // The shell has no events to stream. HTTP 204 stops EventSource reconnects
    // rather than leaving an idle stream open in every unrelated UI test.
    http.get(/\/api\/v1\/notifications\/stream$/, () => new HttpResponse(null, { status: 204 })),
  ];
}
