import type { Page } from '@playwright/test';
import type { AuditTrailAppModel } from '../model/audit-trail-app-model';
import { installMswMocks } from './install-app-mocks';

export function installAuditTrailAppMocks(
  page: Page,
  model: AuditTrailAppModel,
) {
  return installMswMocks(page, 'auditTrail', model);
}
