import { HttpResponse, http } from 'msw/http';
import {
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
import { NotificationAppModel } from '../../../e2e/app/_support/model/notification-app-model';

/** Explicit empty relations and sidebar preloads, after every installed owner. */
export function shellHandlers() {
  const empty = { hasMore: false, items: [] };
  return [
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
    handleListNotifications({
      body: new NotificationAppModel().listNotifications(),
    }),
    // The shell has no events to stream. HTTP 204 stops EventSource reconnects
    // rather than leaving an idle stream open in every unrelated UI test.
    http.get(
      /\/api\/v1\/notifications\/stream$/,
      () => new HttpResponse(null, { status: 204 }),
    ),
  ];
}
