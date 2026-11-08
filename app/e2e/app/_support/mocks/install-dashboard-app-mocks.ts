import type { Page } from '@playwright/test';
import { createUsageEventsAuditTrailModel } from '../../audit-trail/audit-trail.scenarios';
import type { AuditTrailAppModel } from '../model/audit-trail-app-model';
import type { DashboardAppModel } from '../model/dashboard-app-model';
import { installMswMocks } from './install-app-mocks';

/**
 * The dashboard reads its summary from its own slot and its recent changes
 * from the audit trail, so a spec on the dashboard gets both: the audit trail
 * of the usage events unless it brings its own.
 */
export async function installDashboardAppMocks(
  page: Page,
  model: DashboardAppModel,
  auditTrail: AuditTrailAppModel = createUsageEventsAuditTrailModel(),
) {
  await installMswMocks(page, 'auditTrail', auditTrail);
  await installMswMocks(page, 'dashboard', model);
}
