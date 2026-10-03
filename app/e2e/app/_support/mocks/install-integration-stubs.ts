import type { Page } from '@playwright/test';
import type { ServiceAccount } from '@/api-client';
import { E2E_MSW_STORAGE_KEY } from '../contracts/msw-slots';

// Read-only answers for the integration pages a spec opens to see what the
// platform flags show there. Those pages have no stateful model yet, and such a
// spec needs them to render, not to be edited.

/** The service account whose token page opens, and the list around it. */
export function installServiceAccountStub(
  page: Page,
  serviceAccount: ServiceAccount,
) {
  return installIntegrationStub(page, { serviceAccount });
}

/** No webhook and no delivery yet: the webhooks pages render empty. */
export function installEmptyWebhooksStub(page: Page) {
  return installIntegrationStub(page, { emptyWebhooks: true });
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
