import { expect, test } from '../_support/app-test';
import { BillingNavDriver } from '../_support/drivers/billing-nav.driver';
import { persistLanguage } from '../_support/language';
import { installBillingAppMocks } from '../_support/mocks/install-billing-app-mocks';
import { installDashboardAppMocks } from '../_support/mocks/install-dashboard-app-mocks';
import { createBillingDisabledModel } from '../billing/billing.scenarios';
import { createDashboardReadModel } from '../dashboard/dashboard.scenarios';

test('renders key dashboard labels after switching the persisted locale to French', async ({
  page,
}) => {
  const model = createDashboardReadModel();

  await installDashboardAppMocks(page, model);
  await page.goto('/dashboard');

  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  await expect(
    page.locator('main').getByText('Active Instances', { exact: true }).first(),
  ).toBeVisible();

  await persistLanguage(page, 'fr');
  await page.reload();

  const main = page.locator('main');
  await expect(
    page.getByRole('heading', { name: 'Tableau de bord' }),
  ).toBeVisible();
  await expect(
    main.getByText('Clients', { exact: true }).first(),
  ).toBeVisible();
  await expect(
    main.getByText('Instances actives', { exact: true }).first(),
  ).toBeVisible();
  await expect(
    main.getByText('Licences', { exact: true }).first(),
  ).toBeVisible();
});

test('renders the explanation of a billing link and its breadcrumb in French', async ({
  page,
}) => {
  const nav = new BillingNavDriver(page);

  await installBillingAppMocks(
    page,
    createBillingDisabledModel('DEPLOYMENT_DISABLED'),
  );
  // The language is stored once the page is on the app's origin.
  await page.goto('/settings');
  await persistLanguage(page, 'fr');

  await page.goto('/invoices');

  await nav.expectUnavailable('DEPLOYMENT_DISABLED');
  await expect(
    page.getByText('La facturation n’est pas activée'),
  ).toBeVisible();
  await expect(page.getByText(/KAITEN_BILLING_ENABLED/)).toBeVisible();
  // The breadcrumb names the section in the language of the app.
  await expect(
    page.getByRole('navigation', { name: 'breadcrumb' }),
  ).toContainText('Facturation');
});
