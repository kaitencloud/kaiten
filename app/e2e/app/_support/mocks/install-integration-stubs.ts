import type { Page } from '@playwright/test';
import type { ServiceAccount } from '@/api-client';
import { fulfillJson } from './rest-route-helpers';
import { isMswMockingEnabled } from './install-app-mocks';
import { E2E_MSW_STORAGE_KEY } from '../contracts/msw-slots';

// Read-only answers for the integration pages a spec opens to see what the
// platform flags show there. Those pages have no stateful model yet, and such a
// spec needs them to render, not to be edited.
//
// Strict MSW declares these through a slot; legacy uses context routes.

const apiPath = (path: string) => (url: URL) => url.pathname === `/api${path}`;

/** The service account whose token page opens, and the list around it. */
export async function installServiceAccountStub(
  page: Page,
  serviceAccount: ServiceAccount,
) {
  if (isMswMockingEnabled()) {
    await installIntegrationStub(page, { serviceAccount });
    return;
  }
  await page
    .context()
    .route(apiPath('/service-accounts'), (route) =>
      fulfillJson(route, 200, { hasMore: false, items: [serviceAccount] }),
    );
  await page
    .context()
    .route(apiPath(`/service-accounts/${serviceAccount.slug}`), (route) =>
      fulfillJson(route, 200, serviceAccount),
    );
}

/** No webhook and no delivery yet: the webhooks pages render empty. */
export async function installEmptyWebhooksStub(page: Page) {
  if (isMswMockingEnabled()) {
    await installIntegrationStub(page, { emptyWebhooks: true });
    return;
  }
  await page
    .context()
    .route(apiPath('/webhooks'), (route) => fulfillJson(route, 200, []));
  await page
    .context()
    .route(apiPath('/webhooks/history'), (route) =>
      fulfillJson(route, 200, { history: [] }),
    );
}

async function installIntegrationStub(
  page: Page,
  stubs: { serviceAccount?: ServiceAccount; emptyWebhooks?: boolean },
) {
  // Several installers can contribute to this read-only slot before navigation.
  await page.addInitScript(
    ({ values, storageKey }) => {
      const target = window as Window & {
        __KAITEN_E2E_MSW__?: { integrationStubs?: typeof values };
      };
      const config = JSON.parse(sessionStorage.getItem(storageKey) ?? '{}');
      config.integrationStubs = { ...config.integrationStubs, ...values };
      target.__KAITEN_E2E_MSW__ = config;
      sessionStorage.setItem(storageKey, JSON.stringify(config));
    },
    { values: stubs, storageKey: E2E_MSW_STORAGE_KEY },
  );
}
