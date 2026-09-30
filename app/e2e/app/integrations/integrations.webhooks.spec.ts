import { expect, test } from '../_support/app-test';
import { IntegrationsNavDriver } from '../_support/drivers/integrations-nav.driver';
import { TokenCreateDriver } from '../_support/drivers/token-create.driver';
import { installFlagEvaluations } from '../_support/mocks/install-app-mocks';
import {
  installEmptyWebhooksStub,
  installServiceAccountStub,
} from '../_support/mocks/install-integration-stubs';
import { createSdkServiceAccount, WEBHOOKS_ON } from './integrations.scenarios';

// Outbound webhooks are served by saas-api alone, so the console shows them
// only where Kaiten Cloud turns the `webhooks` platform flag on.

test.describe('webhooks on a self-hosted console', () => {
  // No flag evaluation installed: the suite's default reads every platform
  // flag as off, as a deployment with no Kaiten-by-Kaiten does.

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
      await installEmptyWebhooksStub(page);
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

test.describe('webhooks on Kaiten Cloud', () => {
  test.beforeEach(async ({ page }) => {
    await installFlagEvaluations(page, WEBHOOKS_ON);
  });

  test('opens the webhooks pages from the Integrations menu', async ({
    page,
  }) => {
    const nav = new IntegrationsNavDriver(page);

    await installServiceAccountStub(page, createSdkServiceAccount());
    await installEmptyWebhooksStub(page);
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
