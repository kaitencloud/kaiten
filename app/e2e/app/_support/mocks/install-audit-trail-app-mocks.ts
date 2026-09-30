import type { Page } from '@playwright/test';
import type { AuditTrailAppModel } from '../model/audit-trail-app-model';
import { installGraphQLOperationMocks } from './graphql-operation-router';
import { tryInstallMswMocks } from './install-app-mocks';

export async function installAuditTrailAppMocks(
  page: Page,
  model: AuditTrailAppModel,
) {
  if (await tryInstallMswMocks(page, 'auditTrail', model)) {
    return;
  }

  await installGraphQLOperationMocks(page, {
    GetGlobalAuditTrail: (variables) => model.getGlobalAuditTrail(variables),
  });
}
