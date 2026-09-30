import { expect, test } from '../_support/app-test';
import { persistLanguage } from '../_support/language';
import { installDashboardAppMocks } from '../_support/mocks/install-dashboard-app-mocks';
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
