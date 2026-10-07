import type { Page } from '@playwright/test';
import { expect, test } from '../_support/app-test';
import { IntegrationsNavDriver } from '../_support/drivers/integrations-nav.driver';
import { TokenCreateDriver } from '../_support/drivers/token-create.driver';
import {
  installEmptyWebhooksStub,
  installServiceAccountStub,
  installWebhooksNotEntitledStub,
} from '../_support/mocks/install-integration-stubs';
import { createSdkServiceAccount } from './integrations.scenarios';

// Outbound webhooks are served by Kaiten Cloud's saas-api alone, and only to an
// organization whose Kaiten licence carries them. The console shows them where
// GET /api/webhooks answers, and nowhere else.

const hidden: [string, (page: Page) => Promise<void>][] = [
  // No stub: the routes answer 404, as they do where no saas-api runs.
  ['on a self-hosted console', async () => {}],
  // saas-api answers 403 Webhooks.NotEntitled on every webhooks route.
  [
    'for an organization whose licence lacks them',
    installWebhooksNotEntitledStub,
  ],
];

for (const [where, installWebhooks] of hidden) {
  test.describe(`webhooks ${where}`, () => {
    test.beforeEach(async ({ page }) => {
      await installWebhooks(page);
    });

    test('leaves Webhooks out of the Integrations menu', async ({ page }) => {
      const nav = new IntegrationsNavDriver(page);

      await installServiceAccountStub(page, createSdkServiceAccount());
      await page.goto('/integrations/service-accounts');

      await nav.expectEntries(['Service Accounts', 'Connectors']);
      await expect(nav.entry('Webhooks')).toHaveCount(0);
    });

    for (const path of [
      '/integrations/webhooks',
      '/integrations/webhooks/history',
    ]) {
      test(`answers ${path} with the not-found page`, async ({ page }) => {
        await page.goto(path);

        await expect(page.getByText('Page not found')).toBeVisible();
        await expect(
          page.getByRole('heading', { name: 'Webhooks', level: 1 }),
        ).toHaveCount(0);
      });
    }

    test('offers no webhooks scope to a new token', async ({ page }) => {
      const serviceAccount = createSdkServiceAccount();
      const tokens = new TokenCreateDriver(page);

      await installServiceAccountStub(page, serviceAccount);
      await tokens.goto(serviceAccount.slug ?? '');
      const table = await tokens.openScopeTable();

      await expect(tokens.scopeRow(table, 'Metadata Fields')).toBeVisible();
      await expect(tokens.scopeRow(table, 'Webhooks')).toHaveCount(0);
    });
  });
}

test.describe('webhooks on Kaiten Cloud', () => {
  test.beforeEach(async ({ page }) => {
    await installEmptyWebhooksStub(page);
  });

  test('opens the webhooks pages from the Integrations menu', async ({
    page,
  }) => {
    const nav = new IntegrationsNavDriver(page);

    await installServiceAccountStub(page, createSdkServiceAccount());
    await page.goto('/integrations/service-accounts');
    await nav.entry('Webhooks').click();

    await expect(page).toHaveURL(/\/integrations\/webhooks$/);
    await expect(
      page.getByRole('heading', { name: 'Webhooks', level: 1 }),
    ).toBeVisible();

    await page.getByRole('link', { name: 'History' }).click();

    await expect(page).toHaveURL(/\/integrations\/webhooks\/history$/);
    await expect(page.getByText('Page not found')).toHaveCount(0);
  });

  test('offers the webhooks scope to a new token', async ({ page }) => {
    const serviceAccount = createSdkServiceAccount();
    const tokens = new TokenCreateDriver(page);

    await installServiceAccountStub(page, serviceAccount);
    await tokens.goto(serviceAccount.slug ?? '');
    const table = await tokens.openScopeTable();

    await expect(tokens.scopeRow(table, 'Webhooks')).toBeVisible();
  });
});
