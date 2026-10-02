import type { Page } from '@playwright/test';
import type { AuditTrailAppModel } from '../model/audit-trail-app-model';
import { auditTrailOperations } from '../model/graphql-operations';
import { installGraphQLOperationMocks } from './graphql-operation-router';
import { tryInstallMswMocks } from './install-app-mocks';

export async function installAuditTrailAppMocks(
  page: Page,
  model: AuditTrailAppModel,
) {
  if (await tryInstallMswMocks(page, 'auditTrail', model)) {
    return;
  }

  await installGraphQLOperationMocks(page, auditTrailOperations(model));
}
