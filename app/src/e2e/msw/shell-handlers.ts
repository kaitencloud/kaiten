import { HttpResponse } from 'msw/http';
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
} from '@/api-client/msw.gen';
import { NotificationAppModel } from '../../../e2e/app/_support/model/notification-app-model';
import { notificationHandlers } from './notification-handlers';

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
    ...notificationHandlers(new NotificationAppModel()),
  ];
}
