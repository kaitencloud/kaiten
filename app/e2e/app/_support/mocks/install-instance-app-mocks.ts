import type { Page } from '@playwright/test';
import type { InstanceWritable, PatchInstanceBody } from '@/api-client';
import type { InstanceAppModel } from '../model/instance-app-model';
import { installGraphQLOperationMocks } from './graphql-operation-router';
import { tryInstallMswMocks } from './install-app-mocks';
import {
  fulfillJson,
  makeRestRouter,
  parseJsonBody,
} from './rest-route-helpers';

export async function installInstanceAppMocks(
  page: Page,
  model: InstanceAppModel,
) {
  if (await tryInstallMswMocks(page, 'instances', model)) {
    return;
  }

  await installInstancePageRouteMocks(page, model);
}

async function installInstancePageRouteMocks(
  page: Page,
  model: InstanceAppModel,
) {
  await installGraphQLOperationMocks(page, {
    GetCustomersWithInstances: () => model.getCustomersWithInstances(),
    GetInstancesWithRelations: () => model.getInstancesWithRelations(),
    MetadataFields: () => model.getMetadataFields(),
    GetReleaseManagementOverview: () => ({ releases: { items: [] } }),
  });

  await page.route(
    '**/api/customers**',
    makeRestRouter(
      [
        {
          method: 'GET',
          segments: 2,
          handle: () => ({ hasMore: false, items: model.listCustomers() }),
        },
        {
          method: 'GET',
          segments: 3,
          handle: ({ segments }) =>
            model.getCustomer(decodeURIComponent(segments[2] ?? '')),
        },
      ],
      { errorMessage: 'Unexpected customer mock error' },
    ),
  );

  await page.route(
    '**/api/licenses**',
    makeRestRouter(
      [
        {
          method: 'GET',
          segments: 2,
          handle: () => ({ hasMore: false, items: model.listLicenses() }),
        },
        {
          method: 'GET',
          segments: 3,
          handle: ({ segments }) =>
            model.getLicense(decodeURIComponent(segments[2] ?? '')),
        },
        {
          method: 'GET',
          segments: 4,
          handle: ({ segments }) => {
            if (segments[3] !== 'entitlements') {
              throw new Error('not found');
            }
            return {
              hasMore: false,
              items: model.getLicenseEntitlements(
                decodeURIComponent(segments[2] ?? ''),
              ),
            };
          },
        },
      ],
      { errorMessage: 'Unexpected license mock error' },
    ),
  );

  // The license catalogue reads the families beside the versions.
  await page.route(/\/api\/license-families(\?.*)?$/, (route) =>
    fulfillJson(route, 200, {
      hasMore: false,
      items: model.listLicenseFamilies(),
    }),
  );

  // Instance detail overview reads deployment-zones / releases for related data,
  // and the deploy / migrate action offers the zones as targets. Suites that
  // don't seed zones get an empty list, which is what an org without any zone
  // looks like.
  await page.route('**/api/deployment-zones**', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.fulfill({ status: 405 });
      return;
    }
    await fulfillJson(route, 200, {
      hasMore: false,
      items: model.listDeploymentZones(),
    });
  });

  await page.route('**/api/releases**', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.fulfill({ status: 405 });
      return;
    }
    await fulfillJson(route, 200, { hasMore: false, items: [] });
  });

  await page.route(
    '**/api/instances**',
    makeRestRouter(
      [
        {
          method: 'GET',
          segments: 2,
          handle: () => ({
            hasMore: false,
            items: model.listInstances(),
          }),
        },
        {
          method: 'POST',
          segments: 2,
          handle: ({ route }) =>
            model.createInstance(parseJsonBody<InstanceWritable>(route)),
        },
        {
          method: 'GET',
          segments: 3,
          handle: ({ segments }) =>
            model.getInstance(decodeURIComponent(segments[2] ?? '')),
        },
        {
          method: 'PUT',
          segments: 3,
          handle: ({ route, segments }) =>
            model.updateInstance(
              decodeURIComponent(segments[2] ?? ''),
              parseJsonBody<InstanceWritable>(route),
            ),
        },
        {
          method: 'PATCH',
          segments: 3,
          handle: ({ route, segments }) => {
            model.patchInstance(
              decodeURIComponent(segments[2] ?? ''),
              parseJsonBody<PatchInstanceBody>(route),
            );
            return null;
          },
        },
        {
          method: 'DELETE',
          segments: 3,
          handle: ({ segments }) => {
            model.deleteInstance(decodeURIComponent(segments[2] ?? ''));
            return null;
          },
        },
        {
          method: 'GET',
          segments: 5,
          handle: ({ segments }) => {
            if (segments[3] !== 'entitlements' || segments[4] !== 'usage') {
              throw new Error('not found');
            }
            return model.getEntitlementsUsageMetrics(
              decodeURIComponent(segments[2] ?? ''),
            );
          },
        },
      ],
      { errorMessage: 'Unexpected instance mock error' },
    ),
  );
}
