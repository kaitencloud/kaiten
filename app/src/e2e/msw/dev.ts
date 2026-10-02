import type { E2EMswConfig } from '../../../e2e/app/_support/contracts/msw-slots';
import { createUsageEventsAuditTrailModel } from '../../../e2e/app/audit-trail/audit-trail.scenarios';
import { createDisconnectedAttioModel } from '../../../e2e/app/connectors/connectors.scenarios';
import { createCustomersListModel } from '../../../e2e/app/customers/customers.scenarios';
import { createDashboardReadModel } from '../../../e2e/app/dashboard/dashboard.scenarios';
import { createEntitlementsListModel } from '../../../e2e/app/entitlements/entitlements.scenarios';
import { createFeatureFlagsListModel } from '../../../e2e/app/feature-flags/feature-flags.scenarios';
import { createInstancesListModel } from '../../../e2e/app/instances/instances.scenarios';
import { createLicenseCatalogModel } from '../../../e2e/app/licenses/licenses.scenarios';
import { createReleaseManagementReadModel } from '../../../e2e/app/release-management/release-management.scenarios';
import { startE2EMockServiceWorker } from './browser';
import { createNotificationsDevSeed } from './notifications-dev-seed';

/**
 * Every area of the console, each from the scenario its E2E specs read it with,
 * and the notifications of the dev seed. The scenarios do not know one another:
 * a link from one area to a record of another may lead to a missing record.
 * The platform flags stay off, as on a self-hosted deployment.
 */
export function createDevMockConfig(): E2EMswConfig {
  return {
    auditTrail: createUsageEventsAuditTrailModel().serializeForMsw(),
    connectors: createDisconnectedAttioModel().serializeForMsw(),
    customers: createCustomersListModel().serializeForMsw(),
    dashboard: createDashboardReadModel().serializeForMsw(),
    entitlements: createEntitlementsListModel().serializeForMsw(),
    featureFlags: createFeatureFlagsListModel().serializeForMsw(),
    instances: createInstancesListModel().serializeForMsw(),
    licenses: createLicenseCatalogModel().serializeForMsw(),
    notifications: createNotificationsDevSeed(),
    releaseManagement: createReleaseManagementReadModel().serializeForMsw(),
  };
}

/**
 * The console without a backend (`pnpm run dev:mock`, VITE_MOCK_API=true): the
 * API answered by Mock Service Worker in the page, area by area. A request no
 * area serves prints an `[MSW]` warning that names it. What a page changes
 * lives in `sessionStorage`, so it survives a reload and a new tab starts over.
 */
export async function startDevMocks() {
  await startE2EMockServiceWorker(createDevMockConfig(), {
    warnUnhandledApiRequests: true,
  });
}
