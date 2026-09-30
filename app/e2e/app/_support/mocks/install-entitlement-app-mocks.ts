import type { Page } from '@playwright/test';
import type { Entitlement } from '@/api-client';
import type { EntitlementAppModel } from '../model/entitlement-app-model';
import { tryInstallMswMocks } from './install-app-mocks';
import { makeRestRouter, parseJsonBody } from './rest-route-helpers';

export async function installEntitlementAppMocks(
  page: Page,
  model: EntitlementAppModel,
) {
  if (await tryInstallMswMocks(page, 'entitlements', model)) {
    return;
  }

  await installEntitlementPageRouteMocks(page, model);
}

async function installEntitlementPageRouteMocks(
  page: Page,
  model: EntitlementAppModel,
) {
  await page.route(
    '**/api/entitlements',
    makeRestRouter(
      [
        {
          method: 'GET',
          segments: 2,
          handle: () => ({ hasMore: false, items: model.listEntitlements() }),
        },
        {
          method: 'POST',
          segments: 2,
          handle: ({ route }) =>
            model.createEntitlement(parseJsonBody<Partial<Entitlement>>(route)),
        },
      ],
      { errorMessage: 'Unexpected entitlement mock error' },
    ),
  );

  await page.route(
    '**/api/entitlements/*',
    makeRestRouter(
      [
        {
          method: 'GET',
          segments: 3,
          handle: ({ segments }) =>
            model.getEntitlement(decodeURIComponent(segments[2] ?? '')),
        },
        {
          method: 'PUT',
          segments: 3,
          handle: ({ route, segments }) =>
            model.updateEntitlement(
              decodeURIComponent(segments[2] ?? ''),
              parseJsonBody<Partial<Entitlement>>(route),
            ),
        },
        {
          method: 'DELETE',
          segments: 3,
          handle: ({ segments }) => {
            model.deleteEntitlement(decodeURIComponent(segments[2] ?? ''));
            return null;
          },
        },
      ],
      { errorMessage: 'Unexpected entitlement mock error' },
    ),
  );

  await page.route(
    '**/api/entitlement-groups',
    makeRestRouter(
      [
        {
          method: 'GET',
          segments: 2,
          handle: () => ({ hasMore: false, items: [] }),
        },
      ],
      { errorMessage: 'Unexpected entitlement group mock error' },
    ),
  );
}
