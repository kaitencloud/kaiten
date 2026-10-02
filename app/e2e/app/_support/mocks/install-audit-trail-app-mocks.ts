import type { Page } from '@playwright/test';
import type { AuditTrailAppModel } from '../model/audit-trail-app-model';
import { auditTrailOperations } from '../model/graphql-operations';
import { installGraphQLOperationMocks } from './graphql-operation-router';
import { tryInstallMswMocks } from './install-app-mocks';
import { fulfillJson } from './rest-route-helpers';

export async function installAuditTrailAppMocks(
  page: Page,
  model: AuditTrailAppModel,
) {
  if (await tryInstallMswMocks(page, 'auditTrail', model)) {
    return;
  }

  await installGraphQLOperationMocks(page, auditTrailOperations(model));
  await page.route(
    /\/api\/instances\/[^/]+\/audit-trails(?:\?.*)?$/,
    (route) => {
      const url = new URL(route.request().url());
      const slug = decodeURIComponent(url.pathname.split('/')[3] ?? '');
      const limit = url.searchParams.get('limit');
      return fulfillJson(
        route,
        200,
        model.getInstanceAuditTrail(slug, {
          eventName: url.searchParams.get('event_name') ?? undefined,
          limit: limit ? Number(limit) : undefined,
        }),
      );
    },
  );
}
